import "dotenv/config";
import fetch from "node-fetch";

import { supabase } from "../lib/api/supabase.js";
import {
  callOnboardingLLM,
  computePatterns,
  extractFirstJsonObjectFromText,
  getDateRangeLast6Months,
  getLast6MonthKeys,
  isLikelyInternalOrPayment,
  selectTopPatternsForLLM,
} from "../lib/early_insights.js";

const DEFAULT_USER_ID = "84866800-d01c-473d-893b-0ef6b5c40dee";

const userId = process.argv[2] || process.env.USER_ID || DEFAULT_USER_ID;
const shouldRunLLM =
  !process.argv.includes("--no-llm") && process.env.RUN_LLM !== "0";

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, age, occupation, location, finny_style")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadTransactions(userId, startDate, endDate) {
  const pageSize = 1000;
  const maxRows = 5000;
  const rows = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        [
          "date",
          "authorized_date",
          "amount",
          "name",
          "merchant_name",
          "category",
          "top_category",
          "sub_category",
          "new_category",
          "transaction_type",
          "pending",
          "account_id",
          "plaid_transaction_id",
          "if_recurring",
          "recurring_stream_id",
        ].join(","),
      )
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return rows;
}

async function main() {
  console.log(`[onboarding-test] user_id=${userId}`);

  const { startDate, endDate } = getDateRangeLast6Months();
  const months = getLast6MonthKeys();

  const [profile, rows] = await Promise.all([
    loadProfile(userId),
    loadTransactions(userId, startDate, endDate),
  ]);

  const filtered = rows.filter((tx) => !isLikelyInternalOrPayment(tx));
  const patternPayload = computePatterns({
    transactions: filtered,
    months,
  });
  const topPatterns = selectTopPatternsForLLM(patternPayload, 5);

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoff = sixtyDaysAgo.toISOString().slice(0, 10);
  const recentTransactions = filtered.filter((tx) => tx.date >= cutoff);

  console.log(
    JSON.stringify(
      {
        userId,
        profile,
        fetchedTransactions: rows.length,
        filteredTransactions: filtered.length,
        recentTransactionsForLlm: recentTransactions.length,
        topPatternsForLlm: topPatterns.map((pattern, index) => ({
          rank: index + 1,
          type: pattern?.type || null,
          key: pattern?.key || null,
          title: pattern?.title || null,
          description: pattern?.description || null,
          confidence: pattern?.confidence ?? null,
          evidence: pattern?.evidence || null,
        })),
      },
      null,
      2,
    ),
  );

  if (!shouldRunLLM) {
    console.log("[onboarding-test] skipped LLM call (--no-llm)");
    return;
  }

  const openRouterApiKey =
    process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_GROK_KEY;
  if (!openRouterApiKey) {
    throw new Error("Missing OPENROUTER_API_KEY or OPENROUTER_GROK_KEY");
  }

  const llmResult = await callOnboardingLLM({
    openRouterApiKey,
    fetchFn: fetch,
    patterns: topPatterns,
    analysisWindow: "last 6 months",
    userProfile: profile,
    recentTransactions,
  });

  const finalJson =
    llmResult?.ok && llmResult?.json
      ? llmResult.json
      : extractFirstJsonObjectFromText(llmResult?.raw);

  console.log(
    JSON.stringify(
      {
        llmOk: !!llmResult?.ok,
        llmJson: finalJson,
        llmRawPreview: finalJson
          ? null
          : String(llmResult?.rawStripped || llmResult?.raw || "")
              .slice(0, 1200)
              .trim(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[onboarding-test] failed", error);
  process.exit(1);
});

/**
 * Finny Recurring Transaction Analysis
 * Shared logic for LLM-based recurring pattern detection.
 * Used by scripts/analyze-recurring-transactions.js and api/exchange_public_token.js (mode=analyze_recurring)
 */

import { buildRecurringAnalysisPrompt } from "./prompt_engine.js";
import { extractFirstJsonObjectFromText } from "./early_insights.js";

const STANDARD_MODEL = "meta-llama/llama-3.2-3b-instruct";
const REASONING_MODEL =
  process.env.REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout";

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY;
}

export async function fetchTransactionsForAnalysis(supabase, userId, itemId) {
  const fourMonthsAgo = new Date();
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
  const startDate = fourMonthsAgo.toISOString().split("T")[0];

  let query = supabase
    .from("transactions")
    .select(
      "plaid_transaction_id, date, amount, name, merchant_name, category, top_category, new_category, account_id",
    )
    .eq("user_id", userId)
    .gte("date", startDate)
    .order("date", { ascending: false });

  if (itemId) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("account_id")
      .eq("item_id", itemId);
    const accountIds = (accounts || []).map((a) => a.account_id);
    if (accountIds.length === 0) return [];
    query = query.in("account_id", accountIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch transactions: ${error.message}`);
  return data || [];
}

export async function fetchExistingRecurringStreams(supabase, userId, itemId) {
  let query = supabase
    .from("recurring_streams")
    .select("description, merchant_name, stream_id, stream_type")
    .eq("user_id", userId);

  if (itemId) {
    query = query.eq("item_id", itemId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("Could not fetch recurring streams:", error.message);
    return [];
  }
  return data || [];
}

function matchTransactionsByMerchant(transactions, merchant) {
  const m = (merchant || "").toLowerCase().trim();
  if (!m) return [];
  const mNorm = m.replace(/[^a-z0-9]/g, " ");
  return transactions.filter((tx) => {
    const name = (tx.merchant_name || tx.name || "").toLowerCase();
    const firstWord = name.split(/[\s,]+/)[0] || "";
    return name.includes(m) || name.includes(mNorm) || m.includes(firstWord);
  });
}

function computeTypicalAmount(transactions) {
  if (!transactions?.length) return null;
  const amounts = transactions
    .map((t) => Math.abs(parseFloat(t.amount) || 0))
    .filter((a) => a > 0)
    .sort((a, b) => a - b);
  if (amounts.length === 0) return null;
  const mid = Math.floor(amounts.length / 2);
  return amounts.length % 2
    ? amounts[mid]
    : (amounts[mid - 1] + amounts[mid]) / 2;
}

/**
 * Compute frequency from actual transaction dates. Overrides LLM inference to fix
 * misclassifications (e.g. monthly charged as weekly when 4 tx fall in 4 different weeks).
 * @param {Array<{date?: string}>} transactions - Matched transactions with date field
 * @returns {string|null} "weekly" | "bi-weekly" | "monthly" | "quarterly" or null if can't compute
 */
function computeFrequencyFromDates(transactions) {
  if (!transactions?.length || transactions.length < 2) return null;
  const sorted = [...transactions]
    .filter((t) => t.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sorted.length < 2) return null;

  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const days =
      (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) /
      (1000 * 60 * 60 * 24);
    gaps.push(days);
  }
  const median =
    gaps.length % 2
      ? gaps[Math.floor(gaps.length / 2)]
      : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;

  if (median >= 5 && median <= 11) return "weekly";
  if (median >= 12 && median <= 21) return "bi-weekly";
  if (median >= 22 && median <= 45) return "monthly";
  if (median >= 80 && median <= 100) return "quarterly";
  return "monthly";
}

export function enrichWithTransactionIds(parsed, transactions) {
  const txs = transactions || [];
  const ZELLE_MERCHANTS = ["zelle", "zelle payment"];
  const isZelle = (merchant) =>
    ZELLE_MERCHANTS.some((z) => (merchant || "").toLowerCase().includes(z));
  const isInterestReceived = (merchant) =>
    (merchant || "").toLowerCase().includes("interest paid");

  const enrich = (
    arr,
    {
      requireMatch = false,
      excludeZelle = false,
      minTxCount = 0,
      excludeInterest = false,
    } = {},
  ) => {
    if (!Array.isArray(arr)) return arr;
    return arr
      .filter((item) => !excludeZelle || !isZelle(item.merchant))
      .filter((item) => !excludeInterest || !isInterestReceived(item.merchant))
      .map((item) => {
        const merchant = item.merchant || "";
        const matched = matchTransactionsByMerchant(txs, merchant);
        const ids = matched.map((t) => t.plaid_transaction_id).filter(Boolean);
        const typicalFromTx = computeTypicalAmount(matched);
        const computedFreq = computeFrequencyFromDates(matched);
        const frequency = (
          computedFreq ||
          (item.frequency || "monthly")
        ).toLowerCase();
        return {
          ...item,
          transaction_ids: ids,
          typical_amount: typicalFromTx ?? item.typical_amount,
          transaction_count: ids.length,
          frequency,
        };
      })
      .filter((item) => {
        if (requireMatch && item.transaction_ids.length === 0) return false;
        if (minTxCount > 0 && item.transaction_ids.length < minTxCount)
          return false;
        return true;
      });
  };
  return {
    ...parsed,
    newly_found_subscriptions: enrich(parsed.newly_found_subscriptions, {
      requireMatch: true,
    }),
    newly_found_income: enrich(parsed.newly_found_income, {
      requireMatch: true,
      minTxCount: 2,
    }),
    peer_payments: enrich(parsed.peer_payments, {
      requireMatch: true,
      excludeZelle: true,
    }),
    recurring_fees: enrich(parsed.recurring_fees || [], {
      requireMatch: true,
      excludeInterest: true,
    }),
    real_subscriptions: parsed.real_subscriptions
      ? enrich(parsed.real_subscriptions, { requireMatch: true })
      : undefined,
    income_streams: parsed.income_streams
      ? enrich(parsed.income_streams, { requireMatch: true })
      : undefined,
  };
}

async function callLLM(prompt) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured. Set it in .env");
  }

  const models = [REASONING_MODEL, STANDARD_MODEL];

  for (const model of models) {
    try {
      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.5,
            max_tokens: 2000,
            messages: [
              {
                role: "system",
                content:
                  "You are a financial coach. Always return valid JSON only, no other text.",
              },
              { role: "user", content: prompt },
            ],
          }),
        },
      );

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`OpenRouter ${model} error ${resp.status}:`, text);
        continue;
      }

      const data = await resp.json();
      const raw =
        data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "";
      const parsed = extractFirstJsonObjectFromText(raw);
      if (parsed) return { raw, parsed };
      console.warn(`[${model}] No valid JSON in response, trying next model`);
    } catch (err) {
      console.error(`[${model}] Error:`, err.message);
    }
  }
  throw new Error("All LLM models failed to return valid JSON");
}

/** Upsert Finny items into recurring_streams. Excludes items whose merchant already exists in Plaid streams. */
export async function upsertFinnyStreamsIntoRecurring(
  supabase,
  userId,
  enriched,
  existingPlaidMerchants,
) {
  const plaidMerchantSet = new Set(
    (existingPlaidMerchants || []).map((m) => (m || "").toLowerCase().trim()),
  );

  const seenStreamIds = new Set();
  const toRow = (item, category, streamType) => {
    const merchant = (item.merchant || "").trim();
    const merchantKey = merchant.toLowerCase();
    if (plaidMerchantSet.has(merchantKey)) return null;

    let streamId = `finny-${streamType}-${merchantKey.replace(/[^a-z0-9]/g, "-")}`;
    let suffix = 0;
    while (seenStreamIds.has(streamId)) {
      suffix++;
      streamId = `finny-${streamType}-${merchantKey.replace(/[^a-z0-9]/g, "-")}-${suffix}`;
    }
    seenStreamIds.add(streamId);
    const rawAmount = parseFloat(item.typical_amount) || 0;
    const amount = Math.abs(rawAmount);
    const transactionIds = Array.isArray(item.transaction_ids)
      ? item.transaction_ids
      : [];
    // Plaid convention: negative = inflow (income), positive = outflow
    const signedAmount = streamType === "income" ? -amount : amount;

    return {
      user_id: userId,
      item_id: null,
      account_id: null,
      stream_id: streamId,
      source: "finny",
      stream_type: streamType,
      flow_type: streamType === "income" ? "inflow" : "outflow",
      description: merchant,
      merchant_name: merchant,
      category: item.note || merchant,
      average_amount: signedAmount,
      last_amount: signedAmount,
      iso_currency_code: "USD",
      frequency: (item.frequency || "monthly").toLowerCase(),
      first_date: null,
      last_date: null,
      is_active: true,
      transaction_ids: transactionIds,
      last_synced_at: new Date().toISOString(),
    };
  };

  const rows = [];

  (enriched.newly_found_subscriptions || []).forEach((item) => {
    const r = toRow(item, "subscription", "subscription");
    if (r) rows.push(r);
  });
  (enriched.newly_found_income || []).forEach((item) => {
    const r = toRow(item, "income", "income");
    if (r) rows.push(r);
  });
  (enriched.peer_payments || []).forEach((item) => {
    const r = toRow(item, "peer_payment", "other");
    if (r) rows.push(r);
  });
  (enriched.recurring_fees || []).forEach((item) => {
    const r = toRow(item, "recurring_fee", "other");
    if (r) rows.push(r);
  });

  if (rows.length === 0) return { upserted: 0 };

  // Mark existing Finny streams as inactive, then upsert new ones
  await supabase
    .from("recurring_streams")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("source", "finny");

  const { data, error } = await supabase
    .from("recurring_streams")
    .upsert(rows, { onConflict: "stream_id", ignoreDuplicates: false })
    .select();

  if (error) {
    throw new Error(`Failed to upsert Finny streams: ${error.message}`);
  }

  return { upserted: data?.length || rows.length };
}

/**
 * Run full analysis: fetch data, call LLM, enrich, save to finny_recurring_analysis, upsert to recurring_streams.
 * @param {object} supabase - Supabase client
 * @param {string} userId - User UUID
 * @param {string|null} itemId - Optional Plaid item_id to scope analysis
 * @param {string} triggerSource - 'new_account' | 'manual'
 * @returns {{ analysisId: string, analysisJson: object, upserted: number }}
 */
export async function runRecurringAnalysis(
  supabase,
  userId,
  itemId,
  triggerSource = "manual",
) {
  const [transactions, existingStreams] = await Promise.all([
    fetchTransactionsForAnalysis(supabase, userId, itemId),
    fetchExistingRecurringStreams(supabase, userId, itemId),
  ]);

  if (transactions.length === 0) {
    return {
      analysisId: null,
      analysisJson: {},
      upserted: 0,
      reason: "no_transactions",
    };
  }

  const prompt = buildRecurringAnalysisPrompt(
    transactions,
    existingStreams.map((s) => ({
      description: s.description,
      merchant_name: s.merchant_name,
    })),
  );

  const { parsed } = await callLLM(prompt);
  const enriched = enrichWithTransactionIds(parsed, transactions);

  const summary = enriched.summary || "No summary provided.";
  const analysisText =
    typeof summary === "string" ? summary : JSON.stringify(enriched, null, 2);

  const { data: inserted, error: insertError } = await supabase
    .from("finny_recurring_analysis")
    .insert({
      user_id: userId,
      item_id: itemId || null,
      analysis_text: analysisText,
      analysis_json: enriched,
      trigger_source: triggerSource,
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    throw new Error(`Failed to save analysis: ${insertError.message}`);
  }

  const existingPlaidMerchants = existingStreams
    .filter((s) => s.stream_id && !String(s.stream_id).startsWith("finny-"))
    .map((s) => s.merchant_name || s.description);

  const { upserted } = await upsertFinnyStreamsIntoRecurring(
    supabase,
    userId,
    enriched,
    existingPlaidMerchants,
  );

  return {
    analysisId: inserted.id,
    analysisJson: enriched,
    upserted,
  };
}

#!/usr/bin/env node

/**
 * CLI Script: Finny Recurring Transaction Analysis
 * ===============================================
 * Runs LLM analysis on last 4 months of transactions to find recurring patterns.
 * Complements Plaid's recurring streams by using merchant naming (Spotify, Netflix, etc.)
 *
 * Usage:
 *   node scripts/analyze-recurring-transactions.js --user-id <uuid>
 *   node scripts/analyze-recurring-transactions.js --user-id <uuid> --item-id <plaid_item_id>
 *
 * Requires: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 */

import "dotenv/config";
import { supabase } from "../lib/api/supabase.js";
import { buildRecurringAnalysisPrompt } from "../lib/prompt_engine.js";
import { extractFirstJsonObjectFromText } from "../lib/early_insights.js";

const STANDARD_MODEL = "meta-llama/llama-3.2-3b-instruct";
const REASONING_MODEL =
  process.env.REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout";

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { userId: null, itemId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user-id" && args[i + 1]) {
      out.userId = args[i + 1];
      i++;
    } else if (args[i] === "--item-id" && args[i + 1]) {
      out.itemId = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Finny Recurring Analysis - Analyze last 4 months of transactions with LLM.

Usage:
  node scripts/analyze-recurring-transactions.js --user-id <uuid>
  node scripts/analyze-recurring-transactions.js --user-id <uuid> --item-id <plaid_item_id>

Options:
  --user-id   Required. User UUID.
  --item-id   Optional. Plaid item_id to scope analysis to one connection.
  --help      Show this help.
`);
      process.exit(0);
    }
  }
  return out;
}

async function fetchTransactions(userId, itemId) {
  const fourMonthsAgo = new Date();
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
  const startDate = fourMonthsAgo.toISOString().split("T")[0];

  let query = supabase
    .from("transactions")
    .select(
      "date, amount, name, merchant_name, category, top_category, new_category"
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
    if (accountIds.length === 0) {
      console.warn(`No accounts found for item_id ${itemId}`);
      return [];
    }
    query = query.in("account_id", accountIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }
  return data || [];
}

async function callLLM(prompt) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured. Set it in .env");
  }

  const models = [REASONING_MODEL, STANDARD_MODEL];

  for (const model of models) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`OpenRouter ${model} error ${resp.status}:`, text);
        continue;
      }

      const data = await resp.json();
      const raw =
        data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "";
      const parsed = extractFirstJsonObjectFromText(raw);
      if (parsed) {
        return { raw, parsed };
      }
      console.warn(`[${model}] No valid JSON in response, trying next model`);
    } catch (err) {
      console.error(`[${model}] Error:`, err.message);
    }
  }
  throw new Error("All LLM models failed to return valid JSON");
}

async function main() {
  const { userId, itemId } = parseArgs();
  if (!userId) {
    console.error("Error: --user-id is required. Use --help for usage.");
    process.exit(1);
  }

  console.log("📊 Finny Recurring Analysis");
  console.log("  user_id:", userId);
  if (itemId) console.log("  item_id:", itemId);
  console.log("");

  const transactions = await fetchTransactions(userId, itemId);
  console.log(`  Fetched ${transactions.length} transactions (last 4 months)`);
  if (transactions.length === 0) {
    console.log("  No transactions to analyze. Exiting.");
    process.exit(0);
  }

  const prompt = buildRecurringAnalysisPrompt(transactions);
  console.log("  Calling LLM...");

  const { raw, parsed } = await callLLM(prompt);
  console.log("  LLM response received.");

  // Build analysis_text from parsed summary + structured data
  const summary = parsed.summary || "No summary provided.";
  const analysisText =
    typeof summary === "string"
      ? summary
      : JSON.stringify(parsed, null, 2);

  const { data: inserted, error } = await supabase
    .from("finny_recurring_analysis")
    .insert({
      user_id: userId,
      item_id: itemId || null,
      analysis_text: analysisText,
      analysis_json: parsed,
      trigger_source: "manual",
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("  Failed to save to DB:", error.message);
    console.log("\n--- LLM Output (parsed) ---");
    console.log(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  console.log("  Saved to finny_recurring_analysis:", inserted.id);
  console.log("  created_at:", inserted.created_at);
  console.log("\n--- Summary ---");
  console.log(analysisText);
  console.log("\n--- Parsed JSON ---");
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

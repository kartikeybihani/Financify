// /api/transactions_sync.js
import { client } from "../lib/api/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import {
  mapPlaidToAppCategory,
  isInternalTransfer,
} from "../lib/plaidCategoryMapper.js";
import { verifyItemOwnership } from "../lib/api/auth.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";
import fetch from "node-fetch";
import {
  callOnboardingLLM,
  callAccountCompletenessLLM,
  computePatterns,
  extractFirstJsonObjectFromText,
  getDateRangeLast6Months,
  getLast6MonthKeys,
  isLikelyInternalOrPayment,
  selectTopPatternsForLLM,
  formatDate,
} from "../lib/early_insights.js";
import {
  buildBudgetGenerationPrompt,
  buildCategoryMappingPrompt,
} from "../lib/prompt_engine.js";
import { getColorForCategoryName } from "../lib/categoryColors.js";
import { runRecurringAnalysis } from "../lib/recurringAnalysis.js";
import crypto from "crypto";
import {
  hasAcceptedAiConsent,
  ONBOARDING_AI_CONSENT_KEY,
  CHAT_MEMORY_CONSENT_KEY,
} from "../lib/aiConsent.js";
import {
  STANDARD_MODEL,
  TERTIARY_MODEL,
  getOpenRouterKey,
} from "../core/finny/utils/constants/modelConfig.js";
import {
  applyAiSummary,
  buildStructuredLlmFailureMarker,
  classifyOnboardingAiFailure,
  createAiEnrichmentSummary,
  getConsentStateForRun,
  shouldRetryOnboardingFailure,
} from "../lib/onboarding_ai_reliability.js";

function generateUUID() {
  return crypto.randomUUID();
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function toSafeJsonb(value) {
  return value === undefined ? null : value;
}

function trimFailureMessage(value, max = 4000) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function buildOnboardingRunPayload({
  userId,
  itemId,
  requestId,
  apiBuild,
  runType,
  status = "running",
  attemptNo = 1,
  maxAttempts = 1,
  model = null,
  enrichmentMode = null,
  consentState = "none",
  txRows = null,
  filteredRows = null,
  patternCount = null,
  httpStatus = null,
  latencyMs = null,
  failureStage = null,
  failureReasonCode = null,
  failureMessage = null,
  retryable = null,
  outputValid = null,
  profileWriteOk = null,
  llmRequestPayload = null,
  llmResponsePayload = null,
  llmResponseText = null,
  resultPayload = null,
}) {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    item_id: itemId || null,
    request_id: requestId,
    api_build: apiBuild,
    run_type: runType,
    status,
    attempt_no: Number(attemptNo || 1),
    max_attempts: Number(maxAttempts || 1),
    model: model || null,
    enrichment_mode: enrichmentMode || null,
    consent_state: consentState || "none",
    started_at: now,
    completed_at: status === "running" ? null : now,
    tx_rows: Number.isFinite(txRows) ? Number(txRows) : null,
    filtered_rows: Number.isFinite(filteredRows) ? Number(filteredRows) : null,
    pattern_count: Number.isFinite(patternCount) ? Number(patternCount) : null,
    http_status: Number.isFinite(httpStatus) ? Number(httpStatus) : null,
    latency_ms: Number.isFinite(latencyMs) ? Number(latencyMs) : null,
    failure_stage: failureStage || null,
    failure_reason_code: failureReasonCode || null,
    failure_message: trimFailureMessage(failureMessage),
    retryable:
      retryable === null || retryable === undefined ? null : retryable === true,
    output_valid:
      outputValid === null || outputValid === undefined
        ? null
        : outputValid === true,
    profile_write_ok:
      profileWriteOk === null || profileWriteOk === undefined
        ? null
        : profileWriteOk === true,
    llm_request_payload: toSafeJsonb(llmRequestPayload),
    llm_response_payload: toSafeJsonb(llmResponsePayload),
    llm_response_text:
      llmResponseText == null ? null : String(llmResponseText).slice(0, 120000),
    result_payload: toSafeJsonb(resultPayload),
    updated_at: now,
  };
}

async function insertOnboardingRun(payload) {
  try {
    const { data, error } = await supabase
      .from("onboarding_ai_runs")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[TRANSACTIONS_SYNC] onboarding_ai_runs insert failed", error);
      return null;
    }
    return data?.id || null;
  } catch (error) {
    console.error(
      "[TRANSACTIONS_SYNC] onboarding_ai_runs insert exception",
      error,
    );
    return null;
  }
}

async function updateOnboardingRun(runId, patch) {
  if (!runId) return;
  const now = new Date().toISOString();
  try {
    const { error } = await supabase
      .from("onboarding_ai_runs")
      .update({
        ...patch,
        updated_at: now,
      })
      .eq("id", runId);
    if (error) {
      console.error("[TRANSACTIONS_SYNC] onboarding_ai_runs update failed", error);
    }
  } catch (error) {
    console.error(
      "[TRANSACTIONS_SYNC] onboarding_ai_runs update exception",
      error,
    );
  }
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getOrCreateCurrentBudgetPeriod(userId) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 0);

  const periodStartStr = formatLocalDate(periodStart);
  const periodEndStr = formatLocalDate(periodEnd);

  // Keep a single active period and reuse it.
  const { data: existing, error: fetchError } = await supabase
    .from("budget_periods")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("Error fetching active budget period:", fetchError);
    return null;
  }

  if (existing) {
    if (
      existing.period_start !== periodStartStr ||
      existing.period_end !== periodEndStr
    ) {
      const { data: updatedPeriod, error: updateError } = await supabase
        .from("budget_periods")
        .update({
          period_start: periodStartStr,
          period_end: periodEndStr,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (!updateError && updatedPeriod) {
        return updatedPeriod;
      }
    }

    return {
      ...existing,
      period_start: periodStartStr,
      period_end: periodEndStr,
    };
  }

  // Create new period
  const periodName =
    periodStart.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }) + " Budget";

  const { data: newPeriod, error: createError } = await supabase
    .from("budget_periods")
    .insert({
      user_id: userId,
      name: periodName,
      period_start: periodStartStr,
      period_end: periodEndStr,
      period_type: "monthly",
      status: "active", // Set as active when created via Finny
    })
    .select()
    .single();

  if (createError) {
    console.error("Error creating budget period:", createError);
    return null;
  }

  return newPeriod;
}

async function upsertBudgetEntry(budgetPeriodId, entry) {
  // Check if entry exists (for category entries, check by category_id)
  let existingId = null;

  if (entry.scope_type === "category" && entry.category_id) {
    const { data: existing } = await supabase
      .from("budget_entries")
      .select("id")
      .eq("budget_period_id", budgetPeriodId)
      .eq("scope_type", "category")
      .eq("category_id", entry.category_id)
      .maybeSingle();

    existingId = existing?.id || null;
  }

  if (existingId) {
    // Update existing
    const { data, error } = await supabase
      .from("budget_entries")
      .update({
        label: entry.label,
        limit_amount: entry.limit_amount,
        is_flexible: entry.is_flexible ?? false,
      })
      .eq("id", existingId)
      .select()
      .single();

    if (error) {
      console.error("Error updating budget entry:", error);
      return null;
    }

    return data;
  } else {
    // Insert new
    const { data, error } = await supabase
      .from("budget_entries")
      .insert({
        budget_period_id: budgetPeriodId,
        scope_type: entry.scope_type,
        category_id: entry.category_id || null,
        group_key: entry.group_key || null,
        label: entry.label,
        limit_amount: entry.limit_amount,
        is_flexible: entry.is_flexible ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating budget entry:", error);
      return null;
    }

    return data;
  }
}

/**
 * Ensures "Other" category exists for the user and adds it to budget entries
 * @param {string} userId - User ID
 * @param {string} budgetPeriodId - Budget period ID
 * @returns {Promise<string|null>} - Category ID of "Other" category, or null if error
 */
async function ensureOtherCategoryExists(userId, budgetPeriodId) {
  try {
    // Check if "Other" category exists
    const { data: existingOther, error: fetchError } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Other")
      .maybeSingle();

    let otherCategoryId = existingOther?.id;

    if (!otherCategoryId) {
      // Create "Other" category
      const newCategoryId = generateUUID();
      const { error: categoryError } = await supabase
        .from("categories")
        .insert({
          id: newCategoryId,
          user_id: userId,
          name: "Other",
          slug: "other",
          icon: "📦",
          color: "#607D8B",
          rank: 999,
          is_active: true,
        });

      if (categoryError) {
        console.error("Error creating 'Other' category:", categoryError);
        return null;
      }

      otherCategoryId = newCategoryId;
      console.log("✅ Created 'Other' category for user:", userId);
    }

    // Add Other budget entry only if it doesn't exist yet (don't overwrite—draft/LLM may have set a limit)
    const { data: existingEntry } = await supabase
      .from("budget_entries")
      .select("id")
      .eq("budget_period_id", budgetPeriodId)
      .eq("category_id", otherCategoryId)
      .maybeSingle();

    if (!existingEntry) {
      await upsertBudgetEntry(budgetPeriodId, {
        scope_type: "category",
        category_id: otherCategoryId,
        label: "Other",
        limit_amount: 0,
      });
    }

    return otherCategoryId;
  } catch (error) {
    console.error("Error ensuring 'Other' category exists:", error);
    return null;
  }
}

async function callLLM(prompt, options = {}) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const { temperature = 0.3 } = options;
  const models = [STANDARD_MODEL, TERTIARY_MODEL];

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
            temperature,
            max_tokens: 2000,
            messages: [
              {
                role: "system",
                content:
                  "You are a financial coach assistant. Always return valid JSON only, no other text.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`OpenRouter error ${resp.status}: ${errorText}`);
        if (model === models[models.length - 1]) {
          throw new Error(`OpenRouter error: ${errorText}`);
        }
        continue; // Try next model
      }

      const data = await resp.json();
      const rawContent =
        data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "";

      // Log the raw LLM response for debugging
      console.log(`[BUDGET_LLM] Raw response from ${model}:`, rawContent);
      console.log(
        `[BUDGET_LLM] Raw response length: ${rawContent.length} characters`,
      );

      // Extract JSON from response using robust extraction (handles fenced blocks and extra text)
      const parsedJson = extractFirstJsonObjectFromText(rawContent);
      if (parsedJson && parsedJson.categories) {
        console.log(
          `[BUDGET_LLM] Successfully parsed JSON. Found ${parsedJson.categories.length} categories`,
        );
        // Return both parsed JSON and raw response
        return {
          categories: parsedJson.categories || [],
          rawResponse: rawContent,
        };
      }

      // Log the raw content for debugging if extraction failed
      console.error(
        `[BUDGET_LLM] Failed to extract JSON from ${model} response. Raw content (first 1000 chars):`,
        rawContent.substring(0, 1000),
      );
      console.error(`[BUDGET_LLM] Full raw content:`, rawContent);
      throw new Error("No valid JSON found in LLM response");
    } catch (error) {
      console.error(`Error with model ${model}:`, error);
      if (model === models[models.length - 1]) {
        throw error;
      }
      // Try next model
    }
  }

  throw new Error("All LLM models failed");
}

/**
 * Calls LLM for category mapping (different response format than budget generation)
 * @param {string} prompt - Category mapping prompt
 * @returns {Promise<{mappings: Object}>} - Mappings object with transaction keys -> budget category names
 */
async function callLLMForMapping(prompt) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const models = [STANDARD_MODEL, TERTIARY_MODEL];

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
            temperature: 0.3, // Lower temperature for more consistent mapping
            max_tokens: 2000,
            messages: [
              {
                role: "system",
                content:
                  "You are a financial coach assistant. Always return valid JSON only, no other text.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`OpenRouter error ${resp.status}: ${errorText}`);
        if (model === models[models.length - 1]) {
          throw new Error(`OpenRouter error: ${errorText}`);
        }
        continue; // Try next model
      }

      const data = await resp.json();
      const rawContent =
        data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "";

      // Extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedJson = JSON.parse(jsonMatch[0]);
        return {
          mappings: parsedJson.mappings || {},
          rawResponse: rawContent,
        };
      }

      throw new Error("No valid JSON found in LLM response");
    } catch (error) {
      console.error(`Error with model ${model}:`, error);
      if (model === models[models.length - 1]) {
        throw error;
      }
      // Try next model
    }
  }

  throw new Error("All LLM models failed");
}

/**
 * Remaps existing transactions to budget categories using AI
 * Runs in background after budget creation
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function remapTransactionsToBudgetCategories(userId) {
  try {
    console.log(
      `[CATEGORY_MAPPING] Starting remapping for user: ${userId.substring(
        0,
        8,
      )}`,
    );

    // Update budget period status to indicate mapping is in progress
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const periodStartStr = formatLocalDate(new Date(year, month, 1));
    const periodEndStr = formatLocalDate(new Date(year, month + 1, 0));

    // Find active budget period
    const { data: activePeriod } = await supabase
      .from("budget_periods")
      .select("id")
      .eq("user_id", userId)
      .eq("period_start", periodStartStr)
      .eq("period_end", periodEndStr)
      .eq("status", "active")
      .maybeSingle();

    if (!activePeriod) {
      console.log(
        `[CATEGORY_MAPPING] No active budget period found (period ${periodStartStr}–${periodEndStr}), skipping`,
      );
      return;
    }

    console.log(
      `[CATEGORY_MAPPING] Found active period ${activePeriod.id}, fetching unmapped transactions...`,
    );

    // Update status to indicate mapping is in progress
    await supabase
      .from("budget_periods")
      .update({ category_mapping_status: "in_progress" })
      .eq("id", activePeriod.id);

    // 1. Collect transaction categories (last 4 months, exclude income and internal transfers)
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    const startDate = fourMonthsAgo.toISOString().split("T")[0];

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("top_category, sub_category")
      .eq("user_id", userId)
      .is("category_id", null) // Only unmapped transactions
      .gte("date", startDate)
      .gt("amount", 0) // Only expenses (exclude income where amount < 0)
      .neq("top_category", "INTERNAL_TRANSFER") // Exclude internal transfers
      .neq("top_category", "Income") // Exclude income
      .order("top_category, sub_category");

    if (txError) {
      console.error("[CATEGORY_MAPPING] Error fetching transactions:", txError);
      await supabase
        .from("budget_periods")
        .update({ category_mapping_status: "failed" })
        .eq("id", activePeriod.id);
      return;
    }

    if (!transactions || transactions.length === 0) {
      // Fetch count of total transactions in range for context
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("date", startDate)
        .gt("amount", 0);
      console.log(
        `[CATEGORY_MAPPING] No unmapped transactions (category_id=null) in range ${startDate}–now. Total expenses in range: ${count ?? "?"}. LLM not called.`,
      );
      await supabase
        .from("budget_periods")
        .update({ category_mapping_status: "completed" })
        .eq("id", activePeriod.id);
      return;
    }

    // Get unique transaction categories
    const categorySet = new Set();
    transactions.forEach((tx) => {
      const key = `${tx.top_category}|${tx.sub_category || ""}`;
      categorySet.add(key);
    });

    const transactionCategories = Array.from(categorySet).map((key) => {
      const [top, sub] = key.split("|");
      return { top_category: top, sub_category: sub || null };
    });

    console.log(
      `[CATEGORY_MAPPING] Found ${transactions.length} unmapped transactions → ${transactionCategories.length} unique categories to map`,
    );

    // 2. Collect budget categories
    // First get category IDs from budget entries
    const { data: budgetEntries, error: entriesError } = await supabase
      .from("budget_entries")
      .select("category_id")
      .eq("budget_period_id", activePeriod.id)
      .not("category_id", "is", null);

    if (entriesError) {
      console.error(
        "[CATEGORY_MAPPING] Error fetching budget entries:",
        entriesError,
      );
      await supabase
        .from("budget_periods")
        .update({ category_mapping_status: "failed" })
        .eq("id", activePeriod.id);
      return;
    }

    const categoryIds = budgetEntries
      .map((entry) => entry.category_id)
      .filter(Boolean);

    if (categoryIds.length === 0) {
      console.log(
        "[CATEGORY_MAPPING] No budget entries with category_id found, skipping. LLM not called.",
      );
      await supabase
        .from("budget_periods")
        .update({ category_mapping_status: "completed" })
        .eq("id", activePeriod.id);
      return;
    }

    const { data: budgetCategories, error: budgetError } = await supabase
      .from("categories")
      .select("id, name")
      .in("id", categoryIds)
      .eq("is_active", true)
      .order("name");

    if (budgetError) {
      console.error(
        "[CATEGORY_MAPPING] Error fetching budget categories:",
        budgetError,
      );
      await supabase
        .from("budget_periods")
        .update({ category_mapping_status: "failed" })
        .eq("id", activePeriod.id);
      return;
    }

    if (!budgetCategories || budgetCategories.length === 0) {
      console.log(
        "[CATEGORY_MAPPING] No active categories found for budget entries, skipping. LLM not called.",
      );
      await supabase
        .from("budget_periods")
        .update({ category_mapping_status: "completed" })
        .eq("id", activePeriod.id);
      return;
    }

    console.log(
      `[CATEGORY_MAPPING] Found ${budgetCategories.length} budget categories`,
    );

    // 3. Create AI mapping prompt
    const prompt = buildCategoryMappingPrompt(
      transactionCategories,
      budgetCategories,
    );

    // 4. Call AI for mapping
    console.log(
      `[CATEGORY_MAPPING] Calling LLM (${transactionCategories.length} tx categories → ${budgetCategories.length} budget categories)...`,
    );
    const llmResponse = await callLLMForMapping(prompt);
    console.log(
      "[CATEGORY_MAPPING] LLM returned successfully, applying mappings...",
    );

    if (!llmResponse.mappings || typeof llmResponse.mappings !== "object") {
      console.error(
        "[CATEGORY_MAPPING] Invalid LLM response format:",
        llmResponse,
      );
      await supabase
        .from("budget_periods")
        .update({ category_mapping_status: "failed" })
        .eq("id", activePeriod.id);
      return;
    }

    let mappings = llmResponse.mappings || {};

    // 5. Ensure ALL transaction categories have a mapping (orphan → Other)
    const allTransactionKeys = Array.from(categorySet);
    for (const key of allTransactionKeys) {
      if (!(key in mappings) || mappings[key] === undefined) {
        mappings[key] = null; // null → Other in update loop
        console.log(
          `[CATEGORY_MAPPING] Orphan category "${key}" not in LLM response, mapping to Other`,
        );
      }
    }

    const llmKeyCount = Object.keys(llmResponse.mappings || {}).length;
    const orphanCount = allTransactionKeys.filter(
      (k) => mappings[k] === null,
    ).length;
    console.log(
      `[CATEGORY_MAPPING] Final mappings: ${Object.keys(mappings).length} (LLM: ${llmKeyCount}, orphan→Other: ${orphanCount})`,
    );

    // 6. Get "Other" category ID
    const { data: otherCategory } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Other")
      .maybeSingle();

    const otherCategoryId = otherCategory?.id || null;

    // 7. Bulk update transactions
    let updatedCount = 0;
    for (const [transactionKey, budgetCategoryName] of Object.entries(
      mappings,
    )) {
      const [top, sub] = transactionKey.split("|");

      let targetCategoryId = null;

      if (budgetCategoryName === null) {
        // Assign to "Other"
        targetCategoryId = otherCategoryId;
      } else {
        // Find budget category ID
        const budgetCategory = budgetCategories.find(
          (c) => c.name === budgetCategoryName,
        );
        if (budgetCategory) {
          targetCategoryId = budgetCategory.id;
        } else {
          // Category not found, assign to "Other"
          console.warn(
            `[CATEGORY_MAPPING] Budget category "${budgetCategoryName}" not found, assigning to "Other"`,
          );
          targetCategoryId = otherCategoryId;
        }
      }

      if (targetCategoryId) {
        // Build update query
        let updateQuery = supabase
          .from("transactions")
          .update({ category_id: targetCategoryId })
          .eq("user_id", userId)
          .eq("top_category", top)
          .is("category_id", null);

        if (sub) {
          updateQuery = updateQuery.eq("sub_category", sub);
        } else {
          updateQuery = updateQuery.is("sub_category", null);
        }

        const { error: updateError } = await updateQuery;

        if (updateError) {
          console.error(
            `[CATEGORY_MAPPING] Error updating transactions for ${transactionKey}:`,
            updateError,
          );
        } else {
          updatedCount++;
        }
      }
    }

    console.log(
      `[CATEGORY_MAPPING] DB updates: ${updatedCount} transaction groups assigned to budget categories`,
    );

    // 8. Store LLM result in budget_periods and update status to completed
    const categoryMappingResult = {
      mappings,
      transaction_categories_count: transactionCategories.length,
      budget_categories_count: budgetCategories.length,
    };

    await supabase
      .from("budget_periods")
      .update({
        category_mapping_status: "completed",
        category_mapping_result: categoryMappingResult,
      })
      .eq("id", activePeriod.id);

    console.log(
      `[CATEGORY_MAPPING] Remapping completed for user ${userId.substring(0, 8)}. Status=completed.`,
    );
  } catch (error) {
    console.error("[CATEGORY_MAPPING] Error during remapping:", error);

    // Update status to failed
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const periodStartStr = formatLocalDate(new Date(year, month, 1));
      const periodEndStr = formatLocalDate(new Date(year, month + 1, 0));

      const { data: activePeriod } = await supabase
        .from("budget_periods")
        .select("id")
        .eq("user_id", userId)
        .eq("period_start", periodStartStr)
        .eq("period_end", periodEndStr)
        .eq("status", "active")
        .maybeSingle();

      if (activePeriod) {
        await supabase
          .from("budget_periods")
          .update({ category_mapping_status: "failed" })
          .eq("id", activePeriod.id);
      }
    } catch (statusError) {
      console.error(
        "[CATEGORY_MAPPING] Error updating status to failed:",
        statusError,
      );
    }
  }
}

async function handleBudgetCreation(req, res, userId) {
  try {
    const { income, savingsAmount, categories, save } = req.body;

    const incomeVal = Number(income);
    if (!income || isNaN(incomeVal) || incomeVal < 100) {
      return res.status(400).json({
        error: "Monthly income must be at least $100",
      });
    }

    // If categories are provided and save flag is true, save to database
    if (categories && Array.isArray(categories) && save) {
      try {
        // Get or create budget period (prefer latest draft if exists)
        const { data: draftPeriod } = await supabase
          .from("budget_periods")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "draft")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let period = draftPeriod;

        // If no draft, get or create active period
        if (!period) {
          period = await getOrCreateCurrentBudgetPeriod(userId);
          if (!period) {
            return res.status(500).json({
              error: "Failed to create budget period",
            });
          }
        }

        // Ensure period is set to active (activate draft)
        if (period.status !== "active") {
          const { data: updatedPeriod, error: updateError } = await supabase
            .from("budget_periods")
            .update({ status: "active" })
            .eq("id", period.id)
            .select()
            .single();

          if (!updateError && updatedPeriod) {
            period = updatedPeriod;
          }
        }

        // Create categories and budget entries
        const createdCategories = [];
        for (const cat of categories) {
          // Check if category exists
          const { data: existingCategory } = await supabase
            .from("categories")
            .select("id")
            .eq("user_id", userId)
            .eq("name", cat.name)
            .maybeSingle();

          let categoryId = existingCategory?.id;

          if (!categoryId) {
            // Create category
            const newCategoryId = generateUUID();
            const slug = cat.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");

            const { error: categoryError } = await supabase
              .from("categories")
              .insert({
                id: newCategoryId,
                user_id: userId,
                name: cat.name,
                slug: slug,
                icon: cat.icon || "📦",
                color: getColorForCategoryName(cat.name),
                rank: 0,
                is_active: true,
              });

            if (categoryError) {
              console.error("Error creating category:", categoryError);
              continue;
            }

            categoryId = newCategoryId;
          } else if (cat.icon) {
            // Update icon on existing category to match Finny's choice
            await supabase
              .from("categories")
              .update({ icon: cat.icon })
              .eq("id", categoryId);
          }

          // Create budget entry
          await upsertBudgetEntry(period.id, {
            scope_type: "category",
            category_id: categoryId,
            label: cat.name,
            limit_amount: cat.limit,
          });

          createdCategories.push({ name: cat.name, limit: cat.limit });
        }

        // Ensure "Other" category exists and is added to budget entries
        await ensureOtherCategoryExists(userId, period.id);

        // Run category mapping (must await—serverless terminates after response)
        try {
          await remapTransactionsToBudgetCategories(userId);
        } catch (mapError) {
          console.error(
            "[BUDGET_CREATION] Error in category mapping:",
            mapError,
          );
          // Non-blocking: budget is saved, mapping can be retried later
        }

        // Update onboarding progress - mark budget_setup as complete
        const { error: onboardingError } = await supabase
          .from("onboarding_progress")
          .upsert(
            {
              user_id: userId,
              budget_setup: true,
            },
            {
              onConflict: "user_id",
            },
          );

        if (onboardingError) {
          // Non-critical - log but don't fail
          console.error("Error updating onboarding progress:", onboardingError);
        }

        return res.status(200).json({
          success: true,
          message: "Budget created successfully",
          categories: createdCategories,
        });
      } catch (error) {
        console.error("Error saving budget:", error);
        return res.status(500).json({
          error: "Failed to save budget",
          message: error.message,
        });
      }
    }

    // Generate budget (if categories not provided)
    try {
      // Fetch user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("age, occupation, location, first_name")
        .eq("id", userId)
        .maybeSingle();

      // Fetch last 3 months of transactions
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const startDate = threeMonthsAgo.toISOString().split("T")[0];

      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select(
          "date, amount, merchant_name, name, category, top_category, new_category",
        )
        .eq("user_id", userId)
        .gte("date", startDate)
        .gt("amount", 0) // Only expenses
        .order("date", { ascending: false });

      if (txError) {
        console.error("Error fetching transactions:", txError);
        // Continue with empty transactions array
      }

      // Build prompt
      const prompt = buildBudgetGenerationPrompt({
        userProfile: profile || {},
        transactions: transactions || [],
        income,
        savingsAmount: savingsAmount || null,
      });

      console.log("Complete prompt sent to Finny:", prompt);

      // Call LLM with lower temperature for stricter adherence to income constraint
      const llmResponse = await callLLM(prompt, { temperature: 0.3 });

      if (!llmResponse.categories || !Array.isArray(llmResponse.categories)) {
        console.error("Invalid LLM response:", llmResponse);
        throw new Error("Invalid response format from LLM");
      }

      // Enforce integer limits (LLM may return decimals)
      llmResponse.categories.forEach((cat) => {
        const val = cat.limit;
        cat.limit = Math.round(Number(val) || 0);
      });

      // Ensure Savings category is included (should be first category)
      const savingsAmountValue =
        savingsAmount != null && Number(savingsAmount) > 0
          ? Number(savingsAmount)
          : Math.round(income * 0.02);
      const savingsCategoryIndex = llmResponse.categories.findIndex(
        (cat) => cat.name.toLowerCase() === "savings",
      );

      if (savingsCategoryIndex < 0) {
        // Add Savings as the first category
        llmResponse.categories.unshift({
          name: "Savings",
          icon: "💰",
          limit: savingsAmountValue,
        });
        console.log(
          `Added "Savings" category with limit $${savingsAmountValue}`,
        );
      } else {
        // Ensure Savings has the correct amount and is first
        llmResponse.categories[savingsCategoryIndex].limit = savingsAmountValue;
        if (savingsCategoryIndex !== 0) {
          // Move Savings to first position
          const savingsCategory = llmResponse.categories.splice(
            savingsCategoryIndex,
            1,
          )[0];
          llmResponse.categories.unshift(savingsCategory);
          console.log(`Moved "Savings" category to first position`);
        }
      }

      // Validate and normalize budget total to match constraint exactly (should equal full income)
      let totalBudget = llmResponse.categories.reduce(
        (sum, cat) => sum + (cat.limit || 0),
        0,
      );
      const expectedTotal = Math.round(incomeVal);
      const difference = expectedTotal - totalBudget;
      let normalizationAdded = 0; // Amount we had to add when LLM under-allocated

      if (Math.abs(difference) > 1) {
        console.warn(
          `Budget total mismatch: Expected $${expectedTotal}, got $${totalBudget}. Difference: $${difference}. Normalizing...`,
        );
        console.log(
          `Categories before normalization:`,
          llmResponse.categories
            .map((c) => `${c.name}: $${c.limit}`)
            .join(", "),
        );

        // Proportional multi-category normalization
        const categories = llmResponse.categories;
        const savingsIdx = categories.findIndex(
          (c) => c.name.toLowerCase() === "savings",
        );
        const savingsLimit =
          savingsIdx >= 0 ? categories[savingsIdx].limit || 0 : 0;
        const otherIdx = categories.findIndex(
          (c) => c.name.toLowerCase() === "other",
        );

        if (difference > 0) {
          normalizationAdded = Math.round(difference);
          // Under budget: add difference to Other, or largest non-Savings
          const adjustIdx =
            otherIdx >= 0
              ? otherIdx
              : categories.reduce(
                  (best, c, i) =>
                    i !== savingsIdx &&
                    (c.limit || 0) > (categories[best]?.limit || 0)
                      ? i
                      : best,
                  savingsIdx >= 0 ? (savingsIdx === 0 ? 1 : 0) : 0,
                );
          if (adjustIdx >= 0) {
            categories[adjustIdx].limit = Math.round(
              (categories[adjustIdx].limit || 0) + difference,
            );
          }
        } else {
          // Over budget: proportionally scale down non-Savings categories
          const amountToReduce = -difference;
          let adjustableTotal = 0;
          const adjustableIndices = [];
          for (let i = 0; i < categories.length; i++) {
            if (i === savingsIdx) continue;
            const limit = categories[i].limit || 0;
            if (limit > 0) {
              adjustableTotal += limit;
              adjustableIndices.push(i);
            }
          }

          if (adjustableTotal > 0 && adjustableIndices.length > 0) {
            const scale = Math.max(0, 1 - amountToReduce / adjustableTotal);
            let roundedSum = 0;
            const newLimits = [];
            for (const i of adjustableIndices) {
              const raw = Math.round((categories[i].limit || 0) * scale);
              newLimits.push({ i, limit: Math.max(0, raw) });
              roundedSum += newLimits[newLimits.length - 1].limit;
            }
            const roundingDiff = expectedTotal - savingsLimit - roundedSum;
            for (let j = 0; j < newLimits.length; j++) {
              categories[newLimits[j].i].limit = newLimits[j].limit;
            }
            // Absorb rounding in Other, or last adjustable if no Other
            if (Math.abs(roundingDiff) > 0) {
              const absorbIdx =
                otherIdx >= 0
                  ? otherIdx
                  : adjustableIndices[adjustableIndices.length - 1];
              if (absorbIdx >= 0) {
                categories[absorbIdx].limit = Math.max(
                  0,
                  Math.round((categories[absorbIdx].limit || 0) + roundingDiff),
                );
              }
            }
          }
        }

        const newTotal = categories.reduce(
          (sum, cat) => sum + (cat.limit || 0),
          0,
        );
        if (Math.abs(newTotal - expectedTotal) > 1) {
          console.error(
            `Normalization failed: Expected $${expectedTotal}, got $${newTotal}. Difference: $${
              expectedTotal - newTotal
            }`,
          );
          throw new Error(
            "Budget total could not be normalized to match income. Please try again.",
          );
        }
        console.log(
          `✅ Budget normalized successfully. New total: $${newTotal} (matches expected $${expectedTotal})`,
        );
        console.log(
          `Categories after normalization:`,
          categories.map((c) => `${c.name}: $${c.limit}`).join(", "),
        );
      }

      const rawResponse = llmResponse.rawResponse || "";

      // Save as draft budget
      try {
        // Check for existing draft period first (latest draft regardless of month)
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const periodStart = new Date(year, month, 1);
        const periodEnd = new Date(year, month + 1, 0);
        const periodStartStr = formatLocalDate(periodStart);
        const periodEndStr = formatLocalDate(periodEnd);

        const { data: existingDraft } = await supabase
          .from("budget_periods")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "draft")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let period = null;

        if (existingDraft) {
          // Delete old draft entries and update with new analysis
          await supabase
            .from("budget_entries")
            .delete()
            .eq("budget_period_id", existingDraft.id);

          // Update budget_analysis
          await supabase
            .from("budget_periods")
            .update({ budget_analysis: rawResponse })
            .eq("id", existingDraft.id);

          period = existingDraft;
        } else {
          // Create new draft period
          const periodName =
            periodStart.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            }) + " Budget";

          const { data: newPeriod, error: createError } = await supabase
            .from("budget_periods")
            .insert({
              user_id: userId,
              name: periodName,
              period_start: periodStartStr,
              period_end: periodEndStr,
              period_type: "monthly",
              status: "draft",
              budget_analysis: rawResponse,
            })
            .select()
            .single();

          if (!createError && newPeriod) {
            period = newPeriod;
          }
        }

        // Save categories as draft entries
        if (period) {
          for (const cat of llmResponse.categories) {
            // Check if category exists
            const { data: existingCategory } = await supabase
              .from("categories")
              .select("id")
              .eq("user_id", userId)
              .eq("name", cat.name)
              .maybeSingle();

            let categoryId = existingCategory?.id;

            if (!categoryId) {
              // Create category
              const newCategoryId = generateUUID();
              const slug = cat.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");

              const { error: categoryError } = await supabase
                .from("categories")
                .insert({
                  id: newCategoryId,
                  user_id: userId,
                  name: cat.name,
                  slug: slug,
                  icon: cat.icon || "📦",
                  color: "#4A90E2",
                  rank: 0,
                  is_active: true,
                });

              if (!categoryError) {
                categoryId = newCategoryId;
              }
            } else if (cat.icon) {
              await supabase
                .from("categories")
                .update({ icon: cat.icon })
                .eq("id", categoryId);
            }

            // Create draft budget entry
            if (categoryId) {
              await upsertBudgetEntry(period.id, {
                scope_type: "category",
                category_id: categoryId,
                label: cat.name,
                limit_amount: cat.limit,
              });
            }
          }

          // Ensure "Other" category exists and is added to budget entries (even for drafts)
          if (period) {
            await ensureOtherCategoryExists(userId, period.id);
          }
        }
      } catch (draftError) {
        // Non-critical - log but don't fail the request
        console.error("Error saving draft budget:", draftError);
      }

      return res.status(200).json({
        success: true,
        categories: llmResponse.categories,
        ...(normalizationAdded > 0 && { slackAdded: normalizationAdded }),
      });
    } catch (error) {
      console.error("Error generating budget:", error);
      return res.status(500).json({
        error: "Failed to generate budget",
        message: error.message,
      });
    }
  } catch (error) {
    console.error("Error in budget creation:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // Helpful for verifying which deployment is being hit.
  const API_BUILD = "transactions_sync+early_insights+budget@2026-01-26";

  // Check if this is a budget creation request
  const { action } = req.body;
  if (action === "check_draft_budget") {
    try {
      // Authenticate user
      const authHeader =
        req.headers["authorization"] || req.headers["Authorization"];
      const token =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length)
          : null;

      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check latest draft budget period
      const { data: draftPeriod } = await supabase
        .from("budget_periods")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!draftPeriod) {
        return res.status(200).json({
          success: true,
          hasDraft: false,
        });
      }

      // Fetch draft budget entries with categories
      const { data: draftEntries, error: entriesError } = await supabase
        .from("budget_entries")
        .select(
          `
          id,
          label,
          limit_amount,
          categories (
            id,
            name,
            icon
          )
        `,
        )
        .eq("budget_period_id", draftPeriod.id);

      if (entriesError) {
        console.error("Error fetching draft entries:", entriesError);
        return res.status(200).json({
          success: true,
          hasDraft: false,
        });
      }

      // Format categories for response; sort Savings first, Other last
      const formatted =
        draftEntries?.map((entry) => ({
          name: entry.categories?.name || entry.label,
          icon: entry.categories?.icon || "📦",
          limit: entry.limit_amount,
        })) || [];
      const categories = [...formatted].sort((a, b) => {
        const an = (a.name || "").toLowerCase();
        const bn = (b.name || "").toLowerCase();
        if (an === "savings") return -1;
        if (bn === "savings") return 1;
        if (an === "other") return 1;
        if (bn === "other") return -1;
        return an.localeCompare(bn);
      });

      return res.status(200).json({
        success: true,
        hasDraft: true,
        categories,
        budgetAnalysis: draftPeriod.budget_analysis || null,
      });
    } catch (error) {
      console.error("Error checking draft budget:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  if (action === "create_budget") {
    try {
      // Authenticate user
      const authHeader =
        req.headers["authorization"] || req.headers["Authorization"];
      const token =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length)
          : null;

      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      return await handleBudgetCreation(req, res, user.id);
    } catch (error) {
      console.error("Error in budget creation handler:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // Original transactions sync logic
  const {
    item_id,
    user_id,
    skip_enrichment,
    enrichment_mode,
    request_id,
  } = req.body;
  if (!item_id) return res.status(400).json({ error: "Missing item_id" });
  const skipEnrichment = skip_enrichment === true;
  const requestId =
    typeof request_id === "string" && request_id.trim().length > 0
      ? request_id.trim().slice(0, 120)
      : crypto.randomUUID();
  const normalizedEnrichmentMode =
    typeof enrichment_mode === "string"
      ? enrichment_mode.trim().toLowerCase()
      : null;
  const allowedEnrichmentModes = new Set([
    "full",
    "none",
    "base_only",
    "early_only",
  ]);
  const requestedEnrichmentMode = allowedEnrichmentModes.has(
    normalizedEnrichmentMode,
  )
    ? normalizedEnrichmentMode
    : null;
  const effectiveEnrichmentMode = skipEnrichment
    ? "none"
    : requestedEnrichmentMode || "full";

  console.log("[TRANSACTIONS_SYNC] build", {
    API_BUILD,
    request_id: requestId,
    item_id,
    skip_enrichment: skipEnrichment,
    requested_enrichment_mode: requestedEnrichmentMode,
    effective_enrichment_mode: effectiveEnrichmentMode,
  });

  try {
    // 1) Verify user owns this item and get user_id + cursor in one query
    const {
      authorized,
      userId,
      error: authError,
    } = await verifyItemOwnership(req, item_id);

    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }

    const syncRateLimit = await checkRateLimit(req, {
      scope: "transactions_sync",
      userId,
      limit: 4,
      windowMs: 60 * 1000,
    });

    if (!syncRateLimit.allowed) {
      const retryAfter = formatRetryAfterSeconds(syncRateLimit.retryAfterMs);
      if (retryAfter > 0) {
        res.setHeader("Retry-After", retryAfter);
      }
      return res.status(429).json({
        error: "Too many manual sync attempts. Please wait a minute.",
        retry_after: retryAfter,
      });
    }

    const hasOnboardingAiConsent = await hasAcceptedAiConsent(
      supabase,
      userId,
      ONBOARDING_AI_CONSENT_KEY,
    );
    const hasChatMemoryConsent = await hasAcceptedAiConsent(
      supabase,
      userId,
      CHAT_MEMORY_CONSENT_KEY,
    );
    const hasAiEnrichmentConsent =
      hasOnboardingAiConsent || hasChatMemoryConsent;
    const aiEnrichment = createAiEnrichmentSummary();
    const consentState = getConsentStateForRun({
      hasOnboardingAiConsent,
      hasChatMemoryConsent,
    });
    const earlyRetryEnabled =
      String(process.env.ONBOARDING_EARLY_RETRY_ENABLED || "1")
        .trim()
        .toLowerCase() !== "0";
    const earlyMaxAttempts = Math.max(
      1,
      Number(process.env.ONBOARDING_EARLY_MAX_ATTEMPTS || 3),
    );
    const earlyRetryBaseDelayMs = Math.max(
      100,
      Number(process.env.ONBOARDING_EARLY_RETRY_BASE_DELAY_MS || 800),
    );
    const earlyPrimaryModel = "meta-llama/llama-4-scout";
    const fallbackRaw = String(
      process.env.ONBOARDING_EARLY_FALLBACK_MODEL || TERTIARY_MODEL,
    ).trim();
    const earlyFallbackModel =
      fallbackRaw.toLowerCase() === "none" ? null : fallbackRaw || null;
    const shouldRunRecurringAnalysis = effectiveEnrichmentMode === "full";
    const shouldRunEarlyInsights =
      effectiveEnrichmentMode === "full" ||
      effectiveEnrichmentMode === "early_only";
    const shouldRunBaseAnalysis =
      effectiveEnrichmentMode === "full" ||
      effectiveEnrichmentMode === "base_only";
    const shouldRunNotificationPatterns = effectiveEnrichmentMode === "full";

    if (!hasOnboardingAiConsent && hasChatMemoryConsent) {
      console.log(
        "[TRANSACTIONS_SYNC] onboarding consent missing; using chat consent fallback for enrichment",
        { userId },
      );
    }

    console.log("[TRANSACTIONS_SYNC] enrichment plan", {
      userId,
      effective_enrichment_mode: effectiveEnrichmentMode,
      run_recurring_analysis: shouldRunRecurringAnalysis,
      run_early_insights: shouldRunEarlyInsights,
      run_base_analysis: shouldRunBaseAnalysis,
      run_notification_patterns: shouldRunNotificationPatterns,
      consent_state: consentState,
      early_retry_enabled: earlyRetryEnabled,
      early_max_attempts: earlyMaxAttempts,
      early_retry_base_delay_ms: earlyRetryBaseDelayMs,
      early_fallback_model: earlyFallbackModel,
    });

    // Fetch user_id and transactions_cursor together in one query for efficiency
    const { data: itemData, error: fetchErr } = await supabase
      .from("user_items")
      .select("user_id, transactions_cursor")
      .eq("item_id", item_id)
      .eq("user_id", userId) // Additional security: ensure user_id matches
      .single();

    if (fetchErr || !itemData) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 2) Get access token from Vault
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: userId,
      },
    );

    if (tokenErr || !access_token) {
      console.error("Vault token fetch failed:", tokenErr);
      return res.status(404).json({ error: "Access token not found" });
    }

    let cursor = itemData.transactions_cursor || null;
    const hadNoCursorBeforeSync = !itemData.transactions_cursor;
    let added = [],
      modified = [],
      removed = [];
    let hasMore = true;

    // 3) pull all pages
    while (hasMore) {
      const { data } = await client.transactionsSync({
        access_token: access_token,
        cursor, // null for first call, then the next_cursor returned by Plaid
        count: 500, // optional; max 500
        options: {
          include_original_description: true,
          include_personal_finance_category: true, // Ensure we get enhanced categories
        },
      });

      added.push(...data.added);
      modified.push(...data.modified);
      removed.push(...data.removed);

      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    // --- Pending → Posted metadata merge (Plaid uses delete + add, matched via pending_transaction_id) ---
    // Fetch metadata from removed (pending) transactions BEFORE processing, so we can copy user state
    // (is_reviewed, category_id, etc.) to the new posted transaction when it arrives in added.
    const removedMetadata = new Map(); // plaid_transaction_id -> { is_reviewed, category_id, new_category, linked_goal_id, if_recurring }
    if (removed.length > 0) {
      const removedIds = removed.map((r) => r.transaction_id);
      const { data: removedTxs, error: removedFetchErr } = await supabase
        .from("transactions")
        .select(
          "plaid_transaction_id, is_reviewed, category_id, new_category, linked_goal_id, if_recurring, recurring_stream_id, amount, account_id, pending",
        )
        .eq("user_id", userId)
        .in("plaid_transaction_id", removedIds);

      if (removedFetchErr) {
        console.error(
          "⚠️ Failed to fetch removed transactions for pending→posted merge:",
          removedFetchErr,
        );
      } else if (removedTxs) {
        removedTxs.forEach((tx) => {
          removedMetadata.set(tx.plaid_transaction_id, {
            is_reviewed: tx.is_reviewed ?? false,
            category_id: tx.category_id ?? null,
            new_category: tx.new_category ?? null,
            linked_goal_id: tx.linked_goal_id ?? null,
            // Only copy if_recurring when user manually set it (not from stream)
            if_recurring:
              !tx.recurring_stream_id && tx.if_recurring === "yes"
                ? "yes"
                : null,
          });
        });
        console.log(
          `📋 Fetched metadata for ${removedMetadata.size} removed transactions for pending→posted merge`,
        );
      }
    }

    // 4) Fetch user's categories to build name -> category_id map for ID-based linking
    const { data: userCategories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (categoriesError) {
      console.error("Error fetching user categories:", categoriesError);
    }

    // Build category name -> category_id map (case-insensitive for matching)
    const categoryIdMap = new Map();
    const validCategoryIds = new Set();
    if (userCategories) {
      userCategories.forEach((cat) => {
        categoryIdMap.set(cat.name, cat.id);
        categoryIdMap.set(cat.name.toLowerCase(), cat.id);
        validCategoryIds.add(cat.id);
      });
    }

    // 4.5) Fetch active merchant rules (category_rules) for priority matching
    const { data: merchantRules, error: rulesError } = await supabase
      .from("category_rules")
      .select(
        "merchant_name, transaction_name, top_category_id, match_field, amount",
      )
      .eq("user_id", userId)
      .eq("active", true);

    if (rulesError) {
      console.error("Error fetching merchant rules:", rulesError);
    }

    // Build merchant rules lookup maps (amount-specific first, then general)
    // Only include rules whose top_category_id exists in categories table (avoids FK violations)
    const merchantRulesWithAmount = new Map();
    const merchantRulesWithoutAmount = new Map();
    const transactionNameRulesWithAmount = new Map();
    const transactionNameRulesWithoutAmount = new Map();
    if (merchantRules) {
      merchantRules.forEach((rule) => {
        const categoryId = rule.top_category_id;
        if (!validCategoryIds.has(categoryId)) {
          return; // Skip rules with stale/invalid category reference
        }
        const matchField = rule.match_field || "merchant_name";
        const hasAmount = rule.amount != null;

        if (matchField === "merchant_name" && rule.merchant_name) {
          const key = rule.merchant_name.toLowerCase().trim();
          if (hasAmount) {
            merchantRulesWithAmount.set(
              `${key}::${Number(rule.amount)}`,
              categoryId,
            );
          } else {
            merchantRulesWithoutAmount.set(key, categoryId);
          }
        } else if (
          (matchField === "transaction_name" || !rule.merchant_name) &&
          rule.transaction_name
        ) {
          const key = rule.transaction_name.toLowerCase().trim();
          if (hasAmount) {
            transactionNameRulesWithAmount.set(
              `${key}::${Number(rule.amount)}`,
              categoryId,
            );
          } else {
            transactionNameRulesWithoutAmount.set(key, categoryId);
          }
        }
      });
    }

    // Get "Other" category ID for fallback
    const { data: otherCategory } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Other")
      .maybeSingle();

    const otherCategoryId = otherCategory?.id || null;

    // 5) Get existing recurring streams for this account to check if transactions are recurring
    const { data: recurringStreams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select(
        "stream_id, stream_type, transaction_ids, description, average_amount, last_date, last_amount",
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("user_dismissed", false);

    if (streamsError) {
      console.error("Error fetching recurring streams:", streamsError);
    }

    // Create a map for quick lookup of transaction_id -> stream data
    const transactionToStreamMap = new Map();
    const nameToStreamMap = new Map();
    const recurringStreamById = new Map();
    if (recurringStreams) {
      recurringStreams.forEach((stream) => {
        recurringStreamById.set(stream.stream_id, stream);
        if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
          stream.transaction_ids.forEach((transactionId) => {
            transactionToStreamMap.set(transactionId, {
              streamId: stream.stream_id,
              streamType: stream.stream_type,
            });
          });
        }

        const streamName = stream.description || null;
        if (streamName) {
          const existing = nameToStreamMap.get(streamName);
          if (!existing) {
            nameToStreamMap.set(streamName, stream);
          } else {
            const existingDate = existing.last_date
              ? new Date(existing.last_date)
              : null;
            const incomingDate = stream.last_date
              ? new Date(stream.last_date)
              : null;
            if (
              incomingDate &&
              (!existingDate || incomingDate > existingDate)
            ) {
              nameToStreamMap.set(streamName, stream);
            }
          }
        }
      });
    }

    // Helper function to get category from stream type
    const getCategoryFromStreamType = (streamType) => {
      const mapping = {
        subscription: "Subscriptions",
        income: "Income",
        bill: "Housing", // TODO: Update if user wants different category
        other: "Other",
      };
      return mapping[streamType] || null;
    };

    // 6) Store transactions in database
    if (added.length || modified.length) {
      const addedIds = new Set(added.map((txn) => txn.transaction_id));
      const streamUpdates = new Map();
      let rows = [...added, ...modified].map((txn) => {
        // Extract Plaid categories with proper fallback hierarchy
        const primary = txn.personal_finance_category?.primary || null;
        const detailed = txn.personal_finance_category?.detailed || null;

        // Keep original category for reference (prefer detailed, fallback to primary)
        const category = detailed || primary || null;

        // Check if this is an internal transfer using both Plaid categories and transaction names/descriptions
        const detectedAsInternalTransfer = isInternalTransfer(
          primary,
          detailed,
          txn.name || null,
          txn.merchant_name || null,
          txn.original_description || null,
        );

        // Apply comprehensive category mapping using both primary and detailed
        // (internal transfers will be detected and mapped to INTERNAL_TRANSFER)
        const mappedCategory = mapPlaidToAppCategory(primary, detailed);

        // Check if this transaction is part of a recurring stream
        const streamData = transactionToStreamMap.get(txn.transaction_id);
        const nameMatchedStream =
          addedIds.has(txn.transaction_id) && txn.name
            ? nameToStreamMap.get(txn.name)
            : null;
        const effectiveStreamData =
          streamData ||
          (nameMatchedStream
            ? {
                streamId: nameMatchedStream.stream_id,
                streamType: nameMatchedStream.stream_type,
              }
            : null);
        const recurringStreamId = effectiveStreamData
          ? effectiveStreamData.streamId
          : null;

        // Determine category and recurring status based on stream
        let newCategory = null;
        let ifRecurring = "no"; // Default to 'no' instead of 'unknown'

        // Priority 1: Internal transfer detection (highest priority)
        if (detectedAsInternalTransfer) {
          newCategory = "INTERNAL_TRANSFER";
          // Internal transfers are not recurring (they're account movements)
          ifRecurring = "no";
        } else if (effectiveStreamData) {
          // Priority 2: Transaction is part of a recurring stream
          ifRecurring = "yes";

          // Set category based on stream type (will be used as new_category)
          // Note: This will only be set if the transaction doesn't already have new_category
          const categoryFromStream = getCategoryFromStreamType(
            effectiveStreamData.streamType,
          );
          if (
            categoryFromStream &&
            effectiveStreamData.streamType !== "other"
          ) {
            newCategory = categoryFromStream;
          }
        }

        if (nameMatchedStream) {
          const list = streamUpdates.get(nameMatchedStream.stream_id) || [];
          list.push({
            plaidId: txn.transaction_id,
            date: txn.date,
            amount: Math.abs(txn.amount || 0),
          });
          streamUpdates.set(nameMatchedStream.stream_id, list);
        }

        // If category is "Subscriptions", automatically mark as recurring
        // (Subscriptions are inherently recurring, even if not in a Plaid stream)
        // But skip if it's an internal transfer
        if (!detectedAsInternalTransfer) {
          const finalCategory = newCategory || mappedCategory.top;
          if (finalCategory === "Subscriptions") {
            ifRecurring = "yes";
          }
        }

        // Look up category_id from categories table
        // Priority: Merchant Rules > Internal Transfer > Stream Category > Plaid Category > Fallback to "Other"
        let categoryId = null;

        // Priority 1: Check merchant rules (highest priority for new transactions)
        if (!detectedAsInternalTransfer) {
          const merchantName = txn.merchant_name || null;
          const transactionName = txn.name || null;
          const txnAmount = Math.abs(Number(txn.amount) || 0);

          // Check merchant_name rules: amount-specific first, then general
          if (merchantName) {
            const merchantKey = merchantName.toLowerCase().trim();
            categoryId =
              merchantRulesWithAmount.get(`${merchantKey}::${txnAmount}`) ||
              merchantRulesWithoutAmount.get(merchantKey) ||
              null;
          }

          // If no merchant rule match, check transaction_name rules: amount-specific first, then general
          if (!categoryId && transactionName) {
            const transactionKey = transactionName.toLowerCase().trim();
            categoryId =
              transactionNameRulesWithAmount.get(
                `${transactionKey}::${txnAmount}`,
              ) ||
              transactionNameRulesWithoutAmount.get(transactionKey) ||
              null;
          }
        }

        // Priority 2: Internal transfers don't get category_id (skip all other checks)
        if (detectedAsInternalTransfer) {
          categoryId = null; // Explicitly null for internal transfers
        }
        // Priority 3: Stream-based category (if no merchant rule matched)
        else if (
          !categoryId &&
          newCategory &&
          newCategory !== "INTERNAL_TRANSFER"
        ) {
          // Look up category_id for user-set category (from stream or override)
          categoryId =
            categoryIdMap.get(newCategory) ||
            categoryIdMap.get(newCategory.toLowerCase()) ||
            null;
        }
        // Priority 4: Plaid mapped category (if no merchant rule or stream match)
        else if (
          !categoryId &&
          !newCategory &&
          mappedCategory.top &&
          mappedCategory.top !== "INTERNAL_TRANSFER"
        ) {
          // Look up category_id for top_category (Plaid mapped category)
          categoryId =
            categoryIdMap.get(mappedCategory.top) ||
            categoryIdMap.get(mappedCategory.top.toLowerCase()) ||
            null;
        }

        // Priority 5: Fallback to "Other" if no match found (and not internal transfer)
        if (!categoryId && !detectedAsInternalTransfer && otherCategoryId) {
          categoryId = otherCategoryId;
        }

        // Debug log for first few transactions with enhanced info
        if (added.length <= 3 || modified.length <= 3) {
          const logPrefix = detectedAsInternalTransfer
            ? "🔄 INTERNAL TRANSFER"
            : "🏷️ Category Mapping";
          console.log(
            `${logPrefix}: "${txn.name}" → Plaid Primary: "${
              primary || "N/A"
            }" → Detailed: "${detailed || "N/A"}" → Mapped: "${
              mappedCategory.top
            } > ${mappedCategory.sub}" → Final: "${
              newCategory || mappedCategory.top
            }" → category_id: ${categoryId || "null"} ${
              recurringStreamId ? `🔄 RECURRING (${streamData.streamType})` : ""
            }`,
          );
        }

        const row = {
          user_id: userId,
          account_id: txn.account_id,
          plaid_transaction_id: txn.transaction_id,
          date: txn.date,
          amount: txn.amount,
          iso_currency_code: txn.iso_currency_code || null,
          name: txn.name || null,
          merchant_name: txn.merchant_name || null,
          category: category, // Keep original Plaid category (detailed or primary)
          top_category: mappedCategory.top, // Mapped top category
          sub_category: mappedCategory.sub, // Mapped sub category
          authorized_date: txn.authorized_date || null, // When transaction was authorized (when user actually made it)
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId, // Link to recurring stream if applicable
          if_recurring: ifRecurring, // Set recurring flag based on stream membership
          new_category: newCategory, // Only set for INTERNAL_TRANSFER or stream categories (legacy support)
          category_id: categoryId, // Set category_id for ID-based linking (preferred method)
          is_reviewed: false, // Default; overwritten below when pending→posted merge applies
          linked_goal_id: null, // Default; overwritten below when pending→posted merge applies
          updated_at: new Date().toISOString(),
        };

        // Pending → Posted merge: copy user metadata from removed (pending) to new posted transaction
        const pendingId = txn.pending_transaction_id ?? null;
        if (pendingId && removedMetadata.has(pendingId)) {
          const meta = removedMetadata.get(pendingId);
          row.is_reviewed = meta.is_reviewed;
          if (meta.category_id != null) row.category_id = meta.category_id;
          if (meta.new_category != null) row.new_category = meta.new_category;
          if (meta.linked_goal_id != null)
            row.linked_goal_id = meta.linked_goal_id;
          if (meta.if_recurring === "yes") row.if_recurring = "yes";
        }

        return row;
      });

      // CRITICAL: Validate account_ids exist before processing transactions
      // Filter out transactions for deleted accounts to prevent foreign key errors
      const accountIds = [
        ...new Set(rows.map((r) => r.account_id).filter(Boolean)),
      ];
      if (accountIds.length > 0) {
        const { data: existingAccounts, error: accountsErr } = await supabase
          .from("accounts")
          .select("account_id,name,official_name,mask,type,subtype")
          .in("account_id", accountIds)
          .eq("item_id", item_id);

        if (accountsErr) {
          console.error("❌ Failed to validate accounts:", accountsErr);
          // Don't throw - try to continue with what we have
        } else {
          const isDegenerateAccount = (account) =>
            !account?.name &&
            !account?.official_name &&
            !account?.mask &&
            !account?.type &&
            !account?.subtype;

          const degenerateAccountIds = new Set(
            (existingAccounts || [])
              .filter((a) => isDegenerateAccount(a))
              .map((a) => a.account_id),
          );

          const validAccountIds = new Set(
            (existingAccounts || [])
              .filter((a) => !degenerateAccountIds.has(a.account_id))
              .map((a) => a.account_id),
          );
          const invalidRows = rows.filter(
            (r) => !validAccountIds.has(r.account_id),
          );

          if (invalidRows.length > 0) {
            const invalidAccountIds = [
              ...new Set(invalidRows.map((r) => r.account_id)),
            ];
            const ghostAccountIds = invalidAccountIds.filter((id) =>
              degenerateAccountIds.has(id),
            );
            const missingAccountIds = invalidAccountIds.filter(
              (id) => !degenerateAccountIds.has(id),
            );
            console.warn(
              `⚠️ Skipping ${
                invalidRows.length
              } transactions for invalid accounts (account_ids: ${invalidAccountIds.join(
                ", ",
              )}; ghost_accounts: ${ghostAccountIds.join(", ") || "none"}; missing_accounts: ${missingAccountIds.join(", ") || "none"})`,
            );

            // Attempt to re-sync accounts from Plaid in case they were added/changed
            try {
              console.log(
                `🔄 Attempting to re-sync accounts for item ${item_id} to restore missing accounts...`,
              );

              // Get access token (we already verified item ownership)
              const { data: access_token, error: tokenError } =
                await supabase.rpc("secure_get_plaid_token", {
                  p_item_id: item_id,
                  p_user_id: userId,
                });

              if (!tokenError && access_token) {
                // Fetch accounts directly from Plaid
                const accountsResponse = await client.accountsGet({
                  access_token,
                });
                const accounts = accountsResponse.data.accounts || [];

                if (accounts.length > 0) {
                  const accountsToStore = accounts.map((account) => ({
                    account_id: account.account_id,
                    item_id: item_id,
                    name: account.name,
                    mask: account.mask,
                    type: account.type,
                    subtype: account.subtype,
                    official_name: account.official_name,
                    current_balance: account.balances.current,
                    available_balance: account.balances.available,
                  }));

                  const { error: accountsError } = await supabase
                    .from("accounts")
                    .upsert(accountsToStore, {
                      onConflict: "account_id",
                      ignoreDuplicates: false,
                    });

                  if (!accountsError) {
                    console.log(
                      `✅ Re-synced ${accounts.length} accounts from Plaid`,
                    );

                    // Re-check if missing accounts now exist
                    const { data: recheckAccounts } = await supabase
                      .from("accounts")
                      .select("account_id,name,official_name,mask,type,subtype")
                      .in("account_id", invalidAccountIds)
                      .eq("item_id", item_id);

                    const recheckDegenerateIds = new Set(
                      (recheckAccounts || [])
                        .filter((a) => isDegenerateAccount(a))
                        .map((a) => a.account_id),
                    );
                    const recheckValidIds = new Set(
                      (recheckAccounts || [])
                        .filter((a) => !recheckDegenerateIds.has(a.account_id))
                        .map((a) => a.account_id),
                    );
                    const restoredCount = invalidAccountIds.filter((id) =>
                      recheckValidIds.has(id),
                    ).length;

                    if (restoredCount > 0) {
                      console.log(
                        `✅ Restored ${restoredCount} missing account(s) after re-sync`,
                      );
                      // Update validAccountIds to include newly synced accounts
                      recheckValidIds.forEach((id) => validAccountIds.add(id));
                    }
                  } else {
                    console.error(
                      "⚠️ Failed to store re-synced accounts:",
                      accountsError.message,
                    );
                  }
                }
              } else {
                console.error(
                  "⚠️ Could not get access token for account re-sync:",
                  tokenError?.message,
                );
              }
            } catch (reSyncError) {
              console.error(
                "⚠️ Failed to re-sync accounts (non-critical):",
                reSyncError.message,
              );
            }

            // Filter out transactions with invalid account_ids (after potential re-sync)
            rows = rows.filter((r) => validAccountIds.has(r.account_id));
          }
        }
      }

      // IMPORTANT: We use a custom upsert strategy to protect user overrides
      // Strategy: For new transactions, set new_category from stream
      //           For existing transactions, only update if new_category is NULL
      // CRITICAL: If we can't fetch existing transactions, we MUST NOT set new_category
      //           from streams to avoid overwriting user overrides

      // First, get existing transactions to check which ones already have new_category, category_id, and if_recurring.
      // IMPORTANT: This can be a large list (thousands) on first sync.
      // Supabase/PostgREST can choke on a huge `.in(...)` list, so we batch.
      const plaidTxIds = rows
        .map((r) => r.plaid_transaction_id)
        .filter(Boolean);

      const existingTxs = [];
      let fetchErr = null;

      if (plaidTxIds.length > 0) {
        console.log("[TRANSACTIONS_SYNC] existing tx fetch: start", {
          userId,
          ids: plaidTxIds.length,
        });

        const batchSize = 500;
        for (let i = 0; i < plaidTxIds.length; i += batchSize) {
          const batch = plaidTxIds.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from("transactions")
            .select(
              "plaid_transaction_id, new_category, category_id, if_recurring, recurring_stream_id, is_reviewed",
            )
            .eq("user_id", userId)
            .in("plaid_transaction_id", batch);

          if (error) {
            fetchErr = error;
            break;
          }
          if (Array.isArray(data) && data.length > 0) {
            existingTxs.push(...data);
          }

          if (i === 0 || (i / batchSize) % 3 === 0) {
            console.log("[TRANSACTIONS_SYNC] existing tx fetch: progress", {
              userId,
              fetched: existingTxs.length,
              batchEnd: Math.min(i + batchSize, plaidTxIds.length),
              totalIds: plaidTxIds.length,
            });
          }
        }

        console.log("[TRANSACTIONS_SYNC] existing tx fetch: done", {
          userId,
          fetched: existingTxs.length,
          error: !!fetchErr,
        });
      }

      // CRITICAL FIX: If fetch fails, we cannot safely set new_category or if_recurring from streams
      // because we don't know which transactions have user overrides or manual recurring flags.
      // We'll still set recurring_stream_id (safe - this is a fact), but skip new_category and if_recurring.
      const canSafelySetCategories = !fetchErr;

      if (fetchErr) {
        console.error(
          "⚠️ CRITICAL: Error fetching existing transactions to preserve user overrides:",
          fetchErr,
        );
        console.error(
          "⚠️ Skipping new_category and if_recurring updates from streams to protect user data integrity",
        );
      }

      // Create maps of existing transactions with new_category, category_id, if_recurring, and is_reviewed
      const existingCategoryMap = new Map();
      const existingCategoryIdMap = new Map();
      const existingRecurringMap = new Map();
      const existingReviewedMap = new Map();
      const existingTxIdSet = new Set();
      if (canSafelySetCategories) {
        existingTxs.forEach((tx) => {
          existingTxIdSet.add(tx.plaid_transaction_id);
          if (tx.new_category) {
            existingCategoryMap.set(tx.plaid_transaction_id, tx.new_category);
          }
          // Preserve existing category_id if set (user may have manually assigned)
          if (tx.category_id) {
            existingCategoryIdMap.set(tx.plaid_transaction_id, tx.category_id);
          }
          // Track if_recurring for transactions NOT in streams (user might have manually set it)
          if (!tx.recurring_stream_id && tx.if_recurring === "yes") {
            existingRecurringMap.set(tx.plaid_transaction_id, tx.if_recurring);
          }
          // Preserve existing is_reviewed status
          if (tx.is_reviewed !== null && tx.is_reviewed !== undefined) {
            existingReviewedMap.set(tx.plaid_transaction_id, tx.is_reviewed);
          }
        });
      }

      // Update rows to preserve existing new_category and if_recurring values
      const finalRows = rows.map((row) => {
        if (!canSafelySetCategories) {
          // If we can't verify existing overrides, we need to distinguish between:
          // 1. New transactions (not in database) - should include new_category and if_recurring
          // 2. Existing transactions (in database) - should omit to preserve existing values

          // Check if this transaction exists in the database by checking if it's in existingTxs
          // Note: existingTxs might be null/undefined if fetch failed, so we can't check membership
          // In this case, we must be conservative and omit fields for ALL transactions
          // to avoid overwriting existing user choices. New transactions will get their
          // categories set on the next successful sync.
          const { new_category, if_recurring, ...rowWithoutUserFields } = row;
          return rowWithoutUserFields;
        }

        // We can safely verify - check if this is an existing transaction
        // NOTE: Use a Set for O(1) membership. Avoid O(n^2) .find() for large syncs.
        const isNewTransaction = !existingTxIdSet.has(row.plaid_transaction_id);

        // Preserve user overrides for existing transactions
        const existingCategory = existingCategoryMap.get(
          row.plaid_transaction_id,
        );
        const existingRecurring = existingRecurringMap.get(
          row.plaid_transaction_id,
        );

        const updatedRow = { ...row };

        if (isNewTransaction) {
          // New transaction - keep all fields including new_category and if_recurring from stream
          // No existing user choices to protect
          // Keep is_reviewed from pending→posted merge if it was set, otherwise default to false
          // (row.is_reviewed is already set during row mapping, either from merge or default false)
          return updatedRow;
        }

        // Existing transaction - preserve user overrides
        const existingCategoryId = existingCategoryIdMap.get(
          row.plaid_transaction_id,
        );

        if (existingCategoryId) {
          // User has set category_id - preserve it (highest priority)
          updatedRow.category_id = existingCategoryId;
          // If category_id exists, we don't need to set new_category (except for INTERNAL_TRANSFER)
          if (existingCategory === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.category_id = null; // INTERNAL_TRANSFER doesn't have a category_id
          } else {
            // Clear new_category since we're using category_id
            updatedRow.new_category = null;
          }
        } else if (existingCategory) {
          // User has overridden category via new_category - preserve it and look up category_id
          updatedRow.new_category = existingCategory;
          if (existingCategory !== "INTERNAL_TRANSFER") {
            // Try to look up category_id for the existing category name
            updatedRow.category_id =
              categoryIdMap.get(existingCategory) ||
              categoryIdMap.get(existingCategory.toLowerCase()) ||
              null;
          } else {
            updatedRow.category_id = null; // INTERNAL_TRANSFER doesn't have a category_id
          }
        } else {
          // No user override - check if top_category indicates internal transfer
          // (mapper already detected it from Plaid categories)
          if (row.top_category === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.category_id = null;
            updatedRow.if_recurring = "no";
          } else {
            // No override - use the category_id we looked up in the row mapping
            // (already set in the row, just keep it)
          }
        }

        // Determine final category for recurring check
        const finalCategory =
          updatedRow.new_category || row.new_category || row.top_category;

        // If transaction is NOT in a stream but user manually set if_recurring = 'yes', preserve it
        if (!row.recurring_stream_id && existingRecurring === "yes") {
          updatedRow.if_recurring = existingRecurring;
        }
        // If transaction IS in a stream, if_recurring should be 'yes' (already set in row, safe to keep)
        // OR if category is "Subscriptions", automatically mark as recurring
        // BUT skip if it's an internal transfer
        else if (
          finalCategory === "Subscriptions" &&
          updatedRow.if_recurring !== "yes" &&
          updatedRow.new_category !== "INTERNAL_TRANSFER"
        ) {
          updatedRow.if_recurring = "yes";
        }

        // Preserve existing is_reviewed status for existing transactions
        const existingReviewed = existingReviewedMap.get(
          row.plaid_transaction_id,
        );
        if (existingReviewed !== undefined) {
          updatedRow.is_reviewed = existingReviewed;
        }

        return updatedRow;
      });

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(finalRows, { onConflict: "plaid_transaction_id" });

      if (upsertErr) {
        console.error("Transaction upsert error:", upsertErr);
        return res.status(500).json({ error: "Failed to save transactions" });
      }

      console.log("[TRANSACTIONS_SYNC] transactions upserted", {
        userId,
        rows: finalRows.length,
      });

      if (streamUpdates.size > 0) {
        const updatePromises = [];
        streamUpdates.forEach((updates, streamId) => {
          const stream = recurringStreamById.get(streamId);
          if (!stream) return;

          const existingIds = Array.isArray(stream.transaction_ids)
            ? stream.transaction_ids
            : [];
          const transactionIdSet = new Set(existingIds);
          let count = existingIds.length;
          let averageAmount = Number(stream.average_amount || 0);
          let lastDate = stream.last_date ? new Date(stream.last_date) : null;
          let lastAmount = Number(stream.last_amount || 0);

          updates.forEach((update) => {
            if (transactionIdSet.has(update.plaidId)) return;
            transactionIdSet.add(update.plaidId);
            averageAmount =
              count === 0
                ? update.amount
                : (averageAmount * count + update.amount) / (count + 1);
            count += 1;

            const updateDate = update.date ? new Date(update.date) : null;
            if (updateDate && (!lastDate || updateDate > lastDate)) {
              lastDate = updateDate;
              lastAmount = update.amount;
            }
          });

          updatePromises.push(
            supabase
              .from("recurring_streams")
              .update({
                transaction_ids: Array.from(transactionIdSet),
                average_amount: averageAmount,
                last_date: lastDate
                  ? lastDate.toISOString().split("T")[0]
                  : stream.last_date,
                last_amount: lastAmount,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("stream_id", streamId),
          );
        });

        const results = await Promise.all(updatePromises);
        const updateErrors = results.filter((r) => r.error);
        if (updateErrors.length > 0) {
          console.error(
            "Recurring stream update errors:",
            updateErrors.map((r) => r.error),
          );
        }
      }
    }

    // 6.5) On initial sync (new account): auto-mark historical transactions as reviewed
    // Prevents overwhelming users with hundreds of old transactions to review.
    // Only transactions from yesterday onward remain unreviewed.
    if (hadNoCursorBeforeSync && added.length > 0) {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatLocalDate(yesterday);

        const { error: markError } = await supabase
          .from("transactions")
          .update({ is_reviewed: true })
          .eq("user_id", userId)
          .lt("date", yesterdayStr);

        if (markError) {
          console.error(
            "[TRANSACTIONS_SYNC] Failed to auto-mark historical transactions:",
            markError,
          );
        } else {
          console.log(
            "[TRANSACTIONS_SYNC] Auto-marked historical transactions (date < yesterday) as reviewed",
            { userId: userId.substring(0, 8), cutoffDate: yesterdayStr },
          );
        }
      } catch (markErr) {
        console.error(
          "[TRANSACTIONS_SYNC] Error auto-marking historical transactions (non-blocking):",
          markErr,
        );
      }
    }

    // 6) Delete removed transactions
    if (removed.length) {
      await supabase
        .from("transactions")
        .delete()
        .in(
          "plaid_transaction_id",
          removed.map((r) => r.transaction_id),
        );
    }

    // 7) Save the new cursor and timestamp
    await supabase
      .from("user_items")
      .update({
        transactions_cursor: cursor,
        last_synced_at: new Date().toISOString(),
      })
      .eq("item_id", item_id);

    console.log("[TRANSACTIONS_SYNC] cursor updated");

    // 7.4) Run Finny recurring analysis AFTER transactions are synced (new account connect)
    // Must run after transaction upsert so analysis has data to work with
    if (!shouldRunRecurringAnalysis) {
      console.log(
        "[TRANSACTIONS_SYNC] recurring analysis: skipped (mode)",
        { userId, effective_enrichment_mode: effectiveEnrichmentMode },
      );
    } else if (!hasAiEnrichmentConsent) {
      console.log("[TRANSACTIONS_SYNC] recurring analysis: skipped (no consent)", {
        userId,
      });
    } else if (added.length > 0) {
      try {
        console.log("[TRANSACTIONS_SYNC] recurring analysis: start", {
          userId,
          item_id,
          added: added.length,
        });
        const result = await runRecurringAnalysis(
          supabase,
          userId,
          item_id,
          "new_account",
        );
        if (result.reason === "no_transactions") {
          console.log(
            "[TRANSACTIONS_SYNC] recurring analysis: no transactions (skipped)",
          );
        } else {
          console.log("[TRANSACTIONS_SYNC] recurring analysis: done", {
            analysisId: result.analysisId,
            upserted: result.upserted,
          });
        }
      } catch (recurringErr) {
        console.error(
          "[TRANSACTIONS_SYNC] recurring analysis error (non-blocking):",
          recurringErr,
        );
      }
    }

    // 7.5) Generate onboarding early_insights (best-effort, does not block sync)
    // Runs after transactions have been written, so it can read from DB.
    // Stores raw JSON in `profiles.early_insights`.
    if (!shouldRunEarlyInsights || !hasAiEnrichmentConsent) {
      const reasonCode = !shouldRunEarlyInsights
        ? "SKIP_MODE_DISABLED"
        : "SKIP_NO_CONSENT";
      const runId = await insertOnboardingRun(
        buildOnboardingRunPayload({
          userId,
          itemId: item_id,
          requestId,
          apiBuild: API_BUILD,
          runType: "early_insights",
          status: "running",
          attemptNo: 1,
          maxAttempts: 1,
          enrichmentMode: effectiveEnrichmentMode,
          consentState,
          failureReasonCode: reasonCode,
          failureStage: "precheck",
        }),
      );
      await updateOnboardingRun(runId, {
        status: "skipped",
        completed_at: new Date().toISOString(),
        failure_reason_code: reasonCode,
        failure_stage: "precheck",
      });
      aiEnrichment.early_insights = applyAiSummary(aiEnrichment.early_insights, {
        status: "skipped",
        reason_code: reasonCode,
        attempts: 1,
        retryable: false,
        run_id: runId,
      });
      console.log(
        "[TRANSACTIONS_SYNC] early_insights: skipped",
        { userId, reasonCode, effective_enrichment_mode: effectiveEnrichmentMode },
      );
    } else {
      console.log("[TRANSACTIONS_SYNC] early_insights: start", {
        userId,
        item_id,
        requestId,
        added: added.length,
        modified: modified.length,
        removed: removed.length,
      });

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select(
          "id, first_name, age, occupation, location, finny_style, early_insights",
        )
        .eq("id", userId)
        .maybeSingle();

      if (profileErr) {
        const classified = classifyOnboardingAiFailure({
          error: profileErr,
          stage: "profile_fetch",
        });
        const failureMarker = buildStructuredLlmFailureMarker({
          reasonCode: classified.reasonCode,
          stage: classified.stage,
          httpStatus: classified.httpStatus,
          retryable: classified.retryable,
          attempts: 1,
          model: earlyPrimaryModel,
          requestId,
          apiBuild: API_BUILD,
          failureMessage: classified.failureMessage,
        });
        const { error: markerErr } = await supabase
          .from("profiles")
          .upsert(
            {
              id: userId,
              early_insights: failureMarker,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          );
        const runId = await insertOnboardingRun(
          buildOnboardingRunPayload({
            userId,
            itemId: item_id,
            requestId,
            apiBuild: API_BUILD,
            runType: "early_insights",
            status: "running",
            attemptNo: 1,
            maxAttempts: 1,
            enrichmentMode: effectiveEnrichmentMode,
            consentState,
          }),
        );
        await updateOnboardingRun(runId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          failure_reason_code: classified.reasonCode,
          failure_stage: classified.stage,
          failure_message: trimFailureMessage(classified.failureMessage),
          retryable: classified.retryable,
          http_status: classified.httpStatus,
          profile_write_ok: !markerErr,
          result_payload: failureMarker,
          model: earlyPrimaryModel,
        });
        aiEnrichment.early_insights = applyAiSummary(aiEnrichment.early_insights, {
          status: "failed",
          reason_code: classified.reasonCode,
          attempts: 1,
          retryable: classified.retryable,
          http_status: classified.httpStatus,
          model: earlyPrimaryModel,
          run_id: runId,
        });
        console.error(
          "[TRANSACTIONS_SYNC] early_insights: profile fetch failed",
          profileErr,
        );
      } else {
        const existing = profile?.early_insights;
        const hasExistingInsights =
          !!existing &&
          typeof existing === "object" &&
          !Array.isArray(existing) &&
          typeof existing.intro_line === "string" &&
          typeof existing.mirror === "string" &&
          typeof existing.plan === "string" &&
          typeof existing.hook === "string" &&
          existing.intro_line.trim().length > 0;

        if (hasExistingInsights) {
          const runId = await insertOnboardingRun(
            buildOnboardingRunPayload({
              userId,
              itemId: item_id,
              requestId,
              apiBuild: API_BUILD,
              runType: "early_insights",
              status: "running",
              attemptNo: 1,
              maxAttempts: 1,
              enrichmentMode: effectiveEnrichmentMode,
              consentState,
            }),
          );
          await updateOnboardingRun(runId, {
            status: "skipped",
            completed_at: new Date().toISOString(),
            failure_reason_code: "SKIP_ALREADY_PRESENT",
            failure_stage: "precheck",
          });
          aiEnrichment.early_insights = applyAiSummary(
            aiEnrichment.early_insights,
            {
              status: "skipped",
              reason_code: "SKIP_ALREADY_PRESENT",
              attempts: 1,
              retryable: false,
              run_id: runId,
            },
          );
          console.log("[TRANSACTIONS_SYNC] early_insights: already present", {
            userId,
          });
        } else {
          const openRouterApiKeyRaw =
            process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_GROK_KEY;
          const openRouterApiKey = String(openRouterApiKeyRaw || "").trim();
          const keySource = process.env.OPENROUTER_API_KEY
            ? "OPENROUTER_API_KEY"
            : process.env.OPENROUTER_GROK_KEY
              ? "OPENROUTER_GROK_KEY"
              : null;

          console.log("[TRANSACTIONS_SYNC] early_insights: compute", {
            userId,
            requestId,
            keyPresent: !!openRouterApiKey,
            keySource,
          });

          if (!openRouterApiKey) {
            const runId = await insertOnboardingRun(
              buildOnboardingRunPayload({
                userId,
                itemId: item_id,
                requestId,
                apiBuild: API_BUILD,
                runType: "early_insights",
                status: "running",
                attemptNo: 1,
                maxAttempts: 1,
                enrichmentMode: effectiveEnrichmentMode,
                consentState,
              }),
            );
            await updateOnboardingRun(runId, {
              status: "skipped",
              completed_at: new Date().toISOString(),
              failure_reason_code: "SKIP_MISSING_API_KEY",
              failure_stage: "precheck",
            });
            aiEnrichment.early_insights = applyAiSummary(
              aiEnrichment.early_insights,
              {
                status: "skipped",
                reason_code: "SKIP_MISSING_API_KEY",
                attempts: 1,
                retryable: false,
                run_id: runId,
              },
            );
            console.warn(
              "[TRANSACTIONS_SYNC] early_insights: missing OPENROUTER_API_KEY (skipping)",
            );
          } else {
            const { startDate, endDate } = getDateRangeLast6Months();
            const pageSize = 1000;
            const maxRows = 5000;
            let offset = 0;
            const rows = [];
            let txFetchError = null;

            console.log("[TRANSACTIONS_SYNC] early_insights: tx window", {
              userId,
              startDate,
              endDate,
            });

            while (offset < maxRows) {
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

              if (error) {
                txFetchError = error;
                break;
              }
              if (!data || data.length === 0) break;
              rows.push(...data);
              offset += pageSize;
            }

            if (txFetchError) {
              const classified = classifyOnboardingAiFailure({
                error: txFetchError,
                stage: "tx_fetch",
              });
              const failureMarker = buildStructuredLlmFailureMarker({
                reasonCode: classified.reasonCode,
                stage: classified.stage,
                httpStatus: classified.httpStatus,
                retryable: classified.retryable,
                attempts: 1,
                model: earlyPrimaryModel,
                requestId,
                apiBuild: API_BUILD,
                failureMessage: classified.failureMessage,
              });
              const { error: markerErr } = await supabase
                .from("profiles")
                .upsert(
                  {
                    id: userId,
                    early_insights: failureMarker,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "id" },
                );
              const runId = await insertOnboardingRun(
                buildOnboardingRunPayload({
                  userId,
                  itemId: item_id,
                  requestId,
                  apiBuild: API_BUILD,
                  runType: "early_insights",
                  status: "running",
                  attemptNo: 1,
                  maxAttempts: 1,
                  enrichmentMode: effectiveEnrichmentMode,
                  consentState,
                }),
              );
              await updateOnboardingRun(runId, {
                status: "failed",
                completed_at: new Date().toISOString(),
                failure_reason_code: classified.reasonCode,
                failure_stage: classified.stage,
                failure_message: trimFailureMessage(classified.failureMessage),
                retryable: classified.retryable,
                http_status: classified.httpStatus,
                profile_write_ok: !markerErr,
                result_payload: failureMarker,
                model: earlyPrimaryModel,
              });
              aiEnrichment.early_insights = applyAiSummary(
                aiEnrichment.early_insights,
                {
                  status: "failed",
                  reason_code: classified.reasonCode,
                  attempts: 1,
                  retryable: classified.retryable,
                  http_status: classified.httpStatus,
                  model: earlyPrimaryModel,
                  run_id: runId,
                },
              );
              console.error(
                "[TRANSACTIONS_SYNC] early_insights: error fetching transactions",
                txFetchError,
              );
            } else if (rows.length === 0) {
              const runId = await insertOnboardingRun(
                buildOnboardingRunPayload({
                  userId,
                  itemId: item_id,
                  requestId,
                  apiBuild: API_BUILD,
                  runType: "early_insights",
                  status: "running",
                  attemptNo: 1,
                  maxAttempts: 1,
                  enrichmentMode: effectiveEnrichmentMode,
                  consentState,
                  txRows: 0,
                }),
              );
              await updateOnboardingRun(runId, {
                status: "skipped",
                completed_at: new Date().toISOString(),
                failure_reason_code: "SKIP_NO_TRANSACTIONS",
                failure_stage: "tx_fetch",
                tx_rows: 0,
              });
              aiEnrichment.early_insights = applyAiSummary(
                aiEnrichment.early_insights,
                {
                  status: "skipped",
                  reason_code: "SKIP_NO_TRANSACTIONS",
                  attempts: 1,
                  retryable: false,
                  run_id: runId,
                },
              );
              console.log(
                "[TRANSACTIONS_SYNC] early_insights: no tx rows (skipping)",
                { userId },
              );
            } else {
              const months = getLast6MonthKeys();
              const filtered = rows.filter((tx) => !isLikelyInternalOrPayment(tx));
              const patternPayload = computePatterns({
                transactions: filtered,
                months,
              });
              const topPatterns = selectTopPatternsForLLM(patternPayload, 5);

              console.log("[TRANSACTIONS_SYNC] early_insights: patterns", {
                userId,
                fetched: rows.length,
                afterFiltering: filtered.length,
                patternsGenerated: patternPayload?.meta?.patternsGenerated,
                patternsReturned: patternPayload?.meta?.patternsReturned,
                selectedForLlm: topPatterns.length,
                topType: topPatterns[0]?.type,
                topKey: topPatterns[0]?.key,
              });

              if (topPatterns.length === 0) {
                const runId = await insertOnboardingRun(
                  buildOnboardingRunPayload({
                    userId,
                    itemId: item_id,
                    requestId,
                    apiBuild: API_BUILD,
                    runType: "early_insights",
                    status: "running",
                    attemptNo: 1,
                    maxAttempts: 1,
                    enrichmentMode: effectiveEnrichmentMode,
                    consentState,
                    txRows: rows.length,
                    filteredRows: filtered.length,
                    patternCount: 0,
                  }),
                );
                await updateOnboardingRun(runId, {
                  status: "skipped",
                  completed_at: new Date().toISOString(),
                  failure_reason_code: "SKIP_NO_PATTERNS",
                  failure_stage: "pattern_compute",
                  tx_rows: rows.length,
                  filtered_rows: filtered.length,
                  pattern_count: 0,
                });
                aiEnrichment.early_insights = applyAiSummary(
                  aiEnrichment.early_insights,
                  {
                    status: "skipped",
                    reason_code: "SKIP_NO_PATTERNS",
                    attempts: 1,
                    retryable: false,
                    run_id: runId,
                  },
                );
                console.log(
                  "[TRANSACTIONS_SYNC] early_insights: no patterns (skipping)",
                  { userId },
                );
              } else {
                const sixtyDaysAgo = new Date();
                sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
                const sixtyDayCutoff = sixtyDaysAgo.toISOString().slice(0, 10);
                const recentTransactions = filtered.filter(
                  (tx) => tx.date >= sixtyDayCutoff,
                );

                const modelChain = [earlyPrimaryModel];
                if (
                  earlyFallbackModel &&
                  !modelChain.includes(earlyFallbackModel)
                ) {
                  modelChain.push(earlyFallbackModel);
                }
                const maxAttempts = earlyRetryEnabled ? earlyMaxAttempts : 1;
                let storedSuccess = false;
                let finalFailureSummary = null;

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                  const modelForAttempt =
                    modelChain[Math.min(attempt - 1, modelChain.length - 1)];
                  const runId = await insertOnboardingRun(
                    buildOnboardingRunPayload({
                      userId,
                      itemId: item_id,
                      requestId,
                      apiBuild: API_BUILD,
                      runType: "early_insights",
                      status: "running",
                      attemptNo: attempt,
                      maxAttempts,
                      model: modelForAttempt,
                      enrichmentMode: effectiveEnrichmentMode,
                      consentState,
                      txRows: rows.length,
                      filteredRows: filtered.length,
                      patternCount: topPatterns.length,
                    }),
                  );

                  try {
                    const llmResult = await callOnboardingLLM({
                      openRouterApiKey,
                      fetchFn: fetch,
                      patterns: topPatterns,
                      analysisWindow: "last 6 months",
                      userProfile: profile || null,
                      recentTransactions,
                      model: modelForAttempt,
                    });

                    const insightsJson =
                      llmResult?.ok && llmResult?.json
                        ? llmResult.json
                        : extractFirstJsonObjectFromText(llmResult?.raw);

                    if (!insightsJson) {
                      const parseClassified = classifyOnboardingAiFailure({
                        error: new Error("No valid JSON found in LLM response"),
                        stage: "llm_parse",
                      });
                      const failureMarker = buildStructuredLlmFailureMarker({
                        reasonCode: parseClassified.reasonCode,
                        stage: parseClassified.stage,
                        httpStatus: llmResult?.httpStatus ?? parseClassified.httpStatus,
                        retryable: parseClassified.retryable,
                        attempts: attempt,
                        model: llmResult?.model || modelForAttempt,
                        requestId,
                        apiBuild: API_BUILD,
                        failureMessage: parseClassified.failureMessage,
                      });
                      const { error: upsertErr } = await supabase
                        .from("profiles")
                        .upsert(
                          {
                            id: userId,
                            early_insights: failureMarker,
                            updated_at: new Date().toISOString(),
                          },
                          { onConflict: "id" },
                        );
                      await updateOnboardingRun(runId, {
                        status: "failed",
                        completed_at: new Date().toISOString(),
                        failure_reason_code: parseClassified.reasonCode,
                        failure_stage: parseClassified.stage,
                        failure_message: trimFailureMessage(
                          parseClassified.failureMessage,
                        ),
                        retryable: parseClassified.retryable,
                        http_status:
                          llmResult?.httpStatus ?? parseClassified.httpStatus,
                        latency_ms: llmResult?.latencyMs ?? null,
                        output_valid: false,
                        profile_write_ok: !upsertErr,
                        llm_request_payload: llmResult?.requestPayload || null,
                        llm_response_payload: llmResult?.responsePayload || null,
                        llm_response_text:
                          llmResult?.responseText || llmResult?.raw || null,
                        result_payload: failureMarker,
                        model: llmResult?.model || modelForAttempt,
                      });
                      finalFailureSummary = {
                        reasonCode: parseClassified.reasonCode,
                        stage: parseClassified.stage,
                        retryable: parseClassified.retryable,
                        httpStatus:
                          llmResult?.httpStatus ?? parseClassified.httpStatus,
                        attempts: attempt,
                        model: llmResult?.model || modelForAttempt,
                        runId,
                        failureMessage: parseClassified.failureMessage,
                      };
                      aiEnrichment.early_insights = applyAiSummary(
                        aiEnrichment.early_insights,
                        {
                          status: "failed",
                          reason_code: parseClassified.reasonCode,
                          attempts: attempt,
                          model: llmResult?.model || modelForAttempt,
                          http_status:
                            llmResult?.httpStatus ?? parseClassified.httpStatus,
                          retryable: parseClassified.retryable,
                          run_id: runId,
                        },
                      );
                      break;
                    }

                    const { error: upsertErr } = await supabase
                      .from("profiles")
                      .upsert(
                        {
                          id: userId,
                          early_insights: insightsJson,
                          updated_at: new Date().toISOString(),
                        },
                        { onConflict: "id" },
                      );

                    if (upsertErr) {
                      const persistClassified = classifyOnboardingAiFailure({
                        error: upsertErr,
                        stage: "persist",
                      });
                      const failureMarker = buildStructuredLlmFailureMarker({
                        reasonCode: persistClassified.reasonCode,
                        stage: persistClassified.stage,
                        httpStatus:
                          llmResult?.httpStatus ?? persistClassified.httpStatus,
                        retryable: persistClassified.retryable,
                        attempts: attempt,
                        model: llmResult?.model || modelForAttempt,
                        requestId,
                        apiBuild: API_BUILD,
                        failureMessage: persistClassified.failureMessage,
                      });
                      await updateOnboardingRun(runId, {
                        status: "failed",
                        completed_at: new Date().toISOString(),
                        failure_reason_code: persistClassified.reasonCode,
                        failure_stage: persistClassified.stage,
                        failure_message: trimFailureMessage(
                          persistClassified.failureMessage,
                        ),
                        retryable: persistClassified.retryable,
                        http_status:
                          llmResult?.httpStatus ?? persistClassified.httpStatus,
                        latency_ms: llmResult?.latencyMs ?? null,
                        output_valid: true,
                        profile_write_ok: false,
                        llm_request_payload: llmResult?.requestPayload || null,
                        llm_response_payload: llmResult?.responsePayload || null,
                        llm_response_text: llmResult?.responseText || null,
                        result_payload: failureMarker,
                        model: llmResult?.model || modelForAttempt,
                      });
                      finalFailureSummary = {
                        reasonCode: persistClassified.reasonCode,
                        stage: persistClassified.stage,
                        retryable: persistClassified.retryable,
                        httpStatus:
                          llmResult?.httpStatus ?? persistClassified.httpStatus,
                        attempts: attempt,
                        model: llmResult?.model || modelForAttempt,
                        runId,
                        failureMessage: persistClassified.failureMessage,
                      };
                      aiEnrichment.early_insights = applyAiSummary(
                        aiEnrichment.early_insights,
                        {
                          status: "failed",
                          reason_code: persistClassified.reasonCode,
                          attempts: attempt,
                          model: llmResult?.model || modelForAttempt,
                          http_status:
                            llmResult?.httpStatus ?? persistClassified.httpStatus,
                          retryable: persistClassified.retryable,
                          run_id: runId,
                        },
                      );
                      break;
                    }

                    await updateOnboardingRun(runId, {
                      status: "success",
                      completed_at: new Date().toISOString(),
                      output_valid: true,
                      profile_write_ok: true,
                      latency_ms: llmResult?.latencyMs ?? null,
                      llm_request_payload: llmResult?.requestPayload || null,
                      llm_response_payload: llmResult?.responsePayload || null,
                      llm_response_text: llmResult?.responseText || null,
                      result_payload: insightsJson,
                      model: llmResult?.model || modelForAttempt,
                      http_status: llmResult?.httpStatus ?? null,
                    });

                    aiEnrichment.early_insights = applyAiSummary(
                      aiEnrichment.early_insights,
                      {
                        status: "success",
                        reason_code: null,
                        attempts: attempt,
                        model: llmResult?.model || modelForAttempt,
                        http_status: llmResult?.httpStatus ?? null,
                        retryable: false,
                        run_id: runId,
                      },
                    );
                    storedSuccess = true;
                    console.log("✅ Stored profiles.early_insights", {
                      userId,
                      requestId,
                      attempt,
                      model: llmResult?.model || modelForAttempt,
                      hasIntro: !!insightsJson?.intro_line,
                    });
                    break;
                  } catch (attemptErr) {
                    const classified = classifyOnboardingAiFailure({
                      error: attemptErr,
                      stage: attemptErr?.stage || "llm_request",
                    });
                    await updateOnboardingRun(runId, {
                      status: "failed",
                      completed_at: new Date().toISOString(),
                      failure_reason_code: classified.reasonCode,
                      failure_stage: classified.stage,
                      failure_message: trimFailureMessage(
                        classified.failureMessage,
                      ),
                      retryable: classified.retryable,
                      http_status:
                        attemptErr?.httpStatus ?? classified.httpStatus ?? null,
                      latency_ms: attemptErr?.latencyMs ?? null,
                      output_valid: false,
                      profile_write_ok: null,
                      llm_request_payload: attemptErr?.requestPayload || null,
                      llm_response_payload: attemptErr?.responsePayload || null,
                      llm_response_text: attemptErr?.responseText || null,
                      result_payload: null,
                      model: attemptErr?.model || modelForAttempt,
                    });

                    finalFailureSummary = {
                      reasonCode: classified.reasonCode,
                      stage: classified.stage,
                      retryable: classified.retryable,
                      httpStatus:
                        attemptErr?.httpStatus ?? classified.httpStatus,
                      attempts: attempt,
                      model: attemptErr?.model || modelForAttempt,
                      runId,
                      failureMessage: classified.failureMessage,
                    };
                    aiEnrichment.early_insights = applyAiSummary(
                      aiEnrichment.early_insights,
                      {
                        status: "failed",
                        reason_code: classified.reasonCode,
                        attempts: attempt,
                        model: attemptErr?.model || modelForAttempt,
                        http_status:
                          attemptErr?.httpStatus ?? classified.httpStatus,
                        retryable: classified.retryable,
                        run_id: runId,
                      },
                    );

                    const canRetry =
                      earlyRetryEnabled &&
                      attempt < maxAttempts &&
                      shouldRetryOnboardingFailure(classified.reasonCode) &&
                      classified.retryable === true;

                    console.warn(
                      "[TRANSACTIONS_SYNC] early_insights attempt failed",
                      {
                        userId,
                        requestId,
                        attempt,
                        maxAttempts,
                        reason: classified.reasonCode,
                        retryable: classified.retryable,
                        willRetry: canRetry,
                      },
                    );

                    if (canRetry) {
                      const jitterMs = Math.floor(Math.random() * 250);
                      const delayMs =
                        earlyRetryBaseDelayMs * Math.pow(2, attempt - 1) +
                        jitterMs;
                      await sleep(delayMs);
                      continue;
                    }
                    break;
                  }
                }

                if (!storedSuccess && finalFailureSummary) {
                  const failureMarker = buildStructuredLlmFailureMarker({
                    reasonCode: finalFailureSummary.reasonCode,
                    stage: finalFailureSummary.stage,
                    httpStatus: finalFailureSummary.httpStatus,
                    retryable: finalFailureSummary.retryable,
                    attempts: finalFailureSummary.attempts,
                    model: finalFailureSummary.model,
                    requestId,
                    apiBuild: API_BUILD,
                    failureMessage: finalFailureSummary.failureMessage,
                  });
                  const { error: markerErr } = await supabase
                    .from("profiles")
                    .upsert(
                      {
                        id: userId,
                        early_insights: failureMarker,
                        updated_at: new Date().toISOString(),
                      },
                      { onConflict: "id" },
                    );
                  if (markerErr) {
                    console.error(
                      "[TRANSACTIONS_SYNC] early_insights: error marker upsert failed",
                      markerErr,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    // 7.6) Generate account completeness analysis (best-effort, does not block sync)
    // Runs after transactions have been written, so it can read from DB.
    // Stores raw JSON in `profiles.base_analysis`.
    // Only runs if base_analysis doesn't already exist (first account connection).
    if (!shouldRunBaseAnalysis || !hasAiEnrichmentConsent) {
      const reasonCode = !shouldRunBaseAnalysis
        ? "SKIP_MODE_DISABLED"
        : "SKIP_NO_CONSENT";
      const runId = await insertOnboardingRun(
        buildOnboardingRunPayload({
          userId,
          itemId: item_id,
          requestId,
          apiBuild: API_BUILD,
          runType: "base_analysis",
          status: "running",
          attemptNo: 1,
          maxAttempts: 1,
          enrichmentMode: effectiveEnrichmentMode,
          consentState,
          failureReasonCode: reasonCode,
          failureStage: "precheck",
        }),
      );
      await updateOnboardingRun(runId, {
        status: "skipped",
        completed_at: new Date().toISOString(),
        failure_reason_code: reasonCode,
        failure_stage: "precheck",
      });
      aiEnrichment.base_analysis = applyAiSummary(aiEnrichment.base_analysis, {
        status: "skipped",
        reason_code: reasonCode,
        attempts: 1,
        retryable: false,
        run_id: runId,
      });
      console.log("[TRANSACTIONS_SYNC] base_analysis: skipped", {
        userId,
        reasonCode,
        effective_enrichment_mode: effectiveEnrichmentMode,
      });
    } else {
      const runId = await insertOnboardingRun(
        buildOnboardingRunPayload({
          userId,
          itemId: item_id,
          requestId,
          apiBuild: API_BUILD,
          runType: "base_analysis",
          status: "running",
          attemptNo: 1,
          maxAttempts: 1,
          model: earlyPrimaryModel,
          enrichmentMode: effectiveEnrichmentMode,
          consentState,
        }),
      );

      try {
        const { data: profileForAnalysis, error: profileAnalysisErr } =
          await supabase
            .from("profiles")
            .select("id, base_analysis")
            .eq("id", userId)
            .maybeSingle();

        if (profileAnalysisErr) {
          const classified = classifyOnboardingAiFailure({
            error: profileAnalysisErr,
            stage: "profile_fetch",
          });
          const failureMarker = buildStructuredLlmFailureMarker({
            reasonCode: classified.reasonCode,
            stage: classified.stage,
            httpStatus: classified.httpStatus,
            retryable: classified.retryable,
            attempts: 1,
            model: earlyPrimaryModel,
            requestId,
            apiBuild: API_BUILD,
            failureMessage: classified.failureMessage,
          });
          const { error: markerErr } = await supabase
            .from("profiles")
            .upsert(
              {
                id: userId,
                base_analysis: failureMarker,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" },
            );
          await updateOnboardingRun(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            failure_reason_code: classified.reasonCode,
            failure_stage: classified.stage,
            failure_message: trimFailureMessage(classified.failureMessage),
            retryable: classified.retryable,
            http_status: classified.httpStatus,
            result_payload: failureMarker,
            model: earlyPrimaryModel,
            profile_write_ok: !markerErr,
          });
          aiEnrichment.base_analysis = applyAiSummary(aiEnrichment.base_analysis, {
            status: "failed",
            reason_code: classified.reasonCode,
            attempts: 1,
            retryable: classified.retryable,
            http_status: classified.httpStatus,
            model: earlyPrimaryModel,
            run_id: runId,
          });
        } else {
          const existingAnalysis = profileForAnalysis?.base_analysis;
          const hasExistingAnalysis =
            !!existingAnalysis &&
            typeof existingAnalysis === "object" &&
            typeof existingAnalysis.should_ask_for_more_accounts === "boolean";

          if (hasExistingAnalysis) {
            await updateOnboardingRun(runId, {
              status: "skipped",
              completed_at: new Date().toISOString(),
              failure_reason_code: "SKIP_ALREADY_PRESENT",
              failure_stage: "precheck",
            });
            aiEnrichment.base_analysis = applyAiSummary(
              aiEnrichment.base_analysis,
              {
                status: "skipped",
                reason_code: "SKIP_ALREADY_PRESENT",
                attempts: 1,
                retryable: false,
                run_id: runId,
              },
            );
            console.log("[TRANSACTIONS_SYNC] base_analysis: already present", {
              userId,
            });
          } else {
            const openRouterApiKeyRaw =
              process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_GROK_KEY;
            const openRouterApiKey = String(openRouterApiKeyRaw || "").trim();

            if (!openRouterApiKey) {
              await updateOnboardingRun(runId, {
                status: "skipped",
                completed_at: new Date().toISOString(),
                failure_reason_code: "SKIP_MISSING_API_KEY",
                failure_stage: "precheck",
              });
              aiEnrichment.base_analysis = applyAiSummary(
                aiEnrichment.base_analysis,
                {
                  status: "skipped",
                  reason_code: "SKIP_MISSING_API_KEY",
                  attempts: 1,
                  retryable: false,
                  run_id: runId,
                },
              );
              console.warn(
                "[TRANSACTIONS_SYNC] base_analysis: missing OPENROUTER_API_KEY (skipping)",
              );
            } else {
              const end = new Date();
              const start = new Date();
              start.setDate(end.getDate() - 90);
              const startDateStr = formatDate(start);
              const endDateStr = formatDate(end);

              const { data: transactions, error: txError } = await supabase
                .from("transactions")
                .select(
                  "date, amount, merchant_name, name, category, top_category, new_category",
                )
                .eq("user_id", userId)
                .gte("date", startDateStr)
                .lte("date", endDateStr)
                .order("date", { ascending: false })
                .limit(500);

              if (txError) {
                const classified = classifyOnboardingAiFailure({
                  error: txError,
                  stage: "tx_fetch",
                });
                const failureMarker = buildStructuredLlmFailureMarker({
                  reasonCode: classified.reasonCode,
                  stage: classified.stage,
                  httpStatus: classified.httpStatus,
                  retryable: classified.retryable,
                  attempts: 1,
                  model: earlyPrimaryModel,
                  requestId,
                  apiBuild: API_BUILD,
                  failureMessage: classified.failureMessage,
                });
                const { error: markerErr } = await supabase
                  .from("profiles")
                  .upsert(
                    {
                      id: userId,
                      base_analysis: failureMarker,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "id" },
                  );
                await updateOnboardingRun(runId, {
                  status: "failed",
                  completed_at: new Date().toISOString(),
                  failure_reason_code: classified.reasonCode,
                  failure_stage: classified.stage,
                  failure_message: trimFailureMessage(classified.failureMessage),
                  retryable: classified.retryable,
                  http_status: classified.httpStatus,
                  profile_write_ok: !markerErr,
                  result_payload: failureMarker,
                  model: earlyPrimaryModel,
                });
                aiEnrichment.base_analysis = applyAiSummary(
                  aiEnrichment.base_analysis,
                  {
                    status: "failed",
                    reason_code: classified.reasonCode,
                    attempts: 1,
                    retryable: classified.retryable,
                    http_status: classified.httpStatus,
                    model: earlyPrimaryModel,
                    run_id: runId,
                  },
                );
              } else if (!transactions || transactions.length === 0) {
                const result = {
                  should_ask_for_more_accounts: false,
                  message: null,
                  reasoning: "No transactions found",
                };
                const { error: storeError } = await supabase
                  .from("profiles")
                  .update({ base_analysis: result, updated_at: new Date().toISOString() })
                  .eq("id", userId);
                await updateOnboardingRun(runId, {
                  status: "skipped",
                  completed_at: new Date().toISOString(),
                  failure_reason_code: "SKIP_NO_TRANSACTIONS",
                  failure_stage: "tx_fetch",
                  tx_rows: 0,
                  profile_write_ok: !storeError,
                  output_valid: true,
                  result_payload: result,
                });
                aiEnrichment.base_analysis = applyAiSummary(
                  aiEnrichment.base_analysis,
                  {
                    status: "skipped",
                    reason_code: "SKIP_NO_TRANSACTIONS",
                    attempts: 1,
                    retryable: false,
                    model: earlyPrimaryModel,
                    run_id: runId,
                  },
                );
              } else {
                try {
                  const llmResult = await callAccountCompletenessLLM({
                    openRouterApiKey,
                    fetchFn: fetch,
                    transactions,
                    model: earlyPrimaryModel,
                  });
                  const analysisJson =
                    llmResult?.ok && llmResult?.json
                      ? llmResult.json
                      : extractFirstJsonObjectFromText(llmResult?.raw);

                  if (!analysisJson) {
                    const parseClassified = classifyOnboardingAiFailure({
                      error: new Error("No valid JSON found in LLM response"),
                      stage: "llm_parse",
                    });
                    const failureMarker = buildStructuredLlmFailureMarker({
                      reasonCode: parseClassified.reasonCode,
                      stage: parseClassified.stage,
                      httpStatus: llmResult?.httpStatus ?? parseClassified.httpStatus,
                      retryable: parseClassified.retryable,
                      attempts: 1,
                      model: llmResult?.model || earlyPrimaryModel,
                      requestId,
                      apiBuild: API_BUILD,
                      failureMessage: parseClassified.failureMessage,
                    });
                    const { error: markerErr } = await supabase
                      .from("profiles")
                      .upsert(
                        {
                          id: userId,
                          base_analysis: failureMarker,
                          updated_at: new Date().toISOString(),
                        },
                        { onConflict: "id" },
                      );
                    await updateOnboardingRun(runId, {
                      status: "failed",
                      completed_at: new Date().toISOString(),
                      failure_reason_code: parseClassified.reasonCode,
                      failure_stage: parseClassified.stage,
                      failure_message: trimFailureMessage(
                        parseClassified.failureMessage,
                      ),
                      retryable: parseClassified.retryable,
                      http_status:
                        llmResult?.httpStatus ?? parseClassified.httpStatus,
                      latency_ms: llmResult?.latencyMs ?? null,
                      output_valid: false,
                      profile_write_ok: !markerErr,
                      llm_request_payload: llmResult?.requestPayload || null,
                      llm_response_payload: llmResult?.responsePayload || null,
                      llm_response_text:
                        llmResult?.responseText || llmResult?.raw || null,
                      result_payload: failureMarker,
                      model: llmResult?.model || earlyPrimaryModel,
                    });
                    aiEnrichment.base_analysis = applyAiSummary(
                      aiEnrichment.base_analysis,
                      {
                        status: "failed",
                        reason_code: parseClassified.reasonCode,
                        attempts: 1,
                        model: llmResult?.model || earlyPrimaryModel,
                        http_status:
                          llmResult?.httpStatus ?? parseClassified.httpStatus,
                        retryable: parseClassified.retryable,
                        run_id: runId,
                      },
                    );
                  } else {
                    const result = {
                      should_ask_for_more_accounts:
                        analysisJson.should_ask_for_more_accounts === true,
                      message: analysisJson.message || null,
                      reasoning: analysisJson.reasoning || "Analysis complete",
                    };
                    const { error: upsertErr } = await supabase
                      .from("profiles")
                      .upsert(
                        {
                          id: userId,
                          base_analysis: result,
                          updated_at: new Date().toISOString(),
                        },
                        { onConflict: "id" },
                      );
                    if (upsertErr) {
                      const persistClassified = classifyOnboardingAiFailure({
                        error: upsertErr,
                        stage: "persist",
                      });
                      const failureMarker = buildStructuredLlmFailureMarker({
                        reasonCode: persistClassified.reasonCode,
                        stage: persistClassified.stage,
                        httpStatus:
                          llmResult?.httpStatus ?? persistClassified.httpStatus,
                        retryable: persistClassified.retryable,
                        attempts: 1,
                        model: llmResult?.model || earlyPrimaryModel,
                        requestId,
                        apiBuild: API_BUILD,
                        failureMessage: persistClassified.failureMessage,
                      });
                      const { error: markerErr } = await supabase
                        .from("profiles")
                        .upsert(
                          {
                            id: userId,
                            base_analysis: failureMarker,
                            updated_at: new Date().toISOString(),
                          },
                          { onConflict: "id" },
                        );
                      await updateOnboardingRun(runId, {
                        status: "failed",
                        completed_at: new Date().toISOString(),
                        failure_reason_code: persistClassified.reasonCode,
                        failure_stage: persistClassified.stage,
                        failure_message: trimFailureMessage(
                          persistClassified.failureMessage,
                        ),
                        retryable: persistClassified.retryable,
                        http_status:
                          llmResult?.httpStatus ??
                          persistClassified.httpStatus,
                        latency_ms: llmResult?.latencyMs ?? null,
                        output_valid: true,
                        profile_write_ok: !markerErr,
                        llm_request_payload: llmResult?.requestPayload || null,
                        llm_response_payload:
                          llmResult?.responsePayload || null,
                        llm_response_text: llmResult?.responseText || null,
                        result_payload: failureMarker,
                        model: llmResult?.model || earlyPrimaryModel,
                      });
                      aiEnrichment.base_analysis = applyAiSummary(
                        aiEnrichment.base_analysis,
                        {
                          status: "failed",
                          reason_code: persistClassified.reasonCode,
                          attempts: 1,
                          model: llmResult?.model || earlyPrimaryModel,
                          http_status:
                            llmResult?.httpStatus ??
                            persistClassified.httpStatus,
                          retryable: persistClassified.retryable,
                          run_id: runId,
                        },
                      );
                    } else {
                      await updateOnboardingRun(runId, {
                        status: "success",
                        completed_at: new Date().toISOString(),
                        output_valid: true,
                        profile_write_ok: true,
                        latency_ms: llmResult?.latencyMs ?? null,
                        llm_request_payload: llmResult?.requestPayload || null,
                        llm_response_payload:
                          llmResult?.responsePayload || null,
                        llm_response_text: llmResult?.responseText || null,
                        result_payload: result,
                        model: llmResult?.model || earlyPrimaryModel,
                        http_status: llmResult?.httpStatus ?? null,
                      });
                      aiEnrichment.base_analysis = applyAiSummary(
                        aiEnrichment.base_analysis,
                        {
                          status: "success",
                          reason_code: null,
                          attempts: 1,
                          model: llmResult?.model || earlyPrimaryModel,
                          http_status: llmResult?.httpStatus ?? null,
                          retryable: false,
                          run_id: runId,
                        },
                      );
                      console.log("✅ Stored profiles.base_analysis", {
                        userId,
                        should_ask: result.should_ask_for_more_accounts,
                      });
                    }
                  }
                } catch (llmErr) {
                  const classified = classifyOnboardingAiFailure({
                    error: llmErr,
                    stage: llmErr?.stage || "llm_request",
                  });
                  const failureMarker = buildStructuredLlmFailureMarker({
                    reasonCode: classified.reasonCode,
                    stage: classified.stage,
                    httpStatus: llmErr?.httpStatus ?? classified.httpStatus,
                    retryable: classified.retryable,
                    attempts: 1,
                    model: llmErr?.model || earlyPrimaryModel,
                    requestId,
                    apiBuild: API_BUILD,
                    failureMessage: classified.failureMessage,
                  });
                  const { error: markerErr } = await supabase
                    .from("profiles")
                    .upsert(
                      {
                        id: userId,
                        base_analysis: failureMarker,
                        updated_at: new Date().toISOString(),
                      },
                      { onConflict: "id" },
                    );
                  await updateOnboardingRun(runId, {
                    status: "failed",
                    completed_at: new Date().toISOString(),
                    failure_reason_code: classified.reasonCode,
                    failure_stage: classified.stage,
                    failure_message: trimFailureMessage(classified.failureMessage),
                    retryable: classified.retryable,
                    http_status: llmErr?.httpStatus ?? classified.httpStatus,
                    latency_ms: llmErr?.latencyMs ?? null,
                    output_valid: false,
                    profile_write_ok: !markerErr,
                    llm_request_payload: llmErr?.requestPayload || null,
                    llm_response_payload: llmErr?.responsePayload || null,
                    llm_response_text: llmErr?.responseText || null,
                    result_payload: failureMarker,
                    model: llmErr?.model || earlyPrimaryModel,
                  });
                  aiEnrichment.base_analysis = applyAiSummary(
                    aiEnrichment.base_analysis,
                    {
                      status: "failed",
                      reason_code: classified.reasonCode,
                      attempts: 1,
                      model: llmErr?.model || earlyPrimaryModel,
                      http_status: llmErr?.httpStatus ?? classified.httpStatus,
                      retryable: classified.retryable,
                      run_id: runId,
                    },
                  );
                }
              }
            }
          }
        }
      } catch (err) {
        const classified = classifyOnboardingAiFailure({
          error: err,
          stage: err?.stage || "llm_request",
        });
        const failureMarker = buildStructuredLlmFailureMarker({
          reasonCode: classified.reasonCode,
          stage: classified.stage,
          httpStatus: err?.httpStatus ?? classified.httpStatus,
          retryable: classified.retryable,
          attempts: 1,
          model: err?.model || earlyPrimaryModel,
          requestId,
          apiBuild: API_BUILD,
          failureMessage: classified.failureMessage,
        });
        const { error: markerErr } = await supabase
          .from("profiles")
          .upsert(
            {
              id: userId,
              base_analysis: failureMarker,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          );
        await updateOnboardingRun(runId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          failure_reason_code: classified.reasonCode,
          failure_stage: classified.stage,
          failure_message: trimFailureMessage(classified.failureMessage),
          retryable: classified.retryable,
          http_status: err?.httpStatus ?? classified.httpStatus,
          latency_ms: err?.latencyMs ?? null,
          output_valid: false,
          profile_write_ok: !markerErr,
          llm_request_payload: err?.requestPayload || null,
          llm_response_payload: err?.responsePayload || null,
          llm_response_text: err?.responseText || null,
          result_payload: failureMarker,
          model: err?.model || earlyPrimaryModel,
        });
        aiEnrichment.base_analysis = applyAiSummary(aiEnrichment.base_analysis, {
          status: "failed",
          reason_code: classified.reasonCode,
          attempts: 1,
          model: err?.model || earlyPrimaryModel,
          http_status: err?.httpStatus ?? classified.httpStatus,
          retryable: classified.retryable,
          run_id: runId,
        });
      }
    }

    console.log(
      `✅ Sync complete: ${added.length} added, ${modified.length} modified, ${removed.length} removed`,
    );

    // 8) Detect notification patterns (fire and forget - don't block response)
    // Always run pattern detection, even if no new transactions - analyzes last 60 days
    if (!shouldRunNotificationPatterns) {
      console.log(
        "[TRANSACTIONS_SYNC] notification patterns: skipped (mode)",
        { userId, effective_enrichment_mode: effectiveEnrichmentMode },
      );
    } else if (!hasAiEnrichmentConsent) {
      console.log(
        "[TRANSACTIONS_SYNC] notification patterns: skipped (no consent)",
        { userId },
      );
    } else {
      (async () => {
        try {
          const { detectNotificationPatterns } =
            await import("../lib/notificationPatternDetection.js");
          await detectNotificationPatterns(userId, added);
        } catch (error) {
          console.error("[TRANSACTIONS_SYNC] Pattern detection error:", error);
          // Non-critical, don't throw
        }
      })();
    }

    // 9) Return transaction sync summary
    return res.status(200).json({
      message: "Sync complete",
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      request_id: requestId,
      has_onboarding_ai_consent: hasOnboardingAiConsent,
      has_chat_memory_consent: hasChatMemoryConsent,
      has_ai_enrichment_consent: hasAiEnrichmentConsent,
      skip_enrichment: skipEnrichment,
      enrichment_mode: effectiveEnrichmentMode,
      ai_enrichment: aiEnrichment,
      api_build: API_BUILD,
    });
  } catch (e) {
    console.error("transactions_sync error", e.response?.data || e);

    // Handle specific Plaid errors
    const plaidError = e.response?.data;
    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({
        error: plaidError.error_message || "Item requires re-authentication",
        requires_update_mode: true,
      });
    }

    return res
      .status(500)
      .json({ error: plaidError?.error_message || e.message });
  }
}

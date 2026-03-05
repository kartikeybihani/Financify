// core/finny/pipeline/ContextLoadingStage.js
/**
 * Context Loading Stage - Stage 2 of Ask Pipeline
 * 
 * Responsibilities:
 * - Select data packs based on classification
 * - Extract and normalize period/category/merchant filters
 * - Build context packs with optimized fetching
 * - Load user profile and memory
 */

import { logDebug, logInfo } from "../utils/logging.js";

/**
 * Normalize period filter from classification or keywords
 */
export function normalizePeriodFilter(periodFilter, timeRange = "current") {
  if (!periodFilter) return null;

  const now = new Date();
  const toIso = (d) => d.toISOString().split("T")[0];

  // Already structured period
  if (
    typeof periodFilter === "object" &&
    periodFilter !== null &&
    periodFilter.start &&
    periodFilter.end
  ) {
    return {
      start: periodFilter.start,
      end: periodFilter.end,
      ...(Number.isFinite(Number(periodFilter.months))
        ? { months: Number(periodFilter.months) }
        : {}),
    };
  }

  // Convert month-only objects to concrete dates
  if (
    typeof periodFilter === "object" &&
    periodFilter !== null &&
    Number.isFinite(Number(periodFilter.months))
  ) {
    const months = Number(periodFilter.months);
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
    return {
      start: toIso(startDate),
      end: toIso(now),
      months,
    };
  }

  // Natural language period string from classifier
  if (typeof periodFilter === "string") {
    const p = periodFilter.toLowerCase().trim();

    if (p.includes("this month") || p === "current") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toIso(first), end: toIso(now) };
    }
    if (p.includes("last month")) {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toIso(first), end: toIso(last), months: 1 };
    }
    if (p.includes("last 30") || p.includes("past 30")) {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: toIso(start), end: toIso(now), months: 1 };
    }
    const match = p.match(/(\d+)\s+months?/);
    if (match) {
      const months = Number(match[1]);
      const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
      return { start: toIso(startDate), end: toIso(now), months };
    }
  }

  // Fallback from classification time_range
  if (typeof timeRange === "string") {
    if (timeRange === "1_month") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: toIso(first), end: toIso(now), months: 1 };
    }
    if (timeRange === "3_months") {
      const first = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { start: toIso(first), end: toIso(now), months: 3 };
    }
    if (timeRange === "6_months") {
      const first = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return { start: toIso(first), end: toIso(now), months: 6 };
    }
    if (timeRange === "1_year") {
      const first = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      return { start: toIso(first), end: toIso(now), months: 12 };
    }
  }

  return null;
}

/**
 * Execute Context Loading Stage
 * Returns packs, slots, and user context
 */
export async function executeContextLoadingStage(input) {
  const {
    classification,
    message,
    userId,
    contextPlanningService,
    buildContextPacks,
  } = input;

  logInfo("📦 [STAGE:CONTEXT] Starting context loading stage");

  // 1. Select data packs from classification
  const packSelection = contextPlanningService.selectDataPacksFromClassification(
    classification,
    message,
  );

  // 2. Extract keyword-based slots for backward compatibility
  const keywordSlots = contextPlanningService.extractSlots(message);
  
  // 3. Normalize classification period
  const normalizedClassificationPeriod = normalizePeriodFilter(
    packSelection.filters.period,
    classification?.data_requirements?.time_range || "current",
  );

  // 4. Build final slots (classification overrides keywords)
  const slots = {
    ...keywordSlots,
    merchant: packSelection.filters.merchant || keywordSlots.merchant,
    category: packSelection.filters.category || keywordSlots.category,
    period: normalizedClassificationPeriod || keywordSlots.period,
    useMerchantRPC: packSelection.useMerchantRPC,
    time_range: classification?.data_requirements?.time_range || null,
  };

  const needs = packSelection.needs;

  logInfo("🎯 [STAGE:CONTEXT] Selected needs:", needs);
  logInfo("🎯 [STAGE:CONTEXT] Final slots:", JSON.stringify(slots, null, 2));

  // 5. Build context packs
  const contextResult = await buildContextPacks(userId, needs, slots);
  const packs = contextResult?.packs || {};
  const dataGaps = Array.isArray(contextResult?.gaps) ? contextResult.gaps : [];

  logInfo("✅ [STAGE:CONTEXT] Context loading complete", {
    packsLoaded: Object.keys(packs),
    needsRequested: needs.length,
    dataGaps: dataGaps.length,
  });

  return {
    packs,
    slots,
    needs,
    packSelection,
    dataGaps,
  };
}

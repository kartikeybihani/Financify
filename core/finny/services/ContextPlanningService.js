// core/finny/services/ContextPlanningService.js
// Context planning service - determines which data packs to fetch based on classification
// Extracted from api/finny.js lines 4365-4725

import { logInfo } from '../utils/logging.js';

/**
 * ContextPlanningService determines which data packs to fetch based on message classification
 */
export class ContextPlanningService {
  /**
   * Selects data packs from classification result
   * Maps classification data_requirements to internal needs and filters
   * 
   * @param {object} classificationResult - The classification result from ClassificationService
   * @param {string} message - The original user message
   * @returns {object} { needs: string[], filters: object, useMerchantRPC: boolean }
   */
  selectDataPacksFromClassification(classificationResult, message) {
    const lower = String(message || "").toLowerCase();
    const slotsForMessage = this.extractSlots(message);
    const isFactual = classificationResult?.intent_type === "factual";

    // Deterministic factual routing (separate from style generation)
    if (isFactual && classificationResult?.needs_user_data !== false) {
      const needs = ["summary_min"];
      if (slotsForMessage.topic === "spend" || /\bspend|spent|expenses?\b/.test(lower)) {
        if (!needs.includes("spend_total")) needs.push("spend_total");
      }
      if (slotsForMessage.category || slotsForMessage.merchant) {
        if (!needs.includes("category_details")) needs.push("category_details");
      }

      return {
        needs,
        filters: {
          merchant: slotsForMessage.merchant || null,
          category: slotsForMessage.category || null,
          period: slotsForMessage.period || null,
        },
        useMerchantRPC: !!slotsForMessage.merchant,
      };
    }

    // Fallback to keyword-based if no data_requirements
    if (
      !classificationResult ||
      !classificationResult.data_requirements ||
      classificationResult.needs_user_data === false
    ) {
      logInfo(
        "⚠️ [PACK_SELECTOR] No data_requirements, falling back to keyword-based selection",
      );
      const slots = this.extractSlots(message);
      const needs = this.planNeeds(slots, message);
      return {
        needs,
        filters: {
          merchant: slots.merchant || null,
          category: slots.category || null,
          period: slots.period || null,
        },
        useMerchantRPC: !!slots.merchant,
      };
    }

    const dr = classificationResult.data_requirements;
    const needs = [];
    const filters = {
      merchant: dr.filters?.merchant || null,
      category: dr.filters?.category || null,
      period: dr.filters?.period || null,
    };

    // Map classification pack names to internal needs
    const packMapping = {
      summary_min: "summary_min",
      spend_total: "spend_total",
      category_details: "category_details",
      merchant_breakdown: "category_details", // Same pack, different filter
      invest_holdings: "invest_holdings",
      goals_overview: "goals_overview",
    };

    // Add required packs (ensure summary_min for context + base_packs logging)
    if (Array.isArray(dr.required_packs)) {
      dr.required_packs.forEach((pack) => {
        if (pack === "cashflow_monthly") return;
        const need = packMapping[pack] || pack;
        if (!needs.includes(need)) {
          needs.push(need);
        }
      });
    }
    if (!needs.includes("summary_min")) {
      needs.unshift("summary_min"); // Always include base for context + conversation_logs.base_packs
    }

    // Add optional packs (only if not already included)
    if (Array.isArray(dr.optional_packs)) {
      dr.optional_packs.forEach((pack) => {
        if (pack === "cashflow_monthly") return;
        const need = packMapping[pack] || pack;
        if (!needs.includes(need)) {
          needs.push(need);
        }
      });
    }

    // Determine if we should use merchant RPC directly
    // Use merchant RPC if: category_details is needed AND merchant filter exists
    const useMerchantRPC =
      needs.includes("category_details") && filters.merchant && !filters.category; // Only use merchant RPC if no category filter

    logInfo("📦 [PACK_SELECTOR] Selected packs from classification:", {
      needs,
      filters,
      useMerchantRPC,
      required_packs: dr.required_packs,
      optional_packs: dr.optional_packs,
    });

    return {
      needs,
      filters,
      useMerchantRPC,
    };
  }

  /**
   * Plan which data packs are needed based on extracted slots
   * 
   * @param {object} slots - Extracted slots from message
   * @param {string} message - Original user message
   * @returns {string[]} Array of needed data pack names
   */
  planNeeds(slots, message) {
    const needs = ["summary_min"];

    switch (slots.topic) {
      case "spend":
        // HARD GUARDRAIL: For spend questions, ALWAYS include both spend_total and txns_by_category
        needs.push("spend_total", "txns_by_category");
        break;
      case "merchant":
        needs.push("merchant_breakdown");
        break;
      case "accounts":
        // summary_min already covers basic account info
        break;
      case "invest":
      case "retirement":
        // HARD GUARDRAIL: For invest/retirement questions, ALWAYS include both summary_min and invest_holdings
        needs.push("invest_holdings");
        break;
      case "goals":
        // HARD GUARDRAIL: For goals questions, ALWAYS include goals_overview
        needs.push("goals_overview");
        break;
    }

    // ADDITIONAL GUARDRAILS: Force critical data combinations
    if (slots.topic === "spend" && slots.category) {
      // If asking about specific category spending, ensure we have both total and category breakdown
      if (!needs.includes("spend_total")) needs.push("spend_total");
      if (!needs.includes("txns_by_category")) needs.push("txns_by_category");
    }

    if (slots.topic === "retirement" || slots.topic === "invest") {
      // For any investment/retirement question, ensure we have holdings data
      if (!needs.includes("invest_holdings")) needs.push("invest_holdings");
    }

    if (
      message.toLowerCase().includes("goal") ||
      message.toLowerCase().includes("save") ||
      message.toLowerCase().includes("target")
    ) {
      // For any goals question, ensure we have goals context
      if (!needs.includes("goals_overview")) needs.push("goals_overview");
    }

    return needs;
  }

  /**
   * Extract slots (topic, category, merchant, period) from user message
   * 
   * @param {string} message - User message
   * @returns {object} Extracted slots
   */
  extractSlots(message) {
    const lowerMessage = message.toLowerCase();

    // Detect topic
    let topic;
    if (
      lowerMessage.includes("spen") ||
      lowerMessage.includes("expense") ||
      lowerMessage.includes("food") ||
      lowerMessage.includes("shopping") ||
      lowerMessage.includes("utilities") ||
      lowerMessage.includes("internet") ||
      lowerMessage.includes("phone") ||
      lowerMessage.includes("cable") ||
      lowerMessage.includes("rent") ||
      lowerMessage.includes("mortgage")
    ) {
      topic = "spend";
    } else if (
      lowerMessage.includes("merchant") ||
      lowerMessage.includes("chipotle") ||
      lowerMessage.includes("starbucks") ||
      lowerMessage.includes("amazon")
    ) {
      topic = "merchant";
    } else if (
      lowerMessage.includes("account") ||
      lowerMessage.includes("balance") ||
      lowerMessage.includes("bank") ||
      lowerMessage.includes("credit card") ||
      lowerMessage.includes("debit card") ||
      lowerMessage.includes("loan") ||
      lowerMessage.includes("mortgage") ||
      lowerMessage.includes("rent")
    ) {
      topic = "accounts";
    } else if (
      lowerMessage.includes("invest") ||
      lowerMessage.includes("portfolio") ||
      lowerMessage.includes("stock") ||
      lowerMessage.includes("retirement") ||
      lowerMessage.includes("holdings") ||
      lowerMessage.includes("what do i own") ||
      lowerMessage.includes("my investments") ||
      lowerMessage.includes("my portfolio")
    ) {
      topic = lowerMessage.includes("retirement") ? "retirement" : "invest";
    } else if (
      lowerMessage.includes("goal") ||
      lowerMessage.includes("save") ||
      lowerMessage.includes("target")
    ) {
      topic = "goals";
    }

    // Detect category
    let category;
    const categoryPatterns = [
      "food",
      "groceries",
      "shopping",
      "entertainment",
      "transportation",
      "travel",
      "rent",
      "mortgage",
      "utilities",
      "internet",
      "phone",
    ];

    // Map detected patterns to actual database categories
    const categoryMapping = {
      food: "Food",
      groceries: "Groceries",
      shopping: "Shopping",
      entertainment: "Entertainment",
      transportation: "Transportation",
      travel: "Travel",
      rent: "Housing",
      mortgage: "Housing",
      utilities: "Utilities",
      internet: "Utilities",
      phone: "Utilities",
    };

    for (const pattern of categoryPatterns) {
      if (lowerMessage.includes(pattern)) {
        category = categoryMapping[pattern] || pattern;
        break;
      }
    }

    // Detect merchant
    let merchant;
    const merchantPatterns = [
      "chipotle",
      "starbucks",
      "mcdonalds",
      "uber",
      "lyft",
      "amazon",
      "target",
      "walmart",
      "netflix",
      "spotify",
    ];
    for (const pattern of merchantPatterns) {
      if (lowerMessage.includes(pattern)) {
        merchant = pattern;
        break;
      }
    }

    // Detect period
    let period;
    let monthsCount = null; // Track multi-month queries for get_spend_by_category_periods
    const now = new Date();

    // Multi-month patterns (e.g., "last 6 months", "past 3 months")
    const multiMonthMatch = lowerMessage.match(
      /(?:last|past|previous)\s+(\d+)\s+months?/,
    );
    if (multiMonthMatch) {
      monthsCount = parseInt(multiMonthMatch[1], 10);
      const startDate = new Date(
        now.getFullYear(),
        now.getMonth() - monthsCount,
        1,
      );
      period = {
        start: startDate.toISOString().split("T")[0],
        end: now.toISOString().split("T")[0],
        months: monthsCount, // Flag for using get_spend_by_category_periods
      };
    }
    // Multi-year patterns (e.g., "last 1 year", "past 2 years", "last year")
    else if (
      lowerMessage.includes("last year") ||
      lowerMessage.includes("past year") ||
      lowerMessage.includes("previous year")
    ) {
      // Check for "last 1 year" or "past 1 year" explicitly
      const yearMatch = lowerMessage.match(
        /(?:last|past|previous)\s+(\d+)\s+years?/,
      );
      if (yearMatch) {
        const yearsCount = parseInt(yearMatch[1], 10);
        monthsCount = yearsCount * 12;
      } else {
        // Default to 1 year if just "last year" or "past year"
        monthsCount = 12;
      }
      const startDate = new Date(
        now.getFullYear(),
        now.getMonth() - monthsCount,
        1,
      );
      period = {
        start: startDate.toISOString().split("T")[0],
        end: now.toISOString().split("T")[0],
        months: monthsCount,
      };
    } else if (lowerMessage.includes("last month")) {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      period = {
        start: firstOfLastMonth.toISOString().split("T")[0],
        end: lastOfLastMonth.toISOString().split("T")[0],
      };
    } else if (lowerMessage.includes("this month")) {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      period = {
        start: firstOfThisMonth.toISOString().split("T")[0],
        end: now.toISOString().split("T")[0],
      };
    } else if (lowerMessage.includes("last week")) {
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      period = {
        start: lastWeek.toISOString().split("T")[0],
        end: now.toISOString().split("T")[0],
      };
    } else if (
      lowerMessage.includes("last 30 days") ||
      lowerMessage.includes("past 30 days")
    ) {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      period = {
        start: thirtyDaysAgo.toISOString().split("T")[0],
        end: now.toISOString().split("T")[0],
      };
    }

    return {
      intent: "ask",
      topic,
      category,
      merchant,
      period,
    };
  }
}

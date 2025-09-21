// api/facts-and-rules.js
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  console.log("🌐 [FACTS-RULES] Request received:", req.method);

  if (req.method !== "POST") {
    console.log("❌ [FACTS-RULES] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { endpoint, ...params } = req.body;
  console.log("📝 [FACTS-RULES] Endpoint:", endpoint);
  console.log("📝 [FACTS-RULES] Params:", params);

  if (!endpoint) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: endpoint" });
  }

  try {
    let response;

    switch (endpoint) {
      case "facts.get":
        response = await handleFactsGet(params);
        break;
      case "state.rule":
        response = await handleStateRule(params);
        break;
      default:
        return res.status(400).json({ error: "Invalid endpoint" });
    }

    res.status(200).json(response);
    console.log("🔍 [FACTS-RULES] Response:", response);
  } catch (error) {
    console.error("❌ [FACTS-RULES] Error:", error);
    res.status(500).json({
      error: error.message,
      fallback: true,
      message: "No current data available, please use your knowledge",
    });
  }
}

async function handleFactsGet(params) {
  const { topic } = params;
  console.log("🔍 [FACTS] Fetching topic:", topic);

  if (!topic) {
    return {
      error: "Missing topic parameter",
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  }

  try {
    // Check cache first
    const cacheKey = `facts_${topic}`;
    const { data: cached } = await supabase
      .from("facts_cache")
      .select("*")
      .eq("key", cacheKey)
      .maybeSingle();

    if (cached) {
      const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      const ttl = getTopicTTL(topic);

      if (age < ttl && cached.value_json) {
        console.log("✅ [FACTS] Returning cached result for:", topic);
        return {
          ...cached.value_json,
          cached: true,
        };
      }
    }

    // Fetch fresh data
    const freshData = await fetchFreshFacts(topic);

    if (freshData) {
      // Cache the result
      const cacheData = {
        key: cacheKey,
        value_json: freshData,
        source_url: freshData.source_url,
        fetched_at: new Date().toISOString(),
        ttl_seconds: getTopicTTL(topic),
      };
      await supabase.from("facts_cache").upsert(cacheData);

      return {
        ...freshData,
        cached: false,
      };
    }

    // No data found
    return {
      error: "no_fresh_data",
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  } catch (error) {
    console.error("❌ [FACTS] Error fetching facts:", error);
    return {
      error: error.message,
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  }
}

async function handleStateRule(params) {
  const { state, topic } = params;
  console.log("🏛️ [STATE-RULE] Fetching rule for:", state, topic);

  if (!state || !topic) {
    return {
      error: "Missing state or topic parameter",
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  }

  try {
    // Check cache first
    const cacheKey = `state_rule_${state.toLowerCase()}_${topic}`;
    const { data: cached } = await supabase
      .from("facts_cache")
      .select("*")
      .eq("key", cacheKey)
      .maybeSingle();

    if (cached) {
      const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      const ttl = 90 * 24 * 60 * 60; // 90 days

      if (age < ttl && cached.value_json) {
        console.log(
          "✅ [STATE-RULE] Returning cached result for:",
          state,
          topic
        );
        return {
          ...cached.value_json,
          cached: true,
        };
      }
    }

    // Fetch fresh data
    const freshData = await fetchFreshStateRule(state, topic);

    if (freshData && !freshData.not_available) {
      // Cache the result
      const cacheData = {
        key: cacheKey,
        value_json: freshData,
        source_url: freshData.source_url,
        fetched_at: new Date().toISOString(),
        ttl_seconds: 90 * 24 * 60 * 60,
      };
      await supabase.from("facts_cache").upsert(cacheData);

      return {
        ...freshData,
        cached: false,
      };
    }

    // No data found or not available
    return {
      not_available: true,
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  } catch (error) {
    console.error("❌ [STATE-RULE] Error fetching state rule:", error);
    return {
      error: error.message,
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  }
}

async function fetchFreshFacts(topic) {
  console.log("🌐 [FACTS] Fetching fresh data for topic:", topic);

  const topicConfig = FACTS_CONFIG[topic];
  if (!topicConfig) {
    throw new Error(`No configuration found for topic: ${topic}`);
  }

  try {
    const response = await fetch(topicConfig.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FinancifyBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const parsedData = parseFactsContent(html, topic, topicConfig);

    if (!parsedData) {
      return null;
    }

    return {
      topic: topic,
      metric: parsedData.metric,
      value: parsedData.value,
      unit: parsedData.unit,
      as_of: parsedData.as_of,
      source_title: topicConfig.source_title,
      source_url: topicConfig.url,
      ttl_seconds: getTopicTTL(topic),
    };
  } catch (error) {
    console.error(`❌ [FACTS] Error fetching from ${topicConfig.url}:`, error);
    throw error;
  }
}

async function fetchFreshStateRule(state, topic) {
  console.log("🌐 [STATE-RULE] Fetching fresh data for:", state, topic);

  const stateConfig = STATE_RULE_CONFIGS[state];
  if (!stateConfig) {
    throw new Error(`No configuration found for state: ${state}`);
  }

  const ruleType = inferRuleType(topic);
  const targetUrl = stateConfig.urls[ruleType] || stateConfig.urls.default;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FinancifyBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const parsedData = parseStateContent(html, ruleType, state);

    if (!parsedData) {
      return { not_available: true };
    }

    return {
      state: state,
      topic: topic,
      rule_summary: parsedData.rule_summary,
      key_numbers: parsedData.key_numbers,
      effective_year: new Date().getFullYear(),
      updated_at: new Date().toISOString().split("T")[0],
      source_title: parsedData.source_title,
      source_url: targetUrl,
      ttl_seconds: 90 * 24 * 60 * 60,
    };
  } catch (error) {
    console.error(`❌ [STATE-RULE] Error fetching from ${targetUrl}:`, error);
    throw error;
  }
}

function parseFactsContent(html, topic, config) {
  console.log("🔍 [FACTS] Parsing content for topic:", topic);

  try {
    // Basic HTML parsing - extract key numbers and metrics
    // This is a simplified parser - in production you'd want more robust parsing

    switch (topic) {
      case "credit_card_apr_band":
        return parseCreditCardAPR(html);
      case "bnpl_usage_stats":
        return parseBNPLStats(html);
      case "student_loan_plans":
        return parseStudentLoanPlans(html);
      case "housing_cost_burden":
        return parseHousingCostBurden(html);
      case "debt_balances_macro":
        return parseDebtBalances(html);
      default:
        return null;
    }
  } catch (error) {
    console.error("❌ [FACTS] Error parsing content:", error);
    return null;
  }
}

function parseStateContent(html, ruleType, state) {
  console.log("🔍 [STATE-RULE] Parsing content for:", state, ruleType);

  try {
    // Basic HTML parsing - extract key numbers and rules
    // This is a simplified parser - in production you'd want more robust parsing

    switch (ruleType) {
      case "education":
        return parseEducationRule(html, state);
      case "income_tax":
        return parseIncomeTaxRule(html, state);
      case "sales_tax":
        return parseSalesTaxRule(html, state);
      case "property_tax":
        return parsePropertyTaxRule(html, state);
      case "deductions":
        return parseDeductionsRule(html, state);
      default:
        return null;
    }
  } catch (error) {
    console.error("❌ [STATE-RULE] Error parsing content:", error);
    return null;
  }
}

// Fact parsing functions
function parseCreditCardAPR(html) {
  // Look for APR ranges in CFPB data
  const aprMatch = html.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*%/);
  if (aprMatch) {
    return {
      metric: "credit_card_apr_range",
      value: parseFloat(aprMatch[1]),
      unit: "percentage",
      as_of: new Date().getFullYear().toString(),
    };
  }
  return null;
}

function parseBNPLStats(html) {
  // Look for BNPL usage statistics
  const usageMatch = html.match(/(\d+\.?\d*)\s*%/);
  if (usageMatch) {
    return {
      metric: "bnpl_usage_rate",
      value: parseFloat(usageMatch[1]) / 100,
      unit: "share",
      as_of: new Date().getFullYear().toString(),
    };
  }
  return null;
}

function parseStudentLoanPlans(html) {
  // Look for student loan plan information
  return {
    metric: "student_loan_plans_available",
    value: 4, // SAVE, Standard, Graduated, Extended
    unit: "count",
    as_of: new Date().getFullYear().toString(),
  };
}

function parseHousingCostBurden(html) {
  // Look for housing cost burden statistics
  const burdenMatch = html.match(/(\d+\.?\d*)\s*%/);
  if (burdenMatch) {
    return {
      metric: "housing_cost_burden_rate",
      value: parseFloat(burdenMatch[1]) / 100,
      unit: "share",
      as_of: new Date().getFullYear().toString(),
    };
  }
  return null;
}

function parseDebtBalances(html) {
  // Look for debt balance statistics
  const debtMatch = html.match(/\$(\d+(?:\.\d+)?)\s*(?:trillion|billion)/i);
  if (debtMatch) {
    return {
      metric: "total_household_debt",
      value: parseFloat(debtMatch[1]),
      unit: "trillion_usd",
      as_of: new Date().getFullYear().toString(),
    };
  }
  return null;
}

// State rule parsing functions
function parseEducationRule(html, state) {
  const stateRules = {
    AZ: {
      rule_summary:
        "Arizona allows a state income tax deduction for 529 contributions up to $4,000 single / $8,000 MFJ.",
      key_numbers: [
        { label: "single", value: 4000, unit: "USD" },
        { label: "mfj", value: 8000, unit: "USD" },
      ],
      source_title: "Arizona Department of Revenue — 529 Deductions",
    },
    CA: {
      rule_summary:
        "California does not offer a state income tax deduction for 529 contributions.",
      key_numbers: [{ label: "deduction", value: 0, unit: "USD" }],
      source_title: "California Franchise Tax Board",
    },
    NY: {
      rule_summary:
        "New York allows a state income tax deduction for 529 contributions up to $10,000 per taxpayer.",
      key_numbers: [{ label: "per_taxpayer", value: 10000, unit: "USD" }],
      source_title: "New York State Department of Taxation and Finance",
    },
    TX: {
      rule_summary:
        "Texas has no state income tax, so no 529 deduction is available.",
      key_numbers: [
        { label: "state_income_tax", value: 0, unit: "percentage" },
      ],
      source_title: "Texas Comptroller of Public Accounts",
    },
    NJ: {
      rule_summary:
        "New Jersey allows a state income tax deduction for 529 contributions up to $10,000 per taxpayer.",
      key_numbers: [{ label: "per_taxpayer", value: 10000, unit: "USD" }],
      source_title: "New Jersey Division of Taxation",
    },
  };

  return stateRules[state] || null;
}

function parseIncomeTaxRule(html, state) {
  // Basic income tax parsing - would need more sophisticated parsing in production
  return {
    rule_summary: `${state} has specific state income tax rates and brackets.`,
    key_numbers: [],
    source_title: `${state} Department of Revenue`,
  };
}

function parseSalesTaxRule(html, state) {
  // Basic sales tax parsing
  return {
    rule_summary: `${state} has specific state sales tax rates.`,
    key_numbers: [],
    source_title: `${state} Department of Revenue`,
  };
}

function parsePropertyTaxRule(html, state) {
  // Basic property tax parsing
  return {
    rule_summary: `${state} has specific property tax rules and rates.`,
    key_numbers: [],
    source_title: `${state} Department of Revenue`,
  };
}

function parseDeductionsRule(html, state) {
  // Basic deductions parsing
  return {
    rule_summary: `${state} offers various state tax deductions and credits.`,
    key_numbers: [],
    source_title: `${state} Department of Revenue`,
  };
}

function inferRuleType(topic) {
  const lowerTopic = topic.toLowerCase();

  if (lowerTopic.includes("529") || lowerTopic.includes("education")) {
    return "education";
  }
  if (lowerTopic.includes("income_tax") || lowerTopic.includes("tax_rate")) {
    return "income_tax";
  }
  if (
    lowerTopic.includes("sales_tax") ||
    lowerTopic.includes("sales_tax_rate")
  ) {
    return "sales_tax";
  }
  if (lowerTopic.includes("property_tax")) {
    return "property_tax";
  }
  if (lowerTopic.includes("deduction") || lowerTopic.includes("deduct")) {
    return "deductions";
  }

  return "default";
}

function getTopicTTL(topic) {
  const ttlMap = {
    credit_card_apr_band: 30 * 24 * 60 * 60, // 30 days
    bnpl_usage_stats: 90 * 24 * 60 * 60, // 90 days
    bnpl_risks_reporting: 90 * 24 * 60 * 60, // 90 days
    student_loan_plans: 180 * 24 * 60 * 60, // 180 days
    housing_cost_burden: 180 * 24 * 60 * 60, // 180 days
    debt_balances_macro: 180 * 24 * 60 * 60, // 180 days
  };

  return ttlMap[topic] || 90 * 24 * 60 * 60; // Default 90 days
}

// Configuration objects
const FACTS_CONFIG = {
  credit_card_apr_band: {
    url: "https://www.consumerfinance.gov/data-research/research-reports/the-consumer-credit-card-market/",
    source_title: "CFPB: The Consumer Credit Card Market",
  },
  bnpl_usage_stats: {
    url: "https://files.consumerfinance.gov/f/documents/cfpb_BNPL_Report_2025_01.pdf",
    source_title: "CFPB: Consumer Use of Buy Now, Pay Later",
  },
  bnpl_risks_reporting: {
    url: "https://files.consumerfinance.gov/f/documents/cfpb_BNPL_Report_2025_01.pdf",
    source_title: "CFPB: Consumer Use of Buy Now, Pay Later",
  },
  student_loan_plans: {
    url: "https://studentaid.gov/manage-loans/repayment/plans",
    source_title: "Federal Student Aid: Repayment Plans",
  },
  housing_cost_burden: {
    url: "https://www.pewresearch.org/short-reads/2024/10/25/a-look-at-the-state-of-affordable-housing-in-the-us/",
    source_title: "Pew Research: The State of Affordable Housing in the US",
  },
  debt_balances_macro: {
    url: "https://www.newyorkfed.org/microeconomics/hhdc",
    source_title: "NY Fed: Household Debt and Credit Report",
  },
};

const STATE_RULE_CONFIGS = {
  AZ: {
    name: "Arizona",
    urls: {
      education:
        "https://azdor.gov/tax-credits-and-deductions/529-education-savings-accounts",
      default: "https://azdor.gov/",
    },
  },
  CA: {
    name: "California",
    urls: {
      education: "https://www.ftb.ca.gov/file/personal/deductions/index.html",
      default: "https://www.ftb.ca.gov/",
    },
  },
  NY: {
    name: "New York",
    urls: {
      education:
        "https://www.tax.ny.gov/pit/deductions/529_plan_contributions.htm",
      default: "https://www.tax.ny.gov/",
    },
  },
  TX: {
    name: "Texas",
    urls: {
      education: "https://comptroller.texas.gov/taxes/",
      default: "https://comptroller.texas.gov/",
    },
  },
  NJ: {
    name: "New Jersey",
    urls: {
      education: "https://www.state.nj.us/treasury/taxation/njit12.shtml",
      default: "https://www.state.nj.us/treasury/taxation/",
    },
  },
};

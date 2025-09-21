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
  const { query, state } = params;
  console.log("🔍 [FACTS] Processing query:", query, "State:", state);

  if (!query) {
    return {
      error: "Missing query parameter",
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  }

  try {
    // Detect topic and determine if state-specific
    const topicInfo = detectTopic(query, state);
    console.log("🔍 [FACTS] Detected topic:", topicInfo);

    // Check cache first
    const cacheKey = generateCacheKey(topicInfo);
    const cached = await getCachedResult(cacheKey, topicInfo.ttl);

    if (cached) {
      console.log("✅ [FACTS] Returning cached result for:", cacheKey);
      return { ...cached, cached: true };
    }

    // Fetch fresh data from allowlisted sources
    const freshData = await fetchFromAllowlistedSources(topicInfo);

    if (freshData) {
      // Cache the result
      await cacheResult(cacheKey, freshData, topicInfo.ttl);
      return { ...freshData, cached: false };
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
  const { state, query } = params;
  console.log("🏛️ [STATE-RULE] Processing:", state, query);

  if (!state || !query) {
    return {
      error: "Missing state or query parameter",
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  }

  try {
    // Use the same engine as facts.get but with state-specific routing
    const topicInfo = detectTopic(query, state);
    topicInfo.isStateRule = true;

    // Check cache first
    const cacheKey = generateCacheKey(topicInfo);
    const cached = await getCachedResult(cacheKey, topicInfo.ttl);

    if (cached) {
      console.log("✅ [STATE-RULE] Returning cached result for:", cacheKey);
      return { ...cached, cached: true };
    }

    // Fetch from state-specific allowlisted sources
    const freshData = await fetchFromAllowlistedSources(topicInfo);

    if (freshData && !freshData.not_available) {
      // Cache the result
      await cacheResult(cacheKey, freshData, topicInfo.ttl);
      return { ...freshData, cached: false };
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

// Topic detection and source routing
function detectTopic(query, state) {
  const lowerQuery = query.toLowerCase();

  // Topic detection patterns
  const topics = {
    product_comparison: {
      patterns: [
        "chase",
        "amex",
        "american express",
        "capital one",
        "citi",
        "discover",
        "wells fargo",
        "bank of america",
        "vs",
        "versus",
        "compare",
        "better",
        "which",
      ],
      sources: [
        "chase.com",
        "americanexpress.com",
        "capitalone.com",
        "citi.com",
        "discover.com",
        "wellsfargo.com",
        "bankofamerica.com",
      ],
      ttl: 7 * 24 * 60 * 60, // 7 days for product data
      topic: "product_comparison",
      isProductComparison: true,
    },
    bnpl: {
      patterns: ["bnpl", "buy now pay later", "credit report", "reporting"],
      sources: ["consumerfinance.gov"],
      ttl: 90 * 24 * 60 * 60, // 90 days
      topic: "bnpl_risks_reporting",
    },
    student_loans: {
      patterns: ["student loan", "repayment plan", "save plan", "idr"],
      sources: ["studentaid.gov"],
      ttl: 180 * 24 * 60 * 60, // 180 days
      topic: "student_loan_plans",
    },
    credit_apr: {
      patterns: ["credit card", "apr", "interest rate"],
      sources: ["consumerfinance.gov"],
      ttl: 30 * 24 * 60 * 60, // 30 days
      topic: "credit_card_apr_band",
    },
    housing_burden: {
      patterns: ["housing", "rent", "cost burden", "affordable housing"],
      sources: ["pewresearch.org", "census.gov"],
      ttl: 180 * 24 * 60 * 60, // 180 days
      topic: "housing_cost_burden",
    },
    household_debt: {
      patterns: ["debt", "household debt", "credit card debt"],
      sources: ["newyorkfed.org"],
      ttl: 180 * 24 * 60 * 60, // 180 days
      topic: "debt_balances_macro",
    },
    state_529: {
      patterns: ["529", "education savings", "college savings"],
      sources: state ? [getStateOfficialSite(state)] : [],
      ttl: 90 * 24 * 60 * 60, // 90 days
      topic: "state_529_deduction_or_credit",
      isStateSpecific: true,
    },
    state_tax: {
      patterns: ["income tax", "tax rate", "deduction", "credit"],
      sources: state ? [getStateOfficialSite(state)] : [],
      ttl: 90 * 24 * 60 * 60, // 90 days
      topic: "state_income_tax_brackets",
      isStateSpecific: true,
    },
  };

  // Find matching topic
  for (const [key, config] of Object.entries(topics)) {
    if (config.patterns.some((pattern) => lowerQuery.includes(pattern))) {
      return {
        ...config,
        key,
        state: state || null,
        isStateRule: false,
      };
    }
  }

  // Default fallback
  return {
    patterns: [],
    sources: ["consumerfinance.gov"],
    ttl: 90 * 24 * 60 * 60,
    topic: "general_financial_info",
    key: "general",
    state: state || null,
    isStateRule: false,
  };
}

// Get official state website
function getStateOfficialSite(state) {
  const stateSites = {
    AZ: "azdor.gov",
    CA: "ftb.ca.gov",
    NY: "tax.ny.gov",
    TX: "comptroller.texas.gov",
    NJ: "state.nj.us/treasury/taxation",
    FL: "floridarevenue.com",
    IL: "tax.illinois.gov",
    PA: "revenue.pa.gov",
    OH: "tax.ohio.gov",
    GA: "dor.georgia.gov",
  };

  return stateSites[state] || `${state.toLowerCase()}.gov`;
}

// Generate cache key
function generateCacheKey(topicInfo) {
  const statePart = topicInfo.state ? `_${topicInfo.state}` : "";
  const year = new Date().getFullYear();
  return `${topicInfo.topic}${statePart}_${year}`;
}

// Cache operations
async function getCachedResult(cacheKey, ttl) {
  try {
    const { data: cached } = await supabase
      .from("facts_cache")
      .select("*")
      .eq("key", cacheKey)
      .maybeSingle();

    if (cached) {
      const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      if (age < ttl && cached.value_json) {
        return cached.value_json;
      }
    }
    return null;
  } catch (error) {
    console.error("❌ [CACHE] Error getting cached result:", error);
    return null;
  }
}

async function cacheResult(cacheKey, data, ttl) {
  try {
    const cacheData = {
      key: cacheKey,
      value_json: data,
      source_url: data.source_url,
      fetched_at: new Date().toISOString(),
      ttl_seconds: ttl,
    };
    await supabase.from("facts_cache").upsert(cacheData);
  } catch (error) {
    console.error("❌ [CACHE] Error caching result:", error);
  }
}

// Fetch from allowlisted sources
async function fetchFromAllowlistedSources(topicInfo) {
  console.log(
    "🌐 [FACTS] Fetching from allowlisted sources:",
    topicInfo.sources
  );

  for (const source of topicInfo.sources) {
    try {
      const url = buildSearchUrl(source, topicInfo);
      console.log("🔍 [FACTS] Searching:", url);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FinancifyBot/1.0)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 10000,
      });

      if (!response.ok) {
        console.log(`❌ [FACTS] HTTP ${response.status} from ${source}`);
        continue;
      }

      const html = await response.text();
      const extractedData = extractRelevantData(html, topicInfo, url);

      if (extractedData) {
        return extractedData;
      }
    } catch (error) {
      console.error(`❌ [FACTS] Error fetching from ${source}:`, error);
      continue;
    }
  }

  return null;
}

// Build search URL for allowlisted sources
function buildSearchUrl(source, topicInfo) {
  const baseUrls = {
    "consumerfinance.gov": "https://www.consumerfinance.gov",
    "studentaid.gov": "https://studentaid.gov",
    "census.gov": "https://www.census.gov",
    "pewresearch.org": "https://www.pewresearch.org",
    "newyorkfed.org": "https://www.newyorkfed.org",
    "chase.com": "https://www.chase.com",
    "americanexpress.com": "https://www.americanexpress.com",
    "capitalone.com": "https://www.capitalone.com",
    "citi.com": "https://www.citi.com",
    "discover.com": "https://www.discover.com",
    "wellsfargo.com": "https://www.wellsfargo.com",
    "bankofamerica.com": "https://www.bankofamerica.com",
  };

  // For state sites, use the official site
  if (topicInfo.isStateSpecific && topicInfo.state) {
    return `https://${source}`;
  }

  // For national sources, use specific pages based on topic
  const specificPages = {
    product_comparison: {
      "chase.com": "/credit-cards",
      "americanexpress.com": "/us/credit-cards",
      "capitalone.com": "/credit-cards",
      "citi.com": "/credit-cards",
      "discover.com": "/credit-cards",
      "wellsfargo.com": "/credit-cards",
      "bankofamerica.com": "/credit-cards",
    },
    bnpl_risks_reporting: {
      "consumerfinance.gov":
        "/data-research/research-reports/consumer-use-of-buy-now-pay-later-and-other-unsecured-debt/",
    },
    student_loan_plans: {
      "studentaid.gov": "/manage-loans/repayment/plans",
    },
    credit_card_apr_band: {
      "consumerfinance.gov":
        "/data-research/research-reports/the-consumer-credit-card-market/",
    },
    housing_cost_burden: {
      "pewresearch.org":
        "/short-reads/2024/10/25/a-look-at-the-state-of-affordable-housing-in-the-us/",
      "census.gov":
        "/newsroom/press-releases/2024/renter-households-cost-burdened-race.html",
    },
    debt_balances_macro: {
      "newyorkfed.org": "/microeconomics/hhdc",
    },
  };

  const baseUrl = baseUrls[source];
  const specificPage = specificPages[topicInfo.topic]?.[source];

  if (baseUrl && specificPage) {
    return baseUrl + specificPage;
  }

  // Fallback to base URL
  return baseUrl || `https://${source}`;
}

// Extract relevant data from HTML
function extractRelevantData(html, topicInfo, sourceUrl) {
  console.log("🔍 [FACTS] Extracting data for topic:", topicInfo.topic);

  try {
    switch (topicInfo.topic) {
      case "product_comparison":
        return extractProductComparisonData(html, sourceUrl, topicInfo);
      case "bnpl_risks_reporting":
        return extractBNPLData(html, sourceUrl);
      case "student_loan_plans":
        return extractStudentLoanData(html, sourceUrl);
      case "credit_card_apr_band":
        return extractCreditAPRData(html, sourceUrl);
      case "housing_cost_burden":
        return extractHousingBurdenData(html, sourceUrl);
      case "debt_balances_macro":
        return extractDebtData(html, sourceUrl);
      case "state_529_deduction_or_credit":
        return extractState529Data(html, topicInfo.state, sourceUrl);
      case "state_income_tax_brackets":
        return extractStateTaxData(html, topicInfo.state, sourceUrl);
      default:
        return extractGeneralData(html, sourceUrl);
    }
  } catch (error) {
    console.error("❌ [FACTS] Error extracting data:", error);
    return null;
  }
}

// Extraction functions for each topic
function extractProductComparisonData(html, sourceUrl, topicInfo) {
  console.log("🔍 [FACTS] Extracting product comparison data from:", sourceUrl);

  // Extract key financial product information
  const data = {
    apr: [],
    annualFee: [],
    rewards: [],
    benefits: [],
    features: [],
    signupBonus: [],
  };

  // Look for APR information
  const aprPatterns = [
    /(\d+\.?\d*)\s*%\s*APR/i,
    /APR[:\s]*(\d+\.?\d*)\s*%/i,
    /(\d+\.?\d*)\s*%-(\d+\.?\d*)\s*%\s*APR/i,
  ];

  for (const pattern of aprPatterns) {
    const matches = html.match(new RegExp(pattern.source, "gi"));
    if (matches) {
      matches.forEach((match) => {
        const aprMatch = match.match(/(\d+\.?\d*)/);
        if (aprMatch) {
          data.apr.push({
            value: parseFloat(aprMatch[1]),
            text: match.trim(),
            source: sourceUrl,
          });
        }
      });
    }
  }

  // Look for annual fee information
  const feePatterns = [
    /\$(\d+)\s*annual\s*fee/i,
    /annual\s*fee[:\s]*\$(\d+)/i,
    /no\s*annual\s*fee/i,
  ];

  for (const pattern of feePatterns) {
    if (pattern.test(html)) {
      if (pattern.source.includes("no")) {
        data.annualFee.push({
          value: 0,
          text: "No annual fee",
          source: sourceUrl,
        });
      } else {
        const match = html.match(pattern);
        if (match && match[1]) {
          data.annualFee.push({
            value: parseFloat(match[1]),
            text: match[0].trim(),
            source: sourceUrl,
          });
        }
      }
    }
  }

  // Look for rewards information
  const rewardsPatterns = [
    /(\d+\.?\d*)\s*%\s*cash\s*back/i,
    /(\d+\.?\d*)\s*points\s*per\s*dollar/i,
    /(\d+\.?\d*)\s*miles\s*per\s*dollar/i,
    /(\d+\.?\d*)\s*%\s*rewards/i,
  ];

  for (const pattern of rewardsPatterns) {
    const matches = html.match(new RegExp(pattern.source, "gi"));
    if (matches) {
      matches.forEach((match) => {
        const rewardMatch = match.match(/(\d+\.?\d*)/);
        if (rewardMatch) {
          data.rewards.push({
            value: parseFloat(rewardMatch[1]),
            text: match.trim(),
            source: sourceUrl,
          });
        }
      });
    }
  }

  // Look for signup bonus
  const bonusPatterns = [
    /\$(\d+(?:,\d+)?)\s*sign.*up\s*bonus/i,
    /(\d+(?:,\d+)?)\s*points\s*sign.*up\s*bonus/i,
    /(\d+(?:,\d+)?)\s*miles\s*sign.*up\s*bonus/i,
  ];

  for (const pattern of bonusPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      data.signupBonus.push({
        value: parseFloat(match[1].replace(/,/g, "")),
        text: match[0].trim(),
        source: sourceUrl,
      });
    }
  }

  // Extract benefits and features from common sections
  const benefitPatterns = [
    /travel\s*insurance/i,
    /purchase\s*protection/i,
    /extended\s*warranty/i,
    /concierge\s*service/i,
    /lounge\s*access/i,
    /global\s*entry/i,
    /tsa\s*precheck/i,
    /no\s*foreign\s*transaction\s*fee/i,
  ];

  for (const pattern of benefitPatterns) {
    if (pattern.test(html)) {
      data.benefits.push({
        text: pattern.source.replace(/\\/g, "").replace(/i$/, ""),
        source: sourceUrl,
      });
    }
  }

  // Return structured data if we found anything
  if (
    data.apr.length > 0 ||
    data.annualFee.length > 0 ||
    data.rewards.length > 0 ||
    data.benefits.length > 0
  ) {
    return {
      topic: "product_comparison",
      source: sourceUrl,
      extractedAt: new Date().toISOString(),
      data: data,
      summary: {
        hasAPR: data.apr.length > 0,
        hasAnnualFee: data.annualFee.length > 0,
        hasRewards: data.rewards.length > 0,
        hasBenefits: data.benefits.length > 0,
        hasSignupBonus: data.signupBonus.length > 0,
      },
    };
  }

  return null;
}

function extractBNPLData(html, sourceUrl) {
  // Look for BNPL reporting information
  const patterns = [
    /not.*report.*credit.*bureau/i,
    /typically.*not.*report/i,
    /credit.*report.*company/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(html)) {
      return {
        topic: "bnpl_risks_reporting",
        metric: "bnpl_reporting_to_cras",
        value: "Typically not reported to credit bureaus",
        unit: null,
        as_of: new Date().toISOString().split("T")[0],
        source_title: "CFPB – Consumer Use of BNPL and Other Unsecured Debt",
        source_url: sourceUrl,
        ttl_seconds: 90 * 24 * 60 * 60,
      };
    }
  }

  return null;
}

function extractStudentLoanData(html, sourceUrl) {
  // Look for available repayment plans
  const plans = [
    "Standard",
    "Extended",
    "Graduated",
    "SAVE",
    "ICR",
    "IBR",
    "PAYE",
  ];
  const foundPlans = plans.filter((plan) =>
    html.toLowerCase().includes(plan.toLowerCase())
  );

  if (foundPlans.length > 0) {
    return {
      topic: "student_loan_plans",
      metric: "available_plans",
      value: foundPlans,
      unit: "list",
      as_of: new Date().toISOString().split("T")[0],
      source_title: "Federal Student Aid – Repayment Plans",
      source_url: sourceUrl,
      ttl_seconds: 180 * 24 * 60 * 60,
    };
  }

  return null;
}

function extractCreditAPRData(html, sourceUrl) {
  // Look for APR ranges
  const patterns = [
    /(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*%/,
    /(\d+\.?\d*)\s*%/,
    /APR[:\s]*(\d+\.?\d*)\s*%/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const aprValue = parseFloat(match[1]);
      return {
        topic: "credit_card_apr_band",
        metric: "credit_card_apr_average",
        value: aprValue,
        unit: "percentage",
        as_of: new Date().toISOString().split("T")[0],
        source_title: "CFPB – The Consumer Credit Card Market",
        source_url: sourceUrl,
        ttl_seconds: 30 * 24 * 60 * 60,
      };
    }
  }

  return null;
}

function extractHousingBurdenData(html, sourceUrl) {
  // Look for cost burden percentages
  const patterns = [
    /(\d+\.?\d*)\s*%\s*of\s*(?:U\.?S\.?\s*)?households/i,
    /(\d+\.?\d*)\s*%\s*cost.burdened/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const burdenValue = parseFloat(match[1]);
      if (burdenValue >= 0 && burdenValue <= 100) {
        return {
          topic: "housing_cost_burden",
          metric: "share_households_cost_burdened",
          value: burdenValue / 100,
          unit: "share",
          as_of: new Date().toISOString().split("T")[0],
          source_title:
            "Pew Research – The State of Affordable Housing in the US",
          source_url: sourceUrl,
          ttl_seconds: 180 * 24 * 60 * 60,
        };
      }
    }
  }

  return null;
}

function extractDebtData(html, sourceUrl) {
  // Look for debt amounts
  const patterns = [
    /\$(\d+(?:\.\d+)?)\s*trillion/i,
    /(\d+(?:\.\d+)?)\s*trillion/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const debtValue = parseFloat(match[1]);
      return {
        topic: "debt_balances_macro",
        metric: "total_household_debt",
        value: debtValue,
        unit: "trillion_usd",
        as_of: new Date().toISOString().split("T")[0],
        source_title: "NY Fed – Household Debt and Credit Report",
        source_url: sourceUrl,
        ttl_seconds: 180 * 24 * 60 * 60,
      };
    }
  }

  return null;
}

function extractState529Data(html, state, sourceUrl) {
  // Look for 529 deduction amounts
  const patterns = [
    /\$(\d+(?:,\d+)?)\s*(?:per\s+)?(?:taxpayer|person|individual)/i,
    /\$(\d+(?:,\d+)?)\s*(?:single|individual)/i,
    /\$(\d+(?:,\d+)?)\s*(?:mfj|married)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      return {
        state: state,
        topic: "state_529_deduction_or_credit",
        rule_summary: `${state} allows a state income tax deduction for 529 contributions up to $${amount.toLocaleString()}.`,
        key_numbers: [
          { label: "deduction_amount", value: amount, unit: "USD" },
        ],
        effective_year: new Date().getFullYear(),
        updated_at: new Date().toISOString().split("T")[0],
        source_title: `${state} Department of Revenue – 529 Deductions`,
        source_url: sourceUrl,
        ttl_seconds: 90 * 24 * 60 * 60,
      };
    }
  }

  return null;
}

function extractStateTaxData(html, state, sourceUrl) {
  // Basic state tax extraction
  return {
    state: state,
    topic: "state_income_tax_brackets",
    rule_summary: `${state} has specific state income tax rates and brackets.`,
    key_numbers: [],
    effective_year: new Date().getFullYear(),
    updated_at: new Date().toISOString().split("T")[0],
    source_title: `${state} Department of Revenue`,
    source_url: sourceUrl,
    ttl_seconds: 90 * 24 * 60 * 60,
  };
}

function extractGeneralData(html, sourceUrl) {
  // Fallback extraction
  return {
    topic: "general_financial_info",
    metric: "general_info",
    value: "Financial information available",
    unit: null,
    as_of: new Date().toISOString().split("T")[0],
    source_title: "Official Financial Source",
    source_url: sourceUrl,
    ttl_seconds: 90 * 24 * 60 * 60,
  };
}

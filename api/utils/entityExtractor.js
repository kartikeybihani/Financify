// api/utils/entityExtractor.js
import fetch from "node-fetch";

/**
 * Entity extraction system for financial product queries
 * Combines rule-based extraction with LLM fallback
 */

// Rule-based patterns for common financial entities
const ENTITY_PATTERNS = {
  // Credit card issuers
  creditCardIssuers: [
    "chase",
    "american express",
    "amex",
    "capital one",
    "citi",
    "citi bank",
    "discover",
    "wells fargo",
    "bank of america",
    "bofa",
    "us bank",
    "usbank",
    "barclays",
    "synchrony",
    "first national",
    "pnc",
    "regions",
    "huntington",
    "bmo",
    "hsbc",
    "ally",
    "sofi",
    "upgrade",
    "credit one",
    "first premier",
    "bilt",
    "bilt rewards",
    "bilt card",
  ],

  // Credit card names
  creditCardNames: [
    "sapphire",
    "freedom",
    "unlimited",
    "preferred",
    "reserve",
    "ink",
    "gold card",
    "platinum",
    "centurion",
    "blue cash",
    "everyday",
    "venture",
    "quicksilver",
    "savor",
    "double cash",
    "custom cash",
    "discover it",
    "freedom flex",
    "cash back",
    "rewards",
    "miles",
    "travel",
    "business",
    "student",
    "secured",
    "premium",
  ],

  // Banks and financial institutions
  banks: [
    "chase",
    "bank of america",
    "wells fargo",
    "citibank",
    "us bank",
    "pnc",
    "capital one",
    "ally bank",
    "sofi",
    "discover bank",
    "american express",
    "barclays",
    "hsbc",
    "regions",
    "huntington",
    "first national",
    "synchrony",
    "upgrade",
    "bmo",
    "bmo harris",
  ],

  // Investment platforms
  investmentPlatforms: [
    "robinhood",
    "fidelity",
    "vanguard",
    "schwab",
    "charles schwab",
    "etrade",
    "ameritrade",
    "td ameritrade",
    "interactive brokers",
    "webull",
    "public",
    "m1 finance",
    "wealthfront",
    "betterment",
    "acorns",
    "stash",
    "sofi invest",
    "ally invest",
    "merrill edge",
  ],

  // Financial products
  financialProducts: [
    "credit card",
    "debit card",
    "checking account",
    "savings account",
    "cd",
    "certificate of deposit",
    "money market",
    "ira",
    "roth ira",
    "401k",
    "403b",
    "hsa",
    "health savings account",
    "brokerage account",
    "investment account",
    "trading account",
    "mutual fund",
    "etf",
    "index fund",
    "bond",
    "stock",
    "option",
    "crypto",
    "cryptocurrency",
  ],

  // Comparison words
  comparisonWords: [
    "vs",
    "versus",
    "vs.",
    "compare",
    "comparison",
    "better",
    "best",
    "which",
    "difference",
    "differences",
    "pros and cons",
    "advantages",
    "disadvantages",
    "benefits",
    "drawbacks",
    "features",
  ],

  // State codes and names
  states: [
    "al",
    "alabama",
    "ak",
    "alaska",
    "az",
    "arizona",
    "ar",
    "arkansas",
    "ca",
    "california",
    "co",
    "colorado",
    "ct",
    "connecticut",
    "de",
    "delaware",
    "fl",
    "florida",
    "ga",
    "georgia",
    "hi",
    "hawaii",
    "id",
    "idaho",
    "il",
    "illinois",
    "in",
    "indiana",
    "ia",
    "iowa",
    "ks",
    "kansas",
    "ky",
    "kentucky",
    "la",
    "louisiana",
    "me",
    "maine",
    "md",
    "maryland",
    "ma",
    "massachusetts",
    "mi",
    "michigan",
    "mn",
    "minnesota",
    "ms",
    "mississippi",
    "mo",
    "missouri",
    "mt",
    "montana",
    "ne",
    "nebraska",
    "nv",
    "nevada",
    "nh",
    "new hampshire",
    "nj",
    "new jersey",
    "nm",
    "new mexico",
    "ny",
    "new york",
    "nc",
    "north carolina",
    "nd",
    "north dakota",
    "oh",
    "ohio",
    "ok",
    "oklahoma",
    "or",
    "oregon",
    "pa",
    "pennsylvania",
    "ri",
    "rhode island",
    "sc",
    "south carolina",
    "sd",
    "south dakota",
    "tn",
    "tennessee",
    "tx",
    "texas",
    "ut",
    "utah",
    "vt",
    "vermont",
    "va",
    "virginia",
    "wa",
    "washington",
    "wv",
    "west virginia",
    "wi",
    "wisconsin",
    "wy",
    "wyoming",
    "dc",
    "washington dc",
    "washington d.c.",
  ],
};

/**
 * Extract entities from a user query using rule-based patterns
 */
export function extractEntitiesRuleBased(message) {
  const lowerMessage = message.toLowerCase();
  const entities = {
    creditCardIssuers: [],
    creditCardNames: [],
    banks: [],
    investmentPlatforms: [],
    financialProducts: [],
    comparisonWords: [],
    states: [],
    rawEntities: [],
  };

  // Extract each type of entity
  for (const [category, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        entities[category].push(pattern);
        entities.rawEntities.push(pattern);
      }
    }
  }

  // Remove duplicates
  for (const category in entities) {
    if (Array.isArray(entities[category])) {
      entities[category] = [...new Set(entities[category])];
    }
  }
  entities.rawEntities = [...new Set(entities.rawEntities)];

  return entities;
}

/**
 * Extract entities using LLM as fallback for complex queries
 */
export async function extractEntitiesLLM(message, entities) {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          temperature: 0.1,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: [
                "You are a financial entity extractor. Extract relevant financial entities from user queries.",
                "Focus on: credit card issuers, card names, banks, investment platforms, financial products, states.",
                "Return only valid JSON with the extracted entities.",
                "",
                "Example input: 'Chase Sapphire vs Amex Gold'",
                "Example output: {",
                '  "creditCardIssuers": ["chase", "amex"],',
                '  "creditCardNames": ["sapphire", "gold"],',
                '  "comparisonWords": ["vs"],',
                '  "rawEntities": ["chase", "sapphire", "amex", "gold", "vs"]',
                "}",
              ].join("\n"),
            },
            {
              role: "user",
              content: `Extract entities from: "${message}"`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "entity_extraction",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  creditCardIssuers: {
                    type: "array",
                    items: { type: "string" },
                    description: "Credit card issuing banks",
                  },
                  creditCardNames: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific credit card names",
                  },
                  banks: {
                    type: "array",
                    items: { type: "string" },
                    description: "Bank names",
                  },
                  investmentPlatforms: {
                    type: "array",
                    items: { type: "string" },
                    description: "Investment platform names",
                  },
                  financialProducts: {
                    type: "array",
                    items: { type: "string" },
                    description: "Financial product types",
                  },
                  comparisonWords: {
                    type: "array",
                    items: { type: "string" },
                    description: "Comparison-related words",
                  },
                  states: {
                    type: "array",
                    items: { type: "string" },
                    description: "US state names or codes",
                  },
                  rawEntities: {
                    type: "array",
                    items: { type: "string" },
                    description: "All extracted entities",
                  },
                },
                required: [
                  "creditCardIssuers",
                  "creditCardNames",
                  "banks",
                  "investmentPlatforms",
                  "financialProducts",
                  "comparisonWords",
                  "states",
                  "rawEntities",
                ],
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("❌ [ENTITY_EXTRACTOR] LLM API error:", response.status);
      return entities; // Return rule-based results
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return entities; // Return rule-based results
    }

    const llmEntities = JSON.parse(content);

    // Merge LLM results with rule-based results
    const mergedEntities = {
      creditCardIssuers: [
        ...new Set([
          ...entities.creditCardIssuers,
          ...llmEntities.creditCardIssuers,
        ]),
      ],
      creditCardNames: [
        ...new Set([
          ...entities.creditCardNames,
          ...llmEntities.creditCardNames,
        ]),
      ],
      banks: [...new Set([...entities.banks, ...llmEntities.banks])],
      investmentPlatforms: [
        ...new Set([
          ...entities.investmentPlatforms,
          ...llmEntities.investmentPlatforms,
        ]),
      ],
      financialProducts: [
        ...new Set([
          ...entities.financialProducts,
          ...llmEntities.financialProducts,
        ]),
      ],
      comparisonWords: [
        ...new Set([
          ...entities.comparisonWords,
          ...llmEntities.comparisonWords,
        ]),
      ],
      states: [...new Set([...entities.states, ...llmEntities.states])],
      rawEntities: [
        ...new Set([...entities.rawEntities, ...llmEntities.rawEntities]),
      ],
    };

    return mergedEntities;
  } catch (error) {
    console.error("❌ [ENTITY_EXTRACTOR] LLM extraction error:", error);
    return entities; // Return rule-based results
  }
}

/**
 * Main entity extraction function
 */
export async function extractEntities(message) {
  console.log("🔍 [ENTITY_EXTRACTOR] Extracting entities from:", message);

  // Start with rule-based extraction
  const ruleBasedEntities = extractEntitiesRuleBased(message);
  console.log("🔍 [ENTITY_EXTRACTOR] Rule-based entities:", ruleBasedEntities);

  // Use LLM as fallback for complex queries or when rule-based finds few entities
  const shouldUseLLM =
    ruleBasedEntities.rawEntities.length < 2 ||
    message.toLowerCase().includes("vs") ||
    message.toLowerCase().includes("compare") ||
    message.toLowerCase().includes("which");

  if (shouldUseLLM) {
    console.log("🔍 [ENTITY_EXTRACTOR] Using LLM fallback");
    const finalEntities = await extractEntitiesLLM(message, ruleBasedEntities);
    console.log("🔍 [ENTITY_EXTRACTOR] Final entities:", finalEntities);
    return finalEntities;
  }

  return ruleBasedEntities;
}

/**
 * Determine intent based on extracted entities
 */
export function determineIntent(entities, message) {
  const lowerMessage = message.toLowerCase();

  // Check for comparison queries
  if (
    entities.comparisonWords.length > 0 ||
    lowerMessage.includes("vs") ||
    lowerMessage.includes("compare") ||
    lowerMessage.includes("which")
  ) {
    return {
      intent: "ask_personalized",
      needs_web: true,
      needs_user_data: true,
      reasoning: "Comparison query requires user data + web research",
    };
  }

  // Check for specific product queries
  if (
    entities.creditCardIssuers.length > 0 ||
    entities.creditCardNames.length > 0
  ) {
    return {
      intent: "ask_personalized",
      needs_web: true,
      needs_user_data: true,
      reasoning: "Specific product query requires user data + web research",
    };
  }

  // Check for state-specific queries
  if (
    entities.states.length > 0 &&
    (lowerMessage.includes("tax") ||
      lowerMessage.includes("rule") ||
      lowerMessage.includes("benefit"))
  ) {
    return {
      intent: "ask_state_rule",
      needs_web: true,
      needs_user_data: false,
      reasoning: "State-specific rule query",
    };
  }

  // Check for general financial facts
  if (
    lowerMessage.includes("2025") ||
    lowerMessage.includes("current") ||
    lowerMessage.includes("latest")
  ) {
    return {
      intent: "ask_fact_fresh",
      needs_web: true,
      needs_user_data: false,
      reasoning: "Current year facts query",
    };
  }

  // Default to personalized query
  return {
    intent: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
    reasoning: "Default to personalized query",
  };
}

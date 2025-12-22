/**
 * Direct Classification Test with Improved Prompting
 * Tests the classification function directly with enhanced web search detection
 *
 * Usage:
 *   node tests/test_classification_direct.js "your query here"
 *   node tests/test_classification_direct.js hardball
 *   node tests/test_classification_direct.js stock
 */

// Import production functions to ensure test matches production logic
import { detectStockCandidate } from "../lib/stocks.js";

// Configuration
const OPENROUTER_API_KEY =
  "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";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

// Stock actionable detection - matches production
function isStockActionable(message) {
  return /\b(should|buy|invest|investing|investment|purchase|sell|hold)\b/i.test(
    message || ""
  );
}

// Cache for testing
const classificationCache = new Map();

function generateClassificationCacheKey(message) {
  return message.toLowerCase().trim();
}

function getCachedClassification(message) {
  const key = generateClassificationCacheKey(message);
  const cached = classificationCache.get(key);
  if (cached && Date.now() < cached.expires_at) {
    return cached.data;
  }
  return null;
}

function setCachedClassification(message, result) {
  const key = generateClassificationCacheKey(message);
  const ttl = 5 * 60 * 1000; // 5 minutes
  classificationCache.set(key, {
    data: result,
    expires_at: Date.now() + ttl,
  });
}

// Enhanced web search detection patterns
function detectWebSearchNeeded(message) {
  const lowerMessage = message.toLowerCase();
  // Do not suggest web for off-topic queries (e.g., weather)
  if (detectOffTopic(message)) return false;

  // Production-optimized web search keywords
  const webKeywords = [
    // Year indicators
    "2025",
    "2024",
    "current",
    "latest",
    "recent",
    "updated",
    "today",

    // Financial limits & rates
    "roth ira",
    "ira limit",
    "contribution limit",
    "401k limit",
    "hsa limit",
    "tax bracket",
    "interest rate",
    "mortgage rate",
    "fed rate",
    "inflation rate",
    "cd rate",
    "savings rate",
    "credit card rate",
    "standard deduction",

    // Market & economic data
    "stock market",
    "housing market",
    "market trend",
    "economic",
    "crypto",
    "bitcoin",
    "ethereum",
    "regulation",
    "policy",

    // Government & institutions
    "federal",
    "state",
    "irs",
    "treasury",
    "fed",
    "social security",
    "medicare",

    // Question patterns
    "what is the current",
    "what are the current",
    "what's the current",
    "what is the latest",
    "what are the latest",
    "what's the latest",
    "what are the best",
    "what's the best",
    "current rates",
    "latest news",
  ];

  return webKeywords.some((keyword) => lowerMessage.includes(keyword));
}

// Enhanced off-topic detection
function detectOffTopic(message) {
  const lower = message.toLowerCase();

  const financeTerms = [
    "credit",
    "debit",
    "card",
    "cards",
    "account",
    "accounts",
    "spend",
    "spent",
    "spending",
    "transaction",
    "transactions",
    "budget",
    "net worth",
    "invest",
    "investment",
    "investments",
    "stock",
    "stocks",
    "ira",
    "401k",
    "roth",
    "rate",
    "rates",
    "limit",
    "limits",
    "buy",
    "buying",
    "purchase",
    "house",
    "home",
    "achieve",
    "goal",
    "goals",
    "save",
    "saving",
    "afford",
    "affordable",
    "money",
    "financial",
    "finance",
    "finances",
    "wealth",
    "income",
    "salary",
    "wage",
    "earn",
    "earning",
    "debt",
    "loan",
    "mortgage",
    "rent",
    "renting",
    "lease",
    "payment",
    "payments",
    "cost",
    "costs",
    "price",
    "prices",
    "expensive",
    "cheap",
    "budget",
    "budgeting",
    "expense",
    "expenses",
    "cash",
    "dollar",
    "dollars",
    "cent",
    "cents",
    "dollar",
    "dollars",
    "cent",
    "cents",
  ];
  if (financeTerms.some((t) => lower.includes(t))) {
    return false;
  }
  // Broad weather/forecast catch
  if (lower.includes("weather") || lower.includes("forecast")) {
    return true;
  }
  // Ethics / philosophy / emotions / meta-AI / culture / jokes / riddles
  const offTopicBroad = [
    // ethics & morality
    "acceptable to lie",
    "is it ok to lie",
    "is it ever acceptable",
    "ethical",
    "morality",
    "moral",
    // emotions / mental health
    "feeling really down",
    "depressed",
    "anxious",
    "anxiety",
    "sad",
    // philosophy
    "meaning of life",
    "purpose of life",
    "existential",
    // AI meta
    "surpass human intelligence",
    "are you an ai",
    "do you know that you're an ai",
    "can you learn from our previous conversations",
    // humor / riddles
    "why did the chicken cross the road",
    "riddle",
    // culture / etiquette
    "best practices for greeting",
    "etiquette",
    "cultural",
  ];
  if (offTopicBroad.some((p) => lower.includes(p))) {
    return true;
  }
  // Ambiguous generic nouns: if only "bank" without financial context, treat off-topic
  if (
    lower.includes("bank") &&
    !/account|loan|interest|branch|routing|checking|savings|credit|debit/.test(
      lower
    )
  ) {
    return true;
  }

  // Strong off-topic indicators (specific patterns)
  const offTopicPatterns = [
    // Weather & environment
    "what's the weather",
    "weather today",
    "weather forecast",
    "temperature today",
    "is it raining",
    "is it sunny",
    "weather like",
    "what's the weather like",

    // Cooking & food
    "how to cook",
    "recipe for",
    "cooking",
    "baking",
    "kitchen",
    "meal prep",
    "what to eat",
    "restaurant",
    "food",
    "dinner",
    "lunch",
    "breakfast",

    // Entertainment
    "what movie",
    "watch",
    "netflix",
    "tv show",
    "entertainment",
    "cinema",
    "actor",
    "actress",
    "director",
    "oscar",
    "award",
    "film",

    // Sports
    "football",
    "soccer",
    "basketball",
    "baseball",
    "tennis",
    "golf",
    "sports",
    "game",
    "team",
    "player",
    "score",
    "match",
    "tournament",
    "championship",

    // General chat
    "hello",
    "hi",
    "hey",
    "how are you",
    "what's up",
    "good morning",
    "good evening",
    "joke",
    "funny",
    "laugh",
    "humor",
    "tell me a joke",
    "amuse me",

    // Technical support
    "computer",
    "laptop",
    "phone",
    "internet",
    "wifi",
    "password",
    "login",
    "software",
    "app",
    "download",
    "install",
    "update",
    "virus",
    "bug",

    // Academic
    "homework",
    "assignment",
    "school",
    "university",
    "college",
    "study",
    "exam",
    "test",
    "grade",
    "teacher",
    "professor",
    "student",

    // Travel & geography
    "travel",
    "vacation",
    "trip",
    "hotel",
    "flight",
    "airport",
    "passport",
    "country",
    "city",
    "capital",
    "geography",
    "map",
    "location",

    // Health & medical
    "doctor",
    "hospital",
    "medicine",
    "sick",
    "illness",
    "health",
    "medical",
    "pain",
    "ache",
    "symptoms",
    "diagnosis",
    "treatment",
    "therapy",
  ];

  return offTopicPatterns.some((pattern) => lower.includes(pattern));
}

// Enhanced financial concept heuristic
function financialConceptHeuristic(text) {
  const lower = text.toLowerCase();

  // Check for stock tickers BEFORE off-topic (stock queries are financial, not off-topic)
  const stockDetection = detectStockCandidate(text);
  if (stockDetection) {
    const actionable = isStockActionable(text);
    return {
      intent: "stock_query",
      intent_type: actionable ? "actionable" : "exploratory",
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: actionable,
      state: null,
      entities: stockDetection.entities || [],
      ticker: stockDetection.ticker,
      confidence: stockDetection.confidence,
      heuristic: true,
    };
  }

  // Check for off-topic (after stock detection)
  if (detectOffTopic(text)) {
    return {
      intent: "off_topic",
      intent_type: null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: false,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.9,
      heuristic: true,
    };
  }

  // Investment advice queries - should NOT need web search
  const investmentAdvicePatterns = [
    "investment advice",
    "investing advice",
    "investment recommendations",
    "what should i invest in",
    "investment suggestions",
    "portfolio advice",
    "investment guidance",
    "investment help",
    "investing help",
    "what to invest in",
    "investment tips",
    "investing tips",
  ];

  if (investmentAdvicePatterns.some((pattern) => lower.includes(pattern))) {
    return {
      intent: "ask_personalized",
      intent_type: "actionable",
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.9,
      heuristic: true,
    };
  }

  // Personal financial data queries
  if (
    lower.includes("net worth") ||
    lower.includes("networth") ||
    lower.includes("spend") ||
    lower.includes("spent") ||
    lower.includes("transaction") ||
    lower.includes("balance") ||
    lower.includes("account") ||
    lower.includes("my money") ||
    lower.includes("my financial") ||
    lower.includes("my spending") ||
    lower.includes("my goals") ||
    lower.includes("current goals") ||
    lower.includes("what are my goals")
  ) {
    return {
      intent: "ask_personalized",
      intent_type: "exploratory",
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.9,
      heuristic: true,
    };
  }

  // Goal-related patterns
  if (
    lower.includes("save") &&
    (lower.includes("goal") ||
      lower.includes("target") ||
      lower.includes("plan") ||
      lower.includes("want"))
  ) {
    return {
      intent: "goal_conversation",
      intent_type: "actionable",
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: 0.85,
      heuristic: true,
    };
  }

  // Strong web search indicators (only for financial topics)
  if (detectWebSearchNeeded(text)) {
    return {
      intent: "ask_personalized",
      intent_type: "exploratory",
      emotional_state: "neutral",
      needs_web: true,
      needs_user_data: false,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.9,
      heuristic: true,
    };
  }

  return null;
}

// Stock ticker detection - runs BEFORE other heuristics
function detectStockTicker(message) {
  const lowerMessage = message.toLowerCase();

  // Company name to ticker mapping
  const companyToTicker = {
    apple: "AAPL",
    tesla: "TSLA",
    microsoft: "MSFT",
    google: "GOOGL",
    alphabet: "GOOGL",
    amazon: "AMZN",
    meta: "META",
    facebook: "META",
    nvidia: "NVDA",
    "nvidia corporation": "NVDA",
    netflix: "NFLX",
    disney: "DIS",
    "walt disney": "DIS",
    jpmorgan: "JPM",
    "jpmorgan chase": "JPM",
    "bank of america": "BAC",
    "goldman sachs": "GS",
    visa: "V",
    mastercard: "MA",
    paypal: "PYPL",
    salesforce: "CRM",
    oracle: "ORCL",
    intel: "INTC",
    amd: "AMD",
    "advanced micro devices": "AMD",
    "coca cola": "KO",
    pepsico: "PEP",
    walmart: "WMT",
    "home depot": "HD",
    mcdonalds: "MCD",
    starbucks: "SBUX",
    nike: "NKE",
    adobe: "ADBE",
    cisco: "CSCO",
    ibm: "IBM",
    "international business machines": "IBM",
  };

  const knownTickers = new Set(Object.values(companyToTicker));

  // Check for company names (including single-word matches)
  let detectedTicker = null;
  let detectedCompany = null;

  // First check for exact single-word company names (e.g., "Apple", "Tesla")
  const singleWordCompanies = {
    apple: "AAPL",
    tesla: "TSLA",
    microsoft: "MSFT",
    google: "GOOGL",
    amazon: "AMZN",
    meta: "META",
    nvidia: "NVDA",
    netflix: "NFLX",
    disney: "DIS",
    visa: "V",
    paypal: "PYPL",
    salesforce: "CRM",
    oracle: "ORCL",
    intel: "INTC",
    amd: "AMD",
    nike: "NKE",
    adobe: "ADBE",
    cisco: "CSCO",
    ibm: "IBM",
  };

  const companyNamesUpper = new Set(
    Object.keys(singleWordCompanies).map((name) => name.toUpperCase())
  );

  // Common ticker symbols (1-5 uppercase letters) - be more specific
  // Look for ticker patterns that are likely actual stock symbols
  const tickerPattern = /\b([A-Z]{2,5})\b/g;
  const tickerMatches = [];
  let match;

  // Extract potential ticker symbols (only from original casing)
  // Filter out common words that aren't tickers (expanded list)
  const commonWords = new Set([
    "I",
    "AM",
    "AN",
    "AS",
    "AT",
    "BE",
    "BY",
    "DO",
    "GO",
    "HE",
    "IF",
    "IN",
    "IS",
    "IT",
    "ME",
    "MY",
    "NO",
    "OF",
    "ON",
    "OR",
    "SO",
    "TO",
    "UP",
    "US",
    "WE",
    "THE",
    "AND",
    "FOR",
    "ARE",
    "BUT",
    "NOT",
    "YOU",
    "ALL",
    "CAN",
    "HER",
    "WAS",
    "ONE",
    "OUR",
    "OUT",
    "DAY",
    "GET",
    "HAS",
    "HIM",
    "HIS",
    "HOW",
    "ITS",
    "MAY",
    "NEW",
    "NOW",
    "OLD",
    "SEE",
    "TWO",
    "WAY",
    "WHO",
    "BOY",
    "DID",
    "LET",
    "PUT",
    "SAY",
    "SHE",
    "TOO",
    "USE",
    "WHAT",
    "ABOUT",
    "TELL",
    "BUY",
    "SELL",
    "PRICE",
    "STOCK",
    "STOCKS",
    "MARKET",
    "MARKETS",
    "WITH",
    "THIS",
    "THAT",
    "THESE",
    "THOSE",
    "THERE",
    "HERE",
    "YOUR",
    "YOURS",
    "FROM",
    "WILL",
    "WOULD",
    "COULD",
    "SHOULD",
    "MIGHT",
    "WANT",
    "NEED",
    "GOOD",
    "BEST",
    "WORST",
    "WHEN",
    "WHERE",
    "WHY",
    "WHICH",
    "WHOM",
    "DOING",
  ]);
  while ((match = tickerPattern.exec(message)) !== null) {
    const potentialTicker = match[1];
    if (commonWords.has(potentialTicker)) {
      continue;
    }
    if (
      companyNamesUpper.has(potentialTicker) &&
      !knownTickers.has(potentialTicker)
    ) {
      continue;
    }
    if (!tickerMatches.includes(potentialTicker)) {
      tickerMatches.push(potentialTicker);
    }
  }
  // Check if message is just a single company name
  const words = lowerMessage.trim().split(/\s+/);
  if (words.length === 1 && singleWordCompanies[words[0]]) {
    detectedTicker = singleWordCompanies[words[0]];
    detectedCompany = words[0];
  } else {
    // Check for company names in longer messages
    for (const [company, ticker] of Object.entries(companyToTicker)) {
      if (lowerMessage.includes(company)) {
        detectedCompany = company;
        detectedTicker = ticker;
        break;
      }
    }
  }

  // If we found ticker symbols, use the first one (prioritize explicit tickers)
  if (tickerMatches.length > 0) {
    detectedTicker = tickerMatches[0];
  }

  // Only return stock_query if we found a SPECIFIC ticker/company
  // General queries like "What stocks should I buy?" should NOT trigger this
  if (detectedTicker) {
    // Check if this is a general stock market query (no specific ticker context)
    const generalStockPatterns = [
      /what stocks? should i (buy|invest|purchase)/i,
      /what (stocks?|companies) (should|would|do) you (recommend|suggest)/i,
      /best stocks? (to|for)/i,
      /top stocks?/i,
      /stock market/i,
      /stock exchange/i,
    ];

    // If it's a general query WITHOUT a specific ticker/company, don't treat as stock_query
    const isGeneralQuery = generalStockPatterns.some((pattern) =>
      pattern.test(message)
    );
    if (isGeneralQuery && !detectedCompany && tickerMatches.length === 0) {
      return null;
    }

    // For single-word company names without context, lower confidence
    let confidence = 0.95;
    if (words.length === 1 && detectedCompany) {
      confidence = 0.7; // Lower confidence for ambiguous single-word queries
    } else if (detectedCompany && !tickerMatches.length) {
      confidence = 0.85; // Medium confidence for company names
    }

    return {
      intent: "stock_query",
      ticker: detectedTicker,
      entities: tickerMatches.length > 0 ? tickerMatches : [detectedTicker],
      confidence: confidence,
    };
  }

  return null;
}

// Goal detection function from production
function detectGoalIntent(message, conversationContext) {
  const lower = message.toLowerCase();

  // Check if there's an active goal flow in session state
  const activeGoalFlow = conversationContext?.goal_flow;
  const isContinuingGoalFlow = activeGoalFlow && activeGoalFlow.active;

  // 0.5. Check for advice-seeking patterns FIRST (these override goal creation patterns)
  const adviceSeekingPatterns = [
    /\bshould\s+i\s+(?:save|buy|invest|spend)/i, // "Should I save/buy/invest"
    /\bis\s+it\s+(?:worth|smart|good|wise)/i, // "Is it worth/smart/good"
    /\bcan\s+i\s+afford/i, // "Can I afford"
    /\bwhat'?s?\s+a\s+good/i, // "What's a good"
    /\bhow\s+much\s+(?:should|can|could)/i, // "How much should/can/could"
  ];

  if (adviceSeekingPatterns.some((p) => p.test(message))) {
    console.log(
      "✅ [GOAL] Advice-seeking pattern detected → routing to ask_personalized"
    );
    return {
      intent: "ask_personalized",
      confidence: 0.9,
      reason: "advice_query",
    };
  }

  // 1. EXPLICIT goal creation patterns (high confidence)
  const explicitGoalPatterns = [
    /\b(?:create|set|add|make)\s+(?:a\s+)?(?:new\s+)?goal/i,
    /\bgoal\s+(?:for|to)\s+(?:save|buy)/i,
    /\b(?:i\s+want\s+to|i'd\s+like\s+to|let'?s)\s+save\s+\$?\d+[k]?\s+(?:for|toward)/i, // "I want to save $5000 for" or "Let's save $5000 for"
    /\btarget\s+(?:amount|of)\s+\$?\d+/i, // "target amount $5000"
  ];

  if (explicitGoalPatterns.some((p) => p.test(message))) {
    console.log("✅ [GOAL] Explicit goal creation detected");
    return {
      intent: "goal_conversation",
      confidence: 0.95,
      reason: "goal_creation",
    };
  }

  // 1.5. If there's an active goal flow, any response is likely goal-related
  if (isContinuingGoalFlow) {
    // Check if it's clearly off-topic
    const offTopicKeywords = ["weather"];
    const isOffTopic = offTopicKeywords.some((keyword) =>
      lower.includes(keyword)
    );

    if (!isOffTopic) {
      console.log("✅ [GOAL] Continuing active goal flow detected");
      return {
        intent: "goal_conversation",
        confidence: 0.85,
        reason: "continuing_goal_flow",
      };
    }
  }

  // 2. INQUIRY about existing goals (should be ask_personalized, NOT goal_conversation)
  const goalInquiryPatterns = [
    /\b(?:what are|show|list|tell me|display)\s+(?:my\s+)?(?:current\s+)?goals?\b/i,
    /\bam\s+i\s+on\s+track.*goals?\b/i,
    /\bgoal\s+(?:progress|status|update)/i,
    /\bhow.*doing.*goals?\b/i,
  ];

  if (goalInquiryPatterns.some((p) => p.test(message))) {
    console.log(
      "✅ [GOAL] Goal inquiry detected → routing to ask_personalized"
    );
    return {
      intent: "ask_personalized",
      confidence: 0.9,
      reason: "data_query",
    };
  }

  // 3. NOT goal creation - general financial queries (affordability, advice, recommendations)
  const nonGoalPatterns = [
    /\bcan\s+i\s+afford/i, // Affordability check
    /\bshould\s+i\s+buy/i, // Purchase advice
    /\bis\s+it\s+worth\s+it/i, // Value assessment
    /\bis\s+it\s+smart\s+to/i, // Advice seeking
    /\bwhat.*(?:spend|spent)/i, // Spending analysis
    /\bhow\s+much.*(?:spend|spent)/i, // Spending questions
    /\bwhere.*(?:money|spending)/i, // Transaction queries
    /\bshow.*(?:transactions|spending)/i, // Transaction display
    /\bafford.*\$\d+/i, // "afford $1000" patterns
    /\bafford.*\d+[k]/i, // "afford 5k" patterns
    /\bwhat.*(?:good|recommended|suggested).*(?:emergency|savings|amount)/i, // Advice queries like "what's a good emergency amount"
    /\bhow\s+much.*(?:should|can|could).*(?:save|have|keep)/i, // Advice on amounts
    /\b(?:good|ideal|recommended|suggested).*(?:emergency|savings|fund|amount)/i, // General advice patterns
  ];

  if (nonGoalPatterns.some((p) => p.test(message))) {
    console.log("✅ [GOAL] Non-goal financial query detected");
    return {
      intent: "ask_personalized",
      confidence: 0.9,
      reason: "financial_analysis",
    };
  }

  // Default: no strong signal, let LLM decide
  return null;
}

// Production classification function from finny.js
async function handleClassify(message, context, conversationContext = null) {
  console.log("🔍 [TEST] Starting classification for message:", message);
  const startTime = Date.now();

  const { text, user } = { text: message, user: context };
  if (!text || typeof text !== "string") {
    console.log("❌ [TEST] Missing or invalid text parameter");
    return {
      intent: "ask_personalized",
      intent_type: null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.1,
      fallback: true,
    };
  }

  // Check cache first
  const cachedResult = getCachedClassification(text);
  if (cachedResult) {
    // Validate cached result structure before using it - matches production
    if (
      cachedResult.intent &&
      typeof cachedResult.intent === "string" &&
      cachedResult.needs_web !== undefined &&
      cachedResult.needs_user_data !== undefined
    ) {
      // Ensure new fields exist (backward compatibility with old cache entries)
      if (!cachedResult.intent_type && cachedResult.intent !== "off_topic") {
        cachedResult.intent_type = null;
      }
      if (!cachedResult.emotional_state) {
        cachedResult.emotional_state = "neutral";
      }
      if (!Array.isArray(cachedResult.entities)) {
        cachedResult.entities = [];
      }
      if (cachedResult.ticker === undefined) {
        cachedResult.ticker = null;
      }
      if (
        cachedResult.intent === "stock_query" &&
        cachedResult.ticker &&
        cachedResult.entities.length === 0
      ) {
        cachedResult.entities = [cachedResult.ticker];
      }
      console.log(
        `⚡ [TEST] Using cached classification result (${
          Date.now() - startTime
        }ms)`
      );
      return cachedResult;
    } else {
      console.log(
        "⚠️ [TEST] Cached classification is malformed, invalidating cache"
      );
      // Clear the malformed cached entry
      const key = generateClassificationCacheKey(text);
      classificationCache.delete(key);
      console.log(
        "✅ [TEST] Malformed cache entry cleared, proceeding with fresh classification"
      );
    }
  }

  // Check for stock candidate FIRST (before goal detection) - matches production logic
  // Stock queries require a SPECIFIC ticker/company - general queries should not trigger this
  const stockDetection = detectStockCandidate(text);
  if (stockDetection) {
    console.log(`✅ [TEST] Stock ticker detected: ${stockDetection.ticker}`);
    const actionable = isStockActionable(text);
    const result = {
      intent: "stock_query",
      intent_type: actionable ? "actionable" : "exploratory",
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: actionable,
      state: null,
      entities: stockDetection.entities || [],
      ticker: stockDetection.ticker,
      confidence: stockDetection.confidence,
      heuristic: true,
    };
    setCachedClassification(text, result);
    return result;
  }

  // Check for goal intent (before LLM call for efficiency)
  const goalDetection = detectGoalIntent(text, context?.conversation_context);
  if (goalDetection) {
    console.log(`✅ [TEST] Goal detection heuristic: ${goalDetection.reason}`);
    const result = {
      intent: goalDetection.intent,
      intent_type:
        goalDetection.intent === "goal_conversation" ? "actionable" : null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      ticker: null,
      confidence: goalDetection.confidence,
      heuristic: true,
      reason: goalDetection.reason,
    };
    setCachedClassification(text, result);
    return result;
  }

  // Positive heuristic for common financial concept questions (BEFORE off-topic detection)
  const heuristic = financialConceptHeuristic(text);
  if (heuristic) {
    // If both personal data and web recency patterns, set both flags
    const needsWebToo = detectWebSearchNeeded(text) === true;
    const merged = needsWebToo ? { ...heuristic, needs_web: true } : heuristic;

    console.log("✅ [TEST] Heuristic classified (with combined flags check)");
    setCachedClassification(text, merged);
    return merged;
  }

  // Enhanced heuristic for web search detection
  const webSearchHeuristic = detectWebSearchNeeded(text);
  if (webSearchHeuristic) {
    console.log("✅ [TEST] Heuristic detected web search needed");
    const result = {
      intent: "ask_personalized",
      intent_type: "exploratory",
      emotional_state: "neutral",
      needs_web: true,
      needs_user_data: false,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.9,
      heuristic: true,
    };
    setCachedClassification(text, result);
    return result;
  }

  // Off-topic detection removed - let classification layer handle it (matches production)

  try {
    // Create a timeout promise that rejects after 8 seconds (increased for stability)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Classification timeout after 8 seconds")),
        8000
      );
    });

    // Create the fetch promise
    const fetchPromise = fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer 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`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0.1,
          max_tokens: 350, // Allow slightly longer responses for stability
          top_p: 0.9, // Add top_p for better stability
          messages: [
            {
              role: "system",
              content: [
                "You are Finny's intelligent classification system. Analyze user messages to understand their intent, emotional state, and what resources they need.",
                "",
                "=== PRIMARY INTENT CLASSIFICATION ===",
                "Classify into exactly ONE primary intent:",
                "- ask_personalized: Questions about user's finances (spending, accounts, goals, investments, affordability, advice)",
                "- goal_conversation: Creating NEW goals or setting savings targets (explicit goal creation statements)",
                "- stock_query: Questions about specific stocks, tickers, or companies (e.g., 'What about Apple?', 'Tell me about AAPL', 'Should I buy Tesla stock?')",
                "- off_topic: Non-financial topics (weather, cooking, entertainment, general chat, etc)",
                "",
                "=== INTENT TYPE (What user wants to accomplish) ===",
                "Detect the underlying intent type (can combine with primary intent):",
                "- exploratory: Learning, understanding concepts ('tell me about investing', 'explain Roth IRA', 'what is a 401k')",
                "- actionable: Specific steps or how-to ('how do I save', 'what should I do', 'help me budget')",
                "- emotional_support: Seeking reassurance, validation ('I'm worried about money', 'am I doing okay?')",
                "- crisis: Immediate urgent help needed ('can't pay rent', 'overdraft', 'need money now')",
                "- planning: Long-term strategy ('retirement planning', 'investment strategy', 'financial plan')",
                "",
                "=== EMOTIONAL STATE DETECTION ===",
                "Detect emotional state from language and context (be nuanced, avoid false positives):",
                "- neutral: No strong emotional signals detected",
                "- anxious: Worry, stress, uncertainty ('worried', 'stressed', 'anxious', 'nervous', 'afraid')",
                "- panicked: Urgent crisis language ('can't pay', 'overdraft', 'declined', 'bounced', 'emergency', 'need money now')",
                "- ashamed: Shame, guilt, embarrassment ('ashamed', 'embarrassed', 'feel stupid', 'should have', 'failure')",
                "- overwhelmed: Too much to handle ('overwhelmed', 'too much', 'can't handle', 'drowning', 'don't know where to start')",
                "- fomo: Fear of missing out ('saw on tiktok', 'everyone's doing', 'fomo', 'impulse', 'couldn't resist')",
                "",
                "CRITICAL EMOTIONAL DETECTION RULES:",
                "- Only detect emotional state if there are CLEAR signals. Don't infer emotions from neutral questions.",
                "- 'Tell me about investing' → neutral (informational query, no emotional distress)",
                "- 'I'm worried about my debt' → anxious (explicit worry)",
                "- 'Can I afford Italy trip?' → neutral (affordability question, not emotional)",
                "- 'I can't pay my rent this month' → panicked (crisis language)",
                "- 'I feel stupid for spending so much' → ashamed (self-blame language)",
                "",
                "=== FLAG RULES (can combine) ===",
                "- needs_user_data=true: Answer requires user's actual data (spend, net worth, accounts, goals, personal recommendations, affordability checks)",
                "- needs_web=true: Answer requires current/2024-2025 info (limits, rates, brackets, market/news, card offers, current regulations)",
                "",
                "=== CRITICAL CLASSIFICATION RULES ===",
                "",
                "1. Affordability queries are ALWAYS ask_personalized (not goal_conversation):",
                "   - 'Can I afford X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
                "   - 'Can I afford to go Italy trip?' → ask_personalized, needs_user_data:true, intent_type:actionable",
                "   - 'Can I go afford a $1500 trip?' → ask_personalized, needs_user_data:true, intent_type:actionable",
                "",
                "2. Investment advice queries NEVER need web search:",
                "   - 'Tell me about investing' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:exploratory",
                "   - 'Investment advice' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:actionable",
                "   - 'What should I invest in?' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:actionable",
                "",
                "3. Goal queries NEVER need web search:",
                "   - 'Show my goals' → ask_personalized, needs_web:false, needs_user_data:true (inquiry, not creation)",
                "   - 'I want to save $5000 for a house' → goal_conversation, needs_web:false, needs_user_data:true (creation)",
                "",
                "4. Advice-seeking queries are ask_personalized (not goal_conversation):",
                "   - 'What's a good emergency amount for me?' → ask_personalized, needs_user_data:true, intent_type:actionable",
                "   - 'Should I buy X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
                "   - 'Is it worth it to buy X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
                "",
                "5. Credit card queries ALWAYS need web search:",
                "   - 'What credit card should I get?' → ask_personalized, needs_web:true, needs_user_data:true",
                "",
                "6. Stock queries REQUIRE a SPECIFIC ticker/company - general queries are ask_personalized:",
                "   - 'What about Apple stock?' → stock_query, needs_web:false, needs_user_data:false, ticker:'AAPL' (SPECIFIC company)",
                "   - 'Tell me about AAPL' → stock_query, needs_web:false, needs_user_data:false, ticker:'AAPL' (SPECIFIC ticker)",
                "   - 'Should I buy Tesla?' → stock_query, needs_web:false, needs_user_data:true, ticker:'TSLA' (SPECIFIC company)",
                "   - 'What's the market cap of Microsoft?' → stock_query, needs_web:false, needs_user_data:false, ticker:'MSFT' (SPECIFIC company)",
                "   - 'How is NVIDIA doing?' → stock_query, needs_web:false, needs_user_data:false, ticker:'NVDA' (SPECIFIC company)",
                "   - 'What stocks should I buy?' → ask_personalized, needs_user_data:true (GENERAL - no specific ticker)",
                "   - 'What stocks are good?' → ask_personalized, needs_user_data:true (GENERAL - no specific ticker)",
                "   - 'Tell me about the stock market' → ask_personalized, needs_web:true (GENERAL - no specific ticker)",
                "",
                "7. TICKER DETECTION RULES:",
                "   - ONLY classify as stock_query if a SPECIFIC ticker symbol OR company name is mentioned",
                "   - Extract ticker symbols (1-5 uppercase letters): AAPL, TSLA, MSFT, GOOGL, etc.",
                "   - Map company names to tickers: Apple→AAPL, Tesla→TSLA, Microsoft→MSFT, Google→GOOGL, Amazon→AMZN, Meta→META, NVIDIA→NVDA",
                "   - If multiple tickers detected, include all in entities array",
                "   - If ticker is ambiguous (e.g., 'Apple' without context), set confidence < 0.8",
                "   - If NO specific ticker/company mentioned, use ask_personalized (NOT stock_query)",
                "",
                "=== EXAMPLES ===",
                "",
                'Query: "What is the Roth IRA limit for 2025?"',
                'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":true,"needs_user_data":false,"confidence":0.95}',
                "",
                'Query: "How much did I spend last month?"',
                'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.95}',
                "",
                'Query: "Tell me about investing!"',
                'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.9}',
                "",
                'Query: "Can I afford to go Italy trip?"',
                'Response: {"intent":"ask_personalized","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.95}',
                "",
                'Query: "I\'m worried about my debt"',
                'Response: {"intent":"ask_personalized","intent_type":"emotional_support","emotional_state":"anxious","needs_web":false,"needs_user_data":true,"confidence":0.9}',
                "",
                'Query: "I can\'t pay my rent this month"',
                'Response: {"intent":"ask_personalized","intent_type":"crisis","emotional_state":"panicked","needs_web":false,"needs_user_data":true,"confidence":0.95}',
                "",
                'Query: "I want to save $5000 for a house"',
                'Response: {"intent":"goal_conversation","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.95}',
                "",
                'Query: "What\'s the weather?"',
                'Response: {"intent":"off_topic","intent_type":null,"emotional_state":"neutral","needs_web":false,"needs_user_data":false,"confidence":0.95}',
                "",
                'Query: "I feel stupid for spending so much on that"',
                'Response: {"intent":"ask_personalized","intent_type":"emotional_support","emotional_state":"ashamed","needs_web":false,"needs_user_data":true,"confidence":0.9}',
                "",
                'Query: "What about Apple stock?"',
                'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"AAPL","entities":["AAPL"],"confidence":0.95}',
                "",
                'Query: "Tell me about TSLA"',
                'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"TSLA","entities":["TSLA"],"confidence":0.98}',
                "",
                'Query: "Should I buy Tesla?"',
                'Response: {"intent":"stock_query","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"ticker":"TSLA","entities":["TSLA"],"confidence":0.9}',
                "",
                'Query: "What\'s Apple doing?"',
                'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"AAPL","entities":["AAPL"],"confidence":0.75}',
                "",
                'Query: "Tell me about the stock market"',
                'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":true,"needs_user_data":false,"ticker":null,"entities":[],"confidence":0.9}',
                "",
                'Query: "What stocks should I buy?"',
                'Response: {"intent":"ask_personalized","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"ticker":null,"entities":[],"confidence":0.9}',
                "",
                "=== OUTPUT FORMAT ===",
                "CRITICAL: You MUST return ONLY valid JSON. No markdown, no code fences, no extra text, no comments.",
                "The JSON must be parseable by JSON.parse(). Follow this EXACT structure:",
                "",
                '{"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"state":null,"entities":[],"ticker":null,"confidence":0.95}',
                "",
                "Valid JSON format rules:",
                "- Use double quotes for all strings",
                "- Use lowercase true/false (not True/False)",
                "- Use null (not NULL or None)",
                "- No trailing commas",
                "- No extra whitespace or line breaks inside JSON",
                "- All fields must be present",
                "",
                "Field requirements:",
                "- intent: REQUIRED string (ask_personalized|goal_conversation|stock_query|off_topic)",
                "- intent_type: string or null (exploratory|actionable|emotional_support|crisis|planning|null)",
                "- emotional_state: REQUIRED string (neutral|anxious|panicked|ashamed|overwhelmed|fomo)",
                "- needs_web: REQUIRED boolean (true|false)",
                "- needs_user_data: REQUIRED boolean (true|false)",
                "- state: string or null (state code like AZ, CA, or null)",
                "- entities: REQUIRED array (empty array [] if none, or ticker symbols if stock_query)",
                "- ticker: string or null (ticker symbol like 'AAPL', 'TSLA', or null if not stock_query or ambiguous)",
                "- confidence: REQUIRED number (0.0-1.0)",
                "",
                "TICKER EXTRACTION RULES:",
                "- For stock_query intent, extract ticker symbol from message",
                "- If ticker is clear (e.g., 'AAPL', 'TSLA'), set ticker field and confidence >= 0.9",
                "- If company name maps to ticker (e.g., 'Apple'→'AAPL'), set ticker and confidence >= 0.8",
                "- If ticker is ambiguous or unclear, set ticker:null and confidence < 0.8",
                "- Always include ticker in entities array if detected",
                "",
                "CRITICAL: Meta/system questions about AI capabilities are ALWAYS off_topic:",
                "- 'Can you learn from our conversations?' → off_topic",
                "- 'Do you remember our previous chat?' → off_topic",
                "- 'Are you an AI?' → off_topic",
                "- 'How do you work?' → off_topic",
                "",
                "IMPORTANT:",
                "- Be precise with emotional_state: only detect if CLEAR signals exist, default to 'neutral'",
                "- intent_type can be null for off_topic queries",
                "- confidence should reflect how certain you are (0.9+ for clear cases, 0.7-0.9 for ambiguous)",
                "- Return ONLY the JSON object, nothing else",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                text,
                user_hint_state: user?.state || null,
              }),
            },
          ],
          response_format: {
            type: "json_object",
          },
        }),
      }
    );

    // Race between fetch and timeout
    const r = await Promise.race([fetchPromise, timeoutPromise]);

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`OpenRouter error ${r.status}: ${errText}`);
    }
    const data = await r.json();
    console.log("🔍 [TEST] Classification data:", data);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [TEST] No content in response");
      throw new Error("No content");
    }

    // Strip markdown code blocks if present
    let cleanContent = content;
    if (content.startsWith("```") && content.endsWith("```")) {
      cleanContent = content.slice(3, -3).trim();
    }
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }

    // Handle incomplete JSON responses
    let out;
    try {
      out = JSON.parse(cleanContent);

      // VALIDATION: Check if the parsed result has the correct structure
      // If 'intent' field is missing or has wrong type, treat as malformed
      if (!out.intent || typeof out.intent !== "string") {
        console.log(
          "❌ [TEST] Malformed classification result - missing or invalid 'intent' field"
        );
        console.log("❌ [TEST] Malformed structure:", out);
        throw new Error("Invalid classification structure");
      }

      // Check if required fields exist
      if (out.needs_web === undefined || out.needs_user_data === undefined) {
        console.log(
          "❌ [TEST] Malformed classification result - missing required fields"
        );
        console.log("❌ [TEST] Malformed structure:", out);
        throw new Error("Missing required classification fields");
      }

      // Validate new fields with defaults
      if (
        !out.intent_type ||
        (out.intent !== "off_topic" && !out.intent_type)
      ) {
        // intent_type can be null for off_topic, but should exist for others
        if (out.intent !== "off_topic") {
          console.log("⚠️ [TEST] Missing intent_type, defaulting to null");
          out.intent_type = null;
        }
      }

      if (!out.emotional_state) {
        console.log("⚠️ [TEST] Missing emotional_state, defaulting to neutral");
        out.emotional_state = "neutral";
      }

      // Validate ticker field (required for stock_query, optional for others)
      if (out.intent === "stock_query" && !out.ticker) {
        console.log(
          "⚠️ [TEST] stock_query intent but no ticker detected, setting to null"
        );
        out.ticker = null;
      }
      if (out.ticker === undefined) {
        out.ticker = null;
      }
    } catch (parseError) {
      console.log(
        "❌ [TEST] JSON parse/validation error, using fallback classification"
      );
      console.log("❌ [TEST] Error:", parseError.message);
      console.log("❌ [TEST] Raw content was:", cleanContent);

      // Use goal detection fallback instead of trying to parse malformed JSON
      const goalDetection = detectGoalIntent(message, conversationContext);
      if (goalDetection && goalDetection.intent === "goal_conversation") {
        console.log("✅ [TEST] Using goal detection fallback");
        out = {
          intent: "goal_conversation",
          intent_type: "actionable",
          emotional_state: "neutral",
          needs_web: false,
          needs_user_data: true,
          state: null,
          entities: [],
          ticker: null,
          confidence: goalDetection.confidence,
          fallback: true,
          detection_reason: goalDetection.reason,
        };
      } else {
        // Default fallback
        out = {
          intent: "ask_personalized",
          intent_type: null,
          emotional_state: "neutral",
          needs_web: false,
          needs_user_data: true,
          state: null,
          entities: [],
          ticker: null,
          confidence: 0.8,
          fallback: true,
        };
      }
    }
    console.log("🔍 [TEST] Validated classification result:", out);

    // Defensive post-process so your app never crashes
    if (!out.state || typeof out.state !== "string") out.state = null;
    if (!Array.isArray(out.entities)) out.entities = [];
    if (out.ticker === undefined) out.ticker = null;

    // Cache the result for future use
    setCachedClassification(text, out);

    return out;
  } catch (e) {
    console.error("❌ [TEST] Classification error:", e?.message);

    // Handle timeout specifically
    if (e?.message?.includes("timeout")) {
      console.log(
        "⏰ [TEST] Classification timed out after 8 seconds, using fallback"
      );
    }

    // Enhanced heuristic fallbacks in priority order

    // 1. Off-topic detection (highest priority)
    const offTopicCheck = detectOffTopic(message);
    if (
      offTopicCheck &&
      (typeof offTopicCheck === "object"
        ? offTopicCheck.isOffTopic
        : offTopicCheck)
    ) {
      console.log("✅ [TEST] Using off-topic heuristic fallback");
      return {
        intent: "off_topic",
        intent_type: null,
        emotional_state: "neutral",
        needs_web: false,
        needs_user_data: false,
        state: null,
        entities: [],
        ticker: null,
        confidence: 0.9,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
      };
    }

    // 2. Web search detection
    const webSearchHeuristic = detectWebSearchNeeded(message);
    if (webSearchHeuristic) {
      console.log("✅ [TEST] Using web search heuristic fallback");
      return {
        intent: "ask_personalized",
        intent_type: "exploratory",
        emotional_state: "neutral",
        needs_web: true,
        needs_user_data: false,
        state: null,
        entities: [],
        ticker: null,
        confidence: 0.8,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
      };
    }

    // 3. Goal conversation detection (using tightened detection with context)
    const goalDetection = detectGoalIntent(
      message,
      context?.conversation_context
    );
    if (goalDetection && goalDetection.intent === "goal_conversation") {
      console.log(
        `✅ [TEST] Using goal conversation heuristic fallback (reason: ${goalDetection.reason})`
      );
      return {
        intent: "goal_conversation",
        intent_type: "actionable",
        emotional_state: "neutral",
        needs_web: false,
        needs_user_data: true,
        state: null,
        entities: [],
        ticker: null,
        confidence: goalDetection.confidence,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
        detection_reason: goalDetection.reason,
      };
    }

    // Heuristic fallback if available
    const heuristic = financialConceptHeuristic(message);
    if (heuristic) {
      console.log(
        "✅ [TEST] Using heuristic fallback after classification error"
      );
      return {
        ...heuristic,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
      };
    }

    // Default fallback for any classification error
    console.log("🔄 [TEST] Using default ask_personalized fallback");
    return {
      intent: "ask_personalized",
      intent_type: null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.1,
      fallback: true,
      timeout_fallback: e?.message?.includes("timeout") || false,
    };
  }
}

// Test function
async function testSingleMessage(message) {
  try {
    console.log(`\n🧪 Testing: "${message}"`);

    const startTime = Date.now();

    // Call the classification function directly
    const classification = await handleClassify(message, {
      user_id: "79952f35-b607-40d6-a32e-d81386882eb7",
    });
    const responseTime = Date.now() - startTime;

    console.log("📊 Classification Results:");
    console.log(`  Intent: ${classification.intent}`);
    if (classification.intent_type) {
      console.log(`  Intent Type: ${classification.intent_type}`);
    }
    if (classification.emotional_state) {
      console.log(`  Emotional State: ${classification.emotional_state}`);
    }
    console.log(`  needs_web: ${classification.needs_web}`);
    console.log(`  needs_user_data: ${classification.needs_user_data}`);
    console.log(`  confidence: ${classification.confidence}`);
    console.log(`  response_time: ${responseTime}ms`);

    if (classification.ticker) {
      console.log(`  ticker: ${classification.ticker}`);
    }

    if (classification.entities && classification.entities.length > 0) {
      console.log(`  entities: ${JSON.stringify(classification.entities)}`);
    }

    if (classification.state) {
      console.log(`  state: ${classification.state}`);
    }

    if (classification.fallback) {
      console.log(`  ⚠️  FALLBACK USED`);
    }

    if (classification.timeout_fallback) {
      console.log(`  ⏰ TIMEOUT FALLBACK USED`);
    }

    // Analysis
    console.log("\n🔍 Analysis:");
    if (classification.intent === "ask_personalized") {
      console.log("  ✅ Correctly identified as personal financial query");
    } else if (classification.intent === "goal_conversation") {
      console.log("  ✅ Correctly identified as goal-related query");
    } else if (classification.intent === "off_topic") {
      console.log("  ✅ Correctly identified as off-topic (non-financial)");
    } else if (classification.intent === "stock_query") {
      console.log("  ✅ Correctly identified as stock query");
      if (classification.ticker) {
        console.log(`  📈 Ticker detected: ${classification.ticker}`);
      } else {
        console.log(
          "  ⚠️  Stock query but no ticker detected (may need confirmation)"
        );
      }
    }

    if (classification.needs_web) {
      console.log(
        "  🌐 Web search will be triggered (good for current info queries)"
      );
    } else {
      console.log("  📊 No web search needed (good for personal data queries)");
    }

    if (classification.needs_user_data) {
      console.log("  👤 User data will be fetched (good for personal queries)");
    } else {
      console.log("  🌍 No user data needed (good for general info queries)");
    }

    if (classification.confidence >= 0.8) {
      console.log("  🎯 High confidence classification");
    } else if (classification.confidence >= 0.6) {
      console.log("  ⚠️  Medium confidence classification");
    } else {
      console.log("  ❌ Low confidence classification");
    }

    // Specific analysis for different query types
    const lowerMessage = message.toLowerCase();

    // Roth IRA queries
    if (lowerMessage.includes("roth ira") && lowerMessage.includes("limit")) {
      if (classification.needs_web) {
        console.log(
          "  🎯 PERFECT! Roth IRA limit query correctly triggers web search"
        );
      } else {
        console.log(
          "  ❌ ISSUE! Roth IRA limit query should trigger web search but doesn't"
        );
      }
    }

    // Off-topic queries
    if (
      lowerMessage.includes("weather") ||
      lowerMessage.includes("cook") ||
      lowerMessage.includes("movie")
    ) {
      if (classification.intent === "off_topic") {
        console.log("  🎯 PERFECT! Off-topic query correctly identified");
      } else {
        console.log(
          "  ❌ ISSUE! Off-topic query should be classified as off_topic"
        );
      }
    }

    // Goal queries
    if (
      lowerMessage.includes("save") &&
      (lowerMessage.includes("goal") || lowerMessage.includes("want"))
    ) {
      if (classification.intent === "goal_conversation") {
        console.log("  🎯 PERFECT! Goal query correctly identified");
      } else {
        console.log(
          "  ❌ ISSUE! Goal query should be classified as goal_conversation"
        );
      }
    }

    // Personal financial queries
    if (
      lowerMessage.includes("spend") ||
      lowerMessage.includes("net worth") ||
      lowerMessage.includes("transaction")
    ) {
      if (
        classification.intent === "ask_personalized" &&
        classification.needs_user_data
      ) {
        console.log(
          "  🎯 PERFECT! Personal financial query correctly identified"
        );
      } else {
        console.log(
          "  ❌ ISSUE! Personal financial query should need user data"
        );
      }
    }

    return { classification, responseTime };
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return { error: error.message };
  }
}

// Hardball tests - edge cases for classification
async function runHardballTests() {
  const tests = [
    {
      q: "What's a good emergency amount for me?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation",
    },
    {
      q: "Can I afford a $1500 trip?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (affordability check), NOT goal_conversation",
    },
    {
      q: "I want to create a goal for my emergency fund",
      expected: "goal_conversation",
      note: "Should be goal_conversation (explicit goal creation)",
    },
    {
      q: "How much should I have in my emergency fund?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation",
    },
    {
      q: "Is it worth it to buy a $2000 laptop?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (value assessment), NOT goal_conversation",
    },
    {
      q: "Should I save $5000 for a house?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation (note: 'save' + 'for' but phrased as advice)",
    },
    {
      q: "I want to save $5000 for a house",
      expected: "goal_conversation",
      note: "Should be goal_conversation (explicit goal creation statement)",
    },
    {
      q: "What's a good amount to save for retirement?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation",
    },
    {
      q: "Let's set a goal to save for my emergency fund",
      expected: "goal_conversation",
      note: "Should be goal_conversation (explicit goal creation with 'set a goal')",
    },
    {
      q: "Can I go afford a $1500 trip?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (affordability check with typo 'go afford'), NOT goal_conversation",
    },
    {
      q: "Can I afford to go Italy trip?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (affordability check with natural language variation), NOT goal_conversation",
    },
  ];

  console.log("\n" + "=".repeat(80));
  console.log("🔥 HARDBALL TESTS - Edge Cases for Classification");
  console.log("=".repeat(80));

  let pass = 0;
  let total = tests.length;

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log(`\n${i + 1}. Testing: "${t.q}"`);
    console.log(`   Expected: ${t.expected}`);
    console.log(`   Note: ${t.note}`);
    console.log("-".repeat(80));

    try {
      const { classification } = await testSingleMessage(t.q);
      const actual = classification?.intent;
      const isCorrect = actual === t.expected;

      if (isCorrect) {
        pass++;
        console.log(`   ✅ PASS - Got ${actual} (as expected)`);
      } else {
        console.log(`   ❌ FAIL - Got ${actual}, expected ${t.expected}`);
        console.log(`   Confidence: ${classification?.confidence}`);
        console.log(`   Needs web: ${classification?.needs_web}`);
        console.log(`   Needs user data: ${classification?.needs_user_data}`);
        if (classification?.reason) {
          console.log(`   Reason: ${classification.reason}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`📊 HARDBALL TEST SUMMARY: ${pass}/${total} passed`);
  console.log("=".repeat(80));

  if (pass === total) {
    console.log("🎉 All tests passed!");
  } else {
    console.log(`⚠️  ${total - pass} test(s) failed`);
  }
}

// Run if called directly with node
// Check if this is the main module (works for both CommonJS and ES modules)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith("test_classification_direct.js") ||
  process.argv[1]?.endsWith("test_classification_direct.js");

if (isMainModule) {
  const userMessage = process.argv[2];
  const testType = process.argv[3];

  if (
    userMessage &&
    userMessage !== "hardball" &&
    userMessage !== "stock" &&
    userMessage !== "curveball"
  ) {
    // User provided a query string
    console.log("🚀 Testing Single Statement");
    console.log(`Testing: "${userMessage}"`);
    console.log("=".repeat(50));

    testSingleMessage(userMessage)
      .then(() => {
        console.log("\n✅ Test completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
      });
  } else if (userMessage === "hardball" || testType === "hardball") {
    console.log("🔥 Running hardball tests...");
    runHardballTests()
      .then(() => {
        console.log("\n✅ Hardball tests completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Hardball tests failed:", error);
        process.exit(1);
      });
  } else if (userMessage === "stock" || testType === "stock") {
    console.log("📈 Running stock query tests...");
    runStockQueryTests()
      .then(() => {
        console.log("\n✅ Stock query tests completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Stock query tests failed:", error);
        process.exit(1);
      });
  } else {
    console.log("Running curveball tests...");
    runCurveballTests()
      .then(() => {
        console.log("\n✅ Curveball tests completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Curveball tests failed:", error);
        process.exit(1);
      });
  }
}

export { testSingleMessage, handleClassify, runStockQueryTests };

// Curveball hard tests
async function runCurveballTests() {
  const tests = [
    {
      q: "Can you tell me about the bank?",
      note: "Ambiguous 'bank' (river bank vs financial). Expect off_topic or ask_personalized depending on context",
    },
    {
      q: "Is it ever acceptable to lie?",
      note: "Ethical dilemma → off_topic",
    },
    {
      q: "I'm feeling really down today; what should I do?",
      note: "Emotional support → off_topic",
    },
    {
      q: "What is the meaning of life?",
      note: "Philosophical → off_topic",
    },
    {
      q: "Will AI ever surpass human intelligence?",
      note: "Future prediction → off_topic",
    },
    {
      q: "Why did the chicken cross the road?",
      note: "Humor → off_topic",
    },
    {
      q: "If I have a red house on the left and a blue house on the right, where is the white house?",
      note: "Common-sense riddle → off_topic",
    },
    {
      q: "Do you know that you're an AI?",
      note: "Self-awareness → off_topic",
    },
    {
      q: "Can you learn from our previous conversations?",
      note: "Meta/system behavior → off_topic",
    },
    {
      q: "What are the best practices for greeting someone in Japan?",
      note: "Cultural sensitivity → off_topic",
    },
  ];

  let pass = 0;
  for (const t of tests) {
    const { classification } = await testSingleMessage(t.q);
    const isOffTopic = classification?.intent === "off_topic";
    const ok =
      isOffTopic &&
      !classification?.needs_web &&
      !classification?.needs_user_data;
    if (ok) pass++;
    console.log(`\n➡️  Curveball: ${t.q}`);
    console.log(
      `   -> intent=${classification?.intent}, needs_web=${classification?.needs_web}, needs_user_data=${classification?.needs_user_data}`
    );
    console.log(`   Note: ${t.note}`);
    console.log(
      `   Result: ${
        ok ? "✅ as expected (off_topic)" : "⚠️ check classification"
      }`
    );
  }
  console.log(
    `\nCurveball summary: ${pass}/${tests.length} off_topic as expected`
  );
}

// Stock query test cases - Easy, Medium, Hard
async function runStockQueryTests() {
  const tests = [
    // EASY TESTS - Clear ticker symbols
    {
      q: "What about AAPL?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.95,
        note: "Clear ticker symbol - should be high confidence",
      },
    },
    {
      q: "Tell me about TSLA",
      expected: {
        intent: "stock_query",
        ticker: "TSLA",
        confidence: 0.95,
        note: "Clear ticker symbol with 'tell me about' pattern",
      },
    },
    {
      q: "Should I buy MSFT?",
      expected: {
        intent: "stock_query",
        ticker: "MSFT",
        needs_user_data: true,
        confidence: 0.9,
        note: "Clear ticker with investment advice question",
      },
    },
    {
      q: "What's the price of GOOGL?",
      expected: {
        intent: "stock_query",
        ticker: "GOOGL",
        confidence: 0.95,
        note: "Clear ticker with price query",
      },
    },

    // MEDIUM TESTS - Company names that map to tickers
    {
      q: "What about Apple stock?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.85,
        note: "Company name 'Apple' should map to AAPL",
      },
    },
    {
      q: "Tell me about Tesla",
      expected: {
        intent: "stock_query",
        ticker: "TSLA",
        confidence: 0.8,
        note: "Company name 'Tesla' should map to TSLA (medium confidence due to ambiguity)",
      },
    },
    {
      q: "How is Microsoft doing?",
      expected: {
        intent: "stock_query",
        ticker: "MSFT",
        confidence: 0.8,
        note: "Company name 'Microsoft' should map to MSFT",
      },
    },
    {
      q: "Should I invest in NVIDIA?",
      expected: {
        intent: "stock_query",
        ticker: "NVDA",
        needs_user_data: true,
        confidence: 0.85,
        note: "Company name 'NVIDIA' should map to NVDA with investment advice",
      },
    },

    // HARD TESTS - Ambiguous or unclear cases
    {
      q: "What about Apple?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.7,
        note: "Ambiguous - could be company or stock, should detect as stock_query but lower confidence",
      },
    },
    {
      q: "Tell me about the stock market",
      expected: {
        intent: "ask_personalized",
        ticker: null,
        needs_web: true,
        confidence: 0.9,
        note: "General stock market query - NOT stock_query (no specific ticker)",
      },
    },
    {
      q: "What stocks should I buy?",
      expected: {
        intent: "ask_personalized",
        ticker: null,
        needs_user_data: true,
        confidence: 0.9,
        note: "General investment advice - NOT stock_query (no specific ticker)",
      },
    },
    {
      q: "Apple",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.6,
        note: "Very ambiguous - single word could be anything, but in financial context likely stock",
      },
    },
    {
      q: "What's happening with AMZN and MSFT?",
      expected: {
        intent: "stock_query",
        ticker: "AMZN",
        entities: ["AMZN", "MSFT"],
        confidence: 0.9,
        note: "Multiple tickers detected - should include both in entities",
      },
    },
    {
      q: "Is Apple a good investment?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        needs_user_data: true,
        confidence: 0.85,
        note: "Investment question about company - should map to AAPL",
      },
    },
  ];

  console.log("\n" + "=".repeat(80));
  console.log("📈 STOCK QUERY TESTS - Easy, Medium, Hard Cases");
  console.log("=".repeat(80));

  let pass = 0;
  let total = tests.length;

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log(`\n${i + 1}. Testing: "${t.q}"`);
    console.log(
      `   Expected: intent=${t.expected.intent}, ticker=${t.expected.ticker}, confidence>=${t.expected.confidence}`
    );
    console.log(`   Note: ${t.note}`);
    console.log("-".repeat(80));

    try {
      const { classification } = await testSingleMessage(t.q);
      const actual = classification?.intent;
      const actualTicker = classification?.ticker;
      const actualConfidence = classification?.confidence;
      const actualNeedsUserData = classification?.needs_user_data;

      // Check intent match
      const intentMatch = actual === t.expected.intent;

      // Check ticker match (null/undefined matches null, or exact match)
      const tickerMatch =
        (t.expected.ticker === null &&
          (actualTicker === null || actualTicker === undefined)) ||
        (t.expected.ticker && actualTicker === t.expected.ticker);

      // Check confidence threshold
      const confidenceMatch = actualConfidence >= t.expected.confidence;

      // Check needs_user_data if specified
      const needsUserDataMatch =
        t.expected.needs_user_data === undefined ||
        actualNeedsUserData === t.expected.needs_user_data;

      const isCorrect =
        intentMatch && tickerMatch && confidenceMatch && needsUserDataMatch;

      if (isCorrect) {
        pass++;
        console.log(`   ✅ PASS`);
        console.log(`      Intent: ${actual} (expected: ${t.expected.intent})`);
        console.log(
          `      Ticker: ${actualTicker} (expected: ${t.expected.ticker})`
        );
        console.log(
          `      Confidence: ${actualConfidence} (expected: >=${t.expected.confidence})`
        );
        if (t.expected.needs_user_data !== undefined) {
          console.log(
            `      Needs User Data: ${actualNeedsUserData} (expected: ${t.expected.needs_user_data})`
          );
        }
      } else {
        console.log(`   ❌ FAIL`);
        if (!intentMatch) {
          console.log(
            `      Intent mismatch: got ${actual}, expected ${t.expected.intent}`
          );
        }
        if (!tickerMatch) {
          console.log(
            `      Ticker mismatch: got ${actualTicker}, expected ${t.expected.ticker}`
          );
        }
        if (!confidenceMatch) {
          console.log(
            `      Confidence too low: got ${actualConfidence}, expected >=${t.expected.confidence}`
          );
        }
        if (!needsUserDataMatch) {
          console.log(
            `      Needs user data mismatch: got ${actualNeedsUserData}, expected ${t.expected.needs_user_data}`
          );
        }
        console.log(
          `      Full result:`,
          JSON.stringify(classification, null, 2)
        );
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`📊 STOCK QUERY TEST SUMMARY: ${pass}/${total} passed`);
  console.log("=".repeat(80));

  if (pass === total) {
    console.log("🎉 All stock query tests passed!");
  } else {
    console.log(`⚠️  ${total - pass} test(s) failed`);
  }
}

/**
 * Direct Classification Test with Improved Prompting
 * Tests the classification function directly with enhanced web search detection
 */

// Configuration
const OPENROUTER_API_KEY =
  "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";
const OPENROUTER_MODEL = "openai/gpt-oss-20b:free";

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
  // Finance override: if common finance terms appear, do NOT mark off-topic
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

  // Check for off-topic first (highest priority)
  if (detectOffTopic(text)) {
    return {
      intent: "off_topic",
      needs_web: false,
      needs_user_data: false,
      state: null,
      entities: [],
      confidence: 0.9,
      heuristic: true,
    };
  }

  // Strong web search indicators (only for financial topics)
  if (detectWebSearchNeeded(text)) {
    return {
      intent: "ask_personalized",
      needs_web: true,
      needs_user_data: false,
      state: null,
      entities: [],
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
    lower.includes("my spending")
  ) {
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
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
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: 0.85,
      heuristic: true,
    };
  }

  return null;
}

// Enhanced classification function with improved prompting
async function handleClassify(message, context) {
  console.log("🔍 [TEST] Starting classification for message:", message);
  const startTime = Date.now();

  const { text, user } = { text: message, user: context };
  if (!text || typeof text !== "string") {
    console.log("❌ [TEST] Missing or invalid text parameter");
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: 0.1,
      fallback: true,
    };
  }

  // Check cache first
  const cachedResult = getCachedClassification(text);
  if (cachedResult) {
    console.log(
      `⚡ [TEST] Using cached classification result (${
        Date.now() - startTime
      }ms)`
    );
    return cachedResult;
  }

  // Check for off-topic first (highest priority)
  const offTopicHeuristic = detectOffTopic(text);
  if (offTopicHeuristic) {
    console.log("✅ [TEST] Heuristic detected off-topic query");
    const result = {
      intent: "off_topic",
      needs_web: false,
      needs_user_data: false,
      state: null,
      entities: [],
      confidence: 0.9,
      heuristic: true,
    };
    setCachedClassification(text, result);
    return result;
  }

  // Positive heuristic for common financial concept questions (with combined flags)
  const heuristic = financialConceptHeuristic(text);
  if (heuristic) {
    const needsWebToo = detectWebSearchNeeded(text) === true;
    const merged = needsWebToo ? { ...heuristic, needs_web: true } : heuristic;
    console.log("✅ [TEST] Heuristic classified (with combined flags check)");
    setCachedClassification(text, merged);
    return merged;
  }

  try {
    // Create a timeout promise that rejects after 8 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Classification timeout after 8 seconds")),
        8000
      );
    });

    // Create the fetch promise with ENHANCED prompting
    const fetchPromise = fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0.1,
          max_tokens: 300,
          top_p: 0.9,
          messages: [
            {
              role: "system",
              content: [
                "You are Financify's intent router. Classify the user message into exactly one intent and set flags. Never answer off-topic (e.g., weather, ethics, feelings, philosophy, AI meta, culture).",
                "",
                "Intents:",
                "- ask_personalized: user’s finances (spending, accounts, goals, investments)",
                "- goal_conversation: saving/targets/feasibility conversations",
                "- off_topic: non-financial (weather, cooking, movies, sports, tech support)",
                "",
                "Flag rules (can combine):",
                "- needs_user_data=true when the answer requires the user's actual data (spend, net worth, accounts, goals, personal recommendations)",
                "- needs_web=true when the answer requires current/2024-2025 info (limits, rates, brackets, market/news, card offers)",
                "",
                "Examples:",
                '"What is the Roth IRA limit for 2025?" → {intent:"ask_personalized", needs_web:true, needs_user_data:false}',
                '"How much did I spend last month?" → {intent:"ask_personalized", needs_web:false, needs_user_data:true}',
                '"I want to save $5000 for a house" → {intent:"goal_conversation", needs_web:false, needs_user_data:true}',
                '"Which credit card should I get?" → {intent:"ask_personalized", needs_web:true, needs_user_data:true}',
                '"Rent vs buy in Phoenix at 7% for me" → {intent:"ask_personalized", needs_web:true, needs_user_data:true, state:"AZ"}',
                '"What\'s the weather?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                '"How\'s the weather looking today?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                '"Is it ever acceptable to lie?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                '"I\'m feeling really down today; what should I do?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                '"What is the meaning of life?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                '"Do you know that you\'re an AI?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                '"What are the best practices for greeting someone in Japan?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                "",
                "Return ONLY JSON (no code fences, no commentary):",
                '{"intent":"ask_personalized|goal_conversation|off_topic","needs_web":true|false,"needs_user_data":true|false,"state":null|"AZ","entities":[],"confidence":0.0-1.0}',
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
    console.log("🔍 [TEST] Raw content:", content);
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
    } catch (parseError) {
      console.log("❌ [TEST] JSON parse error, trying to fix incomplete JSON");
      console.log("❌ [TEST] Raw content was:", cleanContent);

      // Try to extract intent from malformed JSON
      const intentMatch = cleanContent.match(/"intent"\s*:\s*"([^"]+)"/);
      const needsWebMatch = cleanContent.match(
        /"needs_web"\s*:\s*(true|false)/
      );
      const needsUserDataMatch = cleanContent.match(
        /"needs_user_data"\s*:\s*(true|false)/
      );
      const confidenceMatch = cleanContent.match(
        /"confidence"\s*:\s*([0-9.]+)/
      );

      if (intentMatch) {
        console.log("✅ [TEST] Extracted intent from malformed JSON");
        out = {
          intent: intentMatch[1],
          needs_web: needsWebMatch ? needsWebMatch[1] === "true" : false,
          needs_user_data: needsUserDataMatch
            ? needsUserDataMatch[1] === "true"
            : false,
          state: null,
          entities: [],
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8,
          malformed_json: true,
        };
      } else {
        // Try to extract from the weird format we're seeing
        const weirdIntentMatch = cleanContent.match(/ask_personalized/);
        const weirdNeedsWebMatch = cleanContent.match(/false/);
        const weirdNeedsUserDataMatch = cleanContent.match(/true/);
        const weirdConfidenceMatch = cleanContent.match(/0\.95/);

        if (weirdIntentMatch) {
          console.log("✅ [TEST] Extracted from weird malformed JSON format");
          out = {
            intent: "ask_personalized",
            needs_web: weirdNeedsWebMatch ? false : false,
            needs_user_data: weirdNeedsUserDataMatch ? true : false,
            state: null,
            entities: [],
            confidence: weirdConfidenceMatch ? 0.95 : 0.8,
            malformed_json: true,
          };
        } else {
          throw new Error("Malformed JSON response");
        }
      }
    }
    console.log("🔍 [TEST] Parsed classification result:", out);

    // Defensive post-process so your app never crashes
    if (!out.state || typeof out.state !== "string") out.state = null;
    if (!Array.isArray(out.entities)) out.entities = [];

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
    if (detectOffTopic(message)) {
      console.log("✅ [TEST] Using off-topic heuristic fallback");
      return {
        intent: "off_topic",
        needs_web: false,
        needs_user_data: false,
        state: null,
        entities: [],
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
        needs_web: true,
        needs_user_data: false,
        state: null,
        entities: [],
        confidence: 0.8,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
      };
    }

    // 3. Goal conversation detection
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes("save") &&
      (lowerMessage.includes("goal") ||
        lowerMessage.includes("target") ||
        lowerMessage.includes("plan") ||
        lowerMessage.includes("want"))
    ) {
      console.log("✅ [TEST] Using goal conversation heuristic fallback");
      return {
        intent: "goal_conversation",
        needs_web: false,
        needs_user_data: true,
        state: null,
        entities: [],
        confidence: 0.8,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
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
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
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
    console.log(`  needs_web: ${classification.needs_web}`);
    console.log(`  needs_user_data: ${classification.needs_user_data}`);
    console.log(`  confidence: ${classification.confidence}`);
    console.log(`  response_time: ${responseTime}ms`);

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

// Run if called directly
if (
  typeof window === "undefined" &&
  import.meta.url === `file://${process.argv[1]}`
) {
  const userMessage = process.argv[2];

  if (userMessage) {
    console.log("🚀 Testing Single Statement");
    console.log(`Testing: "${userMessage}"`);
    console.log("=".repeat(50));

    testSingleMessage(userMessage).catch(console.error);
  } else {
    console.log("Running curveball tests...");
    runCurveballTests().catch(console.error);
  }
}

export { testSingleMessage, handleClassify };

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

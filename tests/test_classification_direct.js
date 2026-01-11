/**
 * Direct Classification Test with Improved Prompting
 * Tests the classification function directly with enhanced web search detection
 *
 * Usage:
 *   node tests/test_classification_direct.js "your query here"
 *   node tests/test_classification_direct.js hardball
 *   node tests/test_classification_direct.js stock
 *   node tests/test_classification_direct.js test1
 */

// Configuration - matches production in api/finny.js
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_GROK_KEY ||
  process.env.OPENROUTER_API_KEY ||
  "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";
const CLASSIFICATION_MODEL_PAID =
  process.env.CLASSIFICATION_MODEL_PAID || "openai/gpt-oss-20b";
const CLASSIFICATION_MODEL_FREE =
  process.env.CLASSIFICATION_MODEL_FREE || "openai/gpt-oss-20b:free";
const STANDARD_MODEL = "meta-llama/llama-3.2-3b-instruct";

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
      needs_clarification: false,
      info_sufficiency: "unknown",
      missing_fields: [],
      decision_risk: "unknown",
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
      if (cachedResult.needs_clarification === undefined) {
        cachedResult.needs_clarification = false;
      }
      if (!cachedResult.info_sufficiency) {
        cachedResult.info_sufficiency = "unknown";
      }
      if (!Array.isArray(cachedResult.missing_fields)) {
        cachedResult.missing_fields = [];
      }
      if (!cachedResult.decision_risk) {
        cachedResult.decision_risk = "unknown";
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

  // No rigid heuristics - all classification is handled by LLM
  // This ensures flexible detection of stocks, goals, and all other intents
  // Matches production code

  try {
    async function callLLM(model) {
      // Create a timeout promise that rejects after 12 seconds (matches production)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Classification timeout after 12 seconds")),
          12000
        );
      });

      // Create the fetch promise
      const fetchPromise = fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.05,
            max_tokens: 1000,
            top_p: 0.8,
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
                  "GOAL_CONVERSATION STRICTNESS (important):",
                  "- Use goal_conversation ONLY when the user explicitly wants to create/set/add a goal in the app (they say 'create a goal', 'set a goal', 'add a goal', or clearly refer to the Goals feature).",
                  "- If the user mentions a life goal (house, car, travel, kids) but is asking for feasibility/advice/planning, that is ask_personalized (NOT goal_conversation).",
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
                  "- needs_clarification=true: The user is asking for advice/plan but key inputs are missing or intent is ambiguous (Ask handler will ask 1–3 questions before advising)",
                  "",
                  "=== INFO SUFFICIENCY & RISK (Reliable routing) ===",
                  "Set these fields so the Ask handler can safely clarify instead of guessing:",
                  "- info_sufficiency: 'sufficient'|'missing'|'unknown'",
                  "- missing_fields: array of strings from this set:",
                  "  [income_takehome,income_gross,fixed_expenses,current_savings,debt_balances,credit_score,purchase_price,down_payment,timeline,location,risk_tolerance,investing_horizon,goal_amount,goal_date,move_countries,employer_match]",
                  "- decision_risk: 'low'|'medium'|'high'",
                  "- missing_fields must be UNIQUE and short: choose at most 5, no duplicates",
                  "",
                  "Decision risk guidance (examples, context-dependent):",
                  "- high: decisions that commit a large portion of the user's resources, create long-term obligations, or require missing planning data",
                  "- medium: decisions with meaningful tradeoffs but reversible or limited downside",
                  "- low: definitions, explanations, or small factual questions",
                  "",
                  "If the user asks a high-risk question and details are missing, set needs_clarification=true and include missing_fields like timeline, income_takehome, fixed_expenses, current_savings, debt_balances, location (as applicable).",
                  "",
                  "Ambiguity rule:",
                  "- If the user asks an ambiguous decision question (e.g., 'should I', 'is it worth it', 'help me decide') and it's medium/high stakes, set needs_clarification=true even if missing_fields is empty (Ask handler may ask 1 sharp question to confirm goal).",
                  "",
                  "High-stakes planning rule (non-rigid, apply broadly):",
                  "- If the user is describing a major plan/decision (big purchase, multiple big goals, multi-country plan, life decision) and asks for guidance/feasibility without key numbers, set decision_risk='high', needs_clarification=true, info_sufficiency='missing'.",
                  "- In those cases, include the most relevant missing_fields (pick 3–5): timeline, purchase_price, down_payment, income_takehome, fixed_expenses, current_savings, debt_balances, location.",
                  "- Set intent_type='actionable' for feasibility/planning questions, even if the user didn't explicitly say 'how'.",
                  "- Do NOT set needs_web=true just because it's a big decision. needs_web is only for current rates/brackets/regulations/news or explicitly asked country-specific rules.",
                  "",
                  "Info sufficiency rule:",
                  "- Default to info_sufficiency='missing' for advice/feasibility questions unless the user supplied the key inputs in their message.",
                  "- Do not label info_sufficiency='sufficient' when missing_fields is empty but the user gave no numbers.",
                  "",
                  "Consistency rule:",
                  "- If info_sufficiency is 'missing', needs_clarification MUST be true.",
                  "",
                  "Examples (follow these patterns):",
                  "- 'I want to buy houses in Italy and Japan' -> intent_type:'actionable', decision_risk:'high', needs_web:false, needs_clarification:true, info_sufficiency:'missing', missing_fields includes 3–5 of: timeline, purchase_price, down_payment, income_takehome, fixed_expenses, current_savings, debt_balances, location",
                  "- 'Should I save $5000 for a house?' -> ask_personalized (advice), NOT goal_conversation; intent_type:'actionable'",
                  "",
                  "=== CRITICAL CLASSIFICATION RULES ===",
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
                  "=== OUTPUT FORMAT ===",
                  "CRITICAL: You MUST return ONLY valid JSON. No markdown, no code fences, no extra text, no comments.",
                  "The JSON must be parseable by JSON.parse(). Follow this EXACT structure:",
                  "",
                  '{"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"needs_clarification":false,"info_sufficiency":"sufficient","missing_fields":[],"decision_risk":"low","state":null,"entities":[],"ticker":null,"confidence":0.95}',
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
                  "- needs_clarification: REQUIRED boolean (true|false)",
                  "- info_sufficiency: REQUIRED string ('sufficient'|'missing'|'unknown')",
                  "- missing_fields: REQUIRED array (empty array [] if none)",
                  "- decision_risk: REQUIRED string ('low'|'medium'|'high')",
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
                  "- If needs_clarification=true, set info_sufficiency to 'missing' or 'unknown' and include missing_fields",
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
            response_format: { type: "json_object" },
          }),
        }
      );

      // Race between fetch and timeout
      const r = await Promise.race([fetchPromise, timeoutPromise]);

      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`OpenRouter error ${r.status}: ${errText}`);
      }
      return r.json();
    }

    // Try models in order: free classification model first, then paid (test order - reversed from production)
    const classificationModels = [
      CLASSIFICATION_MODEL_FREE,
      CLASSIFICATION_MODEL_PAID,
    ];
    let data;
    let usedModel = null;
    let lastError = null;

    for (const model of classificationModels) {
      if (!model) continue;
      try {
        data = await callLLM(model);
        usedModel = model;
        break;
      } catch (err) {
        lastError = err;
        console.log(`⚠️ [TEST] Model ${model} failed:`, err?.message);
        // Continue to next model
      }
    }

    if (!data) {
      throw lastError || new Error("All classification models failed");
    }

    console.log(`🔍 [TEST] Classification using model: ${usedModel}`);

    // console.log("🔍 [TEST] Classification data:", data);
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

      // Defaults for clarification/risk routing fields
      if (out.needs_clarification === undefined)
        out.needs_clarification = false;
      if (!out.info_sufficiency) out.info_sufficiency = "unknown";
      if (!Array.isArray(out.missing_fields)) out.missing_fields = [];
      if (!out.decision_risk) out.decision_risk = "unknown";
    } catch (parseError) {
      console.log(
        "❌ [TEST] JSON parse/validation error, using fallback classification"
      );
      console.log("❌ [TEST] Error:", parseError.message);
      console.log("❌ [TEST] Raw content was:", cleanContent);

      // Default fallback for malformed JSON - no rigid heuristics
      out = {
        intent: "ask_personalized",
        intent_type: null,
        emotional_state: "neutral",
        needs_web: false,
        needs_user_data: true,
        needs_clarification: false,
        info_sufficiency: "unknown",
        missing_fields: [],
        decision_risk: "unknown",
        state: null,
        entities: [],
        ticker: null,
        confidence: 0.8,
        fallback: true,
      };
    }
    // Strict trigger: only treat as goal_conversation when user explicitly wants to create/set/add a goal.
    // Avoid matching casual phrases like "my goal is...".
    const goalConversationTrigger =
      /\b(create|set|add|start|make)\s+(a\s+)?goal\b|\bnew\s+goal\b|\bgoal\s+(called|named)\b/i;

    // Normalize/defend new routing fields (LLMs sometimes ignore constraints)
    const allowedInfo = new Set(["sufficient", "missing", "unknown"]);
    const allowedRisk = new Set(["low", "medium", "high", "unknown"]);
    const allowedMissingFields = new Set([
      "income_takehome",
      "income_gross",
      "fixed_expenses",
      "current_savings",
      "debt_balances",
      "credit_score",
      "purchase_price",
      "down_payment",
      "timeline",
      "location",
      "risk_tolerance",
      "investing_horizon",
      "goal_amount",
      "goal_date",
      "move_countries",
      "employer_match",
    ]);

    out.needs_clarification = !!out.needs_clarification;
    out.info_sufficiency = allowedInfo.has(out.info_sufficiency)
      ? out.info_sufficiency
      : "unknown";
    out.decision_risk = allowedRisk.has(out.decision_risk)
      ? out.decision_risk
      : "unknown";
    if (!Array.isArray(out.missing_fields)) out.missing_fields = [];
    out.missing_fields = Array.from(
      new Set(out.missing_fields.filter((f) => allowedMissingFields.has(f)))
    ).slice(0, 5);

    if (
      typeof out.confidence !== "number" ||
      !Number.isFinite(out.confidence)
    ) {
      out.confidence = 0.7;
    }
    out.confidence = Math.max(0, Math.min(1, out.confidence));

    // Enforce strict goal_conversation semantics: only when user explicitly requests goal creation.
    if (
      out.intent === "goal_conversation" &&
      !goalConversationTrigger.test(text)
    ) {
      out.intent = "ask_personalized";
      if (out.intent_type === "goal_conversation")
        out.intent_type = "actionable";
    }

    console.log("🔍 [TEST] Validated classification result:", out);

    // Defensive post-process so your app never crashes
    if (!out.state || typeof out.state !== "string") out.state = null;
    if (!Array.isArray(out.entities)) out.entities = [];
    if (out.ticker === undefined) out.ticker = null;
    if (
      out.intent === "stock_query" &&
      out.ticker &&
      out.entities.length === 0
    ) {
      out.entities = [out.ticker];
    }
    if (out.needs_clarification === undefined) out.needs_clarification = false;
    if (!out.info_sufficiency) out.info_sufficiency = "unknown";
    if (!Array.isArray(out.missing_fields)) out.missing_fields = [];
    if (!out.decision_risk) out.decision_risk = "unknown";

    // Cache the result for future use
    setCachedClassification(text, out);

    return out;
  } catch (e) {
    console.error("❌ [TEST] Classification error:", e?.message);

    // Handle timeout specifically
    if (e?.message?.includes("timeout")) {
      console.log(
        "⏰ [TEST] Classification timed out after 12 seconds, using fallback"
      );
    }

    // Default fallback for any classification error
    // No rigid heuristics - if LLM fails, use safe default
    console.log("🔄 [TEST] Using default ask_personalized fallback");
    return {
      intent: "ask_personalized",
      intent_type: null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      needs_clarification: false,
      info_sufficiency: "unknown",
      missing_fields: [],
      decision_risk: "unknown",
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
      user_id: "f948c4ab-dc68-41d5-89bf-1935653cca37",
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
    console.log(`  needs_clarification: ${classification.needs_clarification}`);
    if (classification.info_sufficiency) {
      console.log(`  info_sufficiency: ${classification.info_sufficiency}`);
    }
    if (classification.decision_risk) {
      console.log(`  decision_risk: ${classification.decision_risk}`);
    }
    if (classification.missing_fields && classification.missing_fields.length) {
      console.log(
        `  missing_fields: ${JSON.stringify(classification.missing_fields)}`
      );
    }
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
      q: "Should I move to Japan this year?",
      expected: "ask_personalized",
      note: "High-stakes ambiguous decision. Should be ask_personalized and typically needs_clarification + decision_risk:high",
    },
    {
      q: "Is it worth it to have kids?",
      expected: "ask_personalized",
      note: "High-stakes ambiguous decision. Should be ask_personalized and typically needs_clarification + decision_risk:high",
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
      q: "I want to buy houses in italy and japan",
      expected: "ask_personalized",
      note: "Major multi-country plan; expect needs_clarification:true, decision_risk:high, info_sufficiency:missing (soft checks)",
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

        // Soft checks (non-fatal): new routing signals for ambiguous/high-stakes decisions
        const lower = t.q.toLowerCase();
        const isBigLifeDecision =
          lower.includes("move") ||
          lower.includes("moving") ||
          lower.includes("kids") ||
          lower.includes("have kids") ||
          lower.includes("married") ||
          lower.includes("marriage");
        if (isBigLifeDecision) {
          if (classification?.decision_risk !== "high") {
            console.log(
              `   ⚠️  Note: expected decision_risk ~ high, got ${classification?.decision_risk}`
            );
          }
          if (classification?.needs_clarification !== true) {
            console.log(
              `   ⚠️  Note: expected needs_clarification ~ true, got ${classification?.needs_clarification}`
            );
          }
        }
      } else {
        console.log(`   ❌ FAIL - Got ${actual}, expected ${t.expected}`);
        console.log(`   Confidence: ${classification?.confidence}`);
        console.log(`   Needs web: ${classification?.needs_web}`);
        console.log(`   Needs user data: ${classification?.needs_user_data}`);
        console.log(
          `   needs_clarification: ${classification?.needs_clarification}`
        );
        console.log(
          `   decision_risk: ${classification?.decision_risk} | info_sufficiency: ${classification?.info_sufficiency}`
        );
        if (classification?.missing_fields?.length) {
          console.log(
            `   missing_fields: ${JSON.stringify(
              classification.missing_fields
            )}`
          );
        }
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

// Test1 - User-provided questions
async function runTest1() {
  const questions = [
    "Can I afford a $1,500 trip?",
    "I want to buy houses in Italy and Japan",
    "What do you know about me?",
    "I feel stupid about my spending",
    "Tell me about investing",
  ];

  console.log("\n" + "=".repeat(80));
  console.log("🧪 TEST1 - Classification Tests");
  console.log("=".repeat(80));

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`\n${i + 1}. "${question}"`);
    console.log("-".repeat(80));

    try {
      const classification = await handleClassify(question, {
        user_id: "f948c4ab-dc68-41d5-89bf-1935653cca37",
      });

      // Only log the 4 requested fields
      console.log(`  intent_type: ${classification.intent_type}`);
      console.log(`  emotional_state: ${classification.emotional_state}`);
      console.log(
        `  needs_clarification: ${classification.needs_clarification}`
      );
      console.log(`  decision_risk: ${classification.decision_risk}`);
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ TEST1 completed");
  console.log("=".repeat(80));
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
    userMessage !== "curveball" &&
    userMessage !== "test1"
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
  } else if (userMessage === "test1" || testType === "test1") {
    console.log("🧪 Running test1...");
    runTest1()
      .then(() => {
        console.log("\n✅ Test1 completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Test1 failed:", error);
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

export { testSingleMessage, handleClassify, runStockQueryTests, runTest1 };

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

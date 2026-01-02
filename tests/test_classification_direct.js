/**
 * Direct Classification Test with Improved Prompting
 * Tests the classification function directly with enhanced web search detection
 *
 * Usage:
 *   node tests/test_classification_direct.js "your query here"
 *   node tests/test_classification_direct.js hardball
 *   node tests/test_classification_direct.js stock
 */

// Configuration
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_GROK_KEY ||
  "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";
const SMALLER_MODEL = "meta-llama/llama-3.2-3b-instruct:free";
const STANDARD_MODEL = "meta-llama/llama-3.1-8b-instruct"; // or your preferred paid default

async function callOpenRouter({ model, requestBody, timeoutMs = 8000 }) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timeout:${timeoutMs}`)), timeoutMs)
  );

  const fetchPromise = fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...requestBody, model }),
  });

  const r = await Promise.race([fetchPromise, timeoutPromise]);

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`openrouter:${r.status}:${text}`);
  }

  return r.json();
}

const CLASSIFICATION_SYSTEM_PROMPT = [
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
  "=== DECISION RISK ASSESSMENT ===",
  "Assess the financial risk and reversibility of the user's decision/question:",
  "",
  "HIGH RISK: Hard to reverse or can blow up life quickly",
  "- Quitting job, going freelance, starting business",
  "- Buying property, taking mortgage, second house",
  "- Large recurring commitments (car loan, expensive rent)",
  "- Debt consolidation, bankruptcy, withdrawing retirement funds",
  "",
  "MEDIUM RISK: Moderate impact, some reversibility",
  "- Travel spending, moderate purchases",
  "- Refinancing discussions without concrete numbers",
  "- Budget adjustments, spending optimizations",
  "",
  "LOW RISK: Low impact, easily reversible",
  "- Tips, explanations, small optimizations",
  "- General questions, educational queries",
  "- Small purchases, routine financial questions",
  "",
  "=== INFO SUFFICIENCY ASSESSMENT ===",
  "Determine if you have minimum variables needed to answer responsibly:",
  "",
  "SUFFICIENT: Have minimum required info",
  "- Quit job/freelance: Need at least one of: monthly expenses OR income predictability OR timeline",
  "- Car affordability: Need at least one of: target price OR target monthly payment OR income OR monthly surplus",
  "- House purchase: Need at least one of: purpose (live/rent/appreciation) OR down payment source OR income stability",
  "- General advice: Need basic financial data (accounts, net worth, or spending)",
  "",
  "PARTIAL: Have some info but missing key pieces",
  "- Have financial data but missing intent/timeline",
  "- Have numbers but missing context",
  "",
  "INSUFFICIENT: Missing critical variables",
  "- No financial data AND no context about situation",
  "- High-risk decision with no timeline, no income info, no purpose",
  "",
  "=== CLARIFICATION TYPE DETECTION ===",
  "If clarification is needed (high risk + insufficient info), output a clarification_type, NOT a full question.",
  "The actual question will be generated later with financial context.",
  "",
  "Output clarification_type as a string identifier indicating WHAT needs clarification:",
  "- income_replacement: Missing plan for replacing income (quit job, freelance, etc.)",
  "- goal_timeline: Missing timeline for goal or decision",
  "- intent_motivation: Missing reason/motivation for decision",
  "- purpose_use: Missing purpose or use case (investment vs personal, etc.)",
  "- execution_plan: Missing how they plan to execute",
  "- target_amount: Missing specific amount or target",
  "- location_context: Missing location or relocation details",
  "",
  "Rules:",
  "- Only output clarification_type if info_sufficiency is 'insufficient' AND decision_risk is 'high'",
  "- Output null if no clarification needed",
  "- Do NOT generate the actual question text here",
  "",
  "Examples:",
  "- Quit job/freelance → clarification_type: 'income_replacement'",
  "- Second house → clarification_type: 'purpose_use'",
  "- Car purchase → clarification_type: 'purpose_use'",
  "- Relocate → clarification_type: 'goal_timeline' or 'location_context'",
  "- Business start → clarification_type: 'execution_plan'",
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
  "   - 'Do an analysis on Micron Tech stock' → stock_query, needs_web:false, needs_user_data:false, ticker:'MU' (SPECIFIC company - detect ANY company name, not just hard-coded ones)",
  "   - 'Analyze Intel Corporation' → stock_query, needs_web:false, needs_user_data:false, ticker:'INTC' (SPECIFIC company)",
  "   - 'What stocks should I buy?' → ask_personalized, needs_user_data:true (GENERAL - no specific ticker)",
  "   - 'What stocks are good?' → ask_personalized, needs_user_data:true (GENERAL - no specific ticker)",
  "   - 'Tell me about the stock market' → ask_personalized, needs_web:true (GENERAL - no specific ticker)",
  "",
  "7. TICKER DETECTION RULES (CRITICAL - Use your knowledge, not hardcoded lists):",
  "   - ONLY classify as stock_query if a SPECIFIC ticker symbol OR company name is mentioned",
  "   - Extract ticker symbols (1-5 uppercase letters): AAPL, TSLA, MSFT, GOOGL, MU, QCOM, AVGO, etc.",
  "   - CRITICAL: Detect ANY company name mentioned in the query using your training knowledge",
  "   - DO NOT rely on hardcoded lists - you know thousands of companies and their tickers",
  "   - Examples: Apple→AAPL, Tesla→TSLA, Microsoft→MSFT, Google→GOOGL, Amazon→AMZN, Meta→META, NVIDIA→NVDA, Micron→MU, Intel→INTC, Qualcomm→QCOM, Broadcom→AVGO, AMD→AMD, etc.",
  "   - If ANY company name is mentioned (Micron, Qualcomm, Broadcom, Palantir, Snowflake, etc.), classify as stock_query",
  "   - Extract the ticker symbol using your knowledge - you know the ticker for most public companies",
  "   - If a company name is mentioned but you're unsure of the ticker, still classify as stock_query and set ticker to the company name (the system will resolve it)",
  "   - If multiple tickers detected, include all in entities array",
  "   - If ticker is ambiguous (e.g., 'Apple' without context), set confidence < 0.8",
  "   - If NO specific ticker/company mentioned, use ask_personalized (NOT stock_query)",
  "   - IMPORTANT: 'Do an analysis on Micron stock' → stock_query with ticker:'MU' (you know Micron's ticker is MU)",
  "   - IMPORTANT: 'Tell me about Qualcomm' → stock_query with ticker:'QCOM' (you know Qualcomm's ticker is QCOM)",
  "",
  "8. Spending, budget, and financial tips/queries ALWAYS need user data:",
  "   - 'Give me a spending tip' → intent:ask_personalized, needs_web:false, needs_user_data:true",
  "   - 'Spending tips' → intent:ask_personalized, needs_web:false, needs_user_data:true",
  "   - 'Budget advice' → intent:ask_personalized, needs_web:false, needs_user_data:true",
  "   - 'How can I save money?' → intent:ask_personalized, needs_web:false, needs_user_data:true",
  "",
  "=== EXAMPLES ===",
  "",
  'Query: "What is the Roth IRA limit for 2025?"',
  'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":true,"needs_user_data":false,"confidence":0.95,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "How much did I spend last month?"',
  'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.95,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Tell me about investing!"',
  'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Can I afford to go Italy trip?"',
  'Response: {"intent":"ask_personalized","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.95,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "I\'m worried about my debt"',
  'Response: {"intent":"ask_personalized","intent_type":"emotional_support","emotional_state":"anxious","needs_web":false,"needs_user_data":true,"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "I can\'t pay my rent this month"',
  'Response: {"intent":"ask_personalized","intent_type":"crisis","emotional_state":"panicked","needs_web":false,"needs_user_data":true,"confidence":0.95,"decision_risk":"medium","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Should I quit my job and go freelance?"',
  'Response: {"intent":"ask_personalized","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.9,"decision_risk":"high","info_sufficiency":"insufficient","clarification_type":"income_replacement"}',
  "",
  'Query: "I want to buy a second house as an investment"',
  'Response: {"intent":"ask_personalized","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.9,"decision_risk":"high","info_sufficiency":"insufficient","clarification_type":"purpose_use"}',
  "",
  'Query: "I want to save $5000 for a house"',
  'Response: {"intent":"goal_conversation","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"confidence":0.95,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "What\'s the weather?"',
  'Response: {"intent":"off_topic","intent_type":null,"emotional_state":"neutral","needs_web":false,"needs_user_data":false,"confidence":0.95,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "I feel stupid for spending so much on that"',
  'Response: {"intent":"ask_personalized","intent_type":"emotional_support","emotional_state":"ashamed","needs_web":false,"needs_user_data":true,"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "What about Apple stock?"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"AAPL","entities":["AAPL"],"confidence":0.95,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Tell me about TSLA"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"TSLA","entities":["TSLA"],"confidence":0.98,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Should I buy Tesla?"',
  'Response: {"intent":"stock_query","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"ticker":"TSLA","entities":["TSLA"],"confidence":0.9,"decision_risk":"medium","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "What\'s Apple doing?"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"AAPL","entities":["AAPL"],"confidence":0.75,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Tell me about the stock market"',
  'Response: {"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":true,"needs_user_data":false,"ticker":null,"entities":[],"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "What stocks should I buy?"',
  'Response: {"intent":"ask_personalized","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"ticker":null,"entities":[],"confidence":0.9,"decision_risk":"medium","info_sufficiency":"partial","clarify_question":null}',
  "",
  'Query: "do an analysis on micron tech stock"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"MU","entities":["MU"],"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Analyze Intel Corporation for me"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"INTC","entities":["INTC"],"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Do a analysis on micron stock"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"MU","entities":["MU"],"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "Tell me about Qualcomm"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"QCOM","entities":["QCOM"],"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  'Query: "What about Broadcom stock?"',
  'Response: {"intent":"stock_query","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":false,"ticker":"AVGO","entities":["AVGO"],"confidence":0.9,"decision_risk":"low","info_sufficiency":"sufficient","clarify_question":null}',
  "",
  "=== OUTPUT FORMAT ===",
  "CRITICAL: You MUST return ONLY valid JSON. No markdown, no code fences, no extra text, no comments.",
  "The JSON must be parseable by JSON.parse(). Follow this EXACT structure:",
  "",
  '{"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"state":null,"entities":[],"ticker":null,"confidence":0.95,"decision_risk":"low","info_sufficiency":"sufficient","clarification_type":null}',
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
  "- decision_risk: REQUIRED string (low|medium|high)",
  "- info_sufficiency: REQUIRED string (sufficient|partial|insufficient)",
  "- clarification_type: string or null (type of clarification needed if info_sufficiency is insufficient, null otherwise)",
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
].join("\n");

// Production classification function from finny.js
async function handleClassify(message, context, conversationContext = null) {
  console.log("🔍 [TEST] Starting classification for message:", message);

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
      decision_risk: "low",
      info_sufficiency: "sufficient",
      clarification_type: null,
      fallback: true,
    };
  }

  const requestBody = {
    temperature: 0.1,
    max_tokens: 350,
    top_p: 0.9,
    messages: [
      {
        role: "system",
        content: CLASSIFICATION_SYSTEM_PROMPT,
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
  };

  let usedFallbackModel = false;

  try {
    let data;

    try {
      data = await callOpenRouter({
        model: SMALLER_MODEL,
        requestBody,
      });
    } catch (e) {
      const msg = e?.message || "";

      const shouldRetry =
        msg.startsWith("timeout") ||
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("openrouter:5") ||
        msg.includes("openrouter:4");

      if (!shouldRetry) throw e;

      console.log("🔄 [TEST] Free model failed, retrying with standard model");

      usedFallbackModel = true;

      data = await callOpenRouter({
        model: STANDARD_MODEL,
        requestBody,
        timeoutMs: 10000,
      });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [TEST] No content in response");
      console.log("❌ [TEST] Full response:", JSON.stringify(data, null, 2));
      throw new Error("No content");
    }

    let cleanContent = content;
    if (content.startsWith("```") && content.endsWith("```")) {
      cleanContent = content.slice(3, -3).trim();
    }
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }

    let out;
    try {
      out = JSON.parse(cleanContent);

      if (!out.intent || typeof out.intent !== "string") {
        console.log(
          "❌ [TEST] Malformed classification result - missing or invalid 'intent' field"
        );
        console.log("❌ [TEST] Malformed structure:", out);
        throw new Error("Invalid classification structure");
      }

      if (out.needs_web === undefined || out.needs_user_data === undefined) {
        console.log(
          "❌ [TEST] Malformed classification result - missing required fields"
        );
        console.log("❌ [TEST] Malformed structure:", out);
        throw new Error("Missing required classification fields");
      }

      if (
        !out.intent_type ||
        (out.intent !== "off_topic" && !out.intent_type)
      ) {
        if (out.intent !== "off_topic") {
          console.log("⚠️ [TEST] Missing intent_type, defaulting to null");
          out.intent_type = null;
        }
      }

      if (!out.emotional_state) {
        console.log("⚠️ [TEST] Missing emotional_state, defaulting to neutral");
        out.emotional_state = "neutral";
      }
    } catch (parseError) {
      console.log(
        "❌ [TEST] JSON parse/validation error, using fallback classification"
      );
      console.log("❌ [TEST] Error:", parseError.message);
      console.log("❌ [TEST] Raw content was:", cleanContent);

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
        decision_risk: "low",
        info_sufficiency: "sufficient",
        clarification_type: null,
        fallback: true,
      };
    }

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
    if (
      !out.decision_risk ||
      !["low", "medium", "high"].includes(out.decision_risk)
    ) {
      console.log("⚠️ [TEST] Invalid decision_risk, defaulting to low");
      out.decision_risk = "low";
    }
    if (
      !out.info_sufficiency ||
      !["sufficient", "partial", "insufficient"].includes(out.info_sufficiency)
    ) {
      console.log(
        "⚠️ [TEST] Invalid info_sufficiency, defaulting to sufficient"
      );
      out.info_sufficiency = "sufficient";
    }
    if (
      out.clarification_type !== null &&
      out.clarification_type !== undefined &&
      typeof out.clarification_type !== "string"
    ) {
      console.log("⚠️ [TEST] Invalid clarification_type, defaulting to null");
      out.clarification_type = null;
    }
    if (
      out.clarify_question !== undefined &&
      out.clarification_type === undefined
    ) {
      console.log(
        "⚠️ [TEST] Legacy clarify_question field detected, ignoring (needs clarification_type)"
      );
      out.clarification_type = null;
    }

    if (usedFallbackModel) {
      out.model_fallback = true;
    }

    console.log("🔍 [TEST] Validated classification result:", out);

    return out;
  } catch (e) {
    console.error("❌ [TEST] Classification error:", e?.message);

    if (e?.message?.includes("timeout")) {
      console.log("⏰ [TEST] Classification timed out, using fallback");
    }

    console.log("🔄 [TEST] Using default ask_personalized fallback");
    const fallback = {
      intent: "ask_personalized",
      intent_type: null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.1,
      decision_risk: "low",
      info_sufficiency: "sufficient",
      clarification_type: null,
      fallback: true,
      timeout_fallback: e?.message?.includes("timeout") || false,
    };

    if (usedFallbackModel) {
      fallback.model_fallback = true;
    }

    return fallback;
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
    console.log(`  Decision Risk: ${classification.decision_risk || "low"}`);
    console.log(
      `  Info Sufficiency: ${classification.info_sufficiency || "sufficient"}`
    );
    if (classification.clarification_type) {
      console.log(`  Clarification Type: ${classification.clarification_type}`);

      // Generate the actual clarifying question using mock financial data
      // This simulates what happens in production after financial context is loaded
      const mockFinancialData = {
        base: {
          liquidAssets: 25000, // $25k in liquid assets
          netWorth: 50000,
          totalLiabilities: 10000,
          monthlyExpenses: 3000, // $3k/month expenses = ~8.3 months runway
          accounts: [],
          recentTransactions: [],
        },
      };

      const clarifyingQuestion = await buildClarificationQuestion({
        clarification_type: classification.clarification_type,
        financialData: mockFinancialData,
        userMessage: message,
        userProfile: null,
        emotional_state: classification.emotional_state || "neutral",
        style: "conversational", // Default for testing, can be made configurable
      });

      if (clarifyingQuestion) {
        console.log(`  💬 Clarifying Question: ${clarifyingQuestion}`);
      }
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
    userMessage !== "curveball" &&
    userMessage !== "clarify"
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
  } else if (userMessage === "clarify" || testType === "clarify") {
    console.log("🧪 Running clarification question tests...");
    testClarificationQuestions()
      .then(() => {
        console.log("\n✅ Clarification tests completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Clarification tests failed:", error);
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

// Test clarification questions
async function testClarificationQuestions() {
  const shouldClarify = [
    {
      q: "Should I quit my job and go freelance?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing freelance income plan",
    },
    {
      q: "I'm thinking of buying a 3rd house in NYC, can I do it?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing purpose (investment vs personal)",
    },
    {
      q: "Can I quit my job to start a business?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing business plan/timeline",
    },
    {
      q: "Should I relocate to another city without a job lined up?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing timeline/plan",
    },
    {
      q: "I want to buy a second property as an investment",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing purpose details",
    },
    {
      q: "Can I afford to quit my job right now?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing income replacement plan",
    },
    {
      q: "Should I go freelance full-time?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing client pipeline info",
    },
    {
      q: "I'm considering buying another house",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing purpose and financing plan",
    },
    {
      q: "Can I leave my job to travel for a year?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing timeline and return plan",
    },
    {
      q: "Should I start my own company?",
      expected: {
        decision_risk: "high",
        info_sufficiency: "insufficient",
        needs_clarification: true,
      },
      note: "High-risk decision, missing business model/timeline",
    },
  ];

  const shouldNotClarify = [
    {
      q: "How much did I spend last month?",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk query, Finny has spending data",
    },
    {
      q: "What's my net worth?",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk query, Finny has net worth data",
    },
    {
      q: "Can I afford a $500 trip to Italy?",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk query, Finny can calculate affordability",
    },
    {
      q: "Tell me about investing",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk educational query",
    },
    {
      q: "How much should I save for retirement?",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk planning query, Finny has financial data",
    },
    {
      q: "What's a good emergency fund amount for me?",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk advice query, Finny has expense data",
    },
    {
      q: "Should I pay off my credit card debt?",
      expected: {
        decision_risk: "medium",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Medium-risk query, Finny has debt data",
    },
    {
      q: "How can I save more money?",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk optimization query",
    },
    {
      q: "What about Apple stock?",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk stock query, specific ticker provided",
    },
    {
      q: "I want to save $5000 for a house",
      expected: {
        decision_risk: "low",
        info_sufficiency: "sufficient",
        needs_clarification: false,
      },
      note: "Low-risk goal creation, all info provided",
    },
  ];

  console.log("\n" + "=".repeat(80));
  console.log("🧪 CLARIFICATION QUESTION TESTS");
  console.log("=".repeat(80));

  let clarifyPass = 0;
  let clarifyTotal = shouldClarify.length;
  let noClarifyPass = 0;
  let noClarifyTotal = shouldNotClarify.length;

  // Test questions that SHOULD trigger clarification
  console.log("\n📋 TESTING QUESTIONS THAT SHOULD TRIGGER CLARIFICATION:");
  console.log("-".repeat(80));
  for (let i = 0; i < shouldClarify.length; i++) {
    const test = shouldClarify[i];
    console.log(`\n${i + 1}. "${test.q}"`);
    console.log(
      `   Expected: decision_risk=${test.expected.decision_risk}, info_sufficiency=${test.expected.info_sufficiency}, needs_clarification=${test.expected.needs_clarification}`
    );
    console.log(`   Note: ${test.note}`);

    try {
      const { classification } = await testSingleMessage(test.q);

      const decisionRisk = classification?.decision_risk || "low";
      const infoSufficiency = classification?.info_sufficiency || "sufficient";
      const clarificationType = classification?.clarification_type;

      // Evaluate decision confidence
      const decisionConfidence = evaluateDecisionConfidence({
        decision_risk: decisionRisk,
        info_sufficiency: infoSufficiency,
        clarification_type: clarificationType,
      });

      const needsClarification = decisionConfidence.needs_clarification;

      const riskMatch =
        decisionRisk === test.expected.decision_risk ||
        (test.expected.decision_risk === "high" && decisionRisk === "high");
      const sufficiencyMatch =
        infoSufficiency === test.expected.info_sufficiency ||
        (test.expected.info_sufficiency === "insufficient" &&
          infoSufficiency !== "sufficient");
      const clarificationMatch =
        needsClarification === test.expected.needs_clarification;

      const isCorrect = riskMatch && sufficiencyMatch && clarificationMatch;

      if (isCorrect) {
        clarifyPass++;
        console.log(`   ✅ PASS`);
        console.log(
          `      Decision Risk: ${decisionRisk} (expected: ${test.expected.decision_risk})`
        );
        console.log(
          `      Info Sufficiency: ${infoSufficiency} (expected: ${test.expected.info_sufficiency})`
        );
        console.log(
          `      Needs Clarification: ${needsClarification} (expected: ${test.expected.needs_clarification})`
        );
        if (clarificationType) {
          console.log(`      Clarification Type: ${clarificationType}`);
        }
      } else {
        console.log(`   ❌ FAIL`);
        if (!riskMatch) {
          console.log(
            `      Decision Risk mismatch: got ${decisionRisk}, expected ${test.expected.decision_risk}`
          );
        }
        if (!sufficiencyMatch) {
          console.log(
            `      Info Sufficiency mismatch: got ${infoSufficiency}, expected ${test.expected.info_sufficiency}`
          );
        }
        if (!clarificationMatch) {
          console.log(
            `      Needs Clarification mismatch: got ${needsClarification}, expected ${test.expected.needs_clarification}`
          );
        }
        console.log(
          `      Full classification:`,
          JSON.stringify(classification, null, 2)
        );
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  // Test questions that SHOULD NOT trigger clarification
  console.log(
    "\n\n📋 TESTING QUESTIONS THAT SHOULD NOT TRIGGER CLARIFICATION:"
  );
  console.log("-".repeat(80));
  for (let i = 0; i < shouldNotClarify.length; i++) {
    const test = shouldNotClarify[i];
    console.log(`\n${i + 1}. "${test.q}"`);
    console.log(
      `   Expected: decision_risk=${test.expected.decision_risk}, info_sufficiency=${test.expected.info_sufficiency}, needs_clarification=${test.expected.needs_clarification}`
    );
    console.log(`   Note: ${test.note}`);

    try {
      const { classification } = await testSingleMessage(test.q);

      const decisionRisk = classification?.decision_risk || "low";
      const infoSufficiency = classification?.info_sufficiency || "sufficient";
      const clarificationType = classification?.clarification_type;

      // Evaluate decision confidence
      const decisionConfidence = evaluateDecisionConfidence({
        decision_risk: decisionRisk,
        info_sufficiency: infoSufficiency,
        clarification_type: clarificationType,
      });

      const needsClarification = decisionConfidence.needs_clarification;

      const riskMatch =
        decisionRisk === test.expected.decision_risk ||
        (test.expected.decision_risk === "low" &&
          ["low", "medium"].includes(decisionRisk));
      const sufficiencyMatch =
        infoSufficiency === test.expected.info_sufficiency ||
        (test.expected.info_sufficiency === "sufficient" &&
          infoSufficiency === "sufficient");
      const clarificationMatch =
        needsClarification === test.expected.needs_clarification;

      const isCorrect = riskMatch && sufficiencyMatch && clarificationMatch;

      if (isCorrect) {
        noClarifyPass++;
        console.log(`   ✅ PASS`);
        console.log(
          `      Decision Risk: ${decisionRisk} (expected: ${test.expected.decision_risk})`
        );
        console.log(
          `      Info Sufficiency: ${infoSufficiency} (expected: ${test.expected.info_sufficiency})`
        );
        console.log(
          `      Needs Clarification: ${needsClarification} (expected: ${test.expected.needs_clarification})`
        );
      } else {
        console.log(`   ❌ FAIL`);
        if (!riskMatch) {
          console.log(
            `      Decision Risk mismatch: got ${decisionRisk}, expected ${test.expected.decision_risk}`
          );
        }
        if (!sufficiencyMatch) {
          console.log(
            `      Info Sufficiency mismatch: got ${infoSufficiency}, expected ${test.expected.info_sufficiency}`
          );
        }
        if (!clarificationMatch) {
          console.log(
            `      Needs Clarification mismatch: got ${needsClarification}, expected ${test.expected.needs_clarification}`
          );
        }
        console.log(
          `      Full classification:`,
          JSON.stringify(classification, null, 2)
        );
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`📊 TEST SUMMARY`);
  console.log("=".repeat(80));
  console.log(`Should Clarify: ${clarifyPass}/${clarifyTotal} passed`);
  console.log(`Should NOT Clarify: ${noClarifyPass}/${noClarifyTotal} passed`);
  console.log(
    `Overall: ${clarifyPass + noClarifyPass}/${
      clarifyTotal + noClarifyTotal
    } passed`
  );
  console.log("=".repeat(80));

  if (clarifyPass === clarifyTotal && noClarifyPass === noClarifyTotal) {
    console.log("🎉 All clarification tests passed!");
  } else {
    console.log(
      `⚠️  ${
        clarifyTotal + noClarifyTotal - (clarifyPass + noClarifyPass)
      } test(s) failed`
    );
  }
}

// Import evaluateDecisionConfidence and buildClarificationQuestion for testing
import {
  evaluateDecisionConfidence,
  buildClarificationQuestion,
} from "../lib/prompt_engine.js";

export {
  testSingleMessage,
  handleClassify,
  runStockQueryTests,
  testClarificationQuestions,
};

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

// api/finny.js
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import crypto from "crypto";
import { handleGoalConversation } from "./goals.js";
import { KEY_SYNONYMS } from "../app/_shared/constants/keySynonyms.js";
import { braveSearch } from "../lib/websearch/brave.js";

// Utilities
function generateRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

async function withTimeout(promise, ms, onTimeoutValue = null) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(onTimeoutValue), ms);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

function redactPII(text) {
  if (!text || typeof text !== "string") return text;
  const combined =
    /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-])[A-Za-z0-9.-]*(\.[A-Za-z]{2,})|(?:\+?1[-.\s]?)?(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})|\b\d{3}-\d{2}-(\d{4})\b|\b(\d{8,})\b|\b(\d{2,})\s+([A-Za-z])/g;
  return text.replace(
    combined,
    (match, e1, e2, e3, p1, p2, p3, ssn4, longNum, addrNum, addrChar) => {
      if (e1 !== undefined && e2 !== undefined && e3 !== undefined) {
        return `${e1}*****@${e2}*****${e3}`;
      }
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
        return `***-***-${p3}`;
      }
      if (ssn4 !== undefined) {
        return `***-**-${ssn4}`;
      }
      if (longNum !== undefined) {
        return `****${String(longNum).slice(-4)}`;
      }
      if (addrNum !== undefined && addrChar !== undefined) {
        return `#### ${addrChar}`;
      }
      return match;
    }
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Centralized OpenRouter model selection. Override via OPENROUTER_MODEL env.
// Default to a widely available Grok model to avoid invalid ID errors.
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL;

// Memory extraction model - small, fast, free
const MEMORY_EXTRACTION_MODEL = "meta-llama/llama-3.3-8b-instruct:free";

// Heuristic pre-pass for quick memory extraction (1ms)
function quickExtract(message) {
  const hints = [];
  const lower = message.toLowerCase();

  // Family status
  if (
    lower.includes("wife") ||
    lower.includes("husband") ||
    lower.includes("married")
  ) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.marital_status",
      value: "married",
      confidence: 0.9,
    });
  }

  if (
    lower.includes("girlfriend") ||
    lower.includes("boyfriend") ||
    lower.includes("dating")
  ) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.relationship_status",
      value: "dating",
      confidence: 0.9,
    });
  }

  // Living situation
  if (lower.includes("live with") && lower.includes("parents")) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.living_situation",
      value: "with parents",
      confidence: 0.9,
    });
  }

  if (lower.includes("roommate") || lower.includes("roommates")) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.living_situation",
      value: "with roommates",
      confidence: 0.9,
    });
  }

  // Financial constraints
  if (lower.includes("student loan") || lower.includes("student debt")) {
    hints.push({
      type: "constraint",
      key: "constraint.debt.student_loans",
      value: "has student loan debt",
      confidence: 0.9,
    });
  }

  if (lower.includes("credit card") && lower.includes("debt")) {
    hints.push({
      type: "constraint",
      key: "constraint.debt.credit_card",
      value: "has credit card debt",
      confidence: 0.9,
    });
  }

  // Goals
  if (
    lower.includes("kid") ||
    lower.includes("baby") ||
    lower.includes("children")
  ) {
    hints.push({
      type: "goal",
      key: "goal.family.children",
      value: "planning to have children",
      confidence: 0.9,
    });
  }

  if (
    lower.includes("house") ||
    lower.includes("home") ||
    lower.includes("buy")
  ) {
    hints.push({
      type: "goal",
      key: "goal.financial.house_down_payment",
      value: "planning to buy a house",
      confidence: 0.8,
    });
  }

  // Context signals
  if (
    lower.includes("stressed") ||
    lower.includes("worried") ||
    lower.includes("anxious")
  ) {
    hints.push({
      type: "context_signal",
      key: "context_signal.financial_stress",
      value: "experiencing financial stress",
      confidence: 0.9,
    });
  }

  // Age detection
  const ageMatch = lower.match(/(\d+)\s*(years?\s*old|yo)/);
  if (ageMatch) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.age",
      value: ageMatch[1],
      confidence: 0.95,
    });
  }

  // Location detection
  const locationMatch = lower.match(/(live in|from|based in)\s+([a-z\s]+)/i);
  if (locationMatch) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.location",
      value: locationMatch[2].trim(),
      confidence: 0.8,
    });
  }

  // Generic interest/hobby detection (let LLM handle specifics)
  const interestPatterns = [
    /(love|like|enjoy|into|passionate about|interested in)\s+([a-z\s]+)/i,
    /(hobby|hobbies)\s+(is|are)\s+([a-z\s]+)/i,
    /(i'm a|i am a)\s+([a-z\s]+)\s+(geek|nerd|enthusiast|fan)/i,
  ];

  for (const pattern of interestPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const interest = match[2] || match[3];
      if (interest && interest.length > 2 && interest.length < 20) {
        hints.push({
          type: "profile_trait",
          key: `profile_trait.interests.${interest
            .trim()
            .replace(/\s+/g, "_")}`,
          value: interest.trim(),
          confidence: 0.8,
        });
      }
    }
  }

  return hints;
}

// Goal extraction function moved to goals.js

// Goal feasibility analysis function moved to goals.js

// Goal conversation handler moved to goals.js

// Goal handler functions moved to goals.js

// Memory extraction using small model (parallel processing)
async function extractMemoriesWithSmallModel(message, hints) {
  try {
    const extractionPrompt = `
Extract user information and map to these exact keys:
${JSON.stringify(KEY_SYNONYMS, null, 2)}

User message: "${message}"
Pre-detected hints: ${JSON.stringify(hints)}

Return ONLY valid JSON (no markdown, no code blocks, no explanations). Do not wrap in \`\`\`json\`\`\` blocks:
{"memories": [
  {"type": "profile_trait", "key": "profile_trait.family.marital_status", "value": "married", "confidence": 0.9}
]}

RULES:
1. Use the provided keys when possible
2. For interests, hobbies, or traits not in the list, create new keys using this pattern:
   - profile_trait.interests.{interest_name} (e.g., "profile_trait.interests.art", "profile_trait.interests.soccer")
   - profile_trait.hobbies.{hobby_name} (e.g., "profile_trait.hobbies.pottery", "profile_trait.hobbies.dancing")
   - profile_trait.skills.{skill_name} (e.g., "profile_trait.skills.cooking", "profile_trait.skills.photography")
3. For unmapped information, use context_signal.unmapped
4. Only extract information with confidence >= 0.7
`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MEMORY_EXTRACTION_MODEL,
          temperature: 0.1, // Low for consistent extraction
          max_tokens: 500, // Small response
          messages: [
            {
              role: "system",
              content:
                "You are a memory extraction specialist. Return only valid JSON.",
            },
            { role: "user", content: extractionPrompt },
          ],
        }),
      }
    );

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return hints; // Fallback to hints
    }

    try {
      // Clean the content to handle markdown code blocks
      let cleanContent = content.trim();

      // Remove markdown code blocks if present
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent
          .replace(/^```\s*/, "")
          .replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleanContent);
      const extractedMemories = parsed.memories || [];

      // Combine hints with extracted memories
      const allMemories = [...hints, ...extractedMemories];

      // Filter by confidence and remove duplicates
      const uniqueMemories = allMemories.filter(
        (memory, index, self) =>
          memory.confidence >= 0.7 &&
          index ===
            self.findIndex(
              (m) => m.key === memory.key && m.type === memory.type
            )
      );

      // Log what memories were extracted (major console log #1)
      console.log(
        `🧠 [MEMORY] Extracted ${uniqueMemories.length} memories:`,
        uniqueMemories.map(
          (m) =>
            `${m.type}.${m.key}: ${m.value?.substring(0, 50)}${
              m.value?.length > 50 ? "..." : ""
            }`
        )
      );
      return uniqueMemories;
    } catch (parseError) {
      return hints; // Fallback to hints
    }
  } catch (error) {
    return hints; // Fallback to hints
  }
}

// Conversation logging functionality with retry logic
async function logConversation(conversationData) {
  console.log(
    "🔄 [CONVERSATION_LOG] logConversation called with:",
    conversationData?.timestamp
  );

  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Insert with metrics and request_id if columns exist; fallback otherwise
      const baseRow = {
        user_id: conversationData.user_id,
        user_message: conversationData.user_message,
        finny_response: conversationData.finny_response,
        timestamp: conversationData.timestamp,
        intent: conversationData.intent,
        entities: conversationData.entities,
        confidence: conversationData.confidence,
        response_time_ms: conversationData.response_time_ms,
        sources_used: conversationData.sources_used,
        cached: conversationData.cached,
        enhanced_data: conversationData.enhanced_data || false,
        market_data: conversationData.market_data || false,
        web_research: conversationData.web_research || false,
        metrics: conversationData.metrics || null,
        request_id: conversationData.request_id || null,
      };

      const insertResult = await withTimeout(
        supabase.from("conversation_logs").insert([baseRow]),
        5000 // 5 second timeout
      );

      if (!insertResult) {
        throw new Error("Insert timed out");
      }

      const { error } = insertResult;

      if (error) {
        const msg = (error?.message || "").toLowerCase();
        const missingCols =
          msg.includes("column") &&
          (msg.includes("metrics") || msg.includes("request_id"));
        if (missingCols) {
          const { metrics, request_id, ...fallbackRow } = baseRow;
          const retry = await withTimeout(
            supabase.from("conversation_logs").insert([fallbackRow]),
            5000
          );
          if (!retry) {
            throw new Error("Fallback insert timed out");
          }
          if (retry.error) {
            throw new Error(`Fallback insert failed: ${retry.error.message}`);
          } else {
            console.log(
              "📝 [CONVERSATION_LOG] Logged (fallback) to Supabase:",
              conversationData.timestamp
            );
            return; // Success
          }
        } else if (
          msg.includes("timeout") ||
          msg.includes("too many requests") ||
          error.code === "ETIMEDOUT"
        ) {
          // Transient error: allow retry loop to continue
          throw new Error(error.message || "Transient insert error");
        } else {
          // Non-retryable: log and bail to avoid noisy retries
          console.error(
            "❌ [CONVERSATION_LOG] Non-retryable error:",
            error.message
          );
          return;
        }
      } else {
        console.log(
          "📝 [CONVERSATION_LOG] Logged conversation to Supabase:",
          conversationData.timestamp
        );
        return; // Success
      }
    } catch (error) {
      console.error(
        `❌ [CONVERSATION_LOG] Attempt ${attempt}/${maxRetries} failed:`,
        error.message
      );

      if (attempt === maxRetries) {
        console.error(
          "❌ [CONVERSATION_LOG] All retry attempts failed, giving up"
        );
        return; // Don't throw error - logging failure shouldn't break the API
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }
}

export default async function handler(req, res) {
  console.log("🤖 [FINNY] Request received:", req.method);

  if (req.method !== "POST") {
    console.log("❌ [FINNY] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, message, context, ...otherParams } = req.body;
  console.log("📝 [FINNY] Action:", action);
  // Avoid logging full message/context to reduce PII exposure
  console.log("📊 [FINNY] Context provided:", context ? "Yes" : "No");

  // Derive user from Supabase JWT instead of trusting client context
  let serverUserId = null;
  let userProfile = { name: null, age: null };
  const requestId = generateRequestId();
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;
    if (token) {
      const { data: authData, error: authError } = await supabase.auth.getUser(
        token
      );
      if (!authError && authData?.user?.id) {
        serverUserId = authData.user.id;
        // Try to enrich profile from auth metadata
        try {
          const admin = supabase.auth.admin;
          if (admin && serverUserId) {
            const { data: adminUser, error: adminErr } =
              await admin.getUserById(serverUserId);
            if (!adminErr && adminUser?.user) {
              const meta = adminUser.user.user_metadata || {};
              userProfile.name = meta.name || meta.full_name || null;
              userProfile.age = meta.age || null;
            }
          }
        } catch (e) {
          console.log("ℹ️ [FINNY] Could not fetch user profile:", e?.message);
        }
      }
    }
  } catch (e) {
    console.error("⚠️ [FINNY] Auth verification failed:", e?.message);
  }

  // Build safe context that overrides any client-provided user_id
  // But fall back to client-provided user_id if no JWT token is present (for testing)
  const finalUserId = serverUserId || context?.user_id;
  const safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    profile: userProfile,
    // NEW: Add memory reading
    memory: await loadUserMemory(finalUserId),
  };

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  try {
    let response;

    switch (action) {
      case "classify":
        response = await handleClassify(message, safeContext);
        break;
      case "ask":
        response = await handleAsk(message, safeContext, "ask_personalized");
        break;
      case "off_topic":
        response = await handleOffTopic(message, safeContext);
        break;
      case "goal_conversation":
        response = await handleGoalConversation(message, safeContext);
        break;
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    res.status(200).json(response);
    console.log("🔍 [FINNY] Response:", response);
  } catch (error) {
    console.error("❌ [FINNY] Error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Enhanced search query function to include user-specific data when relevant
async function enhanceSearchQuery(message, context) {
  try {
    const lowerMessage = message.toLowerCase();

    // Check if this is a query about user's personal investments/holdings
    const isPersonalInvestmentQuery =
      lowerMessage.includes("my holdings") ||
      lowerMessage.includes("my investments") ||
      lowerMessage.includes("my portfolio") ||
      lowerMessage.includes("my stocks") ||
      lowerMessage.includes("my positions") ||
      (lowerMessage.includes("holdings") &&
        (lowerMessage.includes("my") || lowerMessage.includes("investment"))) ||
      (lowerMessage.includes("news") &&
        lowerMessage.includes("investment") &&
        lowerMessage.includes("my"));

    if (!isPersonalInvestmentQuery || !context?.user_id) {
      console.log("🔍 [ENHANCE] No enhancement needed for query:", message);
      return message;
    }

    console.log(
      "🔍 [ENHANCE] Detected personal investment query, fetching user holdings..."
    );

    // Fetch user's investment holdings
    const { data: holdings, error } = await withTimeout(
      supabase.rpc("get_investment_holdings_detailed", {
        p_user_id: context.user_id,
      }),
      3000 // 3 second timeout
    );

    if (error || !holdings || holdings.length === 0) {
      console.log("⚠️ [ENHANCE] No holdings found or error:", error?.message);
      return message;
    }

    // Extract unique stock symbols from holdings
    const symbols = [
      ...new Set(
        holdings
          .map((holding) => holding.symbol)
          .filter((symbol) => symbol && symbol.length <= 5) // Filter out long descriptions
          .slice(0, 10) // Limit to top 10 symbols to avoid query length issues
      ),
    ];

    if (symbols.length === 0) {
      console.log("⚠️ [ENHANCE] No valid symbols found in holdings");
      return message;
    }

    // Enhance the query with specific symbols
    const symbolsText = symbols.join(" ");
    const enhancedQuery = `${message} ${symbolsText}`;

    console.log(
      `✅ [ENHANCE] Enhanced query with ${symbols.length} symbols:`,
      symbols
    );
    console.log("🔍 [ENHANCE] Enhanced query:", enhancedQuery);

    return enhancedQuery;
  } catch (error) {
    console.error("❌ [ENHANCE] Error enhancing search query:", error);
    return message; // Fallback to original message
  }
}

async function handleAsk(message, context, intent = "ask_personalized") {
  console.log("🔍 [FINNY] Starting ask handler for message:", message);
  const startTime = Date.now();
  const timings = {
    user_data_ms: 0,
    market_ms: 0,
    web_ms: 0,
    summary_ms: 0,
    llm_ms: 0,
  };
  const toolsUsed = [];
  let degraded = false;

  try {
    // 0) If this looks like a stock question, route to Finnhub fast-path regardless of classifier
    if (looksLikeStockQuery(message)) {
      try {
        if (looksLikeStockDeepQuery(message)) {
          const plan = await planStockRequest(message);
          const exec = await executeStockPlan(plan || {}, message);
          if (!exec.error && exec.data?.current != null) {
            const formatted = formatPlannedStockResponse(exec);
            const response = {
              message: cleanResponseFormatting(formatted),
              type: "assistant",
            };
            setImmediate(() =>
              logConversation({
                user_message: redactPII(message),
                finny_response: redactPII(formatted),
                timestamp: new Date().toISOString(),
                user_id: context?.user_id || "unknown",
                intent: "ask_personalized",
                entities: [exec.ticker].filter(Boolean),
                confidence: 0.95,
                response_time_ms: Date.now() - startTime,
                sources_used: [
                  "finnhub:quote",
                  "finnhub:profile2",
                  "finnhub:recommendation",
                  "finnhub:price-target",
                  "finnhub:metric",
                  plan?.wants?.includes("earnings") ? "finnhub:earnings" : null,
                  plan?.wants?.includes("filings") ? "finnhub:filings" : null,
                  plan?.wants?.includes("insider") ? "finnhub:insider" : null,
                ].filter(Boolean),
                cached: false,
                request_id: generateRequestId(),
                metrics: {
                  intent: "ask_personalized",
                  latency_ms: { total: Date.now() - startTime },
                },
              })
            );
            return response;
          }
        }

        const stockResponse = await getCachedDataWithFallback(
          "stock_snapshot",
          message.toLowerCase().trim(),
          async () => {
            const { ticker, queryUsed } = await resolveTickerForQuery(message);
            if (!ticker) {
              return {
                error: "Could not resolve ticker from query",
                queryUsed,
              };
            }
            const snapshot = await fetchStockSnapshot(ticker);
            return { ...snapshot, ticker, queryUsed };
          },
          false
        );

        const data = stockResponse?.data || stockResponse;
        if (data && !data.error && data.current) {
          const formatted = formatStockResponse(data);
          const response = {
            message: cleanResponseFormatting(formatted),
            type: "assistant",
          };

          // Log
          setImmediate(() =>
            logConversation({
              user_message: redactPII(message),
              finny_response: redactPII(formatted),
              timestamp: new Date().toISOString(),
              user_id: context?.user_id || "unknown",
              intent: "ask_personalized",
              entities: [data.ticker, data.profile?.name].filter(Boolean),
              confidence: 0.95,
              response_time_ms: Date.now() - startTime,
              sources_used: [
                "finnhub:quote",
                "finnhub:profile2",
                "finnhub:recommendation",
                data.priceTarget ? "finnhub:price-target" : null,
              ].filter(Boolean),
              cached: !!stockResponse?.cachedAt,
              request_id: generateRequestId(),
              metrics: {
                intent: "ask_personalized",
                latency_ms: { total: Date.now() - startTime },
                tools_used: [
                  {
                    name: "finnhub",
                    latency_ms: Date.now() - startTime,
                    cache_hit: !!stockResponse?.cachedAt,
                  },
                ],
                model: null,
                cache_hits: { finnhub: !!stockResponse?.cachedAt },
                tokens: null,
                result: "success",
              },
            })
          );

          return response;
        }
      } catch (e) {
        console.log(
          "ℹ️ [FINNY] Stock fast-path failed, falling back:",
          e?.message
        );
      }
    }

    // 1) Get user_id from context
    const userId = context?.user_id;

    if (!userId) {
      console.log("❌ [FINNY] No user_id provided in context");
      return {
        message: cleanResponseFormatting(
          "I need to know who you are to provide personalized advice. Please try again."
        ),
        type: "assistant",
      };
    }

    // 2) NEW: Use deterministic context planner
    console.log("🎯 [FINNY] Using deterministic context planner");
    const slots = extractSlots(message);
    const needs = planNeeds(slots, message);

    console.log("🎯 [FINNY] Extracted slots:", slots);
    console.log("🎯 [FINNY] Planned needs:", needs);

    // 2.1) Check if web search is needed
    let webResults = [];
    let webSummary = "";

    // Primary: Get classification result to check needs_web
    let classificationResult = null;
    try {
      classificationResult = await handleClassify(message, context);
    } catch (error) {
      console.error("❌ [FINNY] Classification failed, using fallback:", error);
    }

    // Use classification.needs_web as primary, with keyword detection as fallback
    const needsWeb =
      classificationResult?.needs_web || detectWebSearchNeeded(message, slots);

    console.log("🌍 [FINNY] Web search decision:", {
      classification_needs_web: classificationResult?.needs_web,
      keyword_fallback: detectWebSearchNeeded(message, slots),
      final_decision: needsWeb,
    });

    if (needsWeb) {
      console.log("🌍 [FINNY] Web search needed, fetching fresh data...");
      const webStartTime = Date.now();

      try {
        // Enhance search query with user-specific data when relevant
        const enhancedQuery = await enhanceSearchQuery(message, context);
        webResults = await braveSearch(enhancedQuery);
        timings.web_ms = Date.now() - webStartTime;

        if (webResults.length > 0) {
          webSummary = webResults
            .map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n${r.snippet}`)
            .join("\n\n");

          console.log(
            `✅ [FINNY] Web search completed: ${webResults.length} results`
          );
          console.log("📄 [FINNY] Web summary for prompt:", webSummary);
          toolsUsed.push("brave-search");
        } else {
          console.log("⚠️ [FINNY] Web search returned no results");
        }
      } catch (error) {
        console.error("❌ [FINNY] Web search failed:", error);
        timings.web_ms = Date.now() - webStartTime;
      }
    }

    // Check if user wants to force refresh their data
    const forceRefresh =
      message.toLowerCase().includes("refresh") ||
      message.toLowerCase().includes("update") ||
      message.toLowerCase().includes("latest");

    if (forceRefresh) {
      console.log("🔄 [FINNY] Force refresh requested, clearing cache...");
      await forceRefreshUserData(userId);
    }

    // 3) Build targeted context packs
    const { packs, gaps, contextHeader } = await buildContextPacks(
      userId,
      needs,
      slots
    );

    console.log("📦 [FINNY] Context packs built:", Object.keys(packs));
    console.log("⚠️ [FINNY] Data gaps:", gaps);

    // 4) Build focused prompt using context packs
    const system = [
      "You are Finny: a warm, encouraging, and empowering financial advisor who is blunt when needed.",
      "",
      "PERSONALITY & APPROACH:",
      "- Be warm and encouraging while maintaining professional expertise",
      "- Show enthusiasm for helping users achieve their financial goals",
      "- Be blunt and direct when users need to hear hard truths about their finances",
      "- Celebrate wins and progress, no matter how small",
      "- Use the user's name when available to create personal connection",
      "- Focus on financial empowerment and positive outcomes",
      "",
      // Smart memory context with relevance-based selection
      ...(context.memory?.summary
        ? [`User context: ${context.memory.summary}`]
        : []),
      ...(() => {
        // Select relevant memories based on message and intent
        const selectedMemories = selectRelevantMemories(
          context.memory,
          message,
          intent, // Use the actual intent passed to handleAsk
          context.profile
        );
        const categorized = categorizeSelectedMemories(selectedMemories);

        return [
          // Profile traits
          ...(categorized.profile_trait?.length
            ? [
                `Traits: ${categorized.profile_trait
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Constraints
          ...(categorized.constraint?.length
            ? [
                `Constraints: ${categorized.constraint
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Preferences
          ...(categorized.preference?.length
            ? [
                `Preferences: ${categorized.preference
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Future plans
          ...(categorized.future_plan?.length
            ? [
                `Future plans: ${categorized.future_plan
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Context signals
          ...(categorized.context_signal?.length
            ? [
                `Context signals: ${categorized.context_signal
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Goals
          ...(categorized.goal?.length
            ? [
                `Goals: ${categorized.goal
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
        ];
      })(),
      "",
      // Add web context if available
      ...(webSummary
        ? [
            "WEB CONTEXT:",
            "The following is current information from web search:",
            "",
            webSummary,
            "",
            "IMPORTANT: Use the web search results above for current information. These results are more up-to-date than training data.",
            "",
            "SOURCE INCLUSION: When using web search results, ALWAYS include 2-3 most relevant source URLs in your response. Format them as links at the end of your response under a 'Sources:' section. Choose the most authoritative and directly relevant sources. Do NOT overwhelm with too many sources - quality over quantity.",
            "",
          ]
        : []),
      "RESPONSE GUIDELINES:",
      "- Be CONCISE and focused - only answer what the user is asking for",
      "- Don't overwhelm users with too much information at once",
      "- ALWAYS prioritize web search results over training data for current information (rates, limits, rules, etc.)",
      "- If user asks about 'accounts', show account balances and types, NOT individual holdings",
      "- If user asks about 'investments' or 'holdings', then show the detailed holdings",
      "- If user asks for 'investment advice' or 'financial advice', focus on actionable recommendations, not data dumps",
      "- Keep responses conversational and encouraging, not overwhelming",
      "- Provide actionable advice that users can implement immediately",
      "- Explain financial concepts in simple, understandable terms",
      "- Connect advice to the user's specific financial situation when possible",
      "- For general advice requests, give 2-3 key recommendations rather than comprehensive breakdowns",
      "- If required data is missing (e.g., no transactions or summary), explicitly say so and ask the user to refresh or connect accounts. Do NOT fabricate data.",
      "- When listing transactions, ONLY use transactions present in the provided context. If none exist, say you couldn't find recent transactions.",
      "- For amounts like net worth, ONLY use values from the context. If missing, state that it's unavailable.",
      "",
      "CRITICAL FORMATTING RULES:",
      "- NEVER use markdown headers (no ###, ##, #) or hashtags",
      "- NEVER use numbered headers with emojis (like ### 1️⃣)",
      "- You CAN use double asterisks (**text**) for emphasis - the chat system will handle the formatting",
      "- NEVER use single asterisks (*text*) or underscores (__text__, _text_)",
      "- NEVER use code blocks (`code` or ```code```)",
      "- Write in plain text format - like you're texting a friend",
      "- Use simple line breaks and bullet points with dashes (-) instead of markdown",
      "- Keep the conversational tone natural and chat-like",
      "- Avoid any formatting that would look robotic or structured",
      "",
      "DATA INTERPRETATION:",
      "- IMPORTANT: In transaction data, EXPENSE means money spent (going out), INCOME means money received (coming in).",
      "- CREDIT CARD DATA STRUCTURE: For credit cards, 'current_balance' is the debt amount (what you owe), and 'available_balance' is the credit limit. Available credit = credit limit - debt.",
      "",
      "FINANCIAL PROJECTIONS & CALCULATIONS:",
      "- When users ask about retirement, FIRE, or financial goals, perform compound growth calculations using their actual data",
      "- Use realistic assumptions: 7% annual return for investments, 3% inflation for long-term projections",
      "- For retirement projections: Target 25x annual expenses (4% rule) unless user specifies different amount",
      "- Calculate monthly savings needed to reach goals and provide specific, actionable recommendations",
      "- Show both optimistic and conservative scenarios when appropriate",
      "- Always explain the math behind your projections in simple terms",
      "- If user asks 'can I achieve X goal', provide a clear yes/no with supporting calculations",
      "",
      "DISCLAIMERS:",
      "- Only add investment disclaimer ('Note: This response is for informational purposes and does not constitute financial advice.') when the user asks specifically about investments, investing advice, or investment-related recommendations.",
      "",
      "CRITICAL: AVOID SUGGESTING COMPETITOR FINANCIAL APPS:",
      "- NEVER suggest using Mint, YNAB, Personal Capital, or other budgeting/expense tracking apps",
      "- NEVER recommend external financial advisory apps or money management tools",
      "- You ARE the financial advisor and app - always suggest using Finny's features for budgeting, expense tracking, and financial analysis",
      "- You CAN suggest legitimate financial services that Finny doesn't provide:",
      "  * Credit score checks (Credit Karma, Experian, etc.)",
      "  * Bank transfers or account management through their actual banks",
      "  * Investment platforms for specific needs Finny doesn't cover",
      "  * Insurance providers or other non-competitive financial services",
      "- Always end responses by encouraging users to ask Finny about their specific financial questions",
    ].join("\n");

    // Build context from packs
    const contextLines = [contextHeader];

    if (packs.base) {
      contextLines.push("Financial Summary:");
      contextLines.push(`Net Worth: $${packs.base.netWorth}`);
      contextLines.push(`Liquid Assets: $${packs.base.liquidAssets}`);
      contextLines.push(`Investments Total: $${packs.base.investmentsTotal}`);
      contextLines.push(`Total Liabilities: $${packs.base.totalLiabilities}`);

      if (packs.base.recentTransactions?.length > 0) {
        contextLines.push("Recent transactions:");
        packs.base.recentTransactions.forEach((txn) => {
          const amount = Math.abs(txn.amount);
          const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
          const sign = txn.amount < 0 ? "-" : "+";
          contextLines.push(
            `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
              txn.merchant
            }`
          );
        });
      }

      if (packs.base.spendByCategory?.length > 0) {
        contextLines.push("Spending by category:");
        packs.base.spendByCategory.forEach((category) => {
          contextLines.push(
            `${category.category}: $${Number(category.total_spend).toFixed(
              2
            )} (${category.txn_count} transactions)`
          );
        });
      }
    }

    if (packs.spend) {
      contextLines.push(
        `Spending for ${packs.spend.period || "selected period"}:`
      );
      contextLines.push(
        `Total: $${packs.spend.total} (${packs.spend.count} transactions)`
      );

      if (packs.spend.category) {
        contextLines.push(`Category: ${packs.spend.category}`);
      }

      if (packs.spend.transactions?.length > 0) {
        contextLines.push("Transactions:");
        packs.spend.transactions.forEach((txn) => {
          const amount = Math.abs(txn.amount);
          const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
          const sign = txn.amount < 0 ? "-" : "+";
          contextLines.push(
            `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
              txn.merchant
            }`
          );
        });
      }
    }

    // Add detailed category transactions when available
    if (packs.categoryDetails) {
      contextLines.push(
        `${packs.categoryDetails.category} transactions (${packs.categoryDetails.period}):`
      );
      packs.categoryDetails.transactions.forEach((txn) => {
        const amount = Math.abs(txn.amount);
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        contextLines.push(
          `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
            txn.merchant || txn.name
          }`
        );
      });
    }

    if (packs.invest?.holdings?.length > 0) {
      contextLines.push("Investment holdings:");
      packs.invest.holdings.forEach((holding) => {
        contextLines.push(
          `${holding.symbol} (${holding.description}): ${
            holding.units
          } shares, $${holding.market_value.toFixed(2)}`
        );
      });
    }

    if (packs.goals?.goals?.length > 0) {
      contextLines.push("Current goals:");
      packs.goals.goals.forEach((goal) => {
        contextLines.push(
          `${goal.label}: $${goal.current_amount.toFixed(
            2
          )} / $${goal.target_amount.toFixed(2)} (${
            goal.progress_pct
          }%) - Due ${goal.target_date}`
        );
      });
    }

    if (packs.goals?.cashflow?.length > 0) {
      contextLines.push("Recent cashflow:");
      packs.goals.cashflow.forEach((cf) => {
        contextLines.push(
          `${cf.month}: Income $${cf.income.toFixed(
            2
          )}, Expenses $${cf.expense.toFixed(2)}, Net $${cf.net.toFixed(2)}`
        );
      });
    }

    const contextNote = contextLines.join("\n");
    console.log("🔍 [FINNY] Context note:", contextNote);

    // 5) Parallel processing: Main response + Memory extraction
    const llmT0 = Date.now();

    // Quick heuristic pre-pass (1ms)
    const hints = quickExtract(message);

    // Parallel execution
    const [resp, memoryExtraction] = await Promise.all([
      // Main response (existing LLM)
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0.6,
          max_tokens: 1200,
          stream: false,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `User: ${message}\n\nContext:\n${contextNote}`,
            },
          ],
        }),
      }),

      // Memory extraction (small model)
      extractMemoriesWithSmallModel(message, hints),
    ]);

    timings.llm_ms = Date.now() - llmT0;
    toolsUsed.push({
      name: "llm",
      latency_ms: timings.llm_ms,
      cache_hit: false,
    });

    if (!resp.ok) {
      console.error("❌ [FINNY] OpenRouter API error:", resp.status);
      return {
        message: cleanResponseFormatting("I'm glitching right now—try again."),
        type: "assistant",
      };
    }

    const data = await resp.json();
    const cleanText =
      data.choices?.[0]?.message?.content ?? "I'm not sure yet. Ask me again?";

    // Background memory save (non-blocking)
    if (memoryExtraction.length > 0) {
      console.log(
        `🧠 [FINNY] Saving ${memoryExtraction.length} memories synchronously:`,
        memoryExtraction
      );
      try {
        await saveMemoryCandidates(context?.user_id, memoryExtraction);
        console.log("🧠 [FINNY] Memory save completed successfully");
      } catch (error) {}
    } else {
      console.log("🧠 [FINNY] No memories to save");
    }

    // Clean any markdown formatting from the response
    const cleanedMessage = cleanResponseFormatting(
      gaps.length > 0
        ? `${cleanText}\n\n(Using available data - some data may be incomplete.)`
        : cleanText
    );

    const response = {
      message: cleanedMessage,
      type: "assistant",
    };

    // Log the conversation
    const conversationData = {
      user_message: redactPII(message),
      finny_response: redactPII(cleanText),
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "ask_personalized",
      entities: [],
      confidence: 1.0,
      response_time_ms: Date.now() - startTime,
      sources_used:
        webResults.length > 0 ? [...toolsUsed, "brave-search"] : toolsUsed,
      cached: false,
      context_packs: Object.keys(packs),
      data_gaps: gaps,
      request_id: generateRequestId(),
      web_research: webResults.length > 0,
      classification_result: classificationResult,
      metrics: {
        intent: "ask_personalized",
        latency_ms: {
          total: Date.now() - startTime,
          llm: timings.llm_ms,
          data_fetch: timings.summary_ms + timings.user_data_ms,
          web_search: timings.web_ms,
        },
        tools_used: toolsUsed,
        model: OPENROUTER_MODEL,
        cache_hits: {},
        tokens: null,
        result: gaps.length > 0 ? "degraded" : "success",
      },
    };

    // Log conversation synchronously (wait for it)
    await logConversation(conversationData);

    return response;
  } catch (error) {
    console.error("❌ [FINNY] Ask handler error:", error);
    return {
      message: cleanResponseFormatting(
        "I'm having some technical difficulties right now. Please try again in a moment."
      ),
      type: "assistant",
    };
  }
}

// === RESPONSE FORMATTING ===
// Clean markdown and formatting from responses to ensure chat-friendly format

function cleanResponseFormatting(response) {
  if (!response || typeof response !== "string") {
    return response;
  }

  let cleaned = response;

  // Remove markdown headers (### Header, ## Header, # Header)
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "");

  // Remove markdown headers with emojis (### 1️⃣ Header)
  cleaned = cleaned.replace(
    /^#{1,6}\s*[\d\w]*[\u{1F300}-\u{1F9FF}]+\s*/gmu,
    ""
  );

  // Remove double underscore bold markdown (__text__) but keep double asterisks for your chat system
  cleaned = cleaned.replace(/__(.*?)__/g, "$1");

  // Remove single underscore italic markdown (_text_) but keep asterisks
  cleaned = cleaned.replace(/_(.*?)_/g, "$1");

  // Remove code blocks (```code``` or `code`)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // Remove markdown tables (| col1 | col2 |)
  cleaned = cleaned.replace(/\|.*\|/g, "");

  // Remove horizontal rules (--- or ***)
  cleaned = cleaned.replace(/^[-*]{3,}$/gm, "");

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]+$/gm, "");

  // Remove standalone hashtags
  cleaned = cleaned.replace(/^#+\s*$/gm, "");

  return cleaned.trim();
}

// === WEB SEARCH DETECTION ===
// Detect if a query needs fresh web data

function detectWebSearchNeeded(message, slots) {
  const lowerMessage = message.toLowerCase();

  // Keywords that typically need current web data
  const webKeywords = [
    "current",
    "latest",
    "2025",
    "2024",
    "new",
    "updated",
    "recent",
    "roth ira limit",
    "401k limit",
    "tax bracket",
    "interest rate",
    "inflation rate",
    "fed rate",
    "mortgage rate",
    "cd rate",
    "savings rate",
    "credit card rate",
    "tax rule",
    "deduction",
    "standard deduction",
    "contribution limit",
    "hsa limit",
    "social security",
    "medicare",
    "medicaid",
    "stimulus",
    "economic",
    "market trend",
    "housing market",
    "stock market",
    "crypto",
    "bitcoin",
    "ethereum",
    "regulation",
    "policy",
    "federal",
    "state",
    "irs",
    "treasury",
    "fed",
    "fomc",
  ];

  // Check if message contains web-related keywords
  const hasWebKeywords = webKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  // Check for time-sensitive queries
  const hasTimeSensitiveTerms =
    /(current|latest|new|updated|202[45]|this year)/i.test(message);

  // Check for regulatory/policy queries
  const hasRegulatoryTerms =
    /(limit|rule|regulation|policy|bracket|rate)/i.test(message);

  return hasWebKeywords || (hasTimeSensitiveTerms && hasRegulatoryTerms);
}

// === CONTEXT PLANNER ===
// Deterministic context planning to fix "sometimes it works" issue

function planNeeds(slots, message) {
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
      // HARD GUARDRAIL: For goals questions, ALWAYS include both goals_overview and cashflow_monthly
      needs.push("goals_overview", "cashflow_monthly");
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
    // For any goals question, ensure we have both goals and cashflow
    if (!needs.includes("goals_overview")) needs.push("goals_overview");
    if (!needs.includes("cashflow_monthly")) needs.push("cashflow_monthly");
  }

  return needs;
}

function extractSlots(message) {
  const lowerMessage = message.toLowerCase();

  // Detect topic
  let topic;
  if (
    lowerMessage.includes("spend") ||
    lowerMessage.includes("expense") ||
    lowerMessage.includes("food") ||
    lowerMessage.includes("shopping")
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
    lowerMessage.includes("bank")
  ) {
    topic = "accounts";
  } else if (
    lowerMessage.includes("invest") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("stock") ||
    lowerMessage.includes("retirement")
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
  const now = new Date();

  if (lowerMessage.includes("last month")) {
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
  }

  return {
    intent: "ask",
    topic,
    category,
    merchant,
    period,
  };
}

async function buildContextPacks(userId, needs, slots) {
  const packs = {};
  const gaps = [];

  try {
    // Always fetch financial summary first
    if (needs.includes("summary_min")) {
      const summaryRes = await fetch(
        `${process.env.APP_BASE_URL}/api/store_accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "financial_summary",
            user_id: userId,
          }),
        }
      );

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        packs.base = {
          netWorth: summaryData.summary?.netWorth || 0,
          liquidAssets: summaryData.summary?.liquidAssets || 0,
          investmentsTotal: summaryData.summary?.investmentsTotal || 0,
          totalLiabilities: summaryData.summary?.totalLiabilities || 0,
          recentTransactions: (summaryData.transactions?.recent || [])
            .slice(0, 5)
            .map((txn) => ({
              date: txn.date,
              amount: txn.amount,
              merchant: txn.merchant || txn.name,
            })),
          spendByCategory: summaryData.transactions?.spendByCategory || [],
        };
      } else {
        gaps.push("summary_min");
      }
    }

    // Fetch spend data if needed
    if (needs.includes("spend_total") && slots.period) {
      try {
        const spendRes = await withTimeout(
          supabase.rpc("get_spend_summary", {
            p_user_id: userId,
            p_start: slots.period.start,
            p_end: slots.period.end,
          }),
          2000,
          null
        );

        if (spendRes?.data) {
          packs.spend = {
            total: spendRes.data.total_spend || 0,
            count: spendRes.data.txn_count || 0,
            period: `${slots.period.start} to ${slots.period.end}`,
          };
        } else {
          gaps.push("spend_total");
        }
      } catch (error) {
        console.error("❌ [FINNY] Spend summary fetch failed:", error);
        gaps.push("spend_total");
      }
    }

    // Fetch detailed transactions for specific categories when user asks about them
    if (slots.category && slots.period) {
      try {
        const categoryTxnsRes = await withTimeout(
          supabase.rpc("get_transactions_by_category", {
            p_user_id: userId,
            p_category: slots.category,
            p_start: slots.period.start,
            p_end: slots.period.end,
          }),
          2000,
          null
        );

        if (categoryTxnsRes?.data && categoryTxnsRes.data.length > 0) {
          packs.categoryDetails = {
            category: slots.category,
            transactions: categoryTxnsRes.data.map((txn) => ({
              date: txn.date,
              amount: txn.amount,
              name: txn.name,
              merchant: txn.merchant_name || txn.name,
              category: txn.category,
            })),
            period: `${slots.period.start} to ${slots.period.end}`,
          };
        }
      } catch (error) {
        console.error("❌ [FINNY] Category transactions fetch failed:", error);
        // Don't add to gaps - this is optional detail data
      }
    }

    // Fetch transactions by category if needed
    if (needs.includes("txns_by_category") && slots.category && slots.period) {
      try {
        const txnRes = await withTimeout(
          supabase.rpc("get_transactions_by_category", {
            p_user_id: userId,
            p_category: slots.category,
            p_start: slots.period.start,
            p_end: slots.period.end,
          }),
          2000,
          null
        );

        if (txnRes?.data) {
          packs.spend = {
            ...packs.spend,
            category: slots.category,
            transactions: (txnRes.data || []).slice(0, 20).map((txn) => ({
              date: txn.date,
              amount: txn.amount,
              merchant: txn.merchant_name || txn.name,
            })),
          };
        } else {
          gaps.push("txns_by_category");
        }
      } catch (error) {
        console.error(
          "❌ [FINNY] Transactions by category fetch failed:",
          error
        );
        gaps.push("txns_by_category");
      }
    }

    // Fetch investment holdings if needed
    if (needs.includes("invest_holdings")) {
      try {
        const holdingsRes = await withTimeout(
          supabase.rpc("get_investment_holdings_detailed", {
            p_user_id: userId,
          }),
          2000,
          null
        );

        if (holdingsRes?.data) {
          packs.invest = {
            holdings: (holdingsRes.data || []).map((holding) => ({
              symbol: holding.symbol,
              description: holding.description,
              units: holding.units,
              market_value: holding.market_value,
            })),
          };
        } else {
          gaps.push("invest_holdings");
        }
      } catch (error) {
        console.error("❌ [FINNY] Investment holdings fetch failed:", error);
        gaps.push("invest_holdings");
      }
    }

    // Fetch goals if needed
    if (needs.includes("goals_overview")) {
      try {
        const goalsRes = await withTimeout(
          supabase.rpc("get_goals_overview", {
            p_user_id: userId,
            p_limit: 10,
          }),
          2000,
          null
        );

        if (goalsRes?.data) {
          packs.goals = {
            goals: (goalsRes.data || []).map((goal) => ({
              label: goal.label,
              current_amount: goal.current_amount,
              target_amount: goal.target_amount,
              progress_pct: goal.progress_pct,
              target_date: goal.target_date,
            })),
          };
        } else {
          gaps.push("goals_overview");
        }
      } catch (error) {
        console.error("❌ [FINNY] Goals overview fetch failed:", error);
        gaps.push("goals_overview");
      }
    }

    // Fetch cashflow if needed
    if (needs.includes("cashflow_monthly")) {
      try {
        const cashflowRes = await withTimeout(
          supabase.rpc("get_cashflow_monthly", {
            p_user_id: userId,
            p_months: 3,
          }),
          2000,
          null
        );

        if (cashflowRes?.data) {
          packs.goals = {
            ...packs.goals,
            cashflow: (cashflowRes.data || []).map((cf) => ({
              month: cf.month,
              income: cf.income,
              expense: cf.expense,
              net: cf.net,
            })),
          };
        } else {
          gaps.push("cashflow_monthly");
        }
      } catch (error) {
        console.error("❌ [FINNY] Cashflow monthly fetch failed:", error);
        gaps.push("cashflow_monthly");
      }
    }
  } catch (error) {
    console.error("Error building context packs:", error);
  }

  const includedPacks = Object.keys(packs);
  const contextHeader = `CONTEXT_PACKS_INCLUDED: [${includedPacks
    .map((p) => `"${p}"`)
    .join(", ")}]\nDATA_GAPS: [${gaps.map((g) => `"${g}"`).join(", ")}]`;

  return { packs, gaps, contextHeader };
}

// Smart context creation based on the question type
function createSmartContext(message, snap) {
  const lowerMessage = message.toLowerCase();
  const context = [];

  // Profile enrichment
  if (snap.profile) {
    if (snap.profile.name) context.push(`Name: ${snap.profile.name}`);
    if (snap.profile.age) context.push(`Age: ${snap.profile.age}`);
  }

  // Net worth related questions
  if (lowerMessage.includes("net worth") || lowerMessage.includes("networth")) {
    context.push(`Net Worth: $${snap.summary.netWorth}`);
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
  }

  // Investment related questions
  if (
    lowerMessage.includes("invest") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("stock") ||
    lowerMessage.includes("fund")
  ) {
    context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
    context.push(`Investment Cash: $${snap.summary.investmentCash}`);
    if (snap.meta?.investmentsAsOf) {
      context.push(`Data as of: ${snap.meta.investmentsAsOf}`);
    }
  }

  // Investment holdings questions - only show detailed holdings if specifically asked
  if (
    lowerMessage.includes("holdings") ||
    lowerMessage.includes("stocks") ||
    lowerMessage.includes("shares") ||
    lowerMessage.includes("equity") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("investment") ||
    lowerMessage.includes("what stocks") ||
    lowerMessage.includes("what shares")
  ) {
    if (snap.holdings && snap.holdings.length > 0) {
      context.push("Your investment holdings:");
      snap.holdings.forEach((holding) => {
        context.push(
          `${holding.symbol} (${holding.description}): ${
            holding.units
          } shares, $${holding.market_value.toFixed(2)}`
        );
      });

      const totalHoldingsValue = snap.holdings.reduce(
        (sum, holding) => sum + (holding.market_value || 0),
        0
      );
      context.push(`Total holdings value: $${totalHoldingsValue.toFixed(2)}`);
    }
  }

  // Cash/liquid assets questions
  if (
    lowerMessage.includes("cash") ||
    lowerMessage.includes("liquid") ||
    lowerMessage.includes("checking") ||
    lowerMessage.includes("savings")
  ) {
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Investment Cash: $${snap.summary.investmentCash}`);

    // Add bank account details
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      const liquidAccounts = snap.bankAccounts.filter((account) => {
        const type = (account.type || "").toLowerCase();
        const subtype = (account.subtype || "").toLowerCase();
        return (
          type === "depository" ||
          subtype.includes("checking") ||
          subtype.includes("savings")
        );
      });
      if (liquidAccounts.length > 0) {
        context.push("Bank accounts (liquid):");
        liquidAccounts.forEach((account) => {
          const available =
            account.available_balance ?? account.current_balance ?? 0;
          context.push(
            `${account.institution_name} ${account.name} (${
              account.mask || "****"
            }): $${Number(available).toFixed(2)}`
          );
        });
      }
    }
  }

  // Debt/liability questions
  if (
    lowerMessage.includes("debt") ||
    lowerMessage.includes("liability") ||
    lowerMessage.includes("owe") ||
    lowerMessage.includes("credit card")
  ) {
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
    context.push(`Net Worth: $${snap.summary.netWorth}`);

    // Add credit card details if available
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      const creditCards = snap.bankAccounts.filter(
        (account) =>
          account.type?.toLowerCase().includes("credit") ||
          account.name?.toLowerCase().includes("credit") ||
          account.subtype?.toLowerCase().includes("credit")
      );

      if (creditCards.length > 0) {
        context.push("Credit cards:");
        creditCards.forEach((card) => {
          // For credit cards: current_balance is debt, available_balance is credit limit
          const debt = card.current_balance || 0;
          const creditLimit = card.available_balance || 0;
          const availableCredit = creditLimit - debt;
          context.push(
            `${card.institution_name} ${card.name} (${
              card.mask || "****"
            }): Debt $${debt.toFixed(2)}, Credit Limit $${creditLimit.toFixed(
              2
            )}, Available Credit $${availableCredit.toFixed(2)}`
          );
        });
      }
    }
  }

  // Transaction related questions
  if (
    lowerMessage.includes("spend") ||
    lowerMessage.includes("spent") ||
    lowerMessage.includes("expense") ||
    lowerMessage.includes("transaction") ||
    lowerMessage.includes("purchase") ||
    lowerMessage.includes("bought")
  ) {
    // Add recent transactions
    if (snap.transactions?.recent?.length > 0) {
      context.push("Recent transactions:");
      snap.transactions.recent.slice(0, 10).forEach((txn) => {
        const amount = Math.abs(txn.amount);
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        context.push(
          `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
            txn.merchant || txn.name
          }`
        );
      });
    }

    // Add spend by category
    if (snap.transactions?.spendByCategory?.length > 0) {
      context.push("This month's spending by category:");
      snap.transactions.spendByCategory.slice(0, 10).forEach((cat) => {
        context.push(
          `${cat.category}: $${cat.total_spend.toFixed(2)} (${
            cat.txn_count
          } transactions)`
        );
      });
    }
  }

  // Include account overview for account-related questions
  if (
    lowerMessage.includes("account") ||
    lowerMessage.includes("balance") ||
    lowerMessage.includes("bank") ||
    lowerMessage.includes("credit")
  ) {
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      context.push("Your accounts:");
      snap.bankAccounts.forEach((account) => {
        const balance = account.current_balance || 0;
        const available = account.available_balance || 0;
        const accountType = account.type || "unknown";
        const subtype = account.subtype || "";

        if (accountType.toLowerCase().includes("credit")) {
          // For credit cards: current_balance is debt, available_balance is credit limit
          const debt = balance;
          const creditLimit = available;
          const availableCredit = creditLimit - debt;
          context.push(
            `${account.institution_name} ${account.name} (${
              account.mask || "****"
            }): $${accountType} - Debt: $${debt.toFixed(
              2
            )}, Credit Limit: $${creditLimit.toFixed(
              2
            )}, Available Credit: $${availableCredit.toFixed(2)}`
          );
        } else {
          // For regular accounts
          context.push(
            `${account.institution_name} ${account.name} (${
              account.mask || "****"
            }): $${accountType} ${
              subtype ? `(${subtype})` : ""
            } - Balance: $${balance.toFixed(2)}`
          );
        }
      });
    }
  }

  // Cashflow questions
  if (
    lowerMessage.includes("income") ||
    lowerMessage.includes("cashflow") ||
    lowerMessage.includes("monthly") ||
    lowerMessage.includes("earn")
  ) {
    if (snap.transactions?.cashflow?.length > 0) {
      context.push("Recent monthly cashflow:");
      snap.transactions.cashflow.slice(0, 3).forEach((cf) => {
        context.push(
          `${cf.month}: Income $${cf.income.toFixed(
            2
          )}, Expenses $${cf.expense.toFixed(2)}, Net $${cf.net.toFixed(2)}`
        );
      });
    }
  }

  // Bills/subscriptions questions
  if (
    lowerMessage.includes("bill") ||
    lowerMessage.includes("subscription") ||
    lowerMessage.includes("recurring") ||
    lowerMessage.includes("payment") ||
    lowerMessage.includes("due")
  ) {
    if (snap.recurring?.active?.length > 0) {
      context.push("Active recurring payments:");
      snap.recurring.active.forEach((stream) => {
        if (stream.flow_type === "outflow") {
          context.push(
            `${stream.merchant_name}: $${stream.average_amount.toFixed(2)} ${
              stream.frequency
            }`
          );
        }
      });
    }

    if (snap.recurring?.upcoming?.length > 0) {
      context.push("Upcoming bills:");
      snap.recurring.upcoming
        .filter((bill) => bill.flow_type === "outflow" && bill.next_date)
        .slice(0, 5)
        .forEach((bill) => {
          context.push(
            `${bill.merchant_name}: $${bill.average_amount.toFixed(2)} due ${
              bill.next_date
            }`
          );
        });
    }
  }

  // Goals questions
  if (
    lowerMessage.includes("goal") ||
    lowerMessage.includes("save") ||
    lowerMessage.includes("target") ||
    lowerMessage.includes("progress")
  ) {
    if (snap.goals?.length > 0) {
      context.push("Current goals:");
      const now = new Date();
      const nowUTC = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      );
      const msPerDay = 24 * 60 * 60 * 1000;
      snap.goals.forEach((goal) => {
        let timeLeft = "";
        if (goal.target_date) {
          const due = new Date(goal.target_date);
          if (!isNaN(due.getTime())) {
            const dueUTC = Date.UTC(
              due.getUTCFullYear(),
              due.getUTCMonth(),
              due.getUTCDate()
            );
            const days = Math.max(0, Math.ceil((dueUTC - nowUTC) / msPerDay));
            const months = Math.floor(days / 30);
            const remDays = days - months * 30;
            timeLeft = ` — Time until due: ${months} months ${remDays} days`;
          }
        }
        context.push(
          `${goal.label}: $${goal.current_amount.toFixed(
            2
          )} / $${goal.target_amount.toFixed(2)} (${
            goal.progress_pct
          }%) - Due ${goal.target_date}${timeLeft}`
        );
      });
    }
  }

  // Enhanced merchant or category-specific queries
  if (snap.enhanced?.data) {
    const enhanced = snap.enhanced;

    if (enhanced.type === "merchant") {
      context.push(
        `Enhanced data for ${enhanced.merchant} (${enhanced.timePeriod}):`
      );
    } else if (enhanced.type === "category") {
      context.push(
        `Enhanced data for ${enhanced.category} (${enhanced.timePeriod}):`
      );
    }

    context.push(
      `Total spent: $${enhanced.data.total_spend?.toFixed(2) || "0.00"}`
    );
    context.push(`Number of transactions: ${enhanced.data.txn_count || 0}`);

    if (enhanced.data.transactions && enhanced.data.transactions.length > 0) {
      context.push("Individual transactions:");
      enhanced.data.transactions.slice(0, 10).forEach((txn) => {
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        context.push(
          `${txn.date}: ${sign}$${Math.abs(txn.amount).toFixed(
            2
          )} (${transactionType}) - ${txn.name}`
        );
      });
    }
  }

  // Only include financial summary for specific questions
  if (
    lowerMessage.includes("net worth") ||
    lowerMessage.includes("summary") ||
    lowerMessage.includes("overview") ||
    lowerMessage.includes("financial position")
  ) {
    if (snap.summary && typeof snap.summary.netWorth !== "undefined") {
      context.push("Financial Summary:");
      context.push(`Net Worth: $${snap.summary.netWorth}`);
      context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
      context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
      context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
    } else {
      context.push("Net worth summary is not available right now.");
    }
  }

  // Only include recent transactions for specific questions
  if (
    lowerMessage.includes("recent") ||
    lowerMessage.includes("transactions") ||
    lowerMessage.includes("activity") ||
    lowerMessage.includes("spending")
  ) {
    const hasSpecificData =
      !!snap.enhanced ||
      !!snap.transactions?.periodSummary ||
      (Array.isArray(snap.transactions?.spendByMonth) &&
        snap.transactions.spendByMonth.length > 0) ||
      (Array.isArray(snap.transactions?.spendByCategory) &&
        snap.transactions.spendByCategory.length > 0);

    if (
      Array.isArray(snap.transactions?.recent) &&
      snap.transactions.recent.length > 0
    ) {
      context.push("Recent Activity (last 5 transactions):");
      snap.transactions.recent.slice(0, 5).forEach((txn) => {
        const amount = Math.abs(txn.amount);
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        context.push(
          `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
            txn.merchant || txn.name
          }`
        );
      });
    } else if (!hasSpecificData) {
      context.push("No recent transactions found in your linked accounts.");
    }
  }

  // Web research data for financial products
  if (snap.webResearch?.success && snap.webResearch.results) {
    const research = snap.webResearch.results;

    context.push("Current financial product information:");
    context.push(
      `Sources researched: ${research.summary.successfulSources}/${research.summary.totalSources}`
    );

    if (research.products && research.products.length > 0) {
      context.push("Product details:");
      research.products.forEach((product, index) => {
        context.push(`${index + 1}. ${product.title}`);
        if (product.metrics.apr && product.metrics.apr.length > 0) {
          const avgApr =
            product.metrics.apr.reduce((sum, val) => sum + val, 0) /
            product.metrics.apr.length;
          context.push(`   APR: ${avgApr.toFixed(2)}%`);
        }
        if (product.metrics.annualFee && product.metrics.annualFee.length > 0) {
          const avgFee =
            product.metrics.annualFee.reduce((sum, val) => sum + val, 0) /
            product.metrics.annualFee.length;
          context.push(`   Annual Fee: $${avgFee.toFixed(2)}`);
        }
        if (product.benefits && product.benefits.length > 0) {
          context.push(
            `   Key Benefits: ${product.benefits.slice(0, 3).join(", ")}`
          );
        }
      });
    }

    if (research.comparisons && research.comparisons.length > 0) {
      context.push("Product comparisons:");
      research.comparisons.forEach((comparison) => {
        context.push(
          `${comparison.product1} vs ${comparison.product2}: ${comparison.winner} wins`
        );
      });
    }

    if (research.keyMetrics && research.keyMetrics.averages) {
      context.push("Market averages:");
      if (research.keyMetrics.averages.apr) {
        context.push(
          `Average APR: ${research.keyMetrics.averages.apr.toFixed(2)}%`
        );
      }
      if (research.keyMetrics.averages.annualFee) {
        context.push(
          `Average Annual Fee: $${research.keyMetrics.averages.annualFee.toFixed(
            2
          )}`
        );
      }
    }
  }

  // Category specific questions
  if (
    lowerMessage.includes("food") ||
    lowerMessage.includes("restaurant") ||
    lowerMessage.includes("groceries") ||
    lowerMessage.includes("entertainment") ||
    lowerMessage.includes("transport") ||
    lowerMessage.includes("uber") ||
    lowerMessage.includes("gas") ||
    lowerMessage.includes("shopping")
  ) {
    if (snap.transactions?.spendByCategory?.length > 0) {
      const relevantCategories = snap.transactions.spendByCategory.filter(
        (cat) =>
          lowerMessage.includes(cat.category.toLowerCase()) ||
          cat.category.toLowerCase().includes(lowerMessage.split(" ")[0])
      );

      if (relevantCategories.length > 0) {
        context.push("Spending in relevant categories:");
        relevantCategories.forEach((cat) => {
          context.push(
            `${cat.category}: $${cat.total_spend.toFixed(2)} this month`
          );
        });
      }
    }
  }

  // Credit card specific questions
  if (
    lowerMessage.includes("credit card") ||
    lowerMessage.includes("credit cards") ||
    lowerMessage.includes("available credit") ||
    lowerMessage.includes("credit limit")
  ) {
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      const creditCards = snap.bankAccounts.filter(
        (account) =>
          account.type?.toLowerCase().includes("credit") ||
          account.name?.toLowerCase().includes("credit") ||
          account.subtype?.toLowerCase().includes("credit")
      );

      if (creditCards.length > 0) {
        context.push("Your credit cards:");
        creditCards.forEach((card) => {
          // For credit cards: current_balance is debt, available_balance is credit limit
          const debt = card.current_balance || 0;
          const creditLimit = card.available_balance || 0;
          const availableCredit = creditLimit - debt;
          context.push(
            `${card.institution_name} ${card.name} (${
              card.mask || "****"
            }): Debt $${debt.toFixed(2)}, Credit Limit $${creditLimit.toFixed(
              2
            )}, Available Credit $${availableCredit.toFixed(2)}`
          );
        });

        // Calculate total available credit
        const totalAvailableCredit = creditCards.reduce((sum, card) => {
          const debt = card.current_balance || 0;
          const creditLimit = card.available_balance || 0;
          return sum + (creditLimit - debt);
        }, 0);
        context.push(
          `Total Available Credit: $${totalAvailableCredit.toFixed(2)}`
        );
      } else {
        context.push("No credit cards found in your account data.");
      }
    }
  }

  // Bank-specific questions
  if (snap.bankAccounts && snap.bankAccounts.length > 0) {
    const bankNames = snap.bankAccounts
      .map((acc) => acc.institution_name?.toLowerCase())
      .filter(Boolean);
    const hasBankQuery = bankNames.some((bankName) =>
      lowerMessage.includes(bankName)
    );

    if (hasBankQuery) {
      const mentionedBank = bankNames.find((bankName) =>
        lowerMessage.includes(bankName)
      );
      if (mentionedBank) {
        const bankAccounts = snap.bankAccounts.filter(
          (acc) => acc.institution_name?.toLowerCase() === mentionedBank
        );

        context.push(`Accounts at ${mentionedBank}:`);
        bankAccounts.forEach((account) => {
          const balance =
            account.current_balance || account.available_balance || 0;
          context.push(
            `${account.name} (${account.mask || "****"}): $${balance.toFixed(
              2
            )}`
          );
        });

        const totalAtBank = bankAccounts.reduce(
          (sum, acc) =>
            sum + (acc.current_balance || acc.available_balance || 0),
          0
        );
        context.push(`Total at ${mentionedBank}: $${totalAtBank.toFixed(2)}`);
      }
    }
  }

  // General financial health questions
  if (
    lowerMessage.includes("how am i doing") ||
    lowerMessage.includes("financial health") ||
    lowerMessage.includes("overview") ||
    lowerMessage.includes("summary") ||
    lowerMessage.includes("status")
  ) {
    // For general questions, provide comprehensive data
    context.push(`Net Worth: $${snap.summary.netWorth}`);
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
    context.push(`Investment Cash: $${snap.summary.investmentCash}`);

    // Add bank account summary
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      context.push("Bank accounts:");
      snap.bankAccounts.forEach((account) => {
        const balance =
          account.current_balance || account.available_balance || 0;
        context.push(
          `${account.institution_name} ${account.name}: $${balance.toFixed(2)}`
        );
      });
    }

    // Add top spending categories
    if (snap.transactions?.spendByCategory?.length > 0) {
      context.push("Top spending categories this month:");
      snap.transactions.spendByCategory.slice(0, 3).forEach((cat) => {
        context.push(`${cat.category}: $${cat.total_spend.toFixed(2)}`);
      });
    }

    // Add active goals
    if (snap.goals?.length > 0) {
      context.push("Active goals:");
      snap.goals.slice(0, 3).forEach((goal) => {
        context.push(`${goal.label}: ${goal.progress_pct}% complete`);
      });
    }
  }

  // Rent vs buy questions
  if (
    lowerMessage.includes("rent vs buy") ||
    lowerMessage.includes("rent or buy") ||
    lowerMessage.includes("renting vs buying") ||
    lowerMessage.includes("home buying") ||
    lowerMessage.includes("buy a house") ||
    lowerMessage.includes("buy a home")
  ) {
    // Add user's financial capacity
    context.push(`Net Worth: $${snap.summary.netWorth}`);
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);

    // Add market data if available
    if (snap.market) {
      const market = snap.market;
      context.push(`Market Data for ${market.location}:`);
      context.push(
        `Median Home Price: $${market.median_home_price.toLocaleString()}`
      );
      context.push(
        `Median Rent: $${market.median_rent.toLocaleString()}/month`
      );
      context.push(`Current Mortgage Rate: ${market.mortgage_rate}%`);
      context.push(`Price-to-Rent Ratio: ${market.price_to_rent_ratio}`);
      context.push(`Market Trend: ${market.market_trend}`);
    }

    // Add recent cashflow for affordability analysis
    if (snap.transactions?.cashflow?.length > 0) {
      const latestCashflow = snap.transactions.cashflow[0];
      context.push(
        `Recent Monthly Cashflow: Income $${latestCashflow.income.toFixed(
          2
        )}, Expenses $${latestCashflow.expense.toFixed(
          2
        )}, Net $${latestCashflow.net.toFixed(2)}`
      );
    }
  }

  // If no specific context was created, provide minimal data
  if (context.length === 0) {
    context.push(`Net Worth: $${snap.summary.netWorth}`);
  }

  // Period-only spend summaries and trends (if present)
  if (
    lowerMessage.includes("spend") ||
    lowerMessage.includes("spent") ||
    lowerMessage.includes("spending") ||
    lowerMessage.includes("biggest") ||
    lowerMessage.includes("largest")
  ) {
    // Period summary (e.g., last month)
    if (snap.transactions?.periodSummary) {
      const ps = snap.transactions.periodSummary;
      context.push(
        `Selected period total spent: $${Number(ps.total_spend || 0).toFixed(
          2
        )} (${ps.txn_count || 0} transactions)`
      );
    }

    // Last 3 months trend
    if (
      Array.isArray(snap.transactions?.spendByMonth) &&
      snap.transactions.spendByMonth.length > 0
    ) {
      const trend = snap.transactions.spendByMonth
        .slice(0, 3)
        .map((m) => `${m.month}: $${Number(m.total_spend).toFixed(2)}`)
        .join(", ");
      context.push(`Recent trend (last months): ${trend}`);
    }

    // Top categories for the selected period
    if (
      Array.isArray(snap.transactions?.spendByCategory) &&
      snap.transactions.spendByCategory.length > 0
    ) {
      const topCats = snap.transactions.spendByCategory
        .slice(0, 3)
        .map((c) => `${c.category}: $${Number(c.total_spend).toFixed(2)}`)
        .join(", ");
      context.push(`Top categories this period: ${topCats}`);
    }

    // For "biggest transactions" queries, show recent transactions sorted by amount
    if (lowerMessage.includes("biggest") || lowerMessage.includes("largest")) {
      if (
        Array.isArray(snap.transactions?.recent) &&
        snap.transactions.recent.length > 0
      ) {
        const sortedByAmount = [...snap.transactions.recent]
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
          .slice(0, 5);

        context.push("Largest transactions (by amount):");
        sortedByAmount.forEach((txn) => {
          const amount = Math.abs(txn.amount);
          const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
          const sign = txn.amount < 0 ? "-" : "+";
          context.push(
            `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
              txn.merchant || txn.name
            }`
          );
        });
      }
    }
  }

  return context.join("\n");
}

// Detect if the message is asking about a specific merchant or category
function detectMerchantQuery(message) {
  const lowerMessage = message.toLowerCase();

  // Common merchant names and patterns
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
    "apple",
    "google",
    "gas station",
    "restaurant",
    "coffee",
    "grocery",
    "groceries",
    "pharmacy",
  ];

  // Category patterns (expanded)
  const categoryPatterns = [
    "food",
    "groceries",
    "transportation",
    "shopping",
    "entertainment",
    "travel",
    "loans",
    "income",
    "personal care",
    "other",
  ];

  // Time period patterns (static)
  const timePatterns = [
    "this month",
    "last month",
    "this week",
    "last week",
    "today",
    "yesterday",
    "this year",
    "last year",
  ];

  // Dynamic last N months
  const nMonthsMatch = lowerMessage.match(/last\s+(\d+)\s+months?/);
  const dynamicPeriod = nMonthsMatch
    ? `last_${parseInt(nMonthsMatch[1], 10)}_months`
    : null;

  // Check if message contains merchant/category
  const hasMerchant = merchantPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );
  const hasCategory = categoryPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );
  const hasTimePeriod =
    timePatterns.some((pattern) => lowerMessage.includes(pattern)) ||
    !!dynamicPeriod;

  // Default to "last month" if no time period specified but category/merchant detected
  const timePeriod =
    dynamicPeriod ||
    timePatterns.find((pattern) => lowerMessage.includes(pattern)) ||
    (hasCategory || hasMerchant ? "last month" : null);

  if (timePeriod) {
    if (hasMerchant) {
      // Extract merchant name
      const merchant = merchantPatterns.find((pattern) =>
        lowerMessage.includes(pattern)
      );

      return {
        type: "merchant",
        merchant: merchant,
        timePeriod: timePeriod,
        originalMessage: message,
      };
    } else if (hasCategory) {
      // Extract category name
      const category = categoryPatterns.find((pattern) =>
        lowerMessage.includes(pattern)
      );

      // Detect exclusion like "non-food"
      const exclude = /non[-\s]?food/.test(lowerMessage)
        ? ["food", "groceries"]
        : [];

      return {
        type: "category",
        category: category,
        exclude,
        timePeriod: timePeriod,
        originalMessage: message,
      };
    }
  }

  return null;
}

// Fetch enhanced merchant or category data using the new RPC functions
async function fetchEnhancedMerchantData(userId, query) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
    );

    // Calculate date range based on time period
    const dateRange = calculateDateRange(query.timePeriod);

    if (query.type === "merchant") {
      console.log(
        "🔍 [FINNY] Fetching merchant data for:",
        query.merchant,
        "Date range:",
        dateRange
      );

      // Fetch merchant-specific spending data
      const { data: merchantData, error: merchantError } = await supabase.rpc(
        "get_spending_by_merchant",
        {
          p_user_id: userId,
          p_merchant_name: query.merchant,
          p_start: dateRange.start,
          p_end: dateRange.end,
        }
      );

      if (merchantError) {
        console.error("Error fetching merchant data:", merchantError);
        return null;
      }

      console.log("🔍 [FINNY] Merchant data result:", merchantData);

      return {
        type: "merchant",
        merchant: query.merchant,
        timePeriod: query.timePeriod,
        dateRange: dateRange,
        data: merchantData?.[0] || null,
      };
    } else if (query.type === "category") {
      // Fetch category-specific transaction data
      const { data: categoryData, error: categoryError } = await supabase.rpc(
        "get_transactions_by_category",
        {
          p_user_id: userId,
          p_category: query.category,
          p_start: dateRange.start,
          p_end: dateRange.end,
        }
      );

      if (categoryError) {
        console.error("Error fetching category data:", categoryError);
        return null;
      }

      // Calculate total and count from the transactions
      const totalSpend = categoryData.reduce(
        (sum, txn) => sum + parseFloat(txn.amount),
        0
      );
      const txnCount = categoryData.length;

      return {
        type: "category",
        category: query.category,
        timePeriod: query.timePeriod,
        dateRange: dateRange,
        data: {
          total_spend: totalSpend,
          txn_count: txnCount,
          transactions: categoryData.map((txn) => ({
            id: txn.id,
            date: txn.date,
            amount: parseFloat(txn.amount),
            name: txn.name,
            merchant_name: txn.merchant_name,
            category: txn.category,
            top_category: txn.top_category,
            sub_category: txn.sub_category,
          })),
        },
      };
    }

    return null;
  } catch (error) {
    console.error("Error in fetchEnhancedMerchantData:", error);
    return null;
  }
}

// Calculate date range based on time period
function calculateDateRange(timePeriod) {
  const now = new Date();
  let start, end;

  // Dynamic: last_N_months
  const dynMatch =
    typeof timePeriod === "string" && timePeriod.match(/^last_(\d+)_months$/);
  if (dynMatch) {
    const n = Math.max(1, parseInt(dynMatch[1], 10));
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    start = new Date(firstOfThisMonth);
    start.setMonth(start.getMonth() - n);
    end = now;
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  }

  switch (timePeriod) {
    case "this month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
      break;
    case "last month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case "this week":
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      end = now;
      break;
    case "last week":
      const lastWeekEnd = new Date(now);
      lastWeekEnd.setDate(now.getDate() - now.getDay());
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 7);
      start = lastWeekStart;
      end = lastWeekEnd;
      break;
    case "today":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = now;
      break;
    case "yesterday":
      start = new Date(now);
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "this year":
      start = new Date(now.getFullYear(), 0, 1);
      end = now;
      break;
    case "last year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31);
      break;
    default:
      // Default to this month
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

// Detect time-period-only spending queries
function detectTimePeriodOnly(message) {
  const lower = message.toLowerCase();
  const spendTerms = ["spend", "spending", "spent", "transactions"]; // include transactions
  const mentionsSpend = spendTerms.some((t) => lower.includes(t));
  if (!mentionsSpend) return null;

  // Parse "last N months"
  const nMonths = lower.match(/last\s+(\d+)\s+months?/);
  if (nMonths) {
    const n = parseInt(nMonths[1], 10);
    if (!isNaN(n) && n > 0) {
      return { key: `last_${n}_months`, timePeriod: `last_${n}_months` };
    }
  }

  const timeTerms = [
    "this month",
    "last month",
    "this week",
    "last week",
    "today",
    "yesterday",
    "this year",
    "last year",
  ];

  const key = timeTerms.find((t) => lower.includes(t));
  if (!key) return null;
  return { key, timePeriod: key };
}

// Pre-classification filtering for obvious non-financial queries
function isObviousNonFinancial(message) {
  const lowerMessage = message.toLowerCase().trim();

  // Finance override: if message mentions common financial terms, skip off-topic filter
  const financeTerms = [
    "spend",
    "spent",
    "spending",
    "transaction",
    "transactions",
    "budget",
    "savings",
    "income",
    "expense",
    "expenses",
    "category",
    "categories",
    "food",
    "travel",
    "groceries",
    "rent",
    "uber",
    // Investment and market terms
    "stock",
    "stocks",
    "investment",
    "investments",
    "invest",
    "investing",
    "portfolio",
    "market",
    "markets",
    "trading",
    "trade",
    "ticker",
    "share",
    "shares",
    "dividend",
    "dividends",
    "earnings",
    "revenue",
    "profit",
    "loss",
    "price",
    "valuation",
    "analyst",
    "analysts",
    "forecast",
    "forecasts",
    "outlook",
    "sector",
    "sectors",
    "industry",
    "industries",
    "company",
    "companies",
    "corporate",
    "financial",
    "finance",
    "banking",
    "bank",
    "credit",
    "debt",
    "loan",
    "loans",
    "mortgage",
    "interest",
    "rate",
    "rates",
    "yield",
    "bond",
    "bonds",
    "fund",
    "funds",
    "etf",
    "etfs",
    "mutual",
    "retirement",
    "401k",
    "ira",
    "roth",
    "traditional",
    "tax",
    "taxes",
    "deduction",
    "deductions",
    "refund",
    "insurance",
    "policy",
    "policies",
    "premium",
    "coverage",
    "claim",
    "claims",
    "crypto",
    "cryptocurrency",
    "bitcoin",
    "ethereum",
    "blockchain",
    "nft",
    "nfts",
    "defi",
    "trading",
    "exchange",
    "exchanges",
    "broker",
    "brokers",
    "brokerage",
    "account",
    "accounts",
    "balance",
    "balances",
    "asset",
    "assets",
    "liability",
    "liabilities",
    "equity",
    "capital",
    "cash",
    "money",
    "dollar",
    "dollars",
    "currency",
    "currencies",
    "inflation",
    "deflation",
    "recession",
    "depression",
    "bull",
    "bear",
    "volatility",
    "risk",
    "risks",
    "return",
    "returns",
    "performance",
    "growth",
    "decline",
    "crash",
    "rally",
    "correction",
    "bubble",
    "valuation",
    "pe",
    "p/e",
    "ratio",
    "ratios",
    "eps",
    "revenue",
    "sales",
    "profit",
    "profits",
    "margin",
    "margins",
    "ebitda",
    "cash flow",
    "cashflow",
    "balance sheet",
    "income statement",
    "quarterly",
    "quarter",
    "annual",
    "yearly",
    "fiscal",
    "guidance",
    "guidance",
    "upgrade",
    "downgrade",
    "rating",
    "ratings",
    "buy",
    "sell",
    "hold",
    "strong buy",
    "strong sell",
    "overweight",
    "underweight",
    "neutral",
    "outperform",
    "underperform",
    "sector",
    "sectors",
    "industry",
    "industries",
    "semiconductor",
    "semiconductors",
    "tech",
    "technology",
    "software",
    "hardware",
    "ai",
    "artificial intelligence",
    "cloud",
    "saas",
    "biotech",
    "pharma",
    "pharmaceutical",
    "healthcare",
    "energy",
    "oil",
    "news",
    "latest",
    "update",
    "updates",
    "trends",
    "trend",
    "analysis",
    "analyst",
    "analysts",
    "report",
    "reports",
    "earnings",
    "quarterly",
    "quarter",
    "annual",
    "yearly",
    "fiscal",
    "guidance",
    "outlook",
    "forecast",
    "forecasts",
    "performance",
    "growth",
    "decline",
    "crash",
    "rally",
    "correction",
    "bubble",
    "valuation",
    "pe",
    "p/e",
    "ratio",
    "ratios",
    "eps",
    "revenue",
    "sales",
    "profit",
    "profits",
    "margin",
    "margins",
    "ebitda",
    "cash flow",
    "cashflow",
    "balance sheet",
    "income statement",
    "upgrade",
    "downgrade",
    "rating",
    "ratings",
    "buy",
    "sell",
    "hold",
    "strong buy",
    "strong sell",
    "overweight",
    "underweight",
    "neutral",
    "outperform",
    "underperform",
    "gas",
    "renewable",
    "solar",
    "wind",
    "utilities",
    "consumer",
    "retail",
    "automotive",
    "aerospace",
    "defense",
    "materials",
    "mining",
    "real estate",
    "reit",
    "reits",
    "financial services",
    "fintech",
    "payment",
    "payments",
    "lending",
    "credit card",
    "credit cards",
    "debit card",
    "debit cards",
    "banking",
    "fintech",
    "robo",
    "advisor",
    "advisors",
    "wealth",
    "management",
    "hedge",
    "fund",
    "funds",
    "private",
    "equity",
    "venture",
    "capital",
    "ipo",
    "spac",
    "spacs",
    "merger",
    "acquisition",
    "takeover",
    "buyout",
    "spin",
    "off",
    "split",
    "splits",
    "dividend",
    "dividends",
    "yield",
    "yields",
    "payout",
    "payouts",
    "buyback",
    "buybacks",
    "share",
    "repurchase",
    "repurchases",
    "amd",
    "nvidia",
    "intel",
    "apple",
    "microsoft",
    "google",
    "amazon",
    "meta",
    "tesla",
    "netflix",
    "uber",
    "lyft",
    "airbnb",
    "zoom",
    "salesforce",
    "oracle",
    "ibm",
    "cisco",
    "qualcomm",
    "broadcom",
    "adobe",
    "paypal",
    "square",
    "stripe",
    "coinbase",
    "robinhood",
    "webull",
    "etrade",
    "fidelity",
    "schwab",
    "vanguard",
    "blackrock",
    "goldman",
    "sachs",
    "jpmorgan",
    "jpm",
    "morgan",
    "stanley",
    "wells",
    "fargo",
    "bank",
    "of",
    "america",
    "bofa",
    "citigroup",
    "citi",
    "american",
    "express",
    "amex",
    "visa",
    "mastercard",
    "discover",
    "capital",
    "one",
    "chase",
    "us",
    "bank",
    "pnc",
    "truist",
    "regions",
    "huntington",
    "keybank",
    "citizens",
    "bank",
    "m&t",
    "bank",
    "comerica",
    "zions",
    "bancorp",
    "first",
    "citizens",
    "bancshares",
    "new",
    "york",
    "community",
    "bancorp",
    "east",
    "west",
    "bancorp",
    "south",
    "state",
    "bancorp",
    "north",
    "state",
    "bancorp",
    "midwest",
    "bancorp",
    "southwest",
    "bancorp",
    "northeast",
    "bancorp",
    "southeast",
    "bancorp",
    "northwest",
    "bancorp",
    "southwest",
    "bancorp",
    "central",
    "bancorp",
    "regional",
    "bancorp",
    "community",
    "bancorp",
    "local",
    "bancorp",
    "state",
    "bancorp",
    "national",
    "bancorp",
    "federal",
    "bancorp",
    "united",
    "bancorp",
    "american",
    "bancorp",
    "first",
    "bancorp",
    "second",
    "bancorp",
    "third",
    "bancorp",
    "fourth",
    "bancorp",
    "fifth",
    "bancorp",
    "sixth",
    "bancorp",
    "seventh",
    "bancorp",
    "eighth",
    "bancorp",
    "ninth",
    "bancorp",
    "tenth",
    "bancorp",
  ];
  if (financeTerms.some((t) => lowerMessage.includes(t))) {
    return { isOffTopic: false };
  }

  // Weather queries
  if (
    lowerMessage.includes("weather") ||
    lowerMessage.includes("temperature") ||
    lowerMessage.includes("rain") ||
    lowerMessage.includes("sunny") ||
    lowerMessage.includes("forecast")
  ) {
    return { isOffTopic: true, category: "weather" };
  }

  // General greetings and small talk
  if (
    lowerMessage.match(
      /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what's up|how's it going|what's the vibe|how's the vibe|what's good|how are things|how's everything)$/
    )
  ) {
    return { isOffTopic: true, category: "greeting" };
  }

  // Casual conversation and vibe check
  if (
    lowerMessage.includes("vibe") ||
    lowerMessage.includes("what's good") ||
    lowerMessage.includes("how are things") ||
    lowerMessage.includes("how's everything") ||
    lowerMessage.includes("how's it going") ||
    lowerMessage.includes("what's happening") ||
    lowerMessage.includes("how's your day")
  ) {
    return { isOffTopic: true, category: "greeting" };
  }

  // Non-financial questions
  if (
    lowerMessage.includes("recipe") ||
    lowerMessage.includes("cooking") ||
    lowerMessage.includes("movie") ||
    lowerMessage.includes("travel guide")
  ) {
    return { isOffTopic: true, category: "lifestyle" };
  }

  // Technical support (non-financial)
  if (
    lowerMessage.includes("how to use") ||
    lowerMessage.includes("app not working") ||
    lowerMessage.includes("bug") ||
    lowerMessage.includes("error") ||
    lowerMessage.includes("login") ||
    lowerMessage.includes("password")
  ) {
    return { isOffTopic: true, category: "technical" };
  }

  // Philosophical or general questions
  if (
    lowerMessage.includes("meaning of life") ||
    lowerMessage.includes("purpose") ||
    lowerMessage.includes("love") ||
    lowerMessage.includes("happiness")
  ) {
    return { isOffTopic: true, category: "philosophy" };
  }

  return { isOffTopic: false };
}

// Heuristic: detect clearly in-scope financial concept questions to avoid false off-topic
function financialConceptHeuristic(raw) {
  const text = (raw || "").toLowerCase();
  if (!text) return null;

  // If contains these finance keywords, treat as in-scope concept unless it's about app/tech
  const financeKeywords = [
    "credit",
    "debit",
    "card",
    "apr",
    "interest",
    "loan",
    "mortgage",
    "budget",
    "budgeting",
    "saving",
    "savings",
    "checking",
    "account",
    "fico",
    "credit score",
    "bnpl",
    "tax",
    "ira",
    "401k",
    "roth",
    "brokerage",
    "stock",
    "stocks",
    "etf",
    "mutual fund",
    "dividend",
    "net worth",
    "cashflow",
    "cash flow",
  ];

  const hasFinanceKeyword = financeKeywords.some((k) => text.includes(k));

  // Specific: credit vs debit concept
  const creditAndDebit = text.includes("credit") && text.includes("debit");
  const vsOrDifference =
    creditAndDebit &&
    (text.includes(" vs ") ||
      text.includes("difference") ||
      text.includes("b/w") ||
      text.includes("between"));

  if (vsOrDifference || hasFinanceKeyword) {
    // Classify generic concept questions as in-scope, not needing user data or web
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: false,
      needs_calc: false,
      state: null,
      entities: [],
      confidence: 0.85,
      heuristic: true,
    };
  }

  return null;
}

async function handleClassify(message, context) {
  console.log(
    "🔍 [FINNY] Starting classification in handleClassify for message:",
    message
  );
  const startTime = Date.now();

  const { text, user } = { text: message, user: context };
  if (!text || typeof text !== "string") {
    console.log("❌ [FINNY] Missing or invalid text parameter");
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      needs_calc: false,
      state: null,
      entities: [],
      confidence: 0.1,
      fallback: true,
    };
  }

  // Pre-filter for obvious non-financial queries
  const preFilter = isObviousNonFinancial(text);
  if (preFilter.isOffTopic) {
    console.log(
      "🚫 [FINNY] Pre-filtered as non-financial query:",
      preFilter.category
    );
    return {
      intent: "off_topic",
      needs_web: false,
      needs_user_data: false,
      needs_calc: false,
      state: null,
      entities: [],
      confidence: 0.9,
      category: preFilter.category,
      preFiltered: true,
    };
  }

  // Positive heuristic for common financial concept questions
  const heuristic = financialConceptHeuristic(text);
  if (heuristic) {
    console.log(
      "✅ [FINNY] Heuristic classified as financial concept in-scope"
    );
    // Log lightweight classification
    setImmediate(() =>
      logConversation({
        user_message: message,
        finny_response: `Heuristic classification: ${heuristic.intent} (confidence: ${heuristic.confidence})`,
        timestamp: new Date().toISOString(),
        user_id: context?.user_id || "unknown",
        intent: "classify",
        entities: heuristic.entities,
        confidence: heuristic.confidence,
        response_time_ms: Date.now() - startTime,
        sources_used: [],
        cached: false,
        classification_result: heuristic,
      })
    );
    return heuristic;
  }

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You are Financify's intent router with strict financial scope boundaries.",
              "Classify one user message into exactly one intent.",
              "Intents:",
              "- ask_personalized  question about the user's money that needs their data",
              "- calc_projection  what if or plan math",
              "- goal_conversation  goal creation, advice, or management",
              "- off_topic  non-financial queries that should be redirected",
              "",
              "Rules:",
              "- **SCOPE BOUNDARIES**: Only handle financial topics. Non-financial queries (weather, recipes, movies, sports, general chat, technical support) should be classified as `off_topic`.",
              "- **INVESTMENT NEWS IS FINANCIAL**: Stock news, company updates, earnings reports, industry analysis, market trends, and sector performance are ALL financial topics. Use `ask_personalized` with `needs_web=true`.",
              "- **Intents are primary; flags can combine.** Return exactly one `intent`, but `needs_user_data`, `needs_calc`, and `needs_web` may be **true** together.",
              "- **OFF-TOPIC DETECTION**: If message is clearly non-financial (weather, cooking, entertainment, sports, general greetings, technical issues), use `intent=off_topic`.",
              "- **CONCEPT EXPLANATIONS ARE IN-SCOPE**: General finance concepts (e.g., 'difference between credit and debit card') are financial. Do not mark them off_topic.",
              "- If the message asks 'rent vs buy in <city/state>' → `ask_personalized` (needs_web=true, needs_user_data=true) - this is a personal financial decision requiring user data.",
              "- If affordability, FIRE, retirement planning, or financial projections choose ask_personalized (set needs_calc=true)",
              "- If it needs the user's actual data choose ask_personalized",
              "- If purely personal (spend, net worth, goals) → `ask_personalized` (needs_user_data=true, needs_web=false).",
              "- If asking about current rates, limits, rules, or regulations (Roth IRA limits, 401k limits, tax brackets, interest rates) → `ask_personalized` (needs_web=true, needs_user_data=false).",
              "- **GOAL CONVERSATIONS**: If message mentions saving, goals, targets, aspirations, or asks about goal feasibility → `goal_conversation` (needs_user_data=true, needs_calc=true)",
              "- If ambiguous but potentially financial, choose ask_personalized",
              "- **DEFAULT TO FINANCIAL**: When in doubt between financial and non-financial, prefer financial intent.",
              "",
              "Sample inputs and expected intent:",
              '"Set a 2000 emergency fund by March" → goal_conversation',
              '"I want to save $5000 for a house down payment" → goal_conversation',
              '"Should I buy a Rolex or save for a house?" → goal_conversation',
              '"How much did I spend on Uber last month" → ask_personalized',
              '"How are you" or "What\'s up" or "Am I normal?" → ask_personalized (financial wellness)',
              '"What\'s the weather like?" → off_topic',
              '"How do I cook pasta?" → off_topic',
              '"What movie should I watch?" → off_topic',
              '"Difference between Roth and traditional IRA" → ask_personalized',
              '"What is the Roth IRA contribution limit for 2025?" → ask_personalized, needs_web:true, needs_user_data:false',
              '"Difference between credit and debit card?" → ask_personalized, needs_user_data:false, needs_web:false',
              '"Rent vs buy in Phoenix at 7%" → ask_personalized, needs_web:true, needs_user_data:true, state:"AZ"',
              '"Can I hit FIRE by 35" → ask_personalized, needs_calc:true',
              '"Can I retire by 45" → ask_personalized, needs_calc:true',
              '"Will I have enough to retire" → ask_personalized, needs_calc:true',
              '"Can I achieve my financial goals" → goal_conversation',
              '"What\'s the latest news on semiconductor industry and AMD especially?" → ask_personalized, needs_web:true, needs_user_data:false',
              '"How is Tesla stock performing today?" → ask_personalized, needs_web:true, needs_user_data:false',
              '"What are analysts saying about Apple earnings?" → ask_personalized, needs_web:true, needs_user_data:false',
              '"Latest trends in the tech sector" → ask_personalized, needs_web:true, needs_user_data:false',
              "Return JSON only. No extra text.",
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
          type: "json_schema",
          json_schema: {
            name: "financify_intent",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                intent: {
                  type: "string",
                  enum: ["ask_personalized", "goal_conversation", "off_topic"],
                  description: "Single best intent",
                },
                needs_web: {
                  type: "boolean",
                  description: "True if fresh facts or state rules are needed",
                },
                needs_user_data: {
                  type: "boolean",
                  description: "True if answer needs user DB data",
                },
                needs_calc: {
                  type: "boolean",
                  description: "True if a calculator or projection is required",
                },
                state: {
                  type: ["string", "null"],
                  description: "Two letter US state if applicable",
                  pattern: "^[A-Z]{2}$",
                },
                entities: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key entities or topics",
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: [
                "intent",
                "needs_web",
                "needs_user_data",
                "needs_calc",
                "state",
                "entities",
                "confidence",
              ],
            },
          },
        },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`OpenRouter error ${r.status}: ${errText}`);
    }
    const data = await r.json();
    console.log("🔍 [FINNY] Classification data inside handleClassify:", data);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [FINNY] No content in response");
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

    const out = JSON.parse(cleanContent);
    console.log("🔍 [FINNY] Parsed classification result:", out);

    // Defensive post-process so your app never crashes
    if (!out.state || typeof out.state !== "string") out.state = null;
    if (!Array.isArray(out.entities)) out.entities = [];

    // Log the classification
    const conversationData = {
      user_message: message,
      finny_response: `Classification: ${out.intent} (confidence: ${out.confidence})`,
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "classify",
      entities: out.entities,
      confidence: out.confidence,
      response_time_ms: Date.now() - startTime,
      sources_used: [],
      cached: false,
      classification_result: out,
    };

    // Log conversation synchronously
    await logConversation(conversationData);

    return out;
  } catch (e) {
    console.error("❌ [FINNY] Classification error:", e?.message);
    // Heuristic fallback if available
    const heuristic = financialConceptHeuristic(message);
    if (heuristic) {
      return heuristic;
    }
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      needs_calc: false,
      state: null,
      entities: [],
      confidence: 0.1,
      fallback: true,
    };
  }
}

async function handleOffTopic(message, context) {
  console.log("🚫 [FINNY] Handling off-topic query:", message);
  const startTime = Date.now();

  const category = context?.category || "general";
  const userProfile = context?.profile || {};

  // Generate context-aware financial redirection suggestions
  const redirectionSuggestions = generateFinancialRedirectionSuggestions(
    category,
    userProfile
  );

  const systemPrompt = [
    "You are Finny, a warm and encouraging financial advisor.",
    "The user asked a non-financial question that's outside your scope.",
    "Respond with warmth and redirect them to relevant financial topics.",
    "Be encouraging and show enthusiasm for helping with their finances.",
    "Use their name if available, and make the redirection feel natural.",
    "Keep responses concise but engaging.",
    "Focus on financial empowerment and positive outcomes.",
    "",
    // Smart memory context with relevance-based selection
    ...(context.memory?.summary
      ? [`User context: ${context.memory.summary}`]
      : []),
    ...(() => {
      // Select relevant memories based on message and intent
      const selectedMemories = selectRelevantMemories(
        context.memory,
        message,
        "ask_personalized", // Default intent for classification
        context.profile
      );
      const categorized = categorizeSelectedMemories(selectedMemories);

      return [
        // Profile traits
        ...(categorized.profile_trait?.length
          ? [
              `Traits: ${categorized.profile_trait
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Constraints
        ...(categorized.constraint?.length
          ? [
              `Constraints: ${categorized.constraint
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Preferences
        ...(categorized.preference?.length
          ? [
              `Preferences: ${categorized.preference
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Future plans
        ...(categorized.future_plan?.length
          ? [
              `Future plans: ${categorized.future_plan
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Context signals
        ...(categorized.context_signal?.length
          ? [
              `Context signals: ${categorized.context_signal
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Goals
        ...(categorized.goal?.length
          ? [
              `Goals: ${categorized.goal
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
      ];
    })(),
  ].join("\n");

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `User asked: "${message}"\n\nCategory: ${category}\n\nRedirection suggestions: ${redirectionSuggestions.join(
                ", "
              )}\n\nUser name: ${
                userProfile.name || "there"
              }\n\nUse the user's memory context to make the redirection more personal and relevant to their situation.`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ||
      "I'd love to help you with your finances! What financial questions can I answer for you today?";

    // Log the off-topic interaction
    const conversationData = {
      user_message: message,
      finny_response: content,
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "off_topic",
      entities: [],
      confidence: 1.0,
      response_time_ms: Date.now() - startTime,
      sources_used: [],
      cached: false,
      category: category,
      redirection_suggestions: redirectionSuggestions,
    };

    // Log conversation synchronously
    await logConversation(conversationData);

    return {
      text: cleanResponseFormatting(content),
      type: "assistant",
      intent: "off_topic",
      category: category,
      redirection_suggestions: redirectionSuggestions,
    };
  } catch (error) {
    console.error("❌ [FINNY] Off-topic handler error:", error);

    // Fallback response
    const fallbackResponse = generateFallbackRedirection(category, userProfile);

    return {
      text: cleanResponseFormatting(fallbackResponse),
      type: "assistant",
      intent: "off_topic",
      category: category,
      fallback: true,
    };
  }
}

function generateFinancialRedirectionSuggestions(category, userProfile) {
  const suggestions = {
    weather: [
      "budgeting for seasonal expenses",
      "planning for weather-related financial impacts",
      "emergency fund for weather emergencies",
    ],
    greeting: [
      "your financial goals",
      "budgeting strategies",
      "investment planning",
    ],
    lifestyle: [
      "budgeting for hobbies",
      "financial planning for lifestyle goals",
      "saving strategies for entertainment",
    ],
    technical: [
      "financial app features",
      "budgeting tools",
      "investment tracking",
    ],
    philosophical: [
      "financial independence goals",
      "long-term financial planning",
      "building wealth over time",
    ],
    general: [
      "your financial situation",
      "budgeting and saving",
      "investment opportunities",
    ],
  };

  return suggestions[category] || suggestions.general;
}

function generateFallbackRedirection(category, userProfile) {
  const name = userProfile.name || "there";
  const suggestions = generateFinancialRedirectionSuggestions(
    category,
    userProfile
  );

  return `Hi ${name}! I can't help with that, but I'd love to help you with your finances! How about we discuss ${suggestions[0]} or ${suggestions[1]}? What financial questions do you have?`;
}

// Format product comparison response
// Removed product comparison formatter in favor of LLM summarization

// === LLM fallbacks ===
async function llmFallbackFacts(message) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: [
              "You are Finny, a warm and precise financial advisor specializing in current financial facts and information.",
              "",
              "PERSONALITY & APPROACH:",
              "- Be warm and encouraging while providing accurate, up-to-date information",
              "- Show enthusiasm for helping users stay informed about current financial trends",
              "- Be precise and factual in your responses",
              "- Use the user's name when available",
              "",
              "SCOPE BOUNDARIES:",
              "- ONLY discuss current financial facts, rates, limits, and market information",
              "- Stay focused on actionable, current information users can use",
              "- Redirect non-financial questions to financial topics",
              "",
              "RESPONSE GUIDELINES:",
              "- If live data is unavailable, give a concise, helpful answer based on general knowledge",
              "- Include definitions, typical ranges, and decision factors when relevant",
              "- Do not invent exact current numbers - be transparent about data limitations",
              "- Provide actionable insights based on current information",
              "- Explain financial concepts in simple terms",
              "- Connect current facts to user's potential financial impact",
            ].join("\n"),
          },
          { role: "user", content: message },
        ],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (_) {
    return null;
  }
}

// =====================
// GOALS: Slot-filling
// =====================

// GOAL_CATEGORY_KEYWORDS moved to goals.js

// guessGoalCategory function moved to goals.js

// parseCurrencyAmount function moved to goals.js

// parseTargetDate function moved to goals.js

// extractLabel and handleGoal functions moved to goals.js

// ============================================================================
// WEB RESEARCH SYSTEM - CONSOLIDATED UTILITIES
// ============================================================================

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

  // State codes and names (only full state names to avoid false matches)
  states: [
    "alabama",
    "alaska",
    "arizona",
    "arkansas",
    "california",
    "colorado",
    "connecticut",
    "delaware",
    "florida",
    "georgia",
    "hawaii",
    "idaho",
    "illinois",
    "indiana",
    "iowa",
    "kansas",
    "kentucky",
    "louisiana",
    "maine",
    "maryland",
    "massachusetts",
    "michigan",
    "minnesota",
    "mississippi",
    "missouri",
    "montana",
    "nebraska",
    "nevada",
    "new hampshire",
    "new jersey",
    "new mexico",
    "new york",
    "north carolina",
    "north dakota",
    "ohio",
    "oklahoma",
    "oregon",
    "pennsylvania",
    "rhode island",
    "south carolina",
    "south dakota",
    "tennessee",
    "texas",
    "utah",
    "vermont",
    "virginia",
    "washington",
    "west virginia",
    "wisconsin",
    "wyoming",
    "washington dc",
    "washington d.c.",
  ],
};

// Domain mappings for financial institutions
const DOMAIN_MAPPINGS = {
  chase: {
    primary: "chase.com",
    creditCards: "chase.com/credit-cards",
    searchPaths: [
      "/credit-cards",
      "/personal/credit-cards",
      "/business/credit-cards",
    ],
  },
  "american express": {
    primary: "americanexpress.com",
    creditCards: "americanexpress.com/us/credit-cards",
    searchPaths: ["/us/credit-cards", "/us/credit-cards/all-cards"],
  },
  amex: {
    primary: "americanexpress.com",
    creditCards: "americanexpress.com/us/credit-cards",
    searchPaths: ["/us/credit-cards", "/us/credit-cards/all-cards"],
  },
  "capital one": {
    primary: "capitalone.com",
    creditCards: "capitalone.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  citi: {
    primary: "citi.com",
    creditCards: "citi.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  discover: {
    primary: "discover.com",
    creditCards: "discover.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  "wells fargo": {
    primary: "wellsfargo.com",
    creditCards: "wellsfargo.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  "bank of america": {
    primary: "bankofamerica.com",
    creditCards: "bankofamerica.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  bilt: {
    primary: "bilt.com",
    creditCards: "bilt.com/credit-card",
    searchPaths: ["/credit-card", "/personal/credit-card"],
  },
  fidelity: {
    primary: "fidelity.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  vanguard: {
    primary: "vanguard.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  schwab: {
    primary: "schwab.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  robinhood: {
    primary: "robinhood.com",
    searchPaths: ["/investing", "/crypto", "/options"],
  },
};

// Rate limiting configuration
const RATE_LIMITS = {
  maxConcurrent: 3,
  delayBetweenRequests: 1000,
  timeout: 10000,
  maxRetries: 2,
};

let requestQueue = [];
let activeRequests = 0;

// Request deduplication map
const pendingRequests = new Map();

// === Stocks via Finnhub ===
function looksLikeStockQuery(message) {
  const m = message.toLowerCase();
  return (
    /\b(stock|stocks|ticker|share|price|quote|buy|sell|valuation|pt|price target)\b/.test(
      m
    ) || /\b[A-Z]{1,5}\b/.test(message)
  );
}

function looksLikeStockDeepQuery(message) {
  const m = message.toLowerCase();
  return (
    m.includes("more") ||
    m.includes("market cap") ||
    m.includes("cap") ||
    m.includes("earnings") ||
    m.includes("guidance") ||
    m.includes("dividend") ||
    m.includes("pe") ||
    m.includes("p/e") ||
    m.includes("ps") ||
    m.includes("filings") ||
    m.includes("insider") ||
    m.includes("target") ||
    m.includes("52w") ||
    m.includes("52-week")
  );
}

async function planStockRequest(message) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: [
              "You are a stock request planner.",
              "Given a user query, decide what the user wants to fetch.",
              "Return JSON only matching the schema.",
            ].join("\n"),
          },
          { role: "user", content: message },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "stock_plan",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                ticker_candidates: { type: "array", items: { type: "string" } },
                company_candidates: {
                  type: "array",
                  items: { type: "string" },
                },
                wants: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "price",
                      "market_cap",
                      "pe",
                      "ps",
                      "volume",
                      "52w",
                      "earnings",
                      "guidance",
                      "dividend",
                      "news",
                      "filings",
                      "analyst_targets",
                      "insider",
                    ],
                  },
                },
                horizon: { type: ["string", "null"] },
                needs_web: { type: "boolean" },
              },
              required: [
                "ticker_candidates",
                "company_candidates",
                "wants",
                "needs_web",
              ],
            },
          },
        },
      }),
    });
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Strip markdown code blocks if present
    let cleanContent = content;
    if (content.startsWith("```") && content.endsWith("```")) {
      cleanContent = content.slice(3, -3).trim();
    }
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }

    const plan = JSON.parse(cleanContent);
    // Ensure arrays
    plan.ticker_candidates = Array.isArray(plan.ticker_candidates)
      ? plan.ticker_candidates
      : [];
    plan.company_candidates = Array.isArray(plan.company_candidates)
      ? plan.company_candidates
      : [];
    plan.wants = Array.isArray(plan.wants) ? plan.wants : [];
    return plan;
  } catch (e) {
    console.error("❌ [STOCK_PLANNER] Error:", e);
    return null;
  }
}

async function executeStockPlan(plan, message) {
  const wants = plan?.wants || [];
  const preferredTicker = plan?.ticker_candidates?.[0] || null;
  const { ticker } = preferredTicker
    ? { ticker: preferredTicker }
    : await resolveTickerForQuery(message);
  if (!ticker) return { error: "Could not resolve ticker" };

  // Base snapshot always
  const base = await fetchStockSnapshot(ticker);
  if (base?.error) return base;

  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  const extra = {};

  // Earnings
  if (wants.includes("earnings")) {
    extra.earnings = await fetchJson(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${ticker}&token=${apiKey}`
    );
  }
  // Filings
  if (wants.includes("filings")) {
    extra.filings = await fetchJson(
      `https://finnhub.io/api/v1/filings?symbol=${ticker}&token=${apiKey}`
    );
  }
  // Insider
  if (wants.includes("insider")) {
    extra.insider = await fetchJson(
      `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${ticker}&token=${apiKey}`
    );
  }

  return { ticker, planWants: wants, data: base, extra };
}

function formatPlannedStockResponse(exec) {
  const d = exec.data;
  const wants = new Set(exec.planWants || []);
  let out = formatStockResponse(d);
  const lines = [];

  // Append requested items succinctly
  if (wants.has("market_cap") && d.profile?.marketCapitalization != null) {
    lines.push(
      `Market cap: $${Number(d.profile.marketCapitalization).toLocaleString()}`
    );
  }
  if (wants.has("volume") && d.metrics?.volume) {
    lines.push(`Volume: ${Number(d.metrics.volume).toLocaleString()}`);
  }
  if (wants.has("52w")) {
    const hi = d.metrics?.["52WeekHigh"];
    const lo = d.metrics?.["52WeekLow"];
    if (hi || lo)
      lines.push(
        `52-week range: ${lo ? `$${Number(lo).toFixed(2)}` : "?"} - ${
          hi ? `$${Number(hi).toFixed(2)}` : "?"
        }`
      );
  }
  if (wants.has("dividend")) {
    const y = d.metrics?.dividendYieldIndicatedAnnual;
    const dps = d.metrics?.dividendPerShareTTM;
    if (y || dps)
      lines.push(
        `Dividend: ${dps ? `$${Number(dps).toFixed(2)} TTM` : "n/a"}${
          y ? ` (${Number(y * 100).toFixed(2)}% yield)` : ""
        }`
      );
  }
  if (
    wants.has("earnings") &&
    Array.isArray(exec.extra?.earnings) &&
    exec.extra.earnings.length > 0
  ) {
    const e = exec.extra.earnings[0];
    const eps = e?.epsActual != null ? e.epsActual : e?.eps ? e.eps : null;
    const surprise =
      e?.epsSurprisePercent != null
        ? `${Number(e.epsSurprisePercent).toFixed(1)}%`
        : null;
    lines.push(
      `Recent earnings: EPS ${eps != null ? eps : "n/a"}${
        surprise ? ` (surprise ${surprise})` : ""
      }`
    );
  }
  if (
    wants.has("filings") &&
    Array.isArray(exec.extra?.filings) &&
    exec.extra.filings.length > 0
  ) {
    const f = exec.extra.filings
      .slice(0, 2)
      .map((x) => x.form)
      .join(", ");
    lines.push(`Recent filings: ${f}`);
  }
  if (
    wants.has("insider") &&
    Array.isArray(exec.extra?.insider?.data) &&
    exec.extra.insider.data.length > 0
  ) {
    const t = exec.extra.insider.data.slice(0, 2);
    lines.push(
      `Insider trades: ${t
        .map(
          (x) =>
            `${x.name || "Insider"} ${
              x.change >= 0 ? "bought" : "sold"
            } ${Math.abs(x.change)} shares`
        )
        .join("; ")}`
    );
  }

  if (lines.length > 0) {
    out += "\n\nMore details:\n- " + lines.join("\n- ");
  }
  return out;
}

async function resolveTickerForQuery(message) {
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) return { ticker: null, queryUsed: null };

  // Heuristic: if an explicit 1-5 letter uppercase word present, try it first
  const explicit = (message.match(/\b[A-Z]{1,5}\b/g) || []).find(
    (t) => t !== "USD" && t !== "ETF"
  );
  if (explicit) {
    const prof = await fetchJson(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(
        explicit
      )}&token=${apiKey}`
    );
    if (prof && (prof.ticker || prof.ticker === explicit)) {
      return { ticker: explicit, queryUsed: explicit };
    }
  }

  // Name-based lookup using search endpoint
  const cleaned = message.replace(/\?|\./g, " ").trim();
  const search = await fetchJson(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(
      cleaned
    )}&token=${apiKey}`
  );
  const best = Array.isArray(search?.result)
    ? search.result.find(
        (r) =>
          r.type === "Common Stock" || r.type === "ETF" || r.type === "Equity"
      ) || search.result[0]
    : null;
  const symbol = best?.symbol || null;
  return { ticker: symbol, queryUsed: cleaned };
}

async function fetchStockSnapshot(ticker) {
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) return { error: "Missing FINNHUB API key" };

  const [quote, profile, recs, priceTarget, metrics, news] = await Promise.all([
    fetchJson(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`
    ),
    // last 5 company news items within ~30 days
    (() => {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const from = past.toISOString().slice(0, 10);
      const to = now.toISOString().slice(0, 10);
      return fetchJson(
        `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${apiKey}`
      );
    })(),
  ]);

  return {
    current: quote?.c ?? null,
    change: quote?.d ?? null,
    changePercent: quote?.dp ?? null,
    high: quote?.h ?? null,
    low: quote?.l ?? null,
    prevClose: quote?.pc ?? null,
    open: quote?.o ?? null,
    ts: quote?.t ? new Date(quote.t * 1000).toISOString() : null,
    profile: profile || null,
    recommendations: recs || [],
    priceTarget: priceTarget || null,
    metrics: metrics?.metric || null,
    news: Array.isArray(news) ? news.slice(0, 5) : [],
  };
}

function formatStockResponse(data) {
  const name = data.profile?.name || data.ticker || "Stock";
  const cur =
    data.current != null ? `$${Number(data.current).toFixed(2)}` : "n/a";
  const dp =
    data.changePercent != null
      ? `${Number(data.changePercent).toFixed(2)}%`
      : "n/a";
  const pt = data.priceTarget?.targetMean
    ? `$${Number(data.priceTarget.targetMean).toFixed(2)}`
    : null;

  let recLine = "";
  if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
    const latest = data.recommendations[0];
    const totals = [
      latest?.strongBuy || 0,
      latest?.buy || 0,
      latest?.hold || 0,
      latest?.sell || 0,
      latest?.strongSell || 0,
    ];
    const sum = totals.reduce((a, b) => a + b, 0) || 1;
    recLine = `Analyst mix (latest ${latest?.period || ""}): Buy ${(
      (100 * (totals[0] + totals[1])) /
      sum
    ).toFixed(0)}%, Hold ${((100 * totals[2]) / sum).toFixed(0)}%, Sell ${(
      (100 * (totals[3] + totals[4])) /
      sum
    ).toFixed(0)}%`;
  }

  let out = `**${name} (${data.ticker}) — Snapshot**\n\n`;
  out += `- Price: ${cur} (${dp} today)\n`;
  if (pt) out += `- Street price target (mean): ${pt}\n`;
  if (recLine) out += `- ${recLine}\n`;
  if (data.profile?.finnhubIndustry)
    out += `- Industry: ${data.profile.finnhubIndustry}\n`;
  if (data.profile?.weburl) out += `- Website: ${data.profile.weburl}\n`;
  // Add a couple of basic metrics if available
  const pe = data.metrics?.peBasicExclExtraTTM || data.metrics?.peBasicTTM;
  const ps = data.metrics?.psTTM;
  if (pe || ps) {
    out += "\nKey ratios (TTM):\n";
    if (pe) out += `- P/E: ${Number(pe).toFixed(1)}\n`;
    if (ps) out += `- P/S: ${Number(ps).toFixed(1)}\n`;
  }
  // Add latest headlines
  if (Array.isArray(data.news) && data.news.length > 0) {
    out += "\nRecent headlines:\n";
    for (const n of data.news.slice(0, 3)) {
      if (n.headline) out += `- ${n.headline}\n`;
    }
  }
  if (data.ts) out += `\n*As of ${new Date(data.ts).toLocaleString()}*`;
  out += `\n\nThis is informational, not investment advice.`;
  return out;
}

async function fetchJson(url) {
  const r = await withTimeout(fetch(url), 10000, null);
  if (!r) return null;
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch {
    return null;
  }
}

// Enhanced caching functions with different TTLs for different data types
async function getCachedData(type, identifier, userSpecific = false) {
  try {
    const cacheKey = `${type}_${identifier}`;

    const { data: cached, error } = await supabase
      .from("web_scrape_cache")
      .select("*")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (error) {
      console.error("❌ [CACHE] Error getting cached data:", error);
      return null;
    }

    if (!cached) {
      return null;
    }

    const now = new Date();
    const cachedAt = new Date(cached.created_at);

    // Different TTLs for different data types
    let ttl;
    switch (type) {
      case "user_summary":
        ttl = 30 * 60; // 30 minutes for user financial data (goals, accounts, transactions)
        break;
      case "market_data":
        ttl = 4 * 60 * 60; // 4 hours for market data
        break;
      case "enhanced_merchant":
        ttl = 2 * 60 * 60; // 2 hours for merchant data
        break;
      case "web_research":
      default:
        ttl = 30 * 24 * 60 * 60; // 30 days for web scraped data
        break;
    }

    const age = (now - cachedAt) / 1000;

    if (age > ttl) {
      console.log(
        `🕒 [CACHE] Cache expired for ${cacheKey}, age: ${age}s, ttl: ${ttl}s`
      );
      return null;
    }

    console.log(`✅ [CACHE] Cache hit for ${cacheKey}, age: ${age}s`);
    return {
      data: cached.data_json,
      cachedAt: cached.created_at,
      ttl: ttl - age,
      source: "cache",
    };
  } catch (error) {
    console.error("❌ [CACHE] Error in getCachedData:", error);
    return null;
  }
}

async function setCachedData(type, identifier, data, userSpecific = false) {
  try {
    const cacheKey = `${type}_${identifier}`;

    const dataSize = JSON.stringify(data).length;
    if (dataSize > 1000000) {
      console.warn(`⚠️ [CACHE] Data too large for cache: ${dataSize} bytes`);
      return false;
    }

    const cacheData = {
      cache_key: cacheKey,
      data_type: type,
      data_json: data,
      user_specific: userSpecific,
      data_size: dataSize,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("web_scrape_cache")
      .upsert(cacheData, { onConflict: "cache_key" });

    if (error) {
      console.error("❌ [CACHE] Error setting cached data:", error);
      return false;
    }

    console.log(
      `✅ [CACHE] Cached data for ${cacheKey}, size: ${dataSize} bytes`
    );
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in setCachedData:", error);
    return false;
  }
}

async function getCachedDataWithFallback(
  type,
  identifier,
  fallbackFn,
  userSpecific = false
) {
  const cached = await getCachedData(type, identifier, userSpecific);
  if (cached) {
    return cached;
  }

  console.log(
    `🔄 [CACHE] Cache miss for ${type}_${identifier}, calling fallback`
  );
  try {
    const freshData = await fallbackFn();

    await setCachedData(type, identifier, freshData, userSpecific);

    return {
      data: freshData,
      cachedAt: new Date().toISOString(),
      ttl: 30 * 24 * 60 * 60,
      source: "fresh",
    };
  } catch (error) {
    console.error("❌ [CACHE] Fallback function failed:", error);
    throw error;
  }
}

// Cache clearing functions

async function forceRefreshUserData(userId) {
  try {
    console.log(`🔄 [CACHE] Force refreshing user data for: ${userId}`);

    // Clear user summary cache specifically
    await clearCacheByType("user_summary", userId);

    // Clear enhanced merchant cache for this user
    await clearCacheByType("enhanced_merchant", userId);

    console.log(`✅ [CACHE] Force refresh completed for user: ${userId}`);
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in forceRefreshUserData:", error);
    return false;
  }
}

// === MEMORY MANAGEMENT FUNCTIONS ===

// In-memory cache for user memories
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Cache entry structure: { data, timestamp }
function getCachedMemory(userId) {
  const cached = memoryCache.get(userId);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > MEMORY_CACHE_TTL) {
    memoryCache.delete(userId);
    return null;
  }

  return cached.data;
}

function setCachedMemory(userId, data) {
  memoryCache.set(userId, {
    data,
    timestamp: Date.now(),
  });
}

function invalidateMemoryCache(userId) {
  memoryCache.delete(userId);
}

function getMemoryCacheStats() {
  const now = Date.now();
  const stats = {
    totalEntries: memoryCache.size,
    validEntries: 0,
    expiredEntries: 0,
    entries: [],
  };

  for (const [userId, entry] of memoryCache.entries()) {
    const isExpired = now - entry.timestamp > MEMORY_CACHE_TTL;
    if (isExpired) {
      stats.expiredEntries++;
    } else {
      stats.validEntries++;
    }

    stats.entries.push({
      userId,
      age: now - entry.timestamp,
      memoryCount: entry.data?.totalCount || 0,
      hasSummary: !!entry.data?.summary,
    });
  }

  return stats;
}

// Smart memory selection for optimal context building
function selectRelevantMemories(memoryData, message, intent, userProfile) {
  if (!memoryData?.memories?.length) return [];

  const lowerMessage = message.toLowerCase();

  // Define memory importance weights by type
  const memoryTypeWeights = {
    profile_trait: 0.9, // High - personal characteristics are always relevant
    constraint: 0.95, // Very high - financial constraints are critical
    preference: 0.85, // High - user preferences matter for advice
    future_plan: 0.8, // High - future plans affect current decisions
    goal: 0.9, // Very high - current goals are essential
    context_signal: 0.7, // Medium - situational context
  };

  // Intent-based memory type priorities
  const intentPriorities = {
    ask_personalized: [
      "constraint",
      "goal",
      "profile_trait",
      "preference",
      "future_plan",
      "context_signal",
    ],
    goal_conversation: [
      "goal",
      "constraint",
      "future_plan",
      "profile_trait",
      "preference",
    ],
    off_topic: ["profile_trait", "preference"],
  };

  // Dynamic memory limits based on query complexity
  const getMemoryLimit = () => {
    // High complexity indicators
    const highComplexityKeywords = [
      "advice",
      "recommend",
      "should i",
      "help me",
      "what do you think",
      "financial plan",
      "investment",
      "retirement",
      "budget",
      "debt",
      "goal",
      "save",
      "spend",
      "afford",
      "risk",
    ];

    // Medium complexity indicators
    const mediumComplexityKeywords = [
      "how much",
      "when",
      "where",
      "which",
      "compare",
      "difference",
    ];

    const hasHighComplexity = highComplexityKeywords.some((keyword) =>
      lowerMessage.includes(keyword)
    );
    const hasMediumComplexity = mediumComplexityKeywords.some((keyword) =>
      lowerMessage.includes(keyword)
    );

    if (hasHighComplexity) return 12; // Comprehensive context for complex queries
    if (hasMediumComplexity) return 8; // Good context for medium queries
    return 5; // Basic context for simple queries
  };

  // Score memories based on relevance
  const scoreMemory = (memory) => {
    let score = 0;

    // Base score from memory type weight
    score += memoryTypeWeights[memory.memory_type] || 0.5;

    // Confidence score boost
    score += (memory.confidence_score || 0.7) * 0.3;

    // Recency boost (newer memories are more relevant)
    const daysSinceUpdate =
      (Date.now() - new Date(memory.updated_at).getTime()) /
      (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.2 - daysSinceUpdate / 30); // Decay over 30 days

    // Keyword relevance boost
    const memoryText = `${memory.key} ${memory.value}`.toLowerCase();
    const messageWords = lowerMessage.split(/\s+/);
    const relevanceMatches = messageWords.filter(
      (word) => word.length > 3 && memoryText.includes(word)
    ).length;
    score += relevanceMatches * 0.1;

    // Intent-based priority boost
    const intentPriority =
      intentPriorities[intent] || intentPriorities["ask_personalized"];
    const typePriority = intentPriority.indexOf(memory.memory_type);
    if (typePriority !== -1) {
      score += (intentPriority.length - typePriority) * 0.1;
    }

    return score;
  };

  // Score and sort all memories
  const scoredMemories = memoryData.memories
    .map((memory) => ({
      ...memory,
      relevanceScore: scoreMemory(memory),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Apply dynamic limit
  const limit = getMemoryLimit();
  const selectedMemories = scoredMemories.slice(0, limit);

  // Ensure we have at least one memory from each important type if available
  const importantTypes =
    intentPriorities[intent] || intentPriorities["ask_personalized"];
  const finalMemories = [];
  const usedTypes = new Set();

  // First pass: Add top-scored memories
  selectedMemories.forEach((memory) => {
    if (finalMemories.length < limit) {
      finalMemories.push(memory);
      usedTypes.add(memory.memory_type);
    }
  });

  // Second pass: Ensure coverage of important types
  importantTypes.forEach((type) => {
    if (!usedTypes.has(type) && finalMemories.length < limit) {
      const typeMemory = memoryData.memories.find(
        (m) => m.memory_type === type
      );
      if (typeMemory) {
        finalMemories.push({
          ...typeMemory,
          relevanceScore: scoreMemory(typeMemory),
        });
        usedTypes.add(type);
      }
    }
  });

  console.log(
    `🧠 [MEMORY] Selected ${finalMemories.length} memories for intent "${intent}" (limit: ${limit})`
  );
  console.log(`🧠 [MEMORY] Memory types included:`, Array.from(usedTypes));

  return finalMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Helper function to categorize selected memories for context building
function categorizeSelectedMemories(selectedMemories) {
  const categorized = {
    profile_trait: [],
    constraint: [],
    preference: [],
    future_plan: [],
    context_signal: [],
    goal: [],
  };

  selectedMemories.forEach((memory) => {
    if (categorized[memory.memory_type]) {
      categorized[memory.memory_type].push(memory);
    }
  });

  return categorized;
}

async function loadUserMemory(userId) {
  if (!userId) return { summary: "", memories: [] };

  // Check cache first
  const cached = getCachedMemory(userId);
  if (cached) {
    console.log("🧠 [MEMORY] Using cached memory data for user:", userId);
    return cached;
  }

  try {
    console.log("🧠 [MEMORY] Loading fresh memory data for user:", userId);

    // Get ALL memory summaries (not just the most recent)
    const { data: summaries } = await supabase
      .from("memory_summary")
      .select("summary_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Get all non-expired memories with higher limit and confidence filtering
    const { data: memories } = await supabase
      .from("user_memories")
      .select("memory_type, key, value, confidence_score, updated_at")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .gte("confidence_score", 0.7) // Only include high-confidence memories
      .order("updated_at", { ascending: false })
      .limit(20); // Increased limit for better context

    // Combine all summaries into one comprehensive summary
    const combinedSummary =
      summaries
        ?.map((s) => s.summary_text)
        .filter(Boolean)
        .join(" ") || "";

    // Categorize memories by type for better context building
    const categorizedMemories = {
      profile_trait: [],
      constraint: [],
      preference: [],
      future_plan: [],
      context_signal: [],
      goal: [],
    };

    memories?.forEach((memory) => {
      if (categorizedMemories[memory.memory_type]) {
        categorizedMemories[memory.memory_type].push(memory);
      }
    });

    const result = {
      summary: combinedSummary,
      memories: memories || [],
      categorized: categorizedMemories,
      totalCount: memories?.length || 0,
    };

    // Cache the result
    setCachedMemory(userId, result);

    console.log(
      `🧠 [MEMORY] Loaded ${result.totalCount} memories for user ${userId}`
    );
    return result;
  } catch (error) {
    console.error("❌ [MEMORY] Error loading user memory:", error);
    return { summary: "", memories: [], categorized: {}, totalCount: 0 };
  }
}

// Helper function to check if data is sensitive
function isSensitiveData(value) {
  if (!value || typeof value !== "string") return false;

  const sensitivePatterns = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card numbers
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email addresses
    /\b\d{3}-\d{3}-\d{4}\b/, // Phone numbers
  ];

  return sensitivePatterns.some((pattern) => pattern.test(value));
}

// Helper function to get expiry date for different memory types
function getExpiryDate(memoryType) {
  const now = new Date();

  switch (memoryType) {
    case "profile_trait":
      // Profile traits last 1 year
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    case "constraint":
      // Constraints last 6 months
      return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    case "preference":
      // Preferences last 3 months
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    case "goal":
      // Goals last 6 months
      return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    case "context_signal":
      // Context signals last 1 month
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    default:
      // Default to 3 months
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  }
}

async function saveMemoryCandidates(userId, candidates) {
  if (!userId || !candidates.length) {
    console.log("🧠 [FINNY] No userId or candidates to save:", {
      userId,
      candidatesLength: candidates?.length,
    });
    return;
  }

  try {
    let savedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const candidate of candidates) {
      // Map memory types to database format (support both old and new categories)
      const memoryTypeMap = {
        trait: "profile_trait",
        constraint: "constraint",
        preference: "preference",
        future_plan: "future_plan",
        // New hybrid categories
        profile_trait: "profile_trait",
        constraint: "constraint",
        goal: "goal",
        preference: "preference",
        context_signal: "context_signal",
      };

      const memoryType = memoryTypeMap[candidate.type] || candidate.type;

      // Redact sensitive data
      const redactedValue = redactPII(candidate.value);

      // Skip if redacted or sensitive
      if (
        redactedValue !== candidate.value ||
        isSensitiveData(candidate.value)
      ) {
        skippedCount++;
        continue;
      }

      // Upsert memory
      const memoryData = {
        user_id: userId,
        memory_type: memoryType,
        key: candidate.key,
        value: redactedValue,
        confidence_score: candidate.confidence_score || candidate.confidence,
        expires_at: getExpiryDate(memoryType),
      };

      try {
        const { error } = await supabase
          .from("user_memories")
          .upsert(memoryData, {
            onConflict: "user_id,memory_type,key",
          });

        if (error) {
          throw error;
        }

        savedCount++;
        console.log(`🧠 [FINNY] Saved memory: ${memoryType}:${candidate.key}`);
      } catch (supabaseError) {
        console.error(
          `🧠 [FINNY] Upsert failed for ${candidate.key}:`,
          supabaseError
        );
        errors.push(`Upsert failed: ${supabaseError.message}`);

        // Try fallback insert
        try {
          const { error: insertError } = await supabase
            .from("user_memories")
            .insert(memoryData);

          if (insertError) {
            throw insertError;
          }

          savedCount++;
          console.log(
            `🧠 [FINNY] Saved memory via insert: ${memoryType}:${candidate.key}`
          );
        } catch (fallbackError) {
          console.error(
            `🧠 [FINNY] Fallback insert failed for ${candidate.key}:`,
            fallbackError
          );
          errors.push(`Fallback insert failed: ${fallbackError.message}`);
        }
      }
    }

    console.log(
      `🧠 [FINNY] Memory save summary: ${savedCount} saved, ${skippedCount} skipped, ${errors.length} errors`
    );
    if (errors.length > 0) {
      console.error("🧠 [FINNY] Memory save errors:", errors);
    }

    // Update memory summary
    try {
      await updateMemorySummary(userId);
      console.log("🧠 [FINNY] Memory summary updated successfully");
    } catch (summaryError) {
      console.error(
        "🧠 [FINNY] Failed to update memory summary:",
        summaryError
      );
    }

    // Invalidate memory cache since we've added new memories
    invalidateMemoryCache(userId);
    console.log("🧠 [MEMORY] Cache invalidated for user:", userId);
  } catch (error) {
    console.error("🧠 [FINNY] Critical error in saveMemoryCandidates:", error);
  }
}

async function updateMemorySummary(userId) {
  try {
    const { data: memories, error: memoriesError } = await supabase
      .from("user_memories")
      .select("memory_type, key, value")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (memoriesError) {
      throw memoriesError;
    }

    if (!memories?.length) {
      console.log("🧠 [FINNY] No memories found for summary update");
      return;
    }

    const summary = await generateMemorySummary(memories, userId);

    // Insert new memory summary row (instead of updating existing)
    const { error: summaryError } = await supabase
      .from("memory_summary")
      .insert({
        user_id: userId,
        summary_text: summary,
        memory_count: memories.length,
        created_at: new Date().toISOString(),
      });

    if (summaryError) {
      throw summaryError;
    }

    console.log(
      `🧠 [FINNY] Created new memory summary with ${memories.length} memories`
    );
  } catch (error) {
    console.error("🧠 [FINNY] Error creating memory summary:", error);
    throw error; // Re-throw so the caller can handle it
  }
}

async function generateMemorySummary(memories, userId) {
  if (!memories || memories.length === 0) {
    return "I haven't learned much about you yet. Keep chatting with me so I can better understand your financial situation and goals!";
  }

  // Get the most recent summary to avoid repeating information
  let previousSummary = "";
  try {
    const { data: recentSummary } = await supabase
      .from("memory_summary")
      .select("summary_text")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    previousSummary = recentSummary?.summary_text || "";
  } catch (error) {
    // No previous summary exists, that's fine
  }

  // Group by memory type
  const grouped = memories.reduce((acc, memory) => {
    if (!acc[memory.memory_type]) acc[memory.memory_type] = [];
    acc[memory.memory_type].push(memory);
    return acc;
  }, {});

  const newInfo = [];

  // Check for new goals
  if (grouped.goal && grouped.goal.length > 0) {
    const goalTexts = grouped.goal.map((m) => m.value);
    const newGoals = goalTexts.filter(
      (goal) => !previousSummary.toLowerCase().includes(goal.toLowerCase())
    );
    if (newGoals.length > 0) {
      newInfo.push(`New goals: ${newGoals.join(", ")}`);
    }
  }

  // Check for new preferences
  if (grouped.preference && grouped.preference.length > 0) {
    const preferenceTexts = grouped.preference.map((m) => m.value);
    const newPreferences = preferenceTexts.filter(
      (pref) => !previousSummary.toLowerCase().includes(pref.toLowerCase())
    );
    if (newPreferences.length > 0) {
      newInfo.push(`New preferences: ${newPreferences.join(", ")}`);
    }
  }

  // Check for new constraints
  if (grouped.constraint && grouped.constraint.length > 0) {
    const constraintTexts = grouped.constraint.map((m) => m.value);
    const newConstraints = constraintTexts.filter(
      (constraint) =>
        !previousSummary.toLowerCase().includes(constraint.toLowerCase())
    );
    if (newConstraints.length > 0) {
      newInfo.push(`New constraints: ${newConstraints.join(", ")}`);
    }
  }

  // Check for new profile traits (only significant ones)
  if (grouped.profile_trait && grouped.profile_trait.length > 0) {
    const significantTraits = [];
    grouped.profile_trait.forEach((m) => {
      const key = m.key.replace("profile_trait.", "");
      const value = m.value;

      // Only include significant traits that aren't already mentioned
      if (
        (key === "location" ||
          key === "education" ||
          key.startsWith("family.") ||
          key.startsWith("lifestyle.")) &&
        !previousSummary.toLowerCase().includes(value.toLowerCase())
      ) {
        significantTraits.push(value);
      }
    });

    if (significantTraits.length > 0) {
      newInfo.push(`New profile info: ${significantTraits.join(", ")}`);
    }
  }

  // Check for new context signals
  if (grouped.context_signal && grouped.context_signal.length > 0) {
    const contextTexts = grouped.context_signal.map((m) => m.value);
    const newContext = contextTexts.filter(
      (context) =>
        !previousSummary.toLowerCase().includes(context.toLowerCase())
    );
    if (newContext.length > 0) {
      newInfo.push(`New context: ${newContext.join(", ")}`);
    }
  }

  // If no new information, create a brief update message
  if (newInfo.length === 0) {
    if (previousSummary) {
      return `Updated understanding based on ${memories.length} memories.`;
    } else {
      // First summary - create a concise overview
      const overview = [];
      if (grouped.goal && grouped.goal.length > 0) {
        overview.push(`Goals: ${grouped.goal.map((m) => m.value).join(", ")}`);
      }
      if (grouped.profile_trait && grouped.profile_trait.length > 0) {
        const profileInfo = {};
        grouped.profile_trait.forEach((m) => {
          const key = m.key.replace("profile_trait.", "");
          if (key === "age") profileInfo.age = m.value;
          else if (key === "occupation") profileInfo.occupation = m.value;
        });
        if (profileInfo.age && profileInfo.occupation) {
          overview.push(
            `${profileInfo.age}-year-old ${profileInfo.occupation}`
          );
        }
      }
      return overview.length > 0
        ? overview.join(". ") + "."
        : "Initial profile established.";
    }
  }

  return newInfo.join(". ") + ".";
}

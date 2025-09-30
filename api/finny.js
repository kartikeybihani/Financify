// api/finny.js
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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
        } else {
          throw error; // Will trigger retry
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
  const safeContext = {
    ...(context || {}),
    user_id: serverUserId || null,
    profile: userProfile,
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
        response = await handleAsk(message, safeContext);
        break;
      case "goal":
        response = await handleGoal(message, safeContext);
        break;
      case "ask_state_rule":
        response = await handleAskStateRule(message, safeContext);
        break;
      case "ask_fact_fresh":
        response = await handleAskFactFresh(message, safeContext);
        break;
      case "off_topic":
        response = await handleOffTopic(message, safeContext);
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

async function handleAsk(message, context) {
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
            const response = { message: formatted, type: "assistant" };
            setImmediate(() =>
              logConversation({
                user_message: redactPII(message),
                finny_response: redactPII(formatted),
                timestamp: new Date().toISOString(),
                user_id: context?.user_id || "unknown",
                intent: "ask_fact_fresh",
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
                  intent: "ask_fact_fresh",
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
            message: formatted,
            type: "assistant",
          };

          // Log
          setImmediate(() =>
            logConversation({
              user_message: redactPII(message),
              finny_response: redactPII(formatted),
              timestamp: new Date().toISOString(),
              user_id: context?.user_id || "unknown",
              intent: "ask_fact_fresh",
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
                intent: "ask_fact_fresh",
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
        message:
          "I need to know who you are to provide personalized advice. Please try again.",
        type: "assistant",
      };
    }

    // 2) Detect all query types in parallel for better performance
    const [merchantQuery, rentVsBuyQuery, isProductQuery] = await Promise.all([
      Promise.resolve(detectMerchantQuery(message)),
      Promise.resolve(detectRentVsBuyQuery(message)),
      Promise.resolve(detectProductQuery(message)),
    ]);

    // 3) Start all data fetching operations in parallel
    const dataFetchPromises = [];
    const BASE_URL = process.env.APP_BASE_URL;

    // Check if user wants to force refresh their data
    const forceRefresh =
      message.toLowerCase().includes("refresh") ||
      message.toLowerCase().includes("update") ||
      message.toLowerCase().includes("latest");

    if (forceRefresh) {
      console.log("🔄 [FINNY] Force refresh requested, clearing cache...");
      await forceRefreshUserData(userId);
    }

    // Always fetch user financial summary (with caching)
    dataFetchPromises.push(
      getCachedDataWithFallback(
        "user_summary",
        userId,
        async () => {
          const res = await fetch(`${BASE_URL}/api/store_accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "financial_summary",
              user_id: userId,
            }),
          });
          if (!res.ok) {
            throw new Error(`Financial summary failed: ${res.status}`);
          }
          return await res.json();
        },
        true // user-specific cache
      ).then(async (cachedResult) => {
        const sumT0 = Date.now();
        timings.summary_ms = Date.now() - sumT0;
        toolsUsed.push({
          name: "user_summary_rpc",
          latency_ms: timings.summary_ms,
          cache_hit: cachedResult.source === "cache",
        });
        return { type: "summary", data: cachedResult.data };
      })
    );

    // Fetch enhanced merchant data if needed (with caching)
    if (merchantQuery) {
      console.log("🔍 [FINNY] Detected merchant query:", merchantQuery);
      dataFetchPromises.push(
        getCachedDataWithFallback(
          "enhanced_merchant",
          `${userId}_${merchantQuery}`,
          async () => {
            return await withTimeout(
              fetchEnhancedMerchantData(userId, merchantQuery),
              1500,
              null
            );
          },
          true // user-specific cache
        ).then((cachedResult) => {
          const t0 = Date.now();
          timings.user_data_ms += Date.now() - t0;
          toolsUsed.push({
            name: "enhanced_merchant_or_category",
            latency_ms: Date.now() - t0,
            cache_hit: cachedResult.source === "cache",
          });
          console.log(
            "🔍 [FINNY] Enhanced data result:",
            cachedResult.data ? "Success" : "Failed"
          );
          return { type: "enhanced", data: cachedResult.data };
        })
      );
    }

    // Fetch market data if needed (with caching)
    if (rentVsBuyQuery) {
      console.log("🔍 [FINNY] Detected rent vs buy query:", rentVsBuyQuery);
      dataFetchPromises.push(
        getCachedDataWithFallback(
          "market_data",
          rentVsBuyQuery,
          async () => {
            return await withTimeout(
              fetchMarketData(rentVsBuyQuery),
              1800,
              null
            );
          },
          false // not user-specific
        ).then((cachedResult) => {
          const t0 = Date.now();
          timings.market_ms = Date.now() - t0;
          toolsUsed.push({
            name: "market_data",
            latency_ms: timings.market_ms,
            cache_hit: cachedResult.source === "cache",
          });
          console.log(
            "🔍 [FINNY] Market data result:",
            cachedResult.data ? "Success" : "Failed"
          );
          return { type: "market", data: cachedResult.data };
        })
      );
    }

    // Fetch web research data if needed (with caching and deduplication)
    if (isProductQuery) {
      console.log("🔍 [FINNY] Detected product query, starting web research");
      dataFetchPromises.push(
        getCachedDataWithFallback(
          "web_research",
          message.toLowerCase().trim(),
          async () => {
            return await withTimeout(
              deduplicatedWebResearch(message, userId),
              2500,
              { success: false, error: "timeout" }
            );
          },
          false // not user-specific
        )
          .then((cachedResult) => {
            const t0 = Date.now();
            timings.web_ms = Date.now() - t0;
            toolsUsed.push({
              name: "web_research",
              latency_ms: timings.web_ms,
              cache_hit: cachedResult.source === "cache",
            });
            console.log(
              "🔍 [FINNY] Web research result:",
              cachedResult.data?.success ? "Success" : "Failed"
            );
            return { type: "web", data: cachedResult.data };
          })
          .catch((error) => {
            console.error("❌ [FINNY] Web research failed:", error);
            return {
              type: "web",
              data: { success: false, error: error.message },
            };
          })
      );
    }

    // Wait for all data fetching operations to complete
    const dataResults = await Promise.allSettled(dataFetchPromises);

    // Process results and build snap object
    let snap = null;
    let enhancedData = null;
    let marketData = null;
    let webResearchData = null;

    for (const result of dataResults) {
      if (result.status === "fulfilled") {
        const { type, data } = result.value;
        switch (type) {
          case "summary":
            snap = data;
            break;
          case "enhanced":
            enhancedData = data;
            if (!data) degraded = true;
            break;
          case "market":
            marketData = data;
            if (!data) degraded = true;
            break;
          case "web":
            webResearchData = data;
            if (!data?.success) degraded = true;
            break;
        }
      } else {
        console.error("❌ [FINNY] Data fetch failed:", result.reason);
        degraded = true;
      }
    }

    if (!snap) {
      console.log("❌ [FINNY] Failed to fetch financial summary");
      return {
        message:
          "I couldn't load your financial summary yet. Try again in a moment.",
        type: "assistant",
      };
    }

    console.log("✅ [FINNY] Fetched financial summary:", Object.keys(snap));

    // Add enhanced merchant data to snap if available
    if (enhancedData) {
      snap.enhanced = enhancedData;
    }

    // Add market data to snap if available
    if (marketData) {
      snap.market = marketData;
    }

    // Add web research data to snap if available
    if (webResearchData && webResearchData.success) {
      snap.webResearch = webResearchData;
    }

    // 3) Build a focused prompt using the relevant RPC data
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
      "RESPONSE GUIDELINES:",
      "- Be CONCISE and focused - only answer what the user is asking for",
      "- Don't overwhelm users with too much information at once",
      "- If user asks about 'accounts', show account balances and types, NOT individual holdings",
      "- If user asks about 'investments' or 'holdings', then show the detailed holdings",
      "- Keep responses conversational and encouraging, not overwhelming",
      "- Provide actionable advice that users can implement immediately",
      "- Explain financial concepts in simple, understandable terms",
      "- Connect advice to the user's specific financial situation when possible",
      "",
      "DATA INTERPRETATION:",
      "- IMPORTANT: In transaction data, EXPENSE means money spent (going out), INCOME means money received (coming in).",
      "- CREDIT CARD DATA STRUCTURE: For credit cards, 'current_balance' is the debt amount (what you owe), and 'available_balance' is the credit limit. Available credit = credit limit - debt.",
      "- For rent vs buy questions: Use the user's financial data (income, savings, debt) and market data (home prices, rent costs, mortgage rates) to provide personalized analysis. Consider their financial capacity, timeline, and local market conditions.",
      "- For financial product questions: Use web research data to provide current, accurate information about credit cards, banks, and investment platforms. Combine this with the user's financial data to give personalized recommendations.",
      "",
      "DISCLAIMERS:",
      "- Only add investment disclaimer ('Note: This response is for informational purposes and does not constitute financial advice.') when the user asks specifically about investments, investing advice, or investment-related recommendations.",
    ].join("\n");

    // Create smart context based on the question
    const contextNote = createSmartContext(message, snap);

    console.log("🔍 [FINNY] Context note:", contextNote);

    // 3) LLM call with streaming support
    const llmT0 = Date.now();
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 700,
        stream: false, // Keep as false for now, but ready for streaming
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `User: ${message}\n\nContext:\n${contextNote}`,
          },
        ],
      }),
    });
    timings.llm_ms = Date.now() - llmT0;
    toolsUsed.push({
      name: "llm",
      latency_ms: timings.llm_ms,
      cache_hit: false,
    });

    if (!resp.ok) {
      console.error("❌ [FINNY] OpenRouter API error:", resp.status);
      return {
        message: "I'm glitching right now—try again.",
        type: "assistant",
      };
    }

    const data = await resp.json();
    const text =
      data.choices?.[0]?.message?.content ?? "I'm not sure yet. Ask me again?";

    const response = {
      message: degraded
        ? `${text}\n\n(Using available data; some live sources timed out.)`
        : text,
      type: "assistant",
    };

    // Log the conversation
    const conversationData = {
      user_message: redactPII(message),
      finny_response: redactPII(text),
      timestamp: new Date().toISOString(),
      user_id: userId,
      intent: "ask_personalized",
      entities: [],
      confidence: 1.0,
      response_time_ms: Date.now() - startTime,
      sources_used: [],
      cached: false,
      enhanced_data: enhancedData ? true : false,
      market_data: marketData ? true : false,
      web_research: webResearchData?.success || false,
      request_id: generateRequestId(),
      metrics: {
        intent: "ask_personalized",
        latency_ms: {
          total: Date.now() - startTime,
          llm: timings.llm_ms,
          data_fetch: timings.summary_ms + timings.user_data_ms,
          web_research: timings.web_ms,
          market: timings.market_ms,
        },
        tools_used: toolsUsed,
        model: "openai/gpt-4o-mini",
        cache_hits: {
          web_research: false,
          summary: false,
        },
        tokens: null,
        result: degraded ? "degraded" : "success",
      },
    };

    // Log conversation asynchronously (don't wait for it)
    setImmediate(() => logConversation(conversationData));

    return response;
  } catch (error) {
    console.error("❌ [FINNY] Ask handler error:", error);
    return {
      message:
        "I'm having some technical difficulties right now. Please try again in a moment.",
      type: "assistant",
    };
  }
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
    if (snap.summary) {
      context.push("Financial Summary:");
      context.push(`Net Worth: $${snap.summary.netWorth}`);
      context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
      context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
      context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
    }
  }

  // Only include recent transactions for specific questions
  if (
    lowerMessage.includes("recent") ||
    lowerMessage.includes("transactions") ||
    lowerMessage.includes("activity") ||
    lowerMessage.includes("spending")
  ) {
    if (snap.transactions?.recent?.length > 0) {
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
    "pharmacy",
  ];

  // Category patterns
  const categoryPatterns = [
    "food",
    "transportation",
    "shopping",
    "entertainment",
    "travel",
    "loans",
    "income",
    "personal care",
    "other",
  ];

  // Time period patterns
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

  // Check if message contains merchant and time period
  const hasMerchant = merchantPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );
  const hasCategory = categoryPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );
  const hasTimePeriod = timePatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );

  if (hasTimePeriod) {
    const timePeriod = timePatterns.find((pattern) =>
      lowerMessage.includes(pattern)
    );

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

      return {
        type: "category",
        category: category,
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

// Pre-classification filtering for obvious non-financial queries
function isObviousNonFinancial(message) {
  const lowerMessage = message.toLowerCase().trim();

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
    lowerMessage.includes("book") ||
    lowerMessage.includes("music") ||
    lowerMessage.includes("sports") ||
    lowerMessage.includes("travel") ||
    lowerMessage.includes("vacation") ||
    lowerMessage.includes("game") ||
    lowerMessage.includes("hobby")
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
    lowerMessage.includes("relationship") ||
    lowerMessage.includes("job interview")
  ) {
    return { isOffTopic: true, category: "philosophical" };
  }

  return { isOffTopic: false, category: null };
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
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You are Financify's intent router with strict financial scope boundaries.",
              "Classify one user message into exactly one intent.",
              "Intents:",
              "- goal  set or modify a savings or payoff goal",
              "- ask_personalized  question about the user's money that needs their data",
              "- ask_fact_fresh  current year numbers or facts that change",
              "- ask_state_rule  state specific rules or taxes",
              "- calc_projection  what if or plan math",
              "- off_topic  non-financial queries that should be redirected",
              "",
              "Rules:",
              "- **SCOPE BOUNDARIES**: Only handle financial topics. Non-financial queries (weather, recipes, movies, sports, general chat, technical support) should be classified as `off_topic`.",
              "- **Intents are primary; flags can combine.** Return exactly one `intent`, but `needs_user_data`, `needs_calc`, and `needs_web` may be **true** together.",
              "- **OFF-TOPIC DETECTION**: If message is clearly non-financial (weather, cooking, entertainment, sports, general greetings, technical issues), use `intent=off_topic`.",
              "- **CONCEPT EXPLANATIONS ARE IN-SCOPE**: General finance concepts (e.g., 'difference between credit and debit card') are financial. Do not mark them off_topic.",
              "- If message asks for this year current latest updated 2025 etc then ask_fact_fresh",
              "- If asking about specific financial products (cards, banks, rates, benefits, offers) that change over time then ask_fact_fresh",
              "- If comparing specific products/services by name (e.g., 'Chase vs Amex', 'Vanguard vs Fidelity') then ask_fact_fresh",
              "- If the message compares **named** products (e.g., 'Chase Sapphire vs Amex Gold'), set `intent=ask_fact_fresh`, `needs_web=true`, `needs_user_data=false`.",
              "- If the message mentions a **US state** by name or postal code and asks about **rules/benefits/taxes**, set `intent=ask_state_rule`, `needs_web=true`, and fill `state` (use `user_hint_state` only if no state in text).",
              "- If the message asks 'rent vs buy in <city/state>' → `ask_personalized` (needs_web=true, needs_user_data=true) - this is a personal financial decision requiring user data.",
              "- If the message asks about **BNPL reporting/risks** or **current APRs** → `ask_fact_fresh` (needs_web).",
              "- If affordability or FIRE by age or projection choose calc_projection (but set needs_calc=true)",
              "- If it clearly sets a goal choose goal",
              "- If it needs the user's actual data choose ask_personalized",
              "- If purely personal (spend, net worth, goals) → `ask_personalized` (needs_user_data=true, needs_web=false).",
              "- If ambiguous but potentially financial, choose ask_personalized",
              "- **DEFAULT TO FINANCIAL**: When in doubt between financial and non-financial, prefer financial intent.",
              "",
              "Sample inputs and expected intent:",
              '"Set a 2000 emergency fund by March" → goal',
              '"How much did I spend on Uber last month" → ask_personalized',
              '"How are you" or "What\'s up" or "Am I normal?" → ask_personalized (financial wellness)',
              '"What\'s the weather like?" → off_topic',
              '"How do I cook pasta?" → off_topic',
              '"What movie should I watch?" → off_topic',
              '"Difference between Roth and traditional IRA" → ask_personalized',
              '"Difference between credit and debit card?" → ask_personalized, needs_user_data:false, needs_web:false',
              '"What is the 2025 estate tax exemption" → ask_fact_fresh',
              '"Which card has better benefits Chase Rewards or Bolt?" → ask_fact_fresh',
              '"Which card is better for groceries, Amex Gold or SavorOne?" → ask_fact_fresh, needs_web:true, entities:["Amex Gold","SavorOne"]',
              '"Rent vs buy in Phoenix at 7%" → ask_personalized, needs_web:true, needs_user_data:true, state:"AZ"',
              '"Is BNPL hurting my credit?" → ask_fact_fresh, needs_web:true, entities:["BNPL"]',
              '"Does New Jersey have inheritance tax" → ask_state_rule with state NJ',
              '"Can I hit FIRE by 35" → calc_projection',
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
                  enum: [
                    "goal",
                    "ask_personalized",
                    "ask_fact_fresh",
                    "ask_state_rule",
                    "calc_projection",
                    "off_topic",
                  ],
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

    const data = await r.json();
    console.log("🔍 [FINNY] Classification data inside handleClassify:", data);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [FINNY] No content in response");
      throw new Error("No content");
    }

    const out = JSON.parse(content);
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

    // Log conversation asynchronously
    setImmediate(() => logConversation(conversationData));

    return out;
  } catch (e) {
    console.error("❌ [FINNY] Classification error:", e?.message);
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
  ].join("\n");

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
              }\n\nRespond with a warm redirection to financial topics.`,
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
      response_time_ms: Date.now(),
      sources_used: [],
      cached: false,
      category: category,
      redirection_suggestions: redirectionSuggestions,
    };

    // Log conversation asynchronously
    setImmediate(() => logConversation(conversationData));

    return {
      text: content,
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
      text: fallbackResponse,
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

async function handleAskStateRule(message, context) {
  console.log("🏛️ [STATE_RULE] Processing state rule query:", message);

  try {
    // Extract state from message
    const state = extractStateFromMessage(message);
    if (!state) {
      return {
        error:
          "Could not identify state from message. Please specify a state (AZ, CA, NY, TX, NJ).",
        intent: "ask_state_rule",
      };
    }

    // Call the cleaned up facts-and-rules endpoint
    const BASE_URL = process.env.APP_BASE_URL;
    const res = await fetch(`${BASE_URL}/api/facts-and-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "state.rule",
        state: state,
        query: message,
      }),
    });

    if (!res.ok) {
      console.log("❌ [STATE_RULE] Failed to fetch state rule:", res.status);
      return {
        error: "Failed to fetch state rule. Please try again.",
        intent: "ask_state_rule",
      };
    }

    const data = await res.json();

    // If upstream failed or returned fallback, synthesize a safe rule object
    if (data.error || data.fallback || data.not_available) {
      const safeRule = {
        topic: data.topic || "state_rule",
        state: state,
        effective_year: new Date().getFullYear(),
        rule_summary:
          data.message ||
          "Up-to-date details are unavailable right now. Ask a specific question (e.g., standard deduction amount), and I'll fetch it.",
        key_numbers: Array.isArray(data.key_numbers) ? data.key_numbers : [],
        source_title: data.source_title || "Official State Source",
        source_url: data.source_url || null,
        updated_at: data.updated_at || new Date().toISOString(),
        cached: data.cached || false,
        fallback: true,
      };

      // LLM fallback: produce a user-friendly summary if we don't have specifics
      const llmText = await llmStateRuleAnswer(message, state);
      if (llmText) {
        safeRule.rule_summary = llmText;
      }
      const formatted = llmText || formatStateRuleResponse(safeRule, message);
      return {
        intent: "ask_state_rule",
        rule: safeRule,
        cached: !!safeRule.cached,
        message: formatted,
      };
    }

    // Build a richer, user-friendly message for valid data
    const formatted = formatStateRuleResponse(data, message);

    return {
      intent: "ask_state_rule",
      rule: data,
      cached: data.cached || false,
      message: formatted,
    };
  } catch (error) {
    console.error("❌ [STATE_RULE] Error processing state rule:", error);
    return {
      error: "Failed to process state rule query. Please try again.",
      intent: "ask_state_rule",
    };
  }
}

function extractStateFromMessage(message) {
  const lowerMessage = message.toLowerCase();

  // State mappings
  const stateMap = {
    arizona: "AZ",
    az: "AZ",
    california: "CA",
    ca: "CA",
    "new york": "NY",
    ny: "NY",
    texas: "TX",
    tx: "TX",
    "new jersey": "NJ",
    nj: "NJ",
  };

  // Check for state names
  for (const [key, value] of Object.entries(stateMap)) {
    if (lowerMessage.includes(key)) {
      return value;
    }
  }

  return null;
}

async function handleAskFactFresh(message, context) {
  console.log("🌐 [FACT_FRESH] Processing fact fresh query:", message);
  const startTime = Date.now();

  try {
    // If the query sounds like general advice (not a specific product), prefer LLM guidance over comparison
    if (looksLikeGeneralAdvice(message)) {
      const advice = await llmFallbackFacts(message);
      return {
        intent: "ask_fact_fresh",
        message: advice || "Here's practical guidance for your question:",
        cached: false,
      };
    }

    // Fast-path: handle stock/company queries via Finnhub if detected
    if (looksLikeStockQuery(message)) {
      const stockResponse = await getCachedDataWithFallback(
        "stock_snapshot",
        message.toLowerCase().trim(),
        async () => {
          const { ticker, queryUsed } = await resolveTickerForQuery(message);
          if (!ticker) {
            return { error: "Could not resolve ticker from query", queryUsed };
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
          intent: "ask_fact_fresh",
          fact: { topic: "stock_snapshot", ...data },
          cached: !!stockResponse?.cachedAt,
          message: formatted,
        };

        setImmediate(() =>
          logConversation({
            user_message: message,
            finny_response: response.message,
            timestamp: new Date().toISOString(),
            user_id: context?.user_id || "unknown",
            intent: "ask_fact_fresh",
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
            topic: "stock_snapshot",
          })
        );

        return response;
      }
    }

    // Call the cleaned up facts-and-rules endpoint
    const BASE_URL = process.env.APP_BASE_URL;
    const res = await fetch(`${BASE_URL}/api/facts-and-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "facts.get",
        query: message,
      }),
    });

    if (!res.ok) {
      console.log("❌ [FACT_FRESH] Failed to fetch facts:", res.status);
      const llmText = await llmFallbackFacts(message);
      return {
        intent: "ask_fact_fresh",
        fallback: true,
        message:
          llmText ||
          "I couldn't fetch live data right now, but here's what I can tell you:",
      };
    }

    const data = await res.json();

    if (data.error || data.fallback) {
      const llmText = await llmFallbackFacts(message);
      return {
        intent: "ask_fact_fresh",
        fallback: true,
        message:
          llmText ||
          "I couldn't fetch live data right now, but here's what I can tell you:",
      };
    }

    // Delegate final wording to LLM for a user-first answer
    const llmMsg = await llmFallbackFacts(message);
    const response = {
      intent: "ask_fact_fresh",
      fact: data,
      cached: data.cached || false,
      message: llmMsg || undefined,
    };

    // Log the conversation
    const conversationData = {
      user_message: message,
      finny_response: response.message || JSON.stringify(response.fact),
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "ask_fact_fresh",
      entities: [],
      confidence: 0.9,
      response_time_ms: Date.now() - startTime,
      sources_used: data.sources || [],
      cached: data.cached || false,
      topic: data.topic,
    };

    // Log conversation asynchronously
    setImmediate(() => logConversation(conversationData));

    return response;
  } catch (error) {
    console.error("❌ [FACT_FRESH] Error processing fact fresh:", error);
    const llmText = await llmFallbackFacts(message);
    return {
      intent: "ask_fact_fresh",
      fallback: true,
      message:
        llmText ||
        "I couldn't fetch live data right now, but here's what I can tell you:",
    };
  }
}

// Format product comparison response
// Removed product comparison formatter in favor of LLM summarization

// Format state rule responses (e.g., tax brackets, deductions) into a friendly summary
function formatStateRuleResponse(rule, originalQuery) {
  try {
    if (!rule || typeof rule !== "object") {
      return "Couldn't load state details right now.";
    }

    const state = rule.state || "State";
    const topic = rule.topic || "state_rule";
    const year = rule.effective_year || new Date().getFullYear();
    const title =
      topic === "state_income_tax_brackets"
        ? `STATE INCOME TAX — ${state}`
        : topic === "state_529_deduction_or_credit"
        ? `STATE 529 DEDUCTION/CREDIT — ${state}`
        : `STATE RULE — ${state}`;

    let out = `**${title} (${year})**\n\n`;

    if (rule.rule_summary) {
      out += `${rule.rule_summary}\n\n`;
    }

    // Key numbers table-ish bullets if present
    if (Array.isArray(rule.key_numbers) && rule.key_numbers.length > 0) {
      out += "**Key numbers:**\n";
      for (const kn of rule.key_numbers) {
        const label = kn.label?.replace(/_/g, " ") || "value";
        const unit = kn.unit ? ` ${kn.unit}` : "";
        out += `- ${label}: ${formatNumber(kn.value)}${unit}\n`;
      }
      out += "\n";
    }

    // If response is generic, guide the user with clarifying options
    const looksGeneric =
      topic === "state_income_tax_brackets" &&
      (!rule.key_numbers || rule.key_numbers.length === 0);

    if (looksGeneric) {
      out += "**Did you mean one of these?**\n";
      out += "- Standard deduction amount\n";
      out += "- 529 plan contribution deduction/credit limits\n";
      out += "- Itemized deduction caps or phase-outs\n";
      out += "- Retirement income exclusions (pensions, Social Security)\n";
      out += "- Child/Dependent credits and eligibility\n\n";
      out +=
        "Reply with the specific deduction or credit, and I'll pull the exact limits for " +
        `${state} (${year}).\n\n`;
    }

    if (rule.source_title || rule.updated_at) {
      const dateStr = rule.updated_at || new Date().toISOString().split("T")[0];
      out += `*Source: ${
        rule.source_title || "Official state site"
      } (${dateStr})*`;
      if (rule.source_url) {
        out += `\n${rule.source_url}`;
      }
    }

    return out;
  } catch (e) {
    return "Couldn't format the state rule details right now.";
  }
}

// === LLM fallbacks ===
async function llmFallbackFacts(message) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
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

async function llmStateRuleAnswer(message, state) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: [
              "You are Finny, a warm and knowledgeable financial advisor specializing in state-specific rules and taxes.",
              "",
              "PERSONALITY & APPROACH:",
              "- Be warm and encouraging while providing accurate information",
              "- Show enthusiasm for helping users understand complex state rules",
              "- Be direct and clear when explaining tax implications",
              "- Use the user's name when available",
              "",
              "SCOPE BOUNDARIES:",
              "- ONLY discuss state-specific financial rules, taxes, and benefits",
              "- Stay focused on actionable information users can use",
              "- Redirect non-financial questions to financial topics",
              "",
              "RESPONSE GUIDELINES:",
              "- If specific current-year numbers are unavailable, provide a clear overview of the rule for the state, typical limits, and how to check the official source",
              "- Avoid fabricating exact numbers - be transparent about data limitations",
              "- Provide actionable next steps for users",
              "- Explain complex rules in simple terms",
              "- Connect rules to the user's potential financial impact",
            ].join("\n"),
          },
          {
            role: "user",
            content: `Question: ${message}\nState: ${state}`,
          },
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

function looksLikeGeneralAdvice(message) {
  const m = message.toLowerCase();
  const adviceWords = [
    "best",
    "good",
    "recommend",
    "advice",
    "tips",
    "how to choose",
    "for students",
    "for student",
    "for beginners",
    "young adult",
  ];
  const isAdvice = adviceWords.some((w) => m.includes(w));
  const productWords = ["credit card", "credit cards", "card"];
  const mentionsCards = productWords.some((w) => m.includes(w));
  return isAdvice && mentionsCards;
}

// Deprecated: merged into llmFallbackFacts routing for general advice

function formatNumber(value) {
  if (typeof value !== "number") return String(value ?? "");
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// =====================
// GOALS: Slot-filling
// =====================

const GOAL_CATEGORY_KEYWORDS = [
  { key: "emergency_fund", words: ["emergency", "rainy", "safety"] },
  { key: "vacation", words: ["vacation", "trip", "travel", "holiday"] },
  { key: "car", words: ["car", "auto", "vehicle"] },
  {
    key: "house_down_payment",
    words: ["house", "home", "down payment", "mortgage"],
  },
  {
    key: "education",
    words: ["school", "tuition", "education", "college", "university"],
  },
  { key: "retirement", words: ["retirement", "retire", "401k", "ira"] },
  { key: "wedding", words: ["wedding", "marriage"] },
  { key: "debt_payoff", words: ["debt", "loan", "payoff", "credit card"] },
  { key: "investment", words: ["invest", "portfolio", "stock", "bond"] },
  { key: "other", words: [] },
];

function guessGoalCategory(label) {
  const m = (label || "").toLowerCase();
  for (const entry of GOAL_CATEGORY_KEYWORDS) {
    if (entry.words.some((w) => m.includes(w))) return entry.key;
  }
  // domain-specific tweak: phones/gadgets → treat as emergency_fund or other
  if (/phone|iphone|android|pixel|device|gadget/.test(m))
    return "emergency_fund";
  return "other";
}

function parseCurrencyAmount(text) {
  if (!text) return null;
  // capture $1,234.56 or 1234 or 1.2k
  const dollarMatch = text.match(/\$\s*([0-9,.]+)(?:\s*\b)/i);
  if (dollarMatch) {
    const val = Number(dollarMatch[1].replace(/,/g, ""));
    return isFinite(val) && val > 0 ? val : null;
  }
  const kMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*k\b/i);
  if (kMatch) {
    const val = Number(kMatch[1]) * 1000;
    return isFinite(val) && val > 0 ? val : null;
  }
  const numMatch = text.match(/\b([0-9]{2,})(?:\.[0-9]+)?\b/);
  if (numMatch) {
    const val = Number(numMatch[1]);
    return isFinite(val) && val > 0 ? val : null;
  }
  return null;
}

function parseTargetDate(text) {
  if (!text) return null;
  const now = new Date();
  // Patterns like "by Dec", "by December 15", "by 12/31/2025", "by December 2025", "next month", "in 6 weeks"
  const byDate = text.match(
    /\bby\s+([a-zA-Z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|[a-zA-Z]+\s+\d{4}|[a-zA-Z]+)\b/i
  );
  const onDate = text.match(
    /\b(on|by)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/i
  );
  const monthOnly = text.match(
    /\bby\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  const nextMonth = /\bnext\s+month\b/i.test(text);
  const inWeeks = text.match(/\bin\s+(\d{1,2})\s+weeks?\b/i);
  const inMonths = text.match(/\bin\s+(\d{1,2})\s+months?\b/i);
  const bareMonths = text.match(/\b(\d{1,2})\s+months?\b/i);
  const ddMonthYYYY = text.match(
    /\bby\s+(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?\b/i
  );
  const monthYYYY = text.match(
    /\bby\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/i
  );
  // NEW: Standalone month-year patterns (without "by" prefix)
  const standaloneMonthYYYY = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i
  );
  const standaloneDdMonthYYYY = text.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i
  );
  const standaloneMonthOnly = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );

  let d = null;
  if (onDate && onDate[2]) {
    d = new Date(onDate[2]);
  } else if (byDate && byDate[1]) {
    // Try direct parsing first
    d = new Date(byDate[1]);
    if (isNaN(d.getTime())) {
      // try MM/DD parsing
      d = new Date(byDate[1].replace(/-/g, "/"));
    }
    // If still invalid, check if it's a "Month YYYY" format like "December 2025"
    if (isNaN(d.getTime())) {
      const monthYearMatch = byDate[1].match(/^([a-zA-Z]+)\s+(\d{4})$/i);
      if (monthYearMatch) {
        const monStr = monthYearMatch[1].toLowerCase().slice(0, 3);
        const year = Number(monthYearMatch[2]);
        const monthIdx = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ].indexOf(monStr);
        if (monthIdx >= 0) d = new Date(year, monthIdx, 1);
      }
    }
  } else if (ddMonthYYYY) {
    const day = Number(ddMonthYYYY[1]);
    const monStr = ddMonthYYYY[2].toLowerCase().slice(0, 3);
    const year = ddMonthYYYY[3] ? Number(ddMonthYYYY[3]) : now.getFullYear();
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, day);
  } else if (monthYYYY) {
    const monStr = monthYYYY[1].toLowerCase().slice(0, 3);
    const year = Number(monthYYYY[2]);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, 1);
  } else if (standaloneMonthYYYY) {
    // Handle "December 2025", "Dec 2025", etc.
    const monStr = standaloneMonthYYYY[1].toLowerCase().slice(0, 3);
    const year = Number(standaloneMonthYYYY[2]);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, 1);
  } else if (standaloneDdMonthYYYY) {
    // Handle "15 December 2025", "15 Dec 2025", etc.
    const day = Number(standaloneDdMonthYYYY[1]);
    const monStr = standaloneDdMonthYYYY[2].toLowerCase().slice(0, 3);
    const year = Number(standaloneDdMonthYYYY[3]);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, day);
  } else if (monthOnly && monthOnly[1]) {
    const monthStr = monthOnly[1].toLowerCase().slice(0, 3);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monthStr);
    if (monthIdx >= 0) {
      d = new Date(now.getFullYear(), monthIdx, 1);
      if (d < now) d = new Date(now.getFullYear() + 1, monthIdx, 1);
    }
  } else if (standaloneMonthOnly && standaloneMonthOnly[1]) {
    // Handle standalone "December", "Dec", etc. (without "by")
    const monthStr = standaloneMonthOnly[1].toLowerCase().slice(0, 3);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monthStr);
    if (monthIdx >= 0) {
      d = new Date(now.getFullYear(), monthIdx, 1);
      if (d < now) d = new Date(now.getFullYear() + 1, monthIdx, 1);
    }
  } else if (nextMonth) {
    d = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  } else if (inWeeks) {
    const weeks = Number(inWeeks[1]);
    d = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  } else if (inMonths) {
    const months = Number(inMonths[1]);
    d = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  } else if (bareMonths) {
    const months = Number(bareMonths[1]);
    d = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  }

  if (d && !isNaN(d.getTime())) {
    // ensure in the future
    const dMid = new Date(d);
    dMid.setHours(0, 0, 0, 0);
    const nowMid = new Date();
    nowMid.setHours(0, 0, 0, 0);
    if (dMid <= nowMid) {
      // bump by one month as a safe default
      d = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }
    return d.toISOString().split("T")[0];
  }
  return null;
}

function extractLabel(text, amount, dateStr) {
  let t = (text || "").trim();
  // remove amount and date hints to isolate a label-ish phrase
  t = t.replace(/\$[0-9,.]+/g, "");
  t = t.replace(/\bin\s+\d+\s+(weeks?|months?)\b/gi, "");
  t = t.replace(/\bby\b[^.]+/gi, "");
  t = t.replace(/\bfor\b/gi, "");
  // pick concise label
  const m =
    t.match(/add\s+a?\s*goal\s*(?:for|to)?\s*(.*)/i) ||
    t.match(
      /i\s*want\s*to\s*(?:add|set)\s*(?:a\s*)?goal\s*(?:for|to)?\s*(.*)/i
    );
  const raw = m && m[1] ? m[1].trim() : t;
  return raw.replace(/^[,\s:-]+|[,\s:-]+$/g, "").slice(0, 60) || null;
}

async function handleGoal(message, context) {
  const startTime = Date.now();
  const userId = context?.user_id;
  if (!userId) {
    return {
      message: "Please log in to create a goal.",
      type: "assistant",
      intent: "goal",
    };
  }

  // Pull prior flow state if any
  const priorFlow = (context && context.goal_flow) || {};
  const priorSlots = priorFlow.slots || {};

  // Extract from current message
  const extracted = {
    target_amount: parseCurrencyAmount(message),
    target_date: parseTargetDate(message),
    label: null,
    category: null,
  };

  // Improve label parsing to avoid echoing the whole sentence
  const labelFromFor = message.match(
    /\bgoal\b.*?\bfor\b\s+([^$\d\n]+?)(?:\s+for|\s+by|\s+in|\s+on|\s*\$|\s*\d|$)/i
  );
  const labelAlt = message.match(
    /\bfor\b\s+([^$\d\n]+?)(?:\s+by|\s+in|\s+on|\s*\$|\s*\d|$)/i
  );
  // Handle "Create a [ITEM] goal" pattern
  const labelFromCreatePattern = message.match(
    /(?:create|set|add)\s+(?:a\s+)?([^$\d\n]+?)\s+goal(?:\s+of|\s+for|\s|$)/i
  );
  const lbl =
    (labelFromFor && labelFromFor[1]) ||
    (labelAlt && labelAlt[1]) ||
    (labelFromCreatePattern && labelFromCreatePattern[1]) ||
    extractLabel(message);
  if (lbl) extracted.label = lbl.replace(/\s{2,}/g, " ").trim();
  if (extracted.label) extracted.category = guessGoalCategory(extracted.label);

  // Merge with prior
  const slots = {
    label: priorSlots.label || extracted.label || null,
    target_amount: priorSlots.target_amount || extracted.target_amount || null,
    target_date: priorSlots.target_date || extracted.target_date || null,
    category:
      priorSlots.category ||
      extracted.category ||
      (priorSlots.label ? guessGoalCategory(priorSlots.label) : null) ||
      null,
  };

  // Missing management
  const missing = [];
  if (!slots.label) missing.push("label");
  if (!slots.target_amount) missing.push("target_amount");
  if (!slots.target_date) missing.push("target_date");
  if (!slots.category) missing.push("category");

  if (missing.length > 0) {
    const prettyLabel = String(slots.label || "this goal")
      .replace(/^(create|set|add)\b.*$/i, "")
      .trim();
    const base = prettyLabel.length > 0 ? prettyLabel : "this goal";
    // Add encouraging first message if this is the very first prompt
    const isFirstPrompt =
      missing.length === Object.keys(slots).filter((k) => !slots[k]).length;
    let encouragingPrefix = "";
    if (isFirstPrompt && missing[0] === "label") {
      encouragingPrefix = "🎯 Let's set up a new goal together! ";
    } else if (isFirstPrompt) {
      encouragingPrefix = "Great start! ";
    }

    const prompts = {
      label: `${encouragingPrefix}What should I call this goal? (e.g., Emergency fund, Dream vacation)`,
      target_amount: `Perfect! 💰 How much do you want to save for your ${base} goal? (e.g., $500)`,
      target_date: `Awesome! ⏰ When would you like to hit your ${base} goal? (e.g., by Dec 15 or in 3 months)`,
      category:
        "Great! Which category fits best? (emergency_fund, vacation, car, other)",
    };
    const nextKey = missing[0];
    return {
      intent: "goal",
      message: prompts[nextKey],
      missing: [nextKey],
      flow: { active: true, slots },
    };
  }

  // All slots captured → confirmation stage then insert
  const isConfirmStage = (priorFlow && priorFlow.stage) === "confirm";
  const wantsConfirm =
    /\b(confirm|yes|create|looks good|go ahead|save)\b/i.test(message);
  const wantsCancel = /\b(cancel|stop|nevermind|no)\b/i.test(message);

  // If in confirm stage and user canceled
  if (isConfirmStage && wantsCancel) {
    return {
      intent: "goal",
      message: "No problem — I canceled the goal setup.",
      flow: { active: false },
    };
  }

  // If in confirm stage and user confirmed → proceed to insert
  if (isConfirmStage && wantsConfirm) {
    // Skip to insertion logic
  } else if (
    isConfirmStage &&
    !wantsConfirm &&
    !wantsCancel &&
    (extracted.target_amount ||
      extracted.target_date ||
      extracted.label ||
      extracted.category)
  ) {
    // User is in confirm stage and sent edits (amount/date/label/category), apply and re-confirm
    const updatedSlots = {
      ...slots,
      target_amount: extracted.target_amount || slots.target_amount,
      target_date: extracted.target_date || slots.target_date,
      label: extracted.label || slots.label,
      category: extracted.category || slots.category,
    };
    const prettyLabel2 = String(updatedSlots.label);
    const niceAmt2 = `$${Number(updatedSlots.target_amount).toLocaleString()}`;
    const confirmText2 = `**Goal Summary:**
• **Name:** ${prettyLabel2}
• **Amount:** ${niceAmt2}
• **Due:** ${updatedSlots.target_date}
• **Category:** ${
      updatedSlots.category || guessGoalCategory(updatedSlots.label)
    }

Ready to create this goal?`;
    return {
      intent: "goal",
      message: confirmText2,
      type: "action",
      actions: [
        {
          label: "Cancel",
          action: "cancel",
          style: "secondary",
        },
        {
          label: "Confirm ✨",
          action: "confirm",
          style: "primary",
        },
      ],
      flow: { active: true, stage: "confirm", slots: updatedSlots },
    };
  }

  if (!isConfirmStage && !wantsConfirm) {
    const prettyLabel = String(slots.label);
    const niceAmt = `$${Number(slots.target_amount).toLocaleString()}`;
    const confirmText = `**Goal Summary:**
• **Name:** ${prettyLabel}
• **Amount:** ${niceAmt}
• **Due:** ${slots.target_date}
• **Category:** ${slots.category || guessGoalCategory(slots.label)}

Ready to create this goal?`;
    return {
      intent: "goal",
      message: confirmText,
      type: "action",
      actions: [
        {
          label: "Cancel",
          action: "cancel",
          style: "secondary",
        },
        {
          label: "Confirm ✨",
          action: "confirm",
          style: "primary",
        },
      ],
      flow: { active: true, stage: "confirm", slots },
    };
  }

  // If in confirm stage and user confirmed or provided confirm keyword → insert
  if (!isConfirmStage || wantsConfirm) {
    // proceed to insert
  }

  // All slots captured → insert
  const goalRow = {
    user_id: userId,
    label: String(slots.label),
    description: null,
    note: null,
    target_amount: Math.round(Number(slots.target_amount)),
    current_amount: 0,
    target_date: String(slots.target_date),
    category: String(slots.category || guessGoalCategory(slots.label)),
    status: "active",
  };

  try {
    const insertT0 = Date.now();
    const { data, error } = await supabase
      .from("goals")
      .insert([goalRow])
      .select()
      .single();
    const latency = Date.now() - insertT0;

    if (error) {
      console.error("❌ [GOAL] Insert failed:", error);
      return {
        intent: "goal",
        message:
          "I couldn't save that goal right now. Please try again shortly.",
      };
    }

    // Log asynchronously
    setImmediate(() =>
      logConversation({
        user_message: redactPII(message),
        finny_response: `Goal created: ${goalRow.label}`,
        timestamp: new Date().toISOString(),
        user_id: userId,
        intent: "goal",
        entities: [
          goalRow.label,
          String(goalRow.target_amount),
          goalRow.target_date,
          goalRow.category,
        ],
        confidence: 1.0,
        response_time_ms: Date.now() - startTime,
        sources_used: ["supabase:goals.insert"],
        cached: false,
        request_id: generateRequestId(),
        metrics: { intent: "goal", latency_ms: { insert: latency } },
      })
    );

    const niceAmt = `$${Number(goalRow.target_amount).toLocaleString()}`;
    return {
      intent: "goal",
      message: `🎉 Amazing! Your "${goalRow.label}" goal is all set for ${niceAmt} by ${goalRow.target_date}!

You're officially on your financial journey now. This is such a great step forward - every goal starts with a decision, and you just made yours! 🌟`,
      goal: data,
      flow: { active: false },
    };
  } catch (e) {
    console.error("❌ [GOAL] Unexpected error:", e);
    return {
      intent: "goal",
      message: "Hit an error while saving your goal. Please try again.",
    };
  }
}

// Detect if the message is asking about financial products
function detectProductQuery(message) {
  const lowerMessage = message.toLowerCase();

  // Check for product comparison patterns
  const comparisonPatterns = [
    "vs",
    "versus",
    "compare",
    "which",
    "better",
    "best",
    "chase",
    "amex",
    "american express",
    "capital one",
    "citi",
    "discover",
    "wells fargo",
    "bank of america",
    "credit card",
    "sapphire",
    "gold",
    "platinum",
    "freedom",
    "venture",
    "robinhood",
    "fidelity",
    "vanguard",
    "schwab",
    "etrade",
  ];

  const hasProductQuery = comparisonPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );

  return hasProductQuery;
}

// Detect if the message is asking about rent vs buy
function detectRentVsBuyQuery(message) {
  const lowerMessage = message.toLowerCase();

  const rentVsBuyPatterns = [
    "rent vs buy",
    "rent versus buy",
    "rent or buy",
    "should i rent or buy",
    "renting vs buying",
    "renting versus buying",
    "renting or buying",
    "home buying",
    "buy a house",
    "buy a home",
    "purchase a home",
    "purchase a house",
  ];

  const hasRentVsBuy = rentVsBuyPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );

  if (hasRentVsBuy) {
    // Extract location if mentioned
    const locationPatterns = [
      /in\s+([a-zA-Z\s]+)/i,
      /at\s+([a-zA-Z\s]+)/i,
      /([a-zA-Z\s]+)\s+rent/i,
      /([a-zA-Z\s]+)\s+buy/i,
    ];

    let location = null;
    for (const pattern of locationPatterns) {
      const match = lowerMessage.match(pattern);
      if (match && match[1]) {
        location = match[1].trim();
        break;
      }
    }

    return {
      type: "rent_vs_buy",
      location: location,
      originalMessage: message,
    };
  }

  return null;
}

// Fetch market data for rent vs buy analysis
async function fetchMarketData(query) {
  try {
    // For now, return mock data - in production you'd fetch from real estate APIs
    // like Zillow, Realtor.com, or Census data
    const mockMarketData = {
      location: query.location || "Arizona",
      median_home_price: 450000,
      median_rent: 1800,
      mortgage_rate: 7.2,
      property_tax_rate: 0.006,
      home_insurance_rate: 0.003,
      hoa_fees: 200,
      market_trend: "stable",
      price_to_rent_ratio: 20.8,
      affordability_index: 0.65,
    };

    console.log("🔍 [FINNY] Returning mock market data for:", query.location);
    return mockMarketData;
  } catch (error) {
    console.error("Error in fetchMarketData:", error);
    return null;
  }
}

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

// Entity extraction functions
function extractEntitiesRuleBased(message) {
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
        // Special handling for states - only match if there's context
        if (category === "states") {
          const stateContext = [
            "tax",
            "rule",
            "benefit",
            "in",
            "state",
            "law",
            "regulation",
          ];
          const hasStateContext = stateContext.some((ctx) =>
            lowerMessage.includes(ctx)
          );

          if (hasStateContext || pattern.length > 2) {
            entities[category].push(pattern);
            entities.rawEntities.push(pattern);
          }
        } else {
          entities[category].push(pattern);
          entities.rawEntities.push(pattern);
        }
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

async function extractEntitiesLLM(message, entities) {
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
                  },
                  creditCardNames: { type: "array", items: { type: "string" } },
                  banks: { type: "array", items: { type: "string" } },
                  investmentPlatforms: {
                    type: "array",
                    items: { type: "string" },
                  },
                  financialProducts: {
                    type: "array",
                    items: { type: "string" },
                  },
                  comparisonWords: { type: "array", items: { type: "string" } },
                  states: { type: "array", items: { type: "string" } },
                  rawEntities: { type: "array", items: { type: "string" } },
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
      return entities;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return entities;
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
    return entities;
  }
}

async function extractEntities(message) {
  console.log("🔍 [ENTITY_EXTRACTOR] Extracting entities from:", message);

  const ruleBasedEntities = extractEntitiesRuleBased(message);
  console.log("🔍 [ENTITY_EXTRACTOR] Rule-based entities:", ruleBasedEntities);

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

function determineIntent(entities, message) {
  const lowerMessage = message.toLowerCase();

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

  return {
    intent: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
    reasoning: "Default to personalized query",
  };
}

// Domain mapping functions
function getDomainMapping(entity) {
  const lowerEntity = entity.toLowerCase();
  return DOMAIN_MAPPINGS[lowerEntity] || null;
}

function getRelevantDomains(entities) {
  const domains = new Set();

  for (const entity of entities.rawEntities) {
    const mapping = getDomainMapping(entity);
    if (mapping) {
      domains.add(mapping.primary);
    }
  }

  if (domains.size === 0) {
    domains.add("consumerfinance.gov");
    domains.add("nerdwallet.com");
  }

  return Array.from(domains);
}

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
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
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
    const plan = JSON.parse(content);
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

function buildSearchUrls(domain, entity, searchPaths = []) {
  const urls = [];

  const mapping = getDomainMapping(entity);
  if (mapping) {
    mapping.searchPaths.forEach((path) => {
      urls.push(`https://${mapping.primary}${path}`);
    });
  } else {
    searchPaths.forEach((path) => {
      urls.push(`https://${domain}${path}`);
    });
  }

  if (urls.length === 0) {
    urls.push(`https://${domain}`);
  }

  return urls;
}

function getSearchStrategy(entities, message) {
  const lowerMessage = message.toLowerCase();

  const isComparison =
    entities.comparisonWords.length > 0 ||
    lowerMessage.includes("vs") ||
    lowerMessage.includes("compare");

  const domains = getRelevantDomains(entities);

  const searchUrls = [];
  for (const domain of domains) {
    const urls = buildSearchUrls(domain, entities.rawEntities[0] || "", []);
    searchUrls.push(...urls);
  }

  return {
    isComparison,
    domains,
    searchUrls,
    strategy: isComparison ? "comparison" : "product_info",
  };
}

// Web scraping functions
async function rateLimitedFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      url,
      options: {
        ...options,
        timeout: RATE_LIMITS.timeout,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FinancifyBot/1.0)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          ...options.headers,
        },
      },
      resolve,
      reject,
      retries: 0,
    };

    requestQueue.push(request);
    processQueue();
  });
}

async function processQueue() {
  if (
    activeRequests >= RATE_LIMITS.maxConcurrent ||
    requestQueue.length === 0
  ) {
    return;
  }

  const request = requestQueue.shift();
  activeRequests++;

  try {
    const result = await executeRequest(request);
    request.resolve(result);
  } catch (error) {
    if (request.retries < RATE_LIMITS.maxRetries) {
      request.retries++;
      requestQueue.unshift(request);
    } else {
      request.reject(error);
    }
  } finally {
    activeRequests--;
    setTimeout(() => processQueue(), RATE_LIMITS.delayBetweenRequests);
  }
}

async function executeRequest(request) {
  const { url, options } = request;

  console.log(`🌐 [WEB_SCRAPER] Fetching: ${url}`);

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  return {
    url,
    html,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function extractDataFromHTML(html, url, entityType = "credit_card") {
  const $ = cheerio.load(html);
  const extractedData = {
    url,
    entityType,
    title: $("title").text().trim(),
    description: $('meta[name="description"]').attr("content") || "",
    extractedAt: new Date().toISOString(),
    data: {},
  };

  switch (entityType) {
    case "credit_card":
      extractedData.data = extractCreditCardData($);
      break;
    case "bank":
      extractedData.data = extractBankData($);
      break;
    case "investment":
      extractedData.data = extractInvestmentData($);
      break;
    default:
      extractedData.data = extractGenericData($);
  }

  return extractedData;
}

function extractCreditCardData($) {
  const data = {
    apr: [],
    annualFee: [],
    rewards: [],
    benefits: [],
    features: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();
    const aprMatch = text.match(/(\d+\.?\d*)\s*%\s*APR/i);
    if (aprMatch) {
      data.apr.push({
        value: parseFloat(aprMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }

    const feeMatch = text.match(/\$(\d+)\s*annual\s*fee/i);
    if (feeMatch) {
      data.annualFee.push({
        value: parseFloat(feeMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }

    if (
      text.toLowerCase().includes("rewards") ||
      text.toLowerCase().includes("cash back")
    ) {
      data.rewards.push({
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }
  });

  $(
    '.benefits, .features, .perks, [class*="benefit"], [class*="feature"]'
  ).each((i, element) => {
    const benefitText = $(element).text().trim();
    if (benefitText) {
      data.benefits.push(benefitText);
    }
  });

  return data;
}

function extractBankData($) {
  const data = {
    interestRates: [],
    fees: [],
    features: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();
    const rateMatch = text.match(/(\d+\.?\d*)\s*%\s*APY/i);
    if (rateMatch) {
      data.interestRates.push({
        value: parseFloat(rateMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }
  });

  return data;
}

function extractInvestmentData($) {
  const data = {
    fees: [],
    features: [],
    accountTypes: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();
    const feeMatch = text.match(/\$(\d+\.?\d*)\s*per\s*trade/i);
    if (feeMatch) {
      data.fees.push({
        value: parseFloat(feeMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }
  });

  return data;
}

function extractGenericData($) {
  const data = {
    keyNumbers: [],
    features: [],
    benefits: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();

    const rateMatch = text.match(/(\d+\.?\d*)\s*%/);
    if (rateMatch) {
      data.keyNumbers.push({
        type: "percentage",
        value: parseFloat(rateMatch[1]),
        text: text.trim(),
      });
    }

    const dollarMatch = text.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (dollarMatch) {
      data.keyNumbers.push({
        type: "dollar",
        value: parseFloat(dollarMatch[1].replace(/,/g, "")),
        text: text.trim(),
      });
    }
  });

  return data;
}

async function scrapeMultipleUrls(urls, entityType = "credit_card") {
  console.log(`🌐 [WEB_SCRAPER] Starting scrape of ${urls.length} URLs`);

  const results = [];
  const errors = [];

  for (const url of urls) {
    try {
      const response = await rateLimitedFetch(url);
      const extractedData = extractDataFromHTML(response.html, url, entityType);
      results.push(extractedData);
      console.log(`✅ [WEB_SCRAPER] Successfully scraped: ${url}`);
    } catch (error) {
      console.error(`❌ [WEB_SCRAPER] Failed to scrape ${url}:`, error.message);
      errors.push({ url, error: error.message });
    }
  }

  return {
    results,
    errors,
    successCount: results.length,
    errorCount: errors.length,
  };
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
async function clearUserCache(userId) {
  try {
    console.log(`🗑️ [CACHE] Clearing all cache for user: ${userId}`);

    // Clear user-specific cache entries
    const { error } = await supabase
      .from("web_scrape_cache")
      .delete()
      .eq("user_specific", true)
      .like("cache_key", `%_${userId}`);

    if (error) {
      console.error("❌ [CACHE] Error clearing user cache:", error);
      return false;
    }

    console.log(`✅ [CACHE] Cleared cache for user: ${userId}`);
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in clearUserCache:", error);
    return false;
  }
}

async function clearCacheByType(type, identifier = null) {
  try {
    console.log(
      `🗑️ [CACHE] Clearing cache for type: ${type}, identifier: ${identifier}`
    );

    let query = supabase
      .from("web_scrape_cache")
      .delete()
      .eq("data_type", type);

    if (identifier) {
      query = query.like("cache_key", `%_${identifier}`);
    }

    const { error } = await query;

    if (error) {
      console.error("❌ [CACHE] Error clearing cache by type:", error);
      return false;
    }

    console.log(`✅ [CACHE] Cleared cache for type: ${type}`);
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in clearCacheByType:", error);
    return false;
  }
}

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

// Deduplication function for web research
async function deduplicatedWebResearch(message, userId = null) {
  const cacheKey = `web_research_${message.toLowerCase().trim()}`;

  // Check if request is already pending
  if (pendingRequests.has(cacheKey)) {
    console.log(
      "🔄 [WEB_RESEARCH] Request already pending, waiting for result"
    );
    return await pendingRequests.get(cacheKey);
  }

  // Create new request promise
  const requestPromise = researchFinancialProducts(message, userId);
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Clean up pending request
    pendingRequests.delete(cacheKey);
  }
}

// Main web research function
async function researchFinancialProducts(message, userId = null) {
  console.log("🔍 [WEB_RESEARCH] Starting research for:", message);

  try {
    const entities = await extractEntities(message);
    console.log("🔍 [WEB_RESEARCH] Extracted entities:", entities);

    const intent = determineIntent(entities, message);
    console.log("🔍 [WEB_RESEARCH] Determined intent:", intent);

    const searchStrategy = getSearchStrategy(entities, message);
    console.log("🔍 [WEB_RESEARCH] Search strategy:", searchStrategy);

    const researchResults = await researchDomains(
      searchStrategy,
      entities,
      userId
    );
    const combinedResults = combineResearchResults(
      researchResults,
      entities,
      intent
    );

    return {
      success: true,
      entities,
      intent,
      searchStrategy,
      results: combinedResults,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ [WEB_RESEARCH] Research failed:", error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function researchDomains(searchStrategy, entities, userId) {
  const results = [];

  for (const url of searchStrategy.searchUrls) {
    try {
      const entityType = determineEntityType(entities, url);

      const cachedResult = await getCachedDataWithFallback(
        entityType,
        url,
        async () => {
          console.log(`🌐 [WEB_RESEARCH] Scraping ${url}`);
          return await scrapeMultipleUrls([url], entityType);
        },
        false
      );

      if (cachedResult && cachedResult.data.results.length > 0) {
        results.push({
          url,
          entityType,
          data: cachedResult.data.results[0],
          source: cachedResult.source,
          cachedAt: cachedResult.cachedAt,
        });
      }
    } catch (error) {
      console.error(`❌ [WEB_RESEARCH] Failed to research ${url}:`, error);
      results.push({
        url,
        error: error.message,
        failed: true,
      });
    }
  }

  return results;
}

function determineEntityType(entities, url) {
  if (
    entities.creditCardIssuers.length > 0 ||
    entities.creditCardNames.length > 0
  ) {
    return "creditCard";
  }
  if (entities.banks.length > 0) {
    return "bank";
  }
  if (entities.investmentPlatforms.length > 0) {
    return "investment";
  }
  return "generic";
}

function combineResearchResults(researchResults, entities, intent) {
  const combined = {
    summary: {
      totalSources: researchResults.length,
      successfulSources: researchResults.filter((r) => !r.failed).length,
      failedSources: researchResults.filter((r) => r.failed).length,
    },
    products: [],
    comparisons: [],
    keyMetrics: {},
    recommendations: [],
  };

  for (const result of researchResults) {
    if (result.failed) continue;

    const product = {
      source: result.url,
      title: result.data.title,
      description: result.data.description,
      metrics: extractKeyMetrics(result.data.data),
      benefits: extractBenefits(result.data.data),
      features: extractFeatures(result.data.data),
    };

    combined.products.push(product);
  }

  if (intent.intent === "ask_personalized" && intent.needs_web) {
    combined.comparisons = generateComparisons(combined.products, entities);
  }

  combined.keyMetrics = extractKeyMetricsAcrossProducts(combined.products);

  return combined;
}

function extractKeyMetrics(data) {
  const metrics = {};

  if (data.apr && data.apr.length > 0) {
    metrics.apr = data.apr.map((apr) => apr.value);
  }

  if (data.annualFee && data.annualFee.length > 0) {
    metrics.annualFee = data.annualFee.map((fee) => fee.value);
  }

  if (data.interestRates && data.interestRates.length > 0) {
    metrics.interestRates = data.interestRates.map((rate) => rate.value);
  }

  if (data.fees && data.fees.length > 0) {
    metrics.fees = data.fees.map((fee) => fee.value);
  }

  return metrics;
}

function extractBenefits(data) {
  const benefits = [];

  if (data.benefits && data.benefits.length > 0) {
    benefits.push(...data.benefits);
  }

  if (data.rewards && data.rewards.length > 0) {
    benefits.push(...data.rewards.map((r) => r.text));
  }

  return benefits;
}

function extractFeatures(data) {
  const features = [];

  if (data.features && data.features.length > 0) {
    features.push(...data.features);
  }

  if (data.keyNumbers && data.keyNumbers.length > 0) {
    features.push(...data.keyNumbers.map((kn) => kn.text));
  }

  return features;
}

function generateComparisons(products, entities) {
  const comparisons = [];

  if (products.length < 2) {
    return comparisons;
  }

  // Optional capping to reduce O(n^2) blowup
  const options = (entities && entities.comparisonOptions) || {};
  const envTopN = parseInt(process.env.FINNY_COMPARISON_TOP_N || "", 10);
  const envMaxPairs = parseInt(
    process.env.FINNY_COMPARISON_MAX_PAIRS || "",
    10
  );
  const topN = Number.isFinite(options.topN)
    ? options.topN
    : Number.isFinite(envTopN)
    ? envTopN
    : undefined;
  const maxPairs = Number.isFinite(options.maxPairs)
    ? options.maxPairs
    : Number.isFinite(envMaxPairs)
    ? envMaxPairs
    : undefined;

  let workingProducts = products;
  if (topN && products.length > topN) {
    // Rank products by a simple composite of key metrics.
    // Lower APR and Annual Fee are better; higher Interest Rates are better.
    // We convert to a score where lower is better: apr + annualFee - interestRates
    const scored = products.map((p) => {
      const aprAvg =
        Array.isArray(p.metrics?.apr) && p.metrics.apr.length
          ? p.metrics.apr.reduce((s, v) => s + v, 0) / p.metrics.apr.length
          : undefined;
      const feeAvg =
        Array.isArray(p.metrics?.annualFee) && p.metrics.annualFee.length
          ? p.metrics.annualFee.reduce((s, v) => s + v, 0) /
            p.metrics.annualFee.length
          : undefined;
      const irAvg =
        Array.isArray(p.metrics?.interestRates) &&
        p.metrics.interestRates.length
          ? p.metrics.interestRates.reduce((s, v) => s + v, 0) /
            p.metrics.interestRates.length
          : undefined;

      const parts = [];
      if (typeof aprAvg === "number") parts.push(aprAvg);
      if (typeof feeAvg === "number") parts.push(feeAvg);
      if (typeof irAvg === "number") parts.push(-irAvg); // invert so higher IR helps lower score

      const score = parts.length
        ? parts.reduce((s, v) => s + v, 0) / parts.length
        : Number.POSITIVE_INFINITY; // deprioritize when no metrics

      return { product: p, score };
    });

    scored.sort((a, b) => a.score - b.score);
    workingProducts = scored.slice(0, topN).map((s) => s.product);
  }

  let pairCount = 0;
  for (let i = 0; i < workingProducts.length; i++) {
    for (let j = i + 1; j < workingProducts.length; j++) {
      if (typeof maxPairs === "number" && pairCount >= maxPairs) {
        return comparisons;
      }
      const product1 = workingProducts[i];
      const product2 = workingProducts[j];
      pairCount++;

      const comparison = {
        product1: product1.title,
        product2: product2.title,
        metrics: {
          apr: compareMetrics(
            product1.metrics.apr,
            product2.metrics.apr,
            "lower"
          ),
          annualFee: compareMetrics(
            product1.metrics.annualFee,
            product2.metrics.annualFee,
            "lower"
          ),
          interestRates: compareMetrics(
            product1.metrics.interestRates,
            product2.metrics.interestRates,
            "higher"
          ),
        },
        winner: determineWinner(product1, product2),
      };

      comparisons.push(comparison);
    }
  }

  return comparisons;
}

function compareMetrics(metrics1, metrics2, betterDirection) {
  if (
    !metrics1 ||
    !metrics2 ||
    metrics1.length === 0 ||
    metrics2.length === 0
  ) {
    return { result: "insufficient_data" };
  }

  const avg1 = metrics1.reduce((sum, val) => sum + val, 0) / metrics1.length;
  const avg2 = metrics2.reduce((sum, val) => sum + val, 0) / metrics2.length;

  if (betterDirection === "lower") {
    return {
      result:
        avg1 < avg2
          ? "product1_better"
          : avg2 < avg1
          ? "product2_better"
          : "tie",
      product1: avg1,
      product2: avg2,
    };
  } else {
    return {
      result:
        avg1 > avg2
          ? "product1_better"
          : avg2 > avg1
          ? "product2_better"
          : "tie",
      product1: avg1,
      product2: avg2,
    };
  }
}

function determineWinner(product1, product2) {
  let score1 = 0;
  let score2 = 0;

  if (product1.metrics.apr && product2.metrics.apr) {
    const aprComparison = compareMetrics(
      product1.metrics.apr,
      product2.metrics.apr,
      "lower"
    );
    if (aprComparison.result === "product1_better") score1++;
    else if (aprComparison.result === "product2_better") score2++;
  }

  if (product1.metrics.annualFee && product2.metrics.annualFee) {
    const feeComparison = compareMetrics(
      product1.metrics.annualFee,
      product2.metrics.annualFee,
      "lower"
    );
    if (feeComparison.result === "product1_better") score1++;
    else if (feeComparison.result === "product2_better") score2++;
  }

  if (score1 > score2) return "product1";
  if (score2 > score1) return "product2";
  return "tie";
}

function extractKeyMetricsAcrossProducts(products) {
  const metrics = {
    apr: [],
    annualFee: [],
    interestRates: [],
    fees: [],
  };

  for (const product of products) {
    if (product.metrics.apr) metrics.apr.push(...product.metrics.apr);
    if (product.metrics.annualFee)
      metrics.annualFee.push(...product.metrics.annualFee);
    if (product.metrics.interestRates)
      metrics.interestRates.push(...product.metrics.interestRates);
    if (product.metrics.fees) metrics.fees.push(...product.metrics.fees);
  }

  const averages = {};
  for (const [key, values] of Object.entries(metrics)) {
    if (values.length > 0) {
      averages[key] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
  }

  return {
    ranges: metrics,
    averages,
  };
}

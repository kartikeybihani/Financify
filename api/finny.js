// api/finny.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  console.log("🤖 [FINNY] Request received:", req.method);

  if (req.method !== "POST") {
    console.log("❌ [FINNY] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, message, context, ...otherParams } = req.body;
  console.log("📝 [FINNY] Action:", action);
  console.log("📝 [FINNY] Message received:", message);
  console.log("📊 [FINNY] Context provided:", context ? "Yes" : "No");
  console.log("📊 [FINNY] Context:", context);

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  try {
    let response;

    switch (action) {
      case "classify":
        response = await handleClassify(message, context);
        break;
      case "ask":
        response = await handleAsk(message, context);
        break;
      case "goal":
        response = { message: "Let's set a new goal", type: "assistant" };
        break;
      case "ask_state_rule":
        response = await handleAskStateRule(message, context);
        break;
      case "ask_fact_fresh":
        response = await handleAskFactFresh(message, context);
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

  try {
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

    // 2) Check if this is a merchant-specific query that needs enhanced data
    const merchantQuery = detectMerchantQuery(message);
    let enhancedData = null;

    if (merchantQuery) {
      console.log("🔍 [FINNY] Detected merchant query:", merchantQuery);
      enhancedData = await fetchEnhancedMerchantData(userId, merchantQuery);
      console.log(
        "🔍 [FINNY] Enhanced data result:",
        enhancedData ? "Success" : "Failed"
      );
    } else {
      console.log("🔍 [FINNY] No merchant query detected for:", message);
    }

    // 3) Fetch financial summary from store_accounts endpoint
    const BASE_URL = process.env.APP_BASE_URL;
    const res = await fetch(`${BASE_URL}/api/store_accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "financial_summary",
        user_id: userId,
      }),
    });

    if (!res.ok) {
      console.log("❌ [FINNY] Failed to fetch financial summary:", res.status);
      return {
        message:
          "I couldn't load your financial summary yet. Try again in a moment.",
        type: "assistant",
      };
    }

    const snap = await res.json();
    console.log("✅ [FINNY] Fetched financial summary:", Object.keys(snap));

    // Add enhanced merchant data to snap if available
    if (enhancedData) {
      snap.enhanced = enhancedData;
    }

    // 3) Build a comprehensive prompt using the complete RPC data
    const system = [
      "You are Finny: warm, encouraging, blunt when needed.",
      "Use the complete financial data provided. Give accurate, detailed responses based on all available information.",
      "Do not show net worth calculations or mathematical formulas - just state the facts clearly.",
      "IMPORTANT: In transaction data, EXPENSE means money spent (going out), INCOME means money received (coming in).",
      "Only add investment disclaimer ('Note: This response is for informational purposes and does not constitute financial advice.') when the user asks specifically about investments, investing advice, or investment-related recommendations.",
    ].join("\n");

    // Create smart context based on the question
    const contextNote = createSmartContext(message, snap);

    console.log("🔍 [FINNY] Context note:", contextNote);

    // 3) LLM call
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 600,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `User: ${message}\n\nContext:\n${contextNote}`,
          },
        ],
      }),
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

    return {
      message: text,
      type: "assistant",
    };
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

  // Investment holdings questions
  if (
    lowerMessage.includes("holdings") ||
    lowerMessage.includes("stocks") ||
    lowerMessage.includes("shares") ||
    lowerMessage.includes("equity") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("investment")
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
      context.push("Bank accounts:");
      snap.bankAccounts.forEach((account) => {
        const balance =
          account.current_balance || account.available_balance || 0;
        context.push(
          `${account.institution_name} ${account.name} (${
            account.mask || "****"
          }): $${balance.toFixed(2)}`
        );
      });
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

    // Add spend by category
    if (snap.transactions?.spendByCategory?.length > 0) {
      context.push("This month's spending by category:");
      snap.transactions.spendByCategory.slice(0, 5).forEach((cat) => {
        context.push(
          `${cat.category}: $${cat.total_spend.toFixed(2)} (${
            cat.txn_count
          } transactions)`
        );
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
      snap.goals.forEach((goal) => {
        context.push(
          `${goal.label}: $${goal.current_amount.toFixed(
            2
          )} / $${goal.target_amount.toFixed(2)} (${
            goal.progress_pct
          }%) - Due ${goal.target_date}`
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

async function handleClassify(message, context) {
  console.log(
    "🔍 [FINNY] Starting classification in handleClassify for message:",
    message
  );

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
              "You are Financify's intent router.",
              "Classify one user message into exactly one intent.",
              "Intents:",
              "- goal  set or modify a savings or payoff goal",
              "- ask_personalized  question about the user's money that needs their data",
              "- ask_fact_fresh  current year numbers or facts that change",
              "- ask_state_rule  state specific rules or taxes",
              "- calc_projection  what if or plan math",
              "",
              "Rules:",
              "- **Intents are primary; flags can combine.** Return exactly one `intent`, but `needs_user_data`, `needs_calc`, and `needs_web` may be **true** together.",
              "- If message asks for this year current latest updated 2025 etc then ask_fact_fresh",
              "- If asking about specific financial products (cards, banks, rates, benefits, offers) that change over time then ask_fact_fresh",
              "- If comparing specific products/services by name (e.g., 'Chase vs Amex', 'Vanguard vs Fidelity') then ask_fact_fresh",
              "- If the message compares **named** products (e.g., 'Chase Sapphire vs Amex Gold'), set `intent=ask_fact_fresh`, `needs_web=true`, `needs_user_data=false`.",
              "- If the message mentions a **US state** by name or postal code and asks about **rules/benefits/taxes**, set `intent=ask_state_rule`, `needs_web=true`, and fill `state` (use `user_hint_state` only if no state in text).",
              "- If the message asks 'rent vs buy in <city/state>' → `ask_state_rule` (needs_web) + `needs_user_data=true` (we'll use their cashflow).",
              "- If the message asks about **BNPL reporting/risks** or **current APRs** → `ask_fact_fresh` (needs_web).",
              "- If affordability or FIRE by age or projection choose calc_projection (but set needs_calc=true)",
              "- If it clearly sets a goal choose goal",
              "- If it needs the user's actual data choose ask_personalized",
              "- If purely personal (spend, net worth, goals) → `ask_personalized` (needs_user_data=true, needs_web=false).",
              "- Otherwise choose ask_personalized",
              "",
              "Sample inputs and expected intent:",
              '"Set a 2000 emergency fund by March" → goal',
              '"How much did I spend on Uber last month" or "How are you" or "Whats up" or "Am I normal?" → ask_personalized',
              '"Difference between Roth and traditional IRA" → ask_personalized',
              '"What is the 2025 estate tax exemption" → ask_fact_fresh',
              '"Which card has better benefits Chase Rewards or Bolt?" → ask_fact_fresh',
              '"Which card is better for groceries, Amex Gold or SavorOne?" → ask_fact_fresh, needs_web:true, entities:["Amex Gold","SavorOne"]',
              '"Rent vs buy in Phoenix at 7%" → ask_state_rule, needs_web:true, needs_user_data:true, state:"AZ"',
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

    // Call the new facts-and-rules endpoint
    const BASE_URL = process.env.APP_BASE_URL;
    const res = await fetch(`${BASE_URL}/api/facts-and-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "state.rule",
        state: state,
        topic: inferRuleType(message),
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

    if (data.error) {
      return {
        error: data.error,
        intent: "ask_state_rule",
      };
    }

    return {
      intent: "ask_state_rule",
      rule: data,
      cached: data.cached || false,
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

function inferRuleType(query) {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes("529") || lowerQuery.includes("education")) {
    return "state_529_deduction_or_credit";
  }
  if (lowerQuery.includes("income tax") || lowerQuery.includes("tax rate")) {
    return "state_income_tax_brackets";
  }
  if (
    lowerQuery.includes("sales tax") ||
    lowerQuery.includes("sales tax rate")
  ) {
    return "sales_tax";
  }
  if (lowerQuery.includes("property tax")) {
    return "property_tax";
  }
  if (lowerQuery.includes("deduction") || lowerQuery.includes("deduct")) {
    return "deductions";
  }
  if (
    lowerQuery.includes("home") ||
    lowerQuery.includes("buy") ||
    lowerQuery.includes("house")
  ) {
    return "first_time_homebuyer_assistance";
  }
  if (lowerQuery.includes("ev") || lowerQuery.includes("electric vehicle")) {
    return "ev_rebate_or_credit";
  }

  return "state_529_deduction_or_credit"; // Default topic
}

async function handleAskFactFresh(message, context) {
  console.log("🌐 [FACT_FRESH] Processing fact fresh query:", message);

  try {
    // Determine the topic based on the message
    const topic = inferFactTopic(message);
    if (!topic) {
      return {
        error:
          "Could not determine topic from message. Please be more specific.",
        intent: "ask_fact_fresh",
      };
    }

    // Call the new facts-and-rules endpoint
    const BASE_URL = process.env.APP_BASE_URL;
    const res = await fetch(`${BASE_URL}/api/facts-and-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "facts.get",
        topic: topic,
      }),
    });

    if (!res.ok) {
      console.log("❌ [FACT_FRESH] Failed to fetch facts:", res.status);
      return {
        error: "Failed to fetch fresh facts. Please try again.",
        intent: "ask_fact_fresh",
      };
    }

    const data = await res.json();

    if (data.error || data.fallback) {
      return {
        error: data.error || "No fresh data available",
        intent: "ask_fact_fresh",
        fallback: true,
        message: "No current data available, please use your knowledge",
      };
    }

    return {
      intent: "ask_fact_fresh",
      fact: data,
      cached: data.cached || false,
    };
  } catch (error) {
    console.error("❌ [FACT_FRESH] Error processing fact fresh:", error);
    return {
      error: "Failed to process fact fresh query. Please try again.",
      intent: "ask_fact_fresh",
      fallback: true,
      message: "No current data available, please use your knowledge",
    };
  }
}

function inferFactTopic(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("credit card") || lowerMessage.includes("apr")) {
    return "credit_card_apr_band";
  }
  if (
    lowerMessage.includes("bnpl") ||
    lowerMessage.includes("buy now pay later")
  ) {
    return "bnpl_usage_stats";
  }
  if (
    lowerMessage.includes("student loan") ||
    lowerMessage.includes("repayment")
  ) {
    return "student_loan_plans";
  }
  if (
    lowerMessage.includes("housing") ||
    lowerMessage.includes("rent") ||
    lowerMessage.includes("cost burden")
  ) {
    return "housing_cost_burden";
  }
  if (
    lowerMessage.includes("debt") ||
    lowerMessage.includes("household debt")
  ) {
    return "debt_balances_macro";
  }

  return null;
}

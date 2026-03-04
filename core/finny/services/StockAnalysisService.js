// core/finny/services/StockAnalysisService.js

import {
  resolveTickerForQuery,
  fetchStockSnapshot,
  buildStockDataSummary,
  fetchJson,
} from "../../../lib/stocks.js";
import {
  STANDARD_MODEL,
  getOpenRouterKey,
} from "../utils/constants/modelConfig.js";

export class StockAnalysisService {
  constructor({ webSearchService = null } = {}) {
    this.webSearchService = webSearchService;
  }

  async resolveTickerForQuery(message) {
    return resolveTickerForQuery(message);
  }

  async fetchStockSnapshot(ticker, options = {}) {
    return fetchStockSnapshot(ticker, options);
  }

  buildStockDataSummary(stockData, stockPlan = null) {
    return buildStockDataSummary(stockData, stockPlan);
  }

  async fetchJson(url, options = {}) {
    return fetchJson(url, options);
  }

  async planStockRequest(message) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Stock planner timeout after 10 seconds")),
          10000,
        );
      });

      const fetchPromise = fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: STANDARD_MODEL,
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
                    ticker_candidates: {
                      type: "array",
                      items: { type: "string" },
                    },
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
        },
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      if (!response.ok) return null;
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;

      let cleanContent = content;
      if (content.startsWith("```") && content.endsWith("```")) {
        cleanContent = content.slice(3, -3).trim();
      }
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7).trim();
      }

      const plan = JSON.parse(cleanContent);
      plan.ticker_candidates = Array.isArray(plan.ticker_candidates)
        ? plan.ticker_candidates
        : [];
      plan.company_candidates = Array.isArray(plan.company_candidates)
        ? plan.company_candidates
        : [];
      plan.wants = Array.isArray(plan.wants) ? plan.wants : [];
      return plan;
    } catch {
      return null;
    }
  }

  async executeStockPlan(
    plan,
    message,
    { sendProgress = null } = {},
  ) {
    const wants = plan?.wants || [];
    const preferredTicker = plan?.ticker_candidates?.[0] || null;
    const { ticker } = preferredTicker
      ? { ticker: preferredTicker }
      : await this.resolveTickerForQuery(message);

    if (!ticker) return { error: "Could not resolve ticker" };

    if (sendProgress) {
      sendProgress(`📈 Fetching current price and market data for ${ticker}...`);
    }
    const base = await this.fetchStockSnapshot(ticker);
    if (base?.error) return base;

    const apiKey =
      process.env.FINHUB_API_KEY ||
      process.env.FINNHUB_API_KEY ||
      process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
    const extra = {};

    if (wants.includes("earnings")) {
      if (sendProgress) sendProgress("📊 Analyzing earnings data...");
      extra.earnings = await this.fetchJson(
        `https://finnhub.io/api/v1/stock/earnings?symbol=${ticker}&token=${apiKey}`,
      );
    }
    if (wants.includes("filings")) {
      if (sendProgress) sendProgress("📄 Gathering company filings...");
      extra.filings = await this.fetchJson(
        `https://finnhub.io/api/v1/filings?symbol=${ticker}&token=${apiKey}`,
      );
    }
    if (wants.includes("insider")) {
      if (sendProgress) sendProgress("👥 Checking insider transactions...");
      extra.insider = await this.fetchJson(
        `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${ticker}&token=${apiKey}`,
      );
    }

    return { ticker, planWants: wants, data: base, extra };
  }

  async generateFallbackStockAnalysis(ticker, userMessage) {
    const extractedTicker = ticker;
    if (!extractedTicker) {
      return "I'd be happy to help with stock analysis, but I need a specific ticker symbol. Could you provide the stock symbol you'd like me to analyze?";
    }

    try {
      const searchQuery = `${extractedTicker} stock analysis market cap financials`;
      const webResults = this.webSearchService
        ? await this.webSearchService.limitedSearch(searchQuery)
        : [];
      if (webResults && webResults.length > 0) {
        return this.generateStockAnalysisFromWebData(
          extractedTicker,
          webResults,
          userMessage,
        );
      }
    } catch {
      // Fall through to training-data fallback.
    }

    return this.generateTrainingDataStockAnalysis(extractedTicker, userMessage);
  }

  async generateStockAnalysisFromWebData(ticker, webResults, userMessage) {
    const context = webResults
      .slice(0, 3)
      .map((r) => r.content)
      .join("\n\n");

    const analysisPrompt = `Based on the following web search results about ${ticker}, provide a comprehensive stock analysis focusing on market cap, financial performance, and key metrics. Be specific and data-driven.

Web Results:
${context}

User Query: ${userMessage}`;

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: STANDARD_MODEL,
            temperature: 0.3,
            max_tokens: 8000,
            messages: [
              {
                role: "system",
                content:
                  "You are a financial analyst providing detailed stock analysis.",
              },
              { role: "user", content: analysisPrompt },
            ],
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) return content;
      }
    } catch {
      // Fall through to training-data fallback.
    }

    return this.generateTrainingDataStockAnalysis(ticker, userMessage);
  }

  generateTrainingDataStockAnalysis(ticker) {
    const stockKnowledge = {
      BRO: {
        name: "Brown & Brown, Inc.",
        marketCap: "Approximately $29 billion",
        industry: "Insurance",
      },
      AAPL: { name: "Apple Inc.", marketCap: "Over $3 trillion", industry: "Technology" },
      MSFT: { name: "Microsoft Corporation", marketCap: "Over $3 trillion", industry: "Technology" },
      GOOGL: { name: "Alphabet Inc. (Google)", marketCap: "Over $2 trillion", industry: "Technology" },
      AMZN: { name: "Amazon.com Inc.", marketCap: "Over $1.5 trillion", industry: "Technology/Retail" },
      TSLA: { name: "Tesla Inc.", marketCap: "Over $800 billion", industry: "Automotive/Energy" },
    };

    const stock = stockKnowledge[String(ticker || "").toUpperCase()];
    if (!stock) {
      return `I'd be happy to provide analysis for ${ticker}, but I don't have current real-time data available.`;
    }

    return `${stock.name} (${String(ticker).toUpperCase()})\nMarket Cap: ${stock.marketCap}\nIndustry: ${stock.industry}`;
  }
}

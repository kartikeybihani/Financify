// Stock API utility functions
// Basic API calls and data formatting for stock data

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `[STOCKS] HTTP ${response.status}: ${response.statusText} for ${url}`
      );
      return null;
    }

    const text = await response.text();
    if (!text || text.trim() === "") {
      console.error(`[STOCKS] Empty response for ${url}`);
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error(
        `[STOCKS] JSON parse error for ${url}:`,
        parseError.message
      );
      console.error(`[STOCKS] Response text:`, text.substring(0, 200) + "...");
      return null;
    }
  } catch (error) {
    console.error(`[STOCKS] fetchJson error for ${url}:`, error.message);
    return null;
  }
}

async function resolveTickerForQuery(message) {
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) {
    console.error("[FINNHUB] Missing API key for ticker resolution");
    return { ticker: null, queryUsed: null };
  }

  console.log(`[FINNHUB] Resolving ticker for query: "${message}"`);
  const startTime = Date.now();

  // Heuristic: if an explicit 1-5 letter uppercase word present, try it first
  const explicit = (message.match(/\b[A-Z]{1,5}\b/g) || []).find(
    (t) => t !== "USD" && t !== "ETF"
  );
  if (explicit) {
    console.log(`[FINNHUB] Trying explicit ticker: ${explicit}`);
    const prof = await fetchJson(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(
        explicit
      )}&token=${apiKey}`
    );
    if (prof && (prof.ticker || prof.ticker === explicit)) {
      console.log(
        `[FINNHUB] Found ticker via explicit match: ${explicit} (${
          Date.now() - startTime
        }ms)`
      );
      return { ticker: explicit, queryUsed: explicit };
    }
  }

  // Name-based lookup using search endpoint
  const cleaned = message.replace(/\?|\./g, " ").trim();
  console.log(`[FINNHUB] Searching for company name: "${cleaned}"`);
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
  const duration = Date.now() - startTime;
  if (symbol) {
    console.log(
      `[FINNHUB] Resolved ticker: ${symbol} for "${cleaned}" (${duration}ms)`
    );
  } else {
    console.log(
      `[FINNHUB] Could not resolve ticker for "${cleaned}" (${duration}ms)`
    );
  }
  return { ticker: symbol, queryUsed: cleaned };
}

async function fetchStockSnapshot(ticker) {
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) {
    console.error("[FINNHUB] Missing API key");
    return { error: "Missing FINNHUB API key" };
  }

  console.log(`[FINNHUB] Fetching stock snapshot for ticker: ${ticker}`);
  const startTime = Date.now();

  // Use Promise.allSettled to handle individual API failures gracefully
  const results = await Promise.allSettled([
    fetchJson(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${apiKey}`
    ),
    // Removed price-target endpoint due to consistent 403 errors
    // fetchJson(
    //   `https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${apiKey}`
    // ),
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

  // Extract results, handling failures gracefully
  const [quote, profile, recs, metrics, news] = results.map((result, index) => {
    if (result.status === "rejected") {
      console.warn(`[FINNHUB] API call ${index} failed:`, result.reason);
      return null;
    }
    return result.value;
  });

  const duration = Date.now() - startTime;
  console.log(
    `[FINNHUB] Stock snapshot fetched for ${ticker} in ${duration}ms (quote: ${
      quote ? "✓" : "✗"
    }, profile: ${profile ? "✓" : "✗"}, recs: ${recs ? "✓" : "✗"}, metrics: ${
      metrics ? "✓" : "✗"
    }, news: ${news ? "✓" : "✗"})`
  );

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
    priceTarget: null, // Removed due to API restrictions
    metrics: metrics?.metric || null,
    news: Array.isArray(news) ? news.slice(0, 5) : [],
  };
}

function buildStockDataSummary(stockData, stockPlan = null) {
  const name = stockData.profile?.name || stockData.ticker || "Stock";
  const cur =
    stockData.current != null
      ? `$${Number(stockData.current).toFixed(2)}`
      : "n/a";
  const dp =
    stockData.changePercent != null
      ? `${Number(stockData.changePercent).toFixed(2)}%`
      : "n/a";
  const pt = null; // Price target data removed due to API restrictions

  let summary = `${name} (${stockData.ticker})\n`;
  summary += "\n";
  summary += `\nCurrent price: ${cur} (${dp} today) ${
    dp && dp.includes("-") ? "📉" : "📈"
  }\n`;

  if (pt) summary += `\nAnalyst price target: ${pt}\n`;

  // Analyst recommendations
  if (
    Array.isArray(stockData.recommendations) &&
    stockData.recommendations.length > 0
  ) {
    const latest = stockData.recommendations[0];
    const totals = [
      latest?.strongBuy || 0,
      latest?.buy || 0,
      latest?.hold || 0,
      latest?.sell || 0,
      latest?.strongSell || 0,
    ];
    const sum = totals.reduce((a, b) => a + b, 0) || 1;
    const buyPct = ((100 * (totals[0] + totals[1])) / sum).toFixed(0);
    const holdPct = ((100 * totals[2]) / sum).toFixed(0);
    const sellPct = ((100 * (totals[3] + totals[4])) / sum).toFixed(0);
    summary += "\n";
    summary += `Analyst sentiment: ${buyPct}% Buy, ${holdPct}% Hold, ${sellPct}% Sell 💼\n`;
  }

  if (stockData.profile?.finnhubIndustry) {
    summary += "\n";
    summary += `Industry: ${stockData.profile.finnhubIndustry} 🏭\n`;
  }

  // Key metrics
  const pe =
    stockData.metrics?.peBasicExclExtraTTM || stockData.metrics?.peBasicTTM;
  const ps = stockData.metrics?.psTTM;
  if (pe || ps) {
    summary += "\nKey ratios: ";
    if (pe) summary += `P/E ${Number(pe).toFixed(1)}`;
    if (pe && ps) summary += ", ";
    if (ps) summary += `P/S ${Number(ps).toFixed(1)}`;
    summary += "\n";
  }

  // Additional data from stock plan
  if (stockPlan?.wants) {
    const wants = new Set(stockPlan.wants || []);
    if (
      wants.has("market_cap") &&
      stockData.profile?.marketCapitalization != null
    ) {
      summary += `Market cap: $${Number(
        stockData.profile.marketCapitalization
      ).toLocaleString()}\n`;
    }
    if (wants.has("employees") && stockData.profile?.employeeTotal != null) {
      summary += `Employees: ${Number(
        stockData.profile.employeeTotal
      ).toLocaleString()}\n`;
    }
    if (wants.has("description") && stockData.profile?.description) {
      summary += `\nAbout: ${stockData.profile.description}\n`;
    }
  }

  // Recent news headlines
  if (Array.isArray(stockData.news) && stockData.news.length > 0) {
    summary += "\n";
    summary += "Recent headlines:\n";
    for (const n of stockData.news.slice(0, 3)) {
      if (n.headline) summary += `• ${n.headline}\n`;
    }
  }

  if (stockData.ts) {
    summary += `\nAs of ${new Date(stockData.ts).toLocaleString()}`;
  }

  return summary;
}

const STOCK_COMPANY_TO_TICKER = {
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

const STOCK_SINGLE_WORD_COMPANIES = {
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

const STOCK_COMMON_WORDS = new Set([
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

const GENERAL_STOCK_PATTERNS = [
  /what stocks? should i (buy|invest|purchase)/i,
  /what (stocks?|companies) (should|would|do) you (recommend|suggest)/i,
  /best stocks? (to|for)/i,
  /top stocks?/i,
  /stock market/i,
  /stock exchange/i,
];

function detectStockCandidate(message) {
  if (!message || typeof message !== "string") return null;

  const lowerMessage = message.toLowerCase();
  const words = lowerMessage.trim().split(/\s+/);
  const knownTickers = new Set(Object.values(STOCK_COMPANY_TO_TICKER));
  const companyNamesUpper = new Set(
    Object.keys(STOCK_SINGLE_WORD_COMPANIES).map((name) => name.toUpperCase())
  );

  // Check for company names (including single-word matches)
  let detectedTicker = null;
  let detectedCompany = null;

  // First check for exact single-word company names (e.g., "Apple", "Tesla")
  if (words.length === 1 && STOCK_SINGLE_WORD_COMPANIES[words[0]]) {
    detectedTicker = STOCK_SINGLE_WORD_COMPANIES[words[0]];
    detectedCompany = words[0];
  } else {
    // Check for company names in longer messages
    for (const [company, ticker] of Object.entries(STOCK_COMPANY_TO_TICKER)) {
      if (lowerMessage.includes(company)) {
        detectedCompany = company;
        detectedTicker = ticker;
        break;
      }
    }
  }

  // Common ticker symbols (1-5 uppercase letters) - be more specific
  // Look for ticker patterns that are likely actual stock symbols
  const tickerPattern = /\b([A-Z]{2,5})\b/g;
  const tickerMatches = [];
  let match;

  // Extract potential ticker symbols (only from original casing)
  // Filter out common words that aren't tickers
  while ((match = tickerPattern.exec(message)) !== null) {
    const potentialTicker = match[1];
    if (STOCK_COMMON_WORDS.has(potentialTicker)) {
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

  // If we found ticker symbols, use the first one (prioritize explicit tickers)
  if (tickerMatches.length > 0) {
    detectedTicker = tickerMatches[0];
  }

  // Only return stock candidate if we found a SPECIFIC ticker/company
  // General queries like "What stocks should I buy?" should NOT trigger this
  if (!detectedTicker) return null;

  // Check if this is a general stock market query (no specific ticker context)
  const isGeneralQuery = GENERAL_STOCK_PATTERNS.some((pattern) =>
    pattern.test(message)
  );
  if (isGeneralQuery && !detectedCompany && tickerMatches.length === 0) {
    return null;
  }

  // For single-word company names without context, lower confidence
  let confidence = 0.95;
  let source = "explicit";
  if (words.length === 1 && detectedCompany) {
    confidence = 0.7; // Lower confidence for ambiguous single-word queries
    source = "company";
  } else if (detectedCompany && !tickerMatches.length) {
    confidence = 0.85; // Medium confidence for company names
    source = "company";
  }

  return {
    ticker: detectedTicker,
    entities: tickerMatches.length > 0 ? tickerMatches : [detectedTicker],
    confidence,
    source,
  };
}

export {
  resolveTickerForQuery,
  fetchStockSnapshot,
  buildStockDataSummary,
  fetchJson,
  detectStockCandidate,
};

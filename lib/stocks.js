// Stock API utility functions
// Basic API calls and data formatting for stock data

async function fetchJson(url, options = {}) {
  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 10000;
  const controller = new AbortController();
  let timeoutId;

  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.error(
        `[STOCKS] HTTP ${response.status}: ${response.statusText} for ${url}`
      );
      return null;
    }

    // Check Content-Type header to ensure it's JSON
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.error(
        `[STOCKS] Non-JSON response for ${url}: Content-Type is ${contentType}`
      );
      return null;
    }

    const text = await response.text();
    if (!text || text.trim() === "") {
      console.error(`[STOCKS] Empty response for ${url}`);
      return null;
    }

    // Additional check: if response looks like HTML, don't try to parse as JSON
    if (
      text.trim().startsWith("<!DOCTYPE") ||
      text.trim().startsWith("<html")
    ) {
      console.error(
        `[STOCKS] HTML response received for ${url} (likely an error page)`
      );
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
    if (error?.name === "AbortError") {
      console.warn(`[STOCKS] fetchJson aborted (timeout or cancel) for ${url}`);
      return null;
    }
    console.error(`[STOCKS] fetchJson error for ${url}:`, error.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

const IGNORED_TICKER_TOKENS = new Set([
  "A",
  "AN",
  "AND",
  "ARE",
  "BUY",
  "ETF",
  "FOR",
  "HOW",
  "I",
  "IS",
  "ME",
  "MY",
  "NOW",
  "OR",
  "THE",
  "USD",
  "WE",
  "YOU",
]);

const GENERIC_STOCK_TERMS = new Set([
  "about",
  "buy",
  "company",
  "doing",
  "how",
  "is",
  "price",
  "share",
  "shares",
  "stock",
  "stocks",
  "tell",
  "what",
]);

function normalizePhrase(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractTickerCandidates(message) {
  const source = String(message || "");
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = String(value || "").toUpperCase().trim();
    if (!/^[A-Z]{1,5}$/.test(normalized)) return;
    if (IGNORED_TICKER_TOKENS.has(normalized)) return;
    if (candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  // Prioritize $TICKER mentions first.
  for (const match of source.matchAll(/\$([A-Za-z]{1,5})\b/g)) {
    addCandidate(match[1]);
  }

  // Then extract standalone uppercase words (length >= 2 avoids pronoun "I").
  for (const match of source.matchAll(/\b[A-Z]{2,5}\b/g)) {
    addCandidate(match[0]);
  }

  // If the entire query is a single token, allow lowercase ticker input too.
  const singleToken = source.trim();
  if (/^[A-Za-z]{1,5}$/.test(singleToken)) {
    addCandidate(singleToken);
  }

  return candidates;
}

function buildCompanySearchCandidates(message) {
  const source = String(message || "");
  const cleaned = normalizePhrase(source.replace(/[^\w\s]/g, " "));
  if (!cleaned) return [];

  const candidates = [];
  const seen = new Set();
  const addCandidate = (value) => {
    const normalized = normalizePhrase(String(value || ""));
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(normalized);
  };

  addCandidate(cleaned);

  // Strip common conversational wrappers.
  const stripped = normalizePhrase(
    cleaned
      .replace(
        /^(what about|tell me about|should i buy|how is|how s|can i buy|what do you think about)\s+/i,
        ""
      )
      .replace(/\b(stock|stocks|share|shares|today|now|right now|doing)\b/gi, " ")
  );
  addCandidate(stripped);

  // Keep meaningful tokens only (e.g., "Apple", "Tesla", "NVIDIA").
  const compactEntity = normalizePhrase(
    cleaned
      .split(/\s+/)
      .filter((token) => {
        const normalized = token.toLowerCase();
        if (!normalized) return false;
        if (GENERIC_STOCK_TERMS.has(normalized)) return false;
        return true;
      })
      .join(" ")
  );
  addCandidate(compactEntity);

  // Last token fallback helps for queries like "Tell me about Tesla".
  const pieces = cleaned.split(/\s+/).filter(Boolean);
  if (pieces.length > 0) {
    addCandidate(pieces[pieces.length - 1]);
  }

  return candidates;
}

function pickBestSearchResult(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const preferred = results.find(
    (result) =>
      result &&
      (result.type === "Common Stock" ||
        result.type === "ETF" ||
        result.type === "Equity")
  );
  return preferred || results[0] || null;
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

  // First try explicit ticker candidates.
  for (const explicit of extractTickerCandidates(message)) {
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

  // Then try name-based lookups with normalized query variants.
  let symbol = null;
  let queryUsed = null;
  const queries = buildCompanySearchCandidates(message);
  for (const query of queries) {
    console.log(`[FINNHUB] Searching for company name: "${query}"`);
    const search = await fetchJson(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(
        query
      )}&token=${apiKey}`
    );
    const best = pickBestSearchResult(search?.result);
    symbol = best?.symbol || null;
    if (symbol) {
      queryUsed = query;
      break;
    }
  }

  const duration = Date.now() - startTime;
  if (symbol) {
    console.log(
      `[FINNHUB] Resolved ticker: ${symbol} for "${queryUsed}" (${duration}ms)`
    );
  } else {
    console.log(
      `[FINNHUB] Could not resolve ticker for "${message}" (${duration}ms)`
    );
  }
  return { ticker: symbol, queryUsed: queryUsed || null };
}

/**
 * @param {string} ticker - Stock symbol
 * @param {{ quiet?: boolean }} options - quiet: true = no verbose logs (e.g. for cron/batch)
 */
async function fetchStockSnapshot(ticker, options = {}) {
  const quiet = options.quiet === true;
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) {
    console.error("[FINNHUB] Missing API key");
    return { error: "Missing FINNHUB API key" };
  }

  if (!quiet)
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
      if (!quiet)
        console.warn(`[FINNHUB] API call ${index} failed:`, result.reason);
      return null;
    }
    return result.value;
  });

  const duration = Date.now() - startTime;
  if (!quiet) {
    // console.log(
    //   `[FINNHUB] Stock snapshot fetched for ${ticker} in ${duration}ms (quote: ${
    //     quote ? "✓" : "✗"
    //   }, profile: ${profile ? "✓" : "✗"}, recs: ${recs ? "✓" : "✗"}, metrics: ${
    //     metrics ? "✓" : "✗"
    //   }, news: ${news ? "✓" : "✗"})`
    // );
    // 📊 DETAILED FINNHUB RESULTS LOGGING
    console.log(`\n📊 [FINNHUB] Detailed results for ${ticker}:`);
    if (quote) {
      // console.log(
      //   `   Quote: ✅ Current: $${quote.c || "N/A"}, Change: ${
      //     quote.d || "N/A"
      //   } (${quote.dp || "N/A"}%), High: $${quote.h || "N/A"}, Low: $${
      //     quote.l || "N/A"
      //   }`
      // );
    } else {
      console.log(`   Quote: ❌ No quote data`);
    }
    if (profile) {
      console.log(
        `   Profile: ✅ Name: ${profile.name || "N/A"}, Industry: ${
          profile.finnhubIndustry || "N/A"
        }, Market Cap: $${
          profile.marketCapitalization?.toLocaleString() || "N/A"
        }`
      );
    } else {
      console.log(`   Profile: ❌ No profile data`);
    }
    if (recs && Array.isArray(recs) && recs.length > 0) {
      const latest = recs[0];
      const total =
        (latest.strongBuy || 0) +
        (latest.buy || 0) +
        (latest.hold || 0) +
        (latest.sell || 0) +
        (latest.strongSell || 0);
      // console.log(
      //   `   Recommendations: ✅ Buy: ${
      //     (latest.strongBuy || 0) + (latest.buy || 0)
      //   }, Hold: ${latest.hold || 0}, Sell: ${
      //     (latest.sell || 0) + (latest.strongSell || 0)
      //   } (Total: ${total})`
      // );
    } else {
      console.log(`   Recommendations: ❌ No recommendations data`);
    }
    if (metrics?.metric) {
      const pe =
        metrics.metric.peBasicExclExtraTTM || metrics.metric.peBasicTTM;
      const ps = metrics.metric.psTTM;
      console.log(
        `   Metrics: ✅ P/E: ${pe ? pe.toFixed(2) : "N/A"}, P/S: ${
          ps ? ps.toFixed(2) : "N/A"
        }`
      );
    } else {
      console.log(`   Metrics: ❌ No metrics data`);
    }
    if (news && Array.isArray(news)) {
      console.log(`   News: ✅ ${news.length} articles fetched`);
    } else {
      console.log(`   News: ❌ No news data`);
    }
    if (quote) {
      const hasCurrent = quote.c !== null && quote.c !== undefined;
      // console.log(
      //   `🔍 [FINNHUB] Quote data structure:`,
      //   JSON.stringify(
      //     {
      //       c: quote.c,
      //       d: quote.d,
      //       dp: quote.dp,
      //       h: quote.h,
      //       l: quote.l,
      //       o: quote.o,
      //       pc: quote.pc,
      //       t: quote.t,
      //       hasCurrent: hasCurrent,
      //       currentType: typeof quote.c,
      //       hasPrevClose: quote.pc !== null && quote.pc !== undefined,
      //     },
      //     null,
      //     2
      //   )
      // );
      if (!hasCurrent && quote.pc != null) {
        console.warn(
          `⚠️ [FINNHUB] Current price is null but prevClose exists (${quote.pc}) - market may be closed`
        );
      } else if (!hasCurrent) {
        console.warn(
          `⚠️ [FINNHUB] Current price is null and no prevClose - this will trigger fallback`
        );
      }
    } else {
      console.warn(
        `⚠️ [FINNHUB] Quote data is null/undefined - this will cause fallback`
      );
    }
  }

  // Use prevClose as fallback if current is null (market closed scenario)
  const currentPrice = quote?.c ?? quote?.pc ?? null;
  const usingPrevClose = quote?.c == null && quote?.pc != null;

  if (!quiet && usingPrevClose) {
    // console.log(
    //   `ℹ️ [FINNHUB] Using prevClose (${quote.pc}) as current price fallback (market may be closed)`
    // );
  }

  return {
    current: currentPrice,
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
    _usingPrevCloseFallback: usingPrevClose, // Internal flag for logging
  };
}

/**
 * Fetch only quote (1 API call). Use for batch stock_prices refresh to avoid rate limits.
 * Finnhub free tier: 60 calls/min. fetchStockSnapshot uses 5 calls/symbol.
 */
async function fetchQuoteOnly(ticker) {
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) return { error: "Missing FINNHUB API key" };
  const quote = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
  );
  const current = quote?.c ?? quote?.pc ?? null;
  return {
    current,
    prevClose: quote?.pc ?? null,
    change: quote?.d ?? null,
    changePercent: quote?.dp ?? null,
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

  // Handle market closed scenario (using prevClose)
  const priceLabel = stockData._usingPrevCloseFallback
    ? "Last close"
    : "Current price";
  const marketStatusNote = stockData._usingPrevCloseFallback
    ? " (market may be closed)"
    : "";

  summary += `\n${priceLabel}: ${cur}${marketStatusNote}${
    dp !== "n/a" ? ` (${dp} today)` : ""
  } ${dp && dp.includes("-") ? "📉" : dp !== "n/a" ? "📈" : ""}\n`;

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

  // Recent news headlines (with clickable links)
  if (Array.isArray(stockData.news) && stockData.news.length > 0) {
    summary += "\n";
    summary += "Recent headlines:\n";
    for (const n of stockData.news.slice(0, 3)) {
      if (n.headline) {
        // Format headline with URL if available (frontend will make it clickable via URL_REGEX)
        // Finnhub news items have 'url' field with the article URL
        if (n.url) {
          summary += `• ${n.headline} ${n.url}\n`;
        } else {
          summary += `• ${n.headline}\n`;
        }
      }
    }
  }

  if (stockData.ts) {
    summary += `\nAs of ${new Date(stockData.ts).toLocaleString()}`;
  }

  return summary;
}

export {
  resolveTickerForQuery,
  fetchStockSnapshot,
  fetchQuoteOnly,
  buildStockDataSummary,
  fetchJson,
};

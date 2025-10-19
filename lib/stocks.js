// Stock API utility functions
// Basic API calls and data formatting for stock data

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
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

// Deprecated: replaced by buildStockDataSummary
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

  let out = `${name} (${data.ticker}) — Snapshot\n\n`;
  out += `Price: ${cur} (${dp} today)\n`;
  if (pt) out += `Price target (mean): ${pt}\n`;
  if (recLine) out += `${recLine}\n`;
  if (data.profile?.finnhubIndustry)
    out += `\nIndustry: ${data.profile.finnhubIndustry}\n`;
  if (data.profile?.weburl) out += `Website: ${data.profile.weburl}\n`;
  // Add a couple of basic metrics if available
  const pe = data.metrics?.peBasicExclExtraTTM || data.metrics?.peBasicTTM;
  const ps = data.metrics?.psTTM;
  if (pe || ps) {
    const ratioParts = [];
    if (pe) ratioParts.push(`P/E ${Number(pe).toFixed(1)}`);
    if (ps) ratioParts.push(`P/S ${Number(ps).toFixed(1)}`);
    if (ratioParts.length > 0) {
      out += `\nKey ratios (TTM): ${ratioParts.join(", ")}\n`;
      // add a blank line
      out += "\n\n";
    }
  }
  // Add latest headlines
  if (Array.isArray(data.news) && data.news.length > 0) {
    out += "\n";
    out += "\nRecent headlines:\n";
    for (const n of data.news.slice(0, 3)) {
      if (n.headline) out += `- ${n.headline}\n`;
    }
  }
  if (data.ts) out += `\nAs of ${new Date(data.ts).toLocaleString()}`;
  return out;
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
  const pt = stockData.priceTarget?.targetMean
    ? `$${Number(stockData.priceTarget.targetMean).toFixed(2)}`
    : null;

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

export {
  resolveTickerForQuery,
  fetchStockSnapshot,
  formatStockResponse,
  buildStockDataSummary,
  fetchJson,
};

// core/finny/pipeline/EnrichmentStage.js
/**
 * Enrichment Stage - Stage 3 of Ask Pipeline
 * 
 * Responsibilities:
 * - Detect if web search is needed
 * - Execute web searches and stock data fetching
 * - Augment context with real-time data
 * - Build search summaries
 */

import { logDebug, logInfo, logWarn } from "../utils/logging.js";

/**
 * Detect if web search is needed based on message patterns
 */
export function detectWebSearchNeeded(message) {
  if (!message || typeof message !== "string") return false;
  
  const lower = message.toLowerCase();
  
  // Web search triggers
  const webTriggers = [
    /\b(latest|recent|current|newest|today\'s)\b.*\b(news|trends?|updates?|headlines?)\b/i,
    /\bwhat\'s happening\b/i,
    /\btell me about\b.*\b(company|business|industry)\b/i,
    /\b(google|search|look up|find out)\b/i,
    /\bhow is\b.*\b(doing|performing)\b/i,
  ];
  
  return webTriggers.some(pattern => pattern.test(lower));
}

/**
 * Check if stock query is needed
 */
export function looksLikeStockQuery(message, classificationResult = null) {
  // Primary: use classification if available
  if (classificationResult?.intent === "stock_query") {
    return true;
  }
  
  // Fallback: keyword detection
  if (!message || typeof message !== "string") return false;
  
  const lower = message.toLowerCase();
  const stockKeywords = [
    /\b(stock|ticker|share|equity)\b/i,
    /\b(buy|sell|invest in)\b.*\b([A-Z]{1,5})\b/,
    /\bshould i (buy|sell|hold)\b/i,
    /\b(analysis|analyze)\b.*\b(stock|company)\b/i,
  ];
  
  return stockKeywords.some(pattern => pattern.test(lower));
}

/**
 * Execute Enrichment Stage
 * Returns enriched context with web/stock data
 */
export async function executeEnrichmentStage(input) {
  const {
    message,
    classification,
    packs,
    webSearchService,
    stockAnalysisService,
    userId,
    timings = {},
    toolsUsed = [],
  } = input;

  logInfo("🔍 [STAGE:ENRICHMENT] Starting enrichment stage");

  const enrichedData = {
    webResults: [],
    webSummary: "",
    stockData: null,
    searchesPerformed: [],
  };

  // 1. Check for web search needs
  const needsWebSearch = 
    classification?.requires_web_search === true ||
    detectWebSearchNeeded(message);

  if (needsWebSearch) {
    logInfo("🌐 [STAGE:ENRICHMENT] Web search required");
    
    try {
      const webT0 = Date.now();
      
      // Build enhanced search query
      const searchQuery = message; // Can be enhanced with context later
      
      // Execute web search
      const webSearchResult = await webSearchService.search(searchQuery, {
        maxResults: 5,
        userId,
      });
      
      if (webSearchResult?.results && webSearchResult.results.length > 0) {
        enrichedData.webResults = webSearchResult.results;
        enrichedData.webSummary = webSearchResult.summary || "";
        enrichedData.searchesPerformed.push("web_search");
        
        const webLatency = Date.now() - webT0;
        timings.web_ms = webLatency;
        toolsUsed.push({
          name: "web_search",
          latency_ms: webLatency,
          cache_hit: false,
        });
        
        logInfo(`✅ [STAGE:ENRICHMENT] Web search complete (${webSearchResult.results.length} results, ${webLatency}ms)`);
      } else {
        logWarn("⚠️ [STAGE:ENRICHMENT] Web search returned no results");
      }
    } catch (error) {
      logWarn("⚠️ [STAGE:ENRICHMENT] Web search failed:", error?.message);
    }
  }

  // 2. Check for stock data needs
  const isStockQuery = looksLikeStockQuery(message, classification);
  
  if (isStockQuery && classification?.ticker) {
    logInfo(`📈 [STAGE:ENRICHMENT] Stock query detected for ticker: ${classification.ticker}`);
    
    try {
      const stockT0 = Date.now();
      
      // Fetch stock data
      const stockResult = await stockAnalysisService.fetchStockData(
        classification.ticker,
        { userId }
      );
      
      if (stockResult) {
        enrichedData.stockData = stockResult;
        enrichedData.searchesPerformed.push("stock_data");
        
        const stockLatency = Date.now() - stockT0;
        timings.market_ms = stockLatency;
        toolsUsed.push({
          name: "stock_data",
          latency_ms: stockLatency,
          cache_hit: false,
        });
        
        logInfo(`✅ [STAGE:ENRICHMENT] Stock data fetched (${stockLatency}ms)`);
      }
    } catch (error) {
      logWarn("⚠️ [STAGE:ENRICHMENT] Stock data fetch failed:", error?.message);
    }
  }

  logInfo("✅ [STAGE:ENRICHMENT] Enrichment stage complete", {
    webResults: enrichedData.webResults.length,
    stockData: !!enrichedData.stockData,
    searches: enrichedData.searchesPerformed,
  });

  return enrichedData;
}

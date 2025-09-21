// api/utils/webResearchEngine.js
import { extractEntities, determineIntent } from "./entityExtractor.js";
import { getSearchStrategy } from "./domainMapper.js";
import { scrapeMultipleUrls } from "./webScraper.js";
import { getCachedDataWithFallback } from "./simpleCache.js";

/**
 * Main web research engine that orchestrates entity extraction,
 * domain mapping, web scraping, and caching
 */

/**
 * Research financial products based on user query
 */
export async function researchFinancialProducts(message, userId = null) {
  console.log("🔍 [WEB_RESEARCH] Starting research for:", message);

  try {
    // 1. Extract entities from the message
    const entities = await extractEntities(message);
    console.log("🔍 [WEB_RESEARCH] Extracted entities:", entities);

    // 2. Determine intent and search strategy
    const intent = determineIntent(entities, message);
    console.log("🔍 [WEB_RESEARCH] Determined intent:", intent);

    // 3. Get search strategy
    const searchStrategy = getSearchStrategy(entities, message);
    console.log("🔍 [WEB_RESEARCH] Search strategy:", searchStrategy);

    // 4. Research each relevant domain
    const researchResults = await researchDomains(
      searchStrategy,
      entities,
      userId
    );

    // 5. Combine and format results
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

/**
 * Research specific domains
 */
async function researchDomains(searchStrategy, entities, userId) {
  const results = [];

  for (const url of searchStrategy.searchUrls) {
    try {
      // Determine entity type for caching
      const entityType = determineEntityType(entities, url);

      // Use cache with fallback to scraping
      const cachedResult = await getCachedDataWithFallback(
        entityType,
        url,
        async () => {
          console.log(`🌐 [WEB_RESEARCH] Scraping ${url}`);
          return await scrapeMultipleUrls([url], entityType);
        },
        false // Not user-specific for product data
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

/**
 * Determine entity type for caching
 */
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

/**
 * Combine research results into a coherent response
 */
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

  // Extract product information
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

  // Generate comparisons if this is a comparison query
  if (intent.intent === "ask_personalized" && intent.needs_web) {
    combined.comparisons = generateComparisons(combined.products, entities);
  }

  // Extract key metrics across all products
  combined.keyMetrics = extractKeyMetricsAcrossProducts(combined.products);

  return combined;
}

/**
 * Extract key metrics from scraped data
 */
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

/**
 * Extract benefits from scraped data
 */
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

/**
 * Extract features from scraped data
 */
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

/**
 * Generate product comparisons
 */
function generateComparisons(products, entities) {
  const comparisons = [];

  if (products.length < 2) {
    return comparisons;
  }

  // Simple comparison based on key metrics
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const product1 = products[i];
      const product2 = products[j];

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

/**
 * Compare two metric arrays
 */
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

/**
 * Determine overall winner between two products
 */
function determineWinner(product1, product2) {
  // Simple scoring system
  let score1 = 0;
  let score2 = 0;

  // Compare APR (lower is better)
  if (product1.metrics.apr && product2.metrics.apr) {
    const avg1 =
      product1.metrics.apr.reduce((sum, val) => sum + val, 0) /
      product1.metrics.apr.length;
    const avg2 =
      product2.metrics.apr.reduce((sum, val) => sum + val, 0) /
      product2.metrics.apr.length;
    if (avg1 < avg2) score1++;
    else if (avg2 < avg1) score2++;
  }

  // Compare annual fee (lower is better)
  if (product1.metrics.annualFee && product2.metrics.annualFee) {
    const avg1 =
      product1.metrics.annualFee.reduce((sum, val) => sum + val, 0) /
      product1.metrics.annualFee.length;
    const avg2 =
      product2.metrics.annualFee.reduce((sum, val) => sum + val, 0) /
      product2.metrics.annualFee.length;
    if (avg1 < avg2) score1++;
    else if (avg2 < avg1) score2++;
  }

  if (score1 > score2) return "product1";
  if (score2 > score1) return "product2";
  return "tie";
}

/**
 * Extract key metrics across all products
 */
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

  // Calculate averages
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

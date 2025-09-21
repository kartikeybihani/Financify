// api/utils/webScraper.js
import fetch from "node-fetch";
import * as cheerio from "cheerio";

/**
 * Basic web scraping system using fetch + Cheerio
 * Handles static HTML pages with fallback strategies
 */

// Rate limiting configuration
const RATE_LIMITS = {
  maxConcurrent: 3,
  delayBetweenRequests: 1000, // 1 second
  timeout: 10000, // 10 seconds
  maxRetries: 2,
};

// Request queue for rate limiting
let requestQueue = [];
let activeRequests = 0;

/**
 * Rate-limited fetch with retry logic
 */
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

/**
 * Process the request queue with rate limiting
 */
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
      requestQueue.unshift(request); // Retry at front of queue
    } else {
      request.reject(error);
    }
  } finally {
    activeRequests--;
    setTimeout(() => processQueue(), RATE_LIMITS.delayBetweenRequests);
  }
}

/**
 * Execute a single request
 */
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

/**
 * Extract relevant data from HTML using Cheerio
 */
export function extractDataFromHTML(html, url, entityType = "credit_card") {
  const $ = cheerio.load(html);
  const extractedData = {
    url,
    entityType,
    title: $("title").text().trim(),
    description: $('meta[name="description"]').attr("content") || "",
    extractedAt: new Date().toISOString(),
    data: {},
  };

  // Extract data based on entity type
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

/**
 * Extract credit card specific data
 */
function extractCreditCardData($) {
  const data = {
    apr: [],
    annualFee: [],
    rewards: [],
    benefits: [],
    features: [],
  };

  // Look for APR information
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

    // Look for annual fee
    const feeMatch = text.match(/\$(\d+)\s*annual\s*fee/i);
    if (feeMatch) {
      data.annualFee.push({
        value: parseFloat(feeMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }

    // Look for rewards information
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

  // Extract benefits from common selectors
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

/**
 * Extract bank specific data
 */
function extractBankData($) {
  const data = {
    interestRates: [],
    fees: [],
    features: [],
  };

  // Look for interest rate information
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

/**
 * Extract investment platform data
 */
function extractInvestmentData($) {
  const data = {
    fees: [],
    features: [],
    accountTypes: [],
  };

  // Look for fee information
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

/**
 * Extract generic financial data
 */
function extractGenericData($) {
  const data = {
    keyNumbers: [],
    features: [],
    benefits: [],
  };

  // Look for common financial patterns
  $("*").each((i, element) => {
    const text = $(element).text();

    // Look for percentage rates
    const rateMatch = text.match(/(\d+\.?\d*)\s*%/);
    if (rateMatch) {
      data.keyNumbers.push({
        type: "percentage",
        value: parseFloat(rateMatch[1]),
        text: text.trim(),
      });
    }

    // Look for dollar amounts
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

/**
 * Scrape multiple URLs with rate limiting
 */
export async function scrapeMultipleUrls(urls, entityType = "credit_card") {
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

/**
 * Scrape a single URL
 */
export async function scrapeUrl(url, entityType = "credit_card") {
  try {
    const response = await rateLimitedFetch(url);
    const extractedData = extractDataFromHTML(response.html, url, entityType);
    console.log(`✅ [WEB_SCRAPER] Successfully scraped: ${url}`);
    return extractedData;
  } catch (error) {
    console.error(`❌ [WEB_SCRAPER] Failed to scrape ${url}:`, error.message);
    throw error;
  }
}

/**
 * Get scraping status and queue information
 */
export function getScrapingStatus() {
  return {
    activeRequests,
    queueLength: requestQueue.length,
    rateLimits: RATE_LIMITS,
  };
}

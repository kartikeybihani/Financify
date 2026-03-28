#!/usr/bin/env node

/**
 * Direct test script for Brave Search API
 * Run with: node test_brave_direct.js
 */

import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const BRAVE_API_KEY = process.env.BRAVE_API_KEY?.trim() ?? "";

async function braveSearchDirect(query) {
  try {
    console.log("🔍 [BRAVE] Searching for:", query);

    // Check if API key is available
    if (!BRAVE_API_KEY) {
      console.warn("⚠️ [BRAVE] No API key found, skipping web search");
      return [];
    }

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query
      )}`,
      {
        headers: {
          "X-Subscription-Token": BRAVE_API_KEY,
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
      }
    );

    console.log(
      `📊 Response status: ${response.status} ${response.statusText}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "❌ [BRAVE] API request failed:",
        response.status,
        response.statusText
      );
      console.error("Error details:", errorText);
      return [];
    }

    const data = await response.json();
    console.log("📄 Full response structure:", JSON.stringify(data, null, 2));

    // Extract top 3 results
    const results =
      data.web?.results?.slice(0, 3).map((result, index) => ({
        title: result.title || `Result ${index + 1}`,
        url: result.url || "",
        snippet:
          result.description || result.snippet || "No description available",
      })) || [];

    console.log(
      `✅ [BRAVE] Found ${results.length} results for query: "${query}"`
    );
    return results;
  } catch (error) {
    console.error("❌ [BRAVE] Search failed:", error.message);
    return [];
  }
}

async function testBraveDirect() {
  console.log("🧪 Direct Brave API Test\n");

  // Check if API key is set
  if (!BRAVE_API_KEY) {
    console.error("❌ BRAVE_API_KEY not found in environment variables");
    console.log("Please set your Brave API key in .env file:");
    console.log("BRAVE_API_KEY=your_api_key_here");
    process.exit(1);
  }

  console.log("✅ API key found");
  console.log(`🔑 Key: ${BRAVE_API_KEY.substring(0, 8)}...`);

  // Test with a simple query first
  const testQuery = "Roth IRA contribution limit 2025";
  console.log(`\n🔍 Testing with query: "${testQuery}"`);
  console.log("─".repeat(60));

  const results = await braveSearchDirect(testQuery);

  if (results.length > 0) {
    console.log("\n🎉 SUCCESS! Results:");
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.title}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Snippet: ${result.snippet}`);
    });
  } else {
    console.log("\n❌ No results returned");
  }
}

// Run the test
testBraveDirect().catch(console.error);

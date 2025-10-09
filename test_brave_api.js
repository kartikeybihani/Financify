#!/usr/bin/env node

/**
 * Test script for Brave Search API
 * Run with: node test_brave_api.js
 */

import { braveSearch } from "./lib/websearch/brave.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function testBraveAPI() {
  console.log("🧪 Testing Brave Search API...\n");

  // Check if API key is set
  if (!process.env.BRAVE_API_KEY) {
    console.error("❌ BRAVE_API_KEY not found in environment variables");
    console.log("Please set your Brave API key in .env file:");
    console.log("BRAVE_API_KEY=your_api_key_here");
    process.exit(1);
  }

  console.log("✅ API key found");
  console.log(`🔑 Key: ${process.env.BRAVE_API_KEY.substring(0, 8)}...`);

  // Test queries
  const testQueries = [
    "Roth IRA contribution limit 2025",
    "current federal tax rates",
    "S&P 500 today",
    "best high yield savings accounts 2025",
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing query: "${query}"`);
    console.log("─".repeat(50));

    try {
      const results = await braveSearch(query);

      if (results.length === 0) {
        console.log("❌ No results returned");
        continue;
      }

      console.log(`✅ Found ${results.length} results:`);

      results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.title}`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Snippet: ${result.snippet.substring(0, 150)}...`);
      });
    } catch (error) {
      console.error(`❌ Error testing query "${query}":`, error.message);
    }

    // Add delay between requests to be respectful
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n🏁 Test completed!");
}

// Run the test
testBraveAPI().catch(console.error);

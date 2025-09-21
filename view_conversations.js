#!/usr/bin/env node

// Simple script to view conversation logs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFilePath = path.join(__dirname, "conversation_log.json");

if (!fs.existsSync(logFilePath)) {
  console.log("❌ No conversation log file found at:", logFilePath);
  process.exit(1);
}

try {
  const logData = JSON.parse(fs.readFileSync(logFilePath, "utf8"));

  console.log("📊 CONVERSATION LOG SUMMARY");
  console.log("========================");
  console.log(`Total conversations: ${logData.conversations.length}`);
  console.log(`Last updated: ${logData.metadata.last_updated || "Unknown"}`);
  console.log("");

  if (logData.conversations.length === 0) {
    console.log("No conversations logged yet.");
    process.exit(0);
  }

  // Show last 5 conversations
  const recentConversations = logData.conversations.slice(-5);

  console.log("🔍 RECENT CONVERSATIONS (Last 5):");
  console.log("================================");

  recentConversations.forEach((conv, index) => {
    console.log(`\n${index + 1}. [${conv.timestamp}]`);
    console.log(`   User: ${conv.user_message}`);
    console.log(`   Intent: ${conv.intent} (confidence: ${conv.confidence})`);
    console.log(
      `   Response: ${conv.finny_response.substring(0, 100)}${
        conv.finny_response.length > 100 ? "..." : ""
      }`
    );
    console.log(`   Response time: ${conv.response_time_ms}ms`);
    if (conv.sources_used && conv.sources_used.length > 0) {
      console.log(`   Sources: ${conv.sources_used.join(", ")}`);
    }
  });

  // Show statistics
  console.log("\n📈 STATISTICS:");
  console.log("==============");

  const intents = {};
  const avgResponseTime =
    logData.conversations.reduce(
      (sum, conv) => sum + (conv.response_time_ms || 0),
      0
    ) / logData.conversations.length;

  logData.conversations.forEach((conv) => {
    intents[conv.intent] = (intents[conv.intent] || 0) + 1;
  });

  console.log("Intent distribution:");
  Object.entries(intents).forEach(([intent, count]) => {
    console.log(
      `  ${intent}: ${count} (${(
        (count / logData.conversations.length) *
        100
      ).toFixed(1)}%)`
    );
  });

  console.log(`Average response time: ${avgResponseTime.toFixed(0)}ms`);

  const cachedCount = logData.conversations.filter(
    (conv) => conv.cached
  ).length;
  console.log(
    `Cached responses: ${cachedCount} (${(
      (cachedCount / logData.conversations.length) *
      100
    ).toFixed(1)}%)`
  );
} catch (error) {
  console.error("❌ Error reading conversation log:", error.message);
  process.exit(1);
}

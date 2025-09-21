#!/usr/bin/env node

// Simple script to view conversation logs from Supabase
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

async function viewConversations() {
  try {
    console.log("📊 CONVERSATION LOG SUMMARY");
    console.log("========================");

    // Get total count
    const { count, error: countError } = await supabase
      .from("conversation_logs")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("❌ Error getting conversation count:", countError);
      process.exit(1);
    }

    console.log(`Total conversations: ${count || 0}`);

    if (count === 0) {
      console.log("No conversations logged yet.");
      process.exit(0);
    }

    // Get recent conversations
    const { data: conversations, error } = await supabase
      .from("conversation_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(5);

    if (error) {
      console.error("❌ Error fetching conversations:", error);
      process.exit(1);
    }

    console.log("🔍 RECENT CONVERSATIONS (Last 5):");
    console.log("================================");

    conversations.forEach((conv, index) => {
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

    // Get statistics
    const { data: allConversations, error: statsError } = await supabase
      .from("conversation_logs")
      .select("intent, response_time_ms, cached");

    if (statsError) {
      console.error("❌ Error fetching statistics:", statsError);
      return;
    }

    console.log("\n📈 STATISTICS:");
    console.log("==============");

    const intents = {};
    const avgResponseTime =
      allConversations.reduce(
        (sum, conv) => sum + (conv.response_time_ms || 0),
        0
      ) / allConversations.length;

    allConversations.forEach((conv) => {
      intents[conv.intent] = (intents[conv.intent] || 0) + 1;
    });

    console.log("Intent distribution:");
    Object.entries(intents).forEach(([intent, count]) => {
      console.log(
        `  ${intent}: ${count} (${(
          (count / allConversations.length) *
          100
        ).toFixed(1)}%)`
      );
    });

    console.log(`Average response time: ${avgResponseTime.toFixed(0)}ms`);

    const cachedCount = allConversations.filter((conv) => conv.cached).length;
    console.log(
      `Cached responses: ${cachedCount} (${(
        (cachedCount / allConversations.length) *
        100
      ).toFixed(1)}%)`
    );
  } catch (error) {
    console.error("❌ Error reading conversation log:", error.message);
    process.exit(1);
  }
}

viewConversations();

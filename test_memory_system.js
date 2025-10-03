// Simple test script to verify memory system functionality
// Run with: node test_memory_system.js

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testMemorySystem() {
  console.log("🧠 Testing Memory System...\n");

  try {
    // Test 1: Insert a test memory
    console.log("1. Testing memory insertion...");
    const testUserId = "test-user-123";

    const { data: insertData, error: insertError } = await supabase
      .from("user_memories")
      .insert({
        user_id: testUserId,
        memory_type: "profile_trait",
        key: "occupation",
        value: "Software Engineer",
        confidence_score: 0.9,
        expires_at: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
      });

    if (insertError) {
      console.error("❌ Memory insertion failed:", insertError);
      return;
    }
    console.log("✅ Memory inserted successfully");

    // Test 2: Load user memory
    console.log("\n2. Testing memory loading...");
    const { data: memories, error: loadError } = await supabase
      .from("user_memories")
      .select("*")
      .eq("user_id", testUserId);

    if (loadError) {
      console.error("❌ Memory loading failed:", loadError);
      return;
    }
    console.log("✅ Memory loaded successfully:", memories);

    // Test 3: Create memory summary
    console.log("\n3. Testing memory summary...");
    const summary = generateMemorySummary(memories);
    console.log("✅ Generated summary:", summary);

    const { data: summaryData, error: summaryError } = await supabase
      .from("memory_summary")
      .upsert({
        user_id: testUserId,
        summary_text: summary,
        last_updated: new Date().toISOString(),
      });

    if (summaryError) {
      console.error("❌ Memory summary failed:", summaryError);
      return;
    }
    console.log("✅ Memory summary saved successfully");

    // Test 4: Clean up test data
    console.log("\n4. Cleaning up test data...");
    await supabase.from("user_memories").delete().eq("user_id", testUserId);

    await supabase.from("memory_summary").delete().eq("user_id", testUserId);

    console.log("✅ Test data cleaned up");

    console.log("\n🎉 All memory system tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

function generateMemorySummary(memories) {
  const traits = memories.filter((m) => m.memory_type === "profile_trait");
  const constraints = memories.filter((m) => m.memory_type === "constraint");
  const preferences = memories.filter((m) => m.memory_type === "preference");
  const futurePlans = memories.filter((m) => m.memory_type === "future_plan");

  const parts = [];

  if (traits.length) {
    parts.push(
      `Profile: ${traits.map((t) => `${t.key} (${t.value})`).join(", ")}`
    );
  }

  if (constraints.length) {
    parts.push(
      `Constraints: ${constraints
        .map((c) => `${c.key} (${c.value})`)
        .join(", ")}`
    );
  }

  if (preferences.length) {
    parts.push(
      `Preferences: ${preferences
        .map((p) => `${p.key} (${p.value})`)
        .join(", ")}`
    );
  }

  if (futurePlans.length) {
    parts.push(
      `Future plans: ${futurePlans
        .map((f) => `${f.key} (${f.value})`)
        .join(", ")}`
    );
  }

  return parts.join(". ");
}

testMemorySystem();

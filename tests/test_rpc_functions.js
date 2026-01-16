// Test RPC Functions with Authenticated User
// This tests if RPC functions work correctly with RLS policies

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase configuration");
  process.exit(1);
}

// Test user ID - replace with a real user ID from your database
const TEST_USER_ID = "f948c4ab-dc68-41d5-89bf-1935653cca37";

// You'll need to get a real JWT token for this user
// For testing, you can:
// 1. Get token from your app after login
// 2. Or use service_role key temporarily (but this bypasses RLS)
const TEST_TOKEN = process.env.TEST_USER_TOKEN || "";

async function testRPCFunctions() {
  console.log("🧪 Testing RPC Functions with RLS...\n");

  // Create authenticated client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: TEST_TOKEN ? `Bearer ${TEST_TOKEN}` : undefined,
      },
    },
  });

  // If no token, use service_role for testing (bypasses RLS)
  // This is just for testing - in production, always use authenticated tokens
  const supabaseService = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  );

  const testClient = TEST_TOKEN ? supabase : supabaseService;
  const clientType = TEST_TOKEN ? "authenticated" : "service_role";

  console.log(`📋 Using ${clientType} client\n`);

  const tests = [
    {
      name: "get_net_worth",
      fn: () => testClient.rpc("get_net_worth", { p_user_id: TEST_USER_ID }),
    },
    {
      name: "get_investment_snapshot",
      fn: () =>
        testClient.rpc("get_investment_snapshot", { p_user_id: TEST_USER_ID }),
    },
    {
      name: "get_recent_transactions",
      fn: () =>
        testClient.rpc("get_recent_transactions", {
          p_user_id: TEST_USER_ID,
          p_limit: 5,
        }),
    },
    {
      name: "get_spend_by_category",
      fn: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return testClient.rpc("get_spend_by_category", {
          p_user_id: TEST_USER_ID,
          p_start: start.toISOString().split("T")[0],
          p_end: end.toISOString().split("T")[0],
        });
      },
    },
    {
      name: "get_cashflow_monthly",
      fn: () =>
        testClient.rpc("get_cashflow_monthly", {
          p_user_id: TEST_USER_ID,
          p_months: 3,
        }),
    },
    {
      name: "get_summary_min_composite",
      fn: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return testClient.rpc("get_summary_min_composite", {
          p_user_id: TEST_USER_ID,
          p_limit: 5,
          p_start: start.toISOString().split("T")[0],
          p_end: end.toISOString().split("T")[0],
        });
      },
    },
    {
      name: "get_goals_overview",
      fn: () =>
        testClient.rpc("get_goals_overview", {
          p_user_id: TEST_USER_ID,
          p_limit: 5,
        }),
    },
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`🧪 Testing ${test.name}...`);
      const startTime = Date.now();
      const { data, error } = await test.fn();
      const duration = Date.now() - startTime;

      if (error) {
        console.error(`  ❌ ${test.name} FAILED:`, error);
        results.push({
          name: test.name,
          status: "FAILED",
          error: error.message,
          code: error.code,
          duration,
        });
      } else {
        console.log(`  ✅ ${test.name} SUCCESS (${duration}ms)`);
        if (data) {
          const dataType = Array.isArray(data)
            ? `array[${data.length}]`
            : typeof data;
          console.log(`     Data type: ${dataType}`);
          if (Array.isArray(data) && data.length > 0) {
            console.log(
              `     First item keys: ${Object.keys(data[0]).join(", ")}`
            );
          } else if (typeof data === "object" && data !== null) {
            console.log(`     Keys: ${Object.keys(data).join(", ")}`);
          }
        }
        results.push({
          name: test.name,
          status: "SUCCESS",
          duration,
          hasData: !!data,
          dataLength: Array.isArray(data) ? data.length : data ? 1 : 0,
        });
      }
    } catch (err) {
      console.error(`  ❌ ${test.name} EXCEPTION:`, err.message);
      results.push({
        name: test.name,
        status: "EXCEPTION",
        error: err.message,
      });
    }
    console.log("");
  }

  // Summary
  console.log("=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));
  const passed = results.filter((r) => r.status === "SUCCESS").length;
  const failed = results.filter((r) => r.status !== "SUCCESS").length;
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log("");

  if (failed > 0) {
    console.log("Failed tests:");
    results
      .filter((r) => r.status !== "SUCCESS")
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error || r.status}`);
        if (r.code) console.log(`    Code: ${r.code}`);
      });
  }

  return results;
}

// Run tests
testRPCFunctions()
  .then((results) => {
    const allPassed = results.every((r) => r.status === "SUCCESS");
    process.exit(allPassed ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Test runner error:", error);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Debug script: fetch a user's Plaid accounts/balances (and optional endpoints)
 * for inspecting raw Plaid API responses.
 *
 * Usage:
 *   1. Set DEBUG_USER_ID below to your Supabase user UUID.
 *   2. Ensure .env has SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PLAID_* for env you want.
 *   3. For production Plaid: NODE_ENV=production node scripts/debug-plaid-balances.js
 *      Or: PLAID_ENV=production node scripts/debug-plaid-balances.js
 *
 * Optional: pass --item-id <item_id> to debug a single item only.
 */

import "dotenv/config";
import { supabase } from "../lib/api/supabase.js";
import { client } from "../lib/api/plaidClient.js";
import { getEnvironment } from "../lib/api/env.js";

// --- Set this to the Supabase user ID you want to debug ---
const DEBUG_USER_ID = "6e18728a-eaea-4c7e-99a5-f35f3378b69d";

async function main() {
  const userId =
    process.argv.includes("--user-id") &&
    process.argv[process.argv.indexOf("--user-id") + 1]
      ? process.argv[process.argv.indexOf("--user-id") + 1]
      : DEBUG_USER_ID;

  const itemIdArg =
    process.argv.includes("--item-id") &&
    process.argv[process.argv.indexOf("--item-id") + 1]
      ? process.argv[process.argv.indexOf("--item-id") + 1]
      : null;

  if (!userId || userId === "REPLACE_WITH_YOUR_SUPABASE_USER_UUID") {
    console.error(
      "Set DEBUG_USER_ID in the script or run: node scripts/debug-plaid-balances.js --user-id <uuid>",
    );
    process.exit(1);
  }

  console.log("Plaid env:", getEnvironment());
  console.log("User ID:", userId);
  if (itemIdArg) console.log("Item ID (filter):", itemIdArg);

  // 1. Get user's Plaid items
  let query = supabase
    .from("user_items")
    .select("item_id, institution_id, institution_name")
    .eq("user_id", userId);

  if (itemIdArg) query = query.eq("item_id", itemIdArg);

  const { data: items, error: itemsError } = await query;

  if (itemsError) {
    console.error("Failed to fetch user_items:", itemsError);
    process.exit(1);
  }
  if (!items?.length) {
    console.log("No Plaid items found for this user.");
    process.exit(0);
  }

  const fmt = (n) =>
    n != null
      ? typeof n === "number"
        ? `$${n.toFixed(2)}`
        : `$${Number(n).toFixed(2)}`
      : "—";

  for (const item of items) {
    const { item_id, institution_name } = item;
    const label = institution_name
      ? `${institution_name} (${item_id.slice(0, 8)}…)`
      : item_id;

    const { data: access_token, error: tokenError } = await supabase.rpc(
      "secure_get_plaid_token",
      { p_item_id: item_id, p_user_id: userId },
    );

    if (tokenError || !access_token) {
      if (item_id.startsWith("snaptrade-")) {
        console.log(`\n${label}\n  (SnapTrade — no Plaid token)\n`);
      } else {
        console.log(
          `\n${label}\n  ⚠ Token error: ${tokenError?.message || "No token"}\n`,
        );
      }
      continue;
    }

    try {
      // Use accountsBalanceGet for real-time balances (accountsGet returns cached)
      let accounts = [];
      try {
        const res = await client.accountsBalanceGet({ access_token });
        accounts = res.data?.accounts || [];
        console.log(`\n${label} (accountsBalanceGet - real-time)`);
      } catch (balanceErr) {
        console.warn(`  ⚠️ accountsBalanceGet failed: ${balanceErr.message}`);
        const res = await client.accountsGet({ access_token });
        accounts = res.data?.accounts || [];
        console.log(`\n${label} (accountsGet fallback - cached)`);
      }
      if (accounts.length === 0) {
        console.log("  (no accounts)\n");
        continue;
      }
      for (const acc of accounts) {
        const b = acc.balances || {};
        const name = acc.official_name || acc.name || "—";
        const parts = [
          `  • ${name} …${acc.mask || "??"}`,
          `    type: ${acc.type} / ${acc.subtype || "—"}`,
          `    current: ${fmt(b.current)}`,
        ];
        if (b.available != null) parts.push(`available: ${fmt(b.available)}`);
        if (b.limit != null) parts.push(`limit: ${fmt(b.limit)}`);
        console.log(parts.join("  |  "));
      }
      console.log("");
    } catch (err) {
      const plaid = err.response?.data;
      const msg = plaid?.display_message || plaid?.error_message || err.message;
      const code = plaid?.error_code ? ` [${plaid.error_code}]` : "";
      console.log(`\n${label}\n  ❌ ${msg}${code}\n`);
    }
  }
}

main();

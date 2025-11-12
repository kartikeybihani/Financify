import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupDuplicateHoldings() {
  try {
    console.log("🔄 Starting duplicate holdings cleanup...\n");

    // Get all active holdings
    const { data: allHoldings, error: fetchError } = await supabase
      .from("investment_holdings")
      .select("*")
      .eq("is_active", true)
      .order("last_updated", { ascending: false });

    if (fetchError) {
      console.error("❌ Error fetching holdings:", fetchError);
      return;
    }

    if (!allHoldings || allHoldings.length === 0) {
      console.log("✅ No active holdings found");
      return;
    }

    console.log(`📊 Found ${allHoldings.length} active holdings\n`);

    // Group holdings by (user_id, snaptrade_user_id, account_id, symbol)
    const holdingsBySymbol = {};

    allHoldings.forEach((holding) => {
      const key = `${holding.user_id}|${holding.snaptrade_user_id}|${holding.account_id}|${holding.symbol}`;
      if (!holdingsBySymbol[key]) {
        holdingsBySymbol[key] = [];
      }
      holdingsBySymbol[key].push(holding);
    });

    // Find duplicates
    const duplicates = [];
    Object.keys(holdingsBySymbol).forEach((key) => {
      const holdings = holdingsBySymbol[key];
      if (holdings.length > 1) {
        // Sort by last_updated (most recent first)
        holdings.sort((a, b) => {
          const dateA = new Date(a.last_updated || a.created_at);
          const dateB = new Date(b.last_updated || b.created_at);
          return dateB - dateA;
        });

        // Keep the first one (most recent), mark others as duplicates
        const toKeep = holdings[0];
        const toRemove = holdings.slice(1);

        duplicates.push({
          symbol: holdings[0].symbol,
          keep: toKeep,
          remove: toRemove,
        });
      }
    });

    if (duplicates.length === 0) {
      console.log("✅ No duplicates found!");
      return;
    }

    console.log(`🔍 Found ${duplicates.length} symbols with duplicates:\n`);

    let totalToRemove = 0;
    duplicates.forEach((dup, index) => {
      console.log(`${index + 1}. ${dup.symbol}:`);
      console.log(
        `   ✅ Keeping: ${dup.keep.id} (updated: ${
          dup.keep.last_updated || dup.keep.created_at
        })`
      );
      dup.remove.forEach((h) => {
        console.log(
          `   ❌ Removing: ${h.id} (updated: ${h.last_updated || h.created_at})`
        );
        totalToRemove++;
      });
      console.log("");
    });

    console.log(
      `\n📊 Summary: ${totalToRemove} duplicate holdings to remove\n`
    );

    // Ask for confirmation (in a real script, you might want to add a prompt)
    // For now, we'll proceed with the cleanup
    console.log("🔄 Removing duplicates...\n");

    let removedCount = 0;
    let errorCount = 0;

    for (const dup of duplicates) {
      const idsToRemove = dup.remove.map((h) => h.id);

      // Mark as inactive instead of deleting (safer)
      const { error: updateError } = await supabase
        .from("investment_holdings")
        .update({ is_active: false })
        .in("id", idsToRemove);

      if (updateError) {
        console.error(
          `❌ Error removing duplicates for ${dup.symbol}:`,
          updateError
        );
        errorCount += idsToRemove.length;
      } else {
        console.log(
          `✅ Removed ${idsToRemove.length} duplicate(s) for ${dup.symbol}`
        );
        removedCount += idsToRemove.length;
      }
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Removed: ${removedCount} duplicate holdings`);
    if (errorCount > 0) {
      console.log(`   Errors: ${errorCount} holdings`);
    }
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  }
}

// Run the cleanup
cleanupDuplicateHoldings()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });

// Emergency script to reactivate all holdings that were incorrectly marked as inactive
// Run this if holdings were accidentally deactivated

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reactivateAllHoldings() {
  try {
    console.log("🔄 Reactivating all holdings...");
    
    // Get user_id from command line or use a specific one
    const userId = process.argv[2];
    
    if (!userId) {
      console.error("❌ Please provide user_id as argument: node scripts/reactivate_holdings.js <user_id>");
      process.exit(1);
    }
    
    // Reactivate all holdings for this user
    const { data, error } = await supabase
      .from("investment_holdings")
      .update({
        is_active: true,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("is_active", false)
      .select();
    
    if (error) {
      console.error("❌ Error reactivating holdings:", error);
      process.exit(1);
    }
    
    console.log(`✅ Successfully reactivated ${data?.length || 0} holdings`);
    console.log("📊 Reactivated holdings:", data?.map(h => h.symbol).join(", ") || "none");
    
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

reactivateAllHoldings();


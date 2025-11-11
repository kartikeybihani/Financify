// Emergency script to reactivate all holdings that were incorrectly marked as inactive
// Run this if holdings were accidentally deactivated

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reactivateAllHoldings() {
  try {
    console.log("🔄 Reactivating all holdings...");
    
    // Get identifier from command line - can be Supabase user_id or SnapTrade user_id
    const identifier = process.argv[2];
    
    if (!identifier) {
      console.error("❌ Please provide user_id as argument: node scripts/reactivate_holdings.js <user_id>");
      console.error("   You can use either Supabase user_id (UUID) or SnapTrade user_id");
      process.exit(1);
    }
    
    // Check if it's a SnapTrade user_id (contains "financify-") or Supabase UUID
    let userId = identifier;
    
    if (identifier.includes("financify-")) {
      // It's a SnapTrade user_id - need to find the Supabase user_id
      console.log("🔍 Detected SnapTrade user_id, finding Supabase user_id...");
      const { data: connection } = await supabase
        .from("snaptrade_connections")
        .select("user_id")
        .eq("snaptrade_user_id", identifier)
        .limit(1)
        .single();
      
      if (!connection || !connection.user_id) {
        console.error("❌ Could not find Supabase user_id for SnapTrade user_id:", identifier);
        process.exit(1);
      }
      
      userId = connection.user_id;
      console.log("✅ Found Supabase user_id:", userId);
    }
    
    // Reactivate all holdings for this user
    console.log("🔄 Reactivating holdings for user:", userId);
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
    if (data && data.length > 0) {
      console.log("📊 Reactivated holdings:", data.map(h => h.symbol).join(", "));
    } else {
      console.log("ℹ️ No inactive holdings found to reactivate");
    }
    
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

reactivateAllHoldings();


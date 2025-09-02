// Utility functions to debug and fix transaction category issues
import { supabase } from "../lib/supabase/supabase";

/**
 * Debug function to check transaction categories in the database
 */
export const debugTransactionCategories = async (userId: string, limit: number = 20) => {
  try {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("name, category, amount, date")
      .eq("user_id", userId)
      .limit(limit)
      .order("date", { ascending: false });

    if (error) {
      console.error("❌ Error fetching transactions for debug:", error);
      return;
    }

    console.log(`🔍 Debug: Checking ${transactions?.length || 0} recent transactions:`);
    
    const categoryCounts: { [key: string]: number } = {};
    
    transactions?.forEach((tx, idx) => {
      const category = tx.category || "null";
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      
      if (idx < 5) { // Show first 5 in detail
        console.log(`${idx + 1}. "${tx.name}" → Category: "${tx.category}" (${tx.date})`);
      }
    });

    console.log("📊 Category distribution:");
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count} transactions`);
      });

    const nullCount = categoryCounts["null"] || 0;
    const totalCount = transactions?.length || 0;
    
    if (nullCount > 0) {
      console.log(`⚠️ Found ${nullCount}/${totalCount} transactions with null categories`);
      console.log("💡 Consider running a fresh sync to get proper categories");
    } else {
      console.log("✅ All transactions have valid categories!");
    }

  } catch (error) {
    console.error("❌ Error in category debug:", error);
  }
};

/**
 * Count transactions with null/missing categories
 */
export const countNullCategories = async (userId: string) => {
  try {
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("category", null);

    if (error) throw error;

    console.log(`🔍 Found ${count || 0} transactions with null categories`);
    return count || 0;
  } catch (error) {
    console.error("❌ Error counting null categories:", error);
    return 0;
  }
};

/**
 * Get category breakdown for current month
 */
export const getCurrentMonthCategoryBreakdown = async (userId: string) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("category, amount")
      .eq("user_id", userId)
      .gte("date", startOfMonth.toISOString().split('T')[0])
      .lte("date", endOfMonth.toISOString().split('T')[0])
      .gt("amount", 0); // Only expenses

    if (error) throw error;

    const breakdown: { [key: string]: { amount: number; count: number } } = {};

    transactions?.forEach(tx => {
      const category = tx.category || "Other";
      if (!breakdown[category]) {
        breakdown[category] = { amount: 0, count: 0 };
      }
      breakdown[category].amount += tx.amount;
      breakdown[category].count += 1;
    });

    console.log(`📊 Current month spending by category:`);
    Object.entries(breakdown)
      .sort((a, b) => b[1].amount - a[1].amount)
      .forEach(([category, data]) => {
        console.log(`  ${category}: $${data.amount.toFixed(2)} (${data.count} transactions)`);
      });

    return breakdown;
  } catch (error) {
    console.error("❌ Error getting category breakdown:", error);
    return {};
  }
};

/**
 * Force a complete re-sync by resetting transaction cursor
 * This will cause Plaid to re-send ALL transactions with fresh data
 */
export const forceFullResync = async (userId: string) => {
  try {
    console.log("🔄 Starting FULL re-sync for user...");
    
    // Get all user items
    const { data: userItems, error: itemsError } = await supabase
      .from("user_items")
      .select("item_id, institution_name")
      .eq("user_id", userId);
    
    if (itemsError || !userItems?.length) {
      console.error("❌ No user items found:", itemsError);
      return false;
    }

    console.log(`🏦 Found ${userItems.length} connected accounts to re-sync`);

    // Reset cursor for each item (forces full re-sync)
    for (const item of userItems) {
      console.log(`🔄 Resetting cursor for ${item.institution_name}...`);
      
      const { error: updateError } = await supabase
        .from("user_items")
        .update({ 
          transactions_cursor: null, // This forces a full re-sync
          last_synced_at: new Date().toISOString()
        })
        .eq("item_id", item.item_id);

      if (updateError) {
        console.error(`❌ Failed to reset cursor for ${item.institution_name}:`, updateError);
      } else {
        console.log(`✅ Reset cursor for ${item.institution_name}`);
      }
    }

    console.log("✅ All cursors reset - next sync will be a FULL re-sync");
    console.log("💡 Now run syncAllUserTransactions() to get fresh data with categories");
    
    return true;
  } catch (error) {
    console.error("❌ Error in force full resync:", error);
    return false;
  }
};

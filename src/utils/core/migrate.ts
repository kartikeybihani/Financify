// app/utils/migrate.ts
import AppStorage from "@/src/utils/storage/storage";

export async function runStorageMigrationV2() {
  const done = AppStorage.getItemSync("migration_v2_done");
  if (done) return;

  console.log("🧹 Running storage migration v2...");

  // Legacy keys that might contain sensitive data
  const nukes = [
    // Old Plaid token keys
    "access_token",
    "plaid_token", 
    "plaid:item_id",
    "accessToken",
    "plaidItemId",
    
    // Old item arrays
    "plaid:item_ids",
    "items",
    
    // Old full data caches
    "accounts_full",
    "transactions_full", 
    "financialData",
    
    // Old cursors and sync state
    "cursor",
    "tx_history",
    "transactions_cursor",
    
    // Any other potential sensitive keys
    "plaidData",
    "bankAccounts",
    "userFinancials"
  ];

  try {
    // Use synchronous operations
    AppStorage.multiRemoveSync(nukes);
    console.log(`✅ Cleared ${nukes.length} legacy keys`);
  } catch (error) {
    console.error("⚠️ Error during migration:", error);
    // Continue anyway - migration shouldn't block app
  } finally {
    AppStorage.setItemSync("migration_v2_done", "1");
    console.log("✅ Migration v2 complete");
  }
}

// Cleanup orphaned cache entries for disconnected accounts
export async function cleanupOrphanedCache(userId: string, activeItemIds: string[]) {
  try {
    const allKeys = AppStorage.getAllKeysSync();
    const cacheKeys = allKeys.filter(key => 
      key.includes("tx_preview::") || 
      key.includes("balances::") || 
      key.includes("institution::") || 
      key.includes("last_sync_at::")
    );

    const orphanedKeys: string[] = [];

    for (const key of cacheKeys) {
      // Extract item_id from key pattern: "prefix::userId::itemId"
      const parts = key.split("::");
      if (parts.length >= 3) {
        const keyUserId = parts[1];
        const itemId = parts[2];
        
        // If this cache belongs to current user but item is no longer active
        if (keyUserId === userId && !activeItemIds.includes(itemId)) {
          orphanedKeys.push(key);
        }
      }
    }

    if (orphanedKeys.length > 0) {
      AppStorage.multiRemoveSync(orphanedKeys);
      console.log(`🧹 Cleaned up ${orphanedKeys.length} orphaned cache entries`);
    }
  } catch (error) {
    console.error("⚠️ Error cleaning orphaned cache:", error);
  }
}

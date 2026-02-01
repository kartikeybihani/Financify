#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";

/**
 * CLI Script: Manual Plaid Investment Holdings Sync
 * =================================================
 * Run this script to manually sync Plaid investment holdings for a specific item_id
 *
 * This will:
 * 1. Fetch holdings from Plaid API
 * 2. Store holdings in investment_holdings table
 * 3. Create/update investment_balances rows
 *
 * Usage:
 * ------
 * # Sync for a specific item_id:
 * node scripts/sync-plaid-investments.js --item-id 9BqKyEO5VgsbvJP6z619HYepzeearoCdvnz1d
 *
 * # Sync for a specific user_id (will sync all their Plaid items):
 * node scripts/sync-plaid-investments.js --user-id 991d7203-04f5-4845-8a3a-471358128511
 *
 * # Show help:
 * node scripts/sync-plaid-investments.js --help
 */

import { supabase } from "../lib/api/supabase.js";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// ============================================================================
// TEMPORARY: Hardcode production credentials here, then REMOVE after running
// ============================================================================
const PLAID_CLIENT_ID = "///";
const PLAID_SECRET_PROD = "////";
// ============================================================================
// REMOVE THE ABOVE LINES AFTER RUNNING THE SCRIPT
// ============================================================================

// Create Plaid client directly (bypassing plaidClient.js to avoid env checks)
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments.production, // Force production
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET_PROD,
    },
  },
});

const client = new PlaidApi(plaidConfig);

/**
 * Retry utility for Plaid API calls with exponential backoff
 */
async function retryPlaidOperation(
  operation,
  operationName,
  item_id = null,
  maxRetries = 3
) {
  const initialDelay = 1000;
  const maxDelay = 10000;
  const backoffMultiplier = 2;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors (authentication, invalid request)
      const statusCode = error?.response?.status || error?.statusCode;
      if (statusCode === 401 || statusCode === 400 || statusCode === 404) {
        console.error(
          `❌ [${operationName}] Non-retryable error:`,
          error.message
        );
        throw error;
      }

      // Don't retry on rate limit errors immediately (wait longer)
      if (statusCode === 429) {
        const retryAfter = error?.response?.headers?.["retry-after"] || 60;
        const delay = Math.min(retryAfter * 1000, maxDelay * 10);
        console.warn(
          `⚠️ [${operationName}] Rate limited. Waiting ${delay}ms before retry...`,
          { item_id }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        );
        console.warn(
          `⚠️ [${operationName}] Attempt ${attempt + 1}/${
            maxRetries + 1
          } failed. Retrying in ${delay}ms...`,
          { item_id, error: error.message }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `❌ [${operationName}] All ${maxRetries + 1} attempts failed`,
          { item_id, error: error.message }
        );
      }
    }
  }
  throw lastError;
}

/**
 * Sync Plaid investment holdings for a specific item_id
 */
async function syncPlaidInvestmentsForItem(item_id, user_id) {
  console.log(`\n🔄 Syncing Plaid investments for item: ${item_id}`);
  console.log(`   User: ${user_id.substring(0, 8)}...`);

  try {
    // 1. Get access token from Vault
    console.log("🔑 Fetching access token from Vault...");
    const { data: access_token, error: tokenError } = await supabase.rpc(
      "secure_get_plaid_token",
      { p_item_id: item_id, p_user_id: user_id }
    );

    if (tokenError || !access_token) {
      console.error("❌ Error retrieving Plaid token from Vault:", tokenError);
      return {
        success: false,
        error: `Access token not found: ${
          tokenError?.message || "No token returned"
        }`,
        item_id,
        user_id,
      };
    }

    console.log("✅ Access token retrieved");

    // 2. Fetch holdings from Plaid API
    console.log("📈 Fetching holdings from Plaid API...");
    const holdingsResponse = await retryPlaidOperation(
      () => client.investmentsHoldingsGet({ access_token }),
      "investmentsHoldingsGet",
      item_id
    );

    const holdings = holdingsResponse.data.holdings || [];
    const securities = holdingsResponse.data.securities || [];
    const accounts = holdingsResponse.data.accounts || [];
    // console.log(JSON.stringify(holdingsResponse.data, null, 2));
    // console.log(JSON.stringify(securities, null, 2));
    // console.log(JSON.stringify(accounts, null, 2));
    console.log(
      `📊 Found ${holdings.length} holdings, ${securities.length} securities, ${accounts.length} accounts`
    );

    if (holdings.length === 0) {
      console.log("ℹ️ No holdings found for this item");
      return {
        success: true,
        message: "No holdings found (account may have no investments)",
        item_id,
        user_id,
        holdings_count: 0,
      };
    }

    // 3. Create maps for quick lookup
    const securitiesMap = new Map();
    securities.forEach((security) => {
      securitiesMap.set(security.security_id, security);
    });

    const accountsMap = new Map();
    accounts.forEach((account) => {
      accountsMap.set(account.account_id, account);
    });

    // 4. Get existing holdings to calculate day_change
    console.log("🔍 Fetching existing holdings from database...");
    const { data: existingHoldings } = await supabase
      .from("investment_holdings")
      .select(
        "security_id, previous_market_value, market_value, plaid_account_id"
      )
      .eq("user_id", user_id)
      .eq("item_id", item_id)
      .eq("provider", "plaid")
      .eq("is_active", true);

    // 5. Process holdings and prepare for upsert
    console.log("⚙️ Processing holdings data...");
    const holdingsRows = holdings
      .map((holding) => {
        const security = securitiesMap.get(holding.security_id);
        const account = accountsMap.get(holding.account_id);

        if (!security) {
          console.warn(
            `⚠️ Security not found for security_id: ${holding.security_id}`
          );
          return null;
        }

        // Find existing holding to get previous_market_value
        const existingHolding = existingHoldings?.find(
          (eh) =>
            eh.security_id === holding.security_id &&
            eh.plaid_account_id === holding.account_id
        );

        const previousMarketValue =
          existingHolding?.previous_market_value ??
          existingHolding?.market_value ??
          null;

        const currentMarketValue = holding.institution_value || 0;
        const currentPrice =
          holding.institution_price || security.close_price || 0;
        const quantity = holding.quantity || 0;
        const costBasis = holding.cost_basis || 0;

        // Calculate day_change and day_change_percent
        let dayChange = null;
        let dayChangePercent = null;
        if (
          previousMarketValue !== null &&
          previousMarketValue !== undefined &&
          currentMarketValue !== null
        ) {
          dayChange = currentMarketValue - previousMarketValue;
          dayChangePercent =
            previousMarketValue !== 0
              ? (dayChange / previousMarketValue) * 100
              : 0;
        }

        // Calculate unrealized P&L
        const unrealizedPL = currentMarketValue - costBasis;

        // Calculate total_percent_change (from cost basis)
        const totalPercentChange =
          costBasis !== 0 && costBasis !== null
            ? ((currentMarketValue - costBasis) / costBasis) * 100
            : null;

        return {
          user_id: user_id,
          provider: "plaid",
          item_id: item_id,
          plaid_account_id: holding.account_id,
          security_id: holding.security_id,
          symbol: security.ticker_symbol || security.name || null,
          description: security.name || null,
          currency_code:
            holding.iso_currency_code || security.iso_currency_code || "USD",
          exchange_code: security.market_identifier_code || null,
          exchange_name: null,
          security_type: security.type || null,
          sector: security.sector || null,
          industry: security.industry || null,
          units: quantity,
          price: currentPrice,
          market_value: currentMarketValue,
          previous_market_value: currentMarketValue,
          average_purchase_price:
            costBasis > 0 && quantity > 0 ? costBasis / quantity : null,
          total_cost_basis: costBasis,
          unrealized_pl: unrealizedPL,
          day_change: dayChange,
          day_change_percent: dayChangePercent,
          total_percent_change: totalPercentChange,
          is_active: true,
          last_updated: new Date().toISOString(),
          snaptrade_user_id: null,
          account_id: holding.account_id,
          symbol_id: null,
        };
      })
      .filter((h) => h !== null);

    if (holdingsRows.length === 0) {
      console.log("⚠️ No valid holdings rows to insert (all filtered out)");
      return {
        success: false,
        error: "No valid holdings to store",
        item_id,
        user_id,
      };
    }

    // 6. Upsert holdings using delete-then-insert pattern (works with partial unique indexes)
    console.log(`💾 Upserting ${holdingsRows.length} holdings...`);
    let holdingsError = null;
    let holdingsStored = 0;

    try {
      // Extract security_ids and account_ids for deletion
      const securityIds = holdingsRows
        .map((h) => h.security_id)
        .filter((id) => id !== null && id !== undefined && id !== "");
      const accountIds = holdingsRows
        .map((h) => h.plaid_account_id)
        .filter((id) => id !== null && id !== undefined && id !== "");

      if (securityIds.length > 0 && accountIds.length > 0) {
        // Delete existing holdings for these securities/accounts first
        console.log("🗑️  Deleting existing holdings for these securities...");
        const { error: deleteError } = await supabase
          .from("investment_holdings")
          .delete()
          .eq("user_id", user_id)
          .eq("item_id", item_id)
          .eq("provider", "plaid")
          .in("security_id", securityIds)
          .in("plaid_account_id", accountIds);

        if (deleteError) {
          console.warn(
            "⚠️ Error deleting existing holdings (continuing anyway):",
            deleteError
          );
        }
      }

      // Now insert the new holdings
      console.log(`➕ Inserting ${holdingsRows.length} holdings...`);
      const { error: insertError } = await supabase
        .from("investment_holdings")
        .insert(holdingsRows);

      if (insertError) {
        holdingsError = insertError;
        console.error("❌ Error inserting Plaid holdings:", insertError);

        // Fallback: Try individual inserts
        console.log("🔄 Attempting individual holdings inserts...");
        let successCount = 0;
        let failCount = 0;

        for (const holding of holdingsRows) {
          try {
            // Delete existing first
            await supabase
              .from("investment_holdings")
              .delete()
              .eq("user_id", user_id)
              .eq("item_id", item_id)
              .eq("provider", "plaid")
              .eq("security_id", holding.security_id)
              .eq("plaid_account_id", holding.plaid_account_id);

            // Then insert
            const { error: individualError } = await supabase
              .from("investment_holdings")
              .insert(holding);

            if (individualError) {
              console.error(
                `❌ Failed to insert holding ${
                  holding.symbol || holding.security_id
                }:`,
                individualError
              );
              failCount++;
            } else {
              successCount++;
            }
          } catch (err) {
            console.error(
              `❌ Exception inserting holding ${
                holding.symbol || holding.security_id
              }:`,
              err
            );
            failCount++;
          }
        }

        holdingsStored = successCount;
        if (failCount > 0) {
          console.warn(
            `⚠️ ${failCount} holdings failed to insert, ${successCount} succeeded`
          );
        } else {
          console.log(`✅ All ${successCount} holdings inserted individually`);
        }
      } else {
        holdingsStored = holdingsRows.length;
        console.log(
          `✅ Stored ${holdingsRows.length} Plaid investment holdings`
        );
      }
    } catch (err) {
      console.error("❌ Exception during holdings insert:", err);
      holdingsError = err;
    }

    // 7. Mark removed holdings as inactive
    await new Promise((resolve) => setTimeout(resolve, 500));

    const activeSecurityIds = new Set(
      holdingsRows
        .map((h) => h.security_id)
        .filter((id) => id !== null && id !== undefined && id !== "")
    );
    const activeAccountIds = new Set(
      holdingsRows
        .map((h) => h.plaid_account_id)
        .filter((id) => id !== null && id !== undefined && id !== "")
    );

    if (activeSecurityIds.size > 0 && activeAccountIds.size > 0) {
      const { data: allActiveHoldings, error: fetchError } = await supabase
        .from("investment_holdings")
        .select("security_id, plaid_account_id")
        .eq("user_id", user_id)
        .eq("item_id", item_id)
        .eq("provider", "plaid")
        .eq("is_active", true);

      if (!fetchError && allActiveHoldings && allActiveHoldings.length > 0) {
        const removedHoldings = allActiveHoldings.filter((h) => {
          if (!h.security_id || !h.plaid_account_id) return false;
          const exists =
            activeSecurityIds.has(h.security_id) &&
            activeAccountIds.has(h.plaid_account_id);
          return !exists;
        });

        if (removedHoldings.length > 0) {
          console.log(
            `🔴 Marking ${removedHoldings.length} removed holdings as inactive...`
          );
          const removedSecurityIds = removedHoldings
            .map((h) => h.security_id)
            .filter((id) => id);
          const removedAccountIds = removedHoldings
            .map((h) => h.plaid_account_id)
            .filter((id) => id);

          const { error: deactivateError } = await supabase
            .from("investment_holdings")
            .update({
              is_active: false,
              last_updated: new Date().toISOString(),
            })
            .eq("user_id", user_id)
            .eq("item_id", item_id)
            .eq("provider", "plaid")
            .in("security_id", removedSecurityIds)
            .in("plaid_account_id", removedAccountIds);

          if (deactivateError) {
            console.error(
              "❌ Error marking removed holdings as inactive:",
              deactivateError
            );
          } else {
            console.log(
              `✅ Successfully marked ${removedHoldings.length} removed holdings as inactive`
            );
          }
        }
      }
    }

    // 8. Process account balances
    console.log("💰 Processing account balances...");
    const investmentAccounts = accounts.filter(
      (account) => account.type === "investment"
    );

    const balanceRows = await Promise.all(
      investmentAccounts.map(async (account) => {
        // Calculate total value from holdings for this account
        const accountHoldings = holdingsRows.filter(
          (h) => h.plaid_account_id === account.account_id
        );
        const totalHoldingsValue = accountHoldings.reduce(
          (sum, h) => sum + (h.market_value || 0),
          0
        );
        const cashBalance = account.balances?.current || 0;
        const totalValue = totalHoldingsValue + cashBalance;

        // Get existing balance to calculate day_change
        const { data: existingBalance } = await supabase
          .from("investment_balances")
          .select("previous_total_value, total_value")
          .eq("user_id", user_id)
          .eq("item_id", item_id)
          .eq("plaid_account_id", account.account_id)
          .eq("provider", "plaid")
          .eq("is_current", true)
          .single();

        const previousTotalValue =
          existingBalance?.previous_total_value ??
          existingBalance?.total_value ??
          null;

        // Calculate day_change
        let dayChange = null;
        let dayChangePercent = null;
        if (previousTotalValue !== null && previousTotalValue !== undefined) {
          dayChange = totalValue - previousTotalValue;
          dayChangePercent =
            previousTotalValue !== 0
              ? (dayChange / previousTotalValue) * 100
              : 0;
        }

        return {
          user_id: user_id,
          provider: "plaid",
          item_id: item_id,
          plaid_account_id: account.account_id,
          currency_code: account.balances?.iso_currency_code || "USD",
          cash: cashBalance,
          buying_power: 0,
          total_value: totalValue,
          previous_total_value: totalValue,
          day_change: dayChange,
          day_change_percent: dayChangePercent,
          total_change: null,
          total_change_percent: null,
          is_current: true,
          last_updated: new Date().toISOString(),
          snaptrade_user_id: null,
          account_id: account.account_id,
        };
      })
    );

    if (balanceRows.length > 0) {
      // Backup current balances before update (for rollback)
      const { data: previousBalances } = await supabase
        .from("investment_balances")
        .select("*")
        .eq("user_id", user_id)
        .eq("item_id", item_id)
        .eq("provider", "plaid")
        .eq("is_current", true);

      // Upsert balances using delete-then-insert pattern (works with partial unique indexes)
      console.log(`💾 Upserting ${balanceRows.length} balance rows...`);

      // Delete existing balances for these accounts first
      const accountIds = balanceRows.map((b) => b.plaid_account_id);
      if (accountIds.length > 0) {
        console.log("🗑️  Deleting existing balances for these accounts...");
        const { error: deleteBalancesError } = await supabase
          .from("investment_balances")
          .delete()
          .eq("user_id", user_id)
          .eq("item_id", item_id)
          .eq("provider", "plaid")
          .in("plaid_account_id", accountIds);

        if (deleteBalancesError) {
          console.warn(
            "⚠️ Error deleting existing balances (continuing anyway):",
            deleteBalancesError
          );
        }
      }

      // Now insert the new balances
      console.log(`➕ Inserting ${balanceRows.length} balance rows...`);
      const { error: balancesError } = await supabase
        .from("investment_balances")
        .insert(balanceRows);

      if (balancesError) {
        console.error("❌ Error upserting Plaid balances:", balancesError);

        // Rollback: Restore previous balances as current
        if (previousBalances && previousBalances.length > 0) {
          console.log("🔄 Rolling back balance updates...");
          const rollbackData = previousBalances.map((b) => ({
            ...b,
            is_current: true,
          }));

          // Delete any partially inserted balances first
          await supabase
            .from("investment_balances")
            .delete()
            .eq("user_id", user_id)
            .eq("item_id", item_id)
            .eq("provider", "plaid")
            .in("plaid_account_id", accountIds);

          // Restore previous balances
          const { error: rollbackError } = await supabase
            .from("investment_balances")
            .insert(rollbackData);

          if (rollbackError) {
            console.error(
              "❌ Critical: Failed to rollback balances:",
              rollbackError
            );
          } else {
            console.log("✅ Successfully rolled back balance updates");
          }
        }

        throw balancesError;
      } else {
        console.log(
          `✅ Stored ${balanceRows.length} Plaid investment account balances`
        );
      }
    }

    return {
      success: true,
      item_id,
      user_id,
      holdings_count: holdingsStored,
      balances_count: balanceRows.length,
      message: `Successfully synced ${holdingsStored} holdings and ${balanceRows.length} balances`,
    };
  } catch (error) {
    console.error("❌ Error syncing Plaid investments:", error);
    return {
      success: false,
      error: error.message || "Unknown error",
      item_id,
      user_id,
    };
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    itemId: undefined,
    userId: undefined,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--item-id":
      case "-i":
        options.itemId = args[++i];
        break;

      case "--user-id":
      case "-u":
        options.userId = args[++i];
        break;

      case "--help":
      case "-h":
        options.help = true;
        break;

      default:
        console.warn(`⚠️  Unknown argument: ${arg}`);
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║   Manual Plaid Investment Holdings Sync                       ║
╚════════════════════════════════════════════════════════════════╝

This script manually syncs Plaid investment holdings for a specific item_id
or all items for a user_id. It will:

1. Fetch holdings from Plaid API
2. Store holdings in investment_holdings table
3. Create/update investment_balances rows

USAGE:
  node scripts/sync-plaid-investments.js [OPTIONS]

OPTIONS:
  --item-id, -i <id>     Plaid item_id to sync (required if --user-id not provided)
  --user-id, -u <id>     User ID - will sync all Plaid items for this user
  --help, -h              Show this help message

EXAMPLES:
  # Sync for a specific item_id:
  node scripts/sync-plaid-investments.js \\
    --item-id 9BqKyEO5VgsbvJP6z619HYepzeearoCdvnz1d

  # Sync all Plaid items for a user:
  node scripts/sync-plaid-investments.js \\
    --user-id 991d7203-04f5-4845-8a3a-471358128511

NOTES:
  - Requires valid Plaid access token stored in Vault
  - Will update existing holdings if they already exist
  - Will mark removed holdings as inactive
  - Creates investment_balances rows for each investment account

`);
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate arguments
  if (!options.itemId && !options.userId) {
    console.error("❌ Error: Either --item-id or --user-id is required");
    console.log("\nUse --help for usage information");
    process.exit(1);
  }

  const results = [];

  if (options.itemId) {
    // Single item sync
    console.log(`\n🔄 Syncing item: ${options.itemId}`);

    // Get user_id from item_id
    const { data: userItem, error: itemError } = await supabase
      .from("user_items")
      .select("user_id")
      .eq("item_id", options.itemId)
      .single();

    if (itemError || !userItem) {
      console.error(`❌ Error: Item not found: ${options.itemId}`, itemError);
      process.exit(1);
    }

    const result = await syncPlaidInvestmentsForItem(
      options.itemId,
      userItem.user_id
    );
    results.push(result);
  } else if (options.userId) {
    // Sync all items for user
    console.log(`\n🔄 Syncing all Plaid items for user: ${options.userId}`);

    // Get all Plaid items for this user
    const { data: userItems, error: itemsError } = await supabase
      .from("user_items")
      .select("item_id")
      .eq("user_id", options.userId);

    if (itemsError) {
      console.error(`❌ Error fetching items:`, itemsError);
      process.exit(1);
    }

    if (!userItems || userItems.length === 0) {
      console.log(`ℹ️ No Plaid items found for user ${options.userId}`);
      process.exit(0);
    }

    console.log(`📊 Found ${userItems.length} Plaid item(s) to sync\n`);

    for (const item of userItems) {
      const result = await syncPlaidInvestmentsForItem(
        item.item_id,
        options.userId
      );
      results.push(result);
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalHoldings = results.reduce(
    (sum, r) => sum + (r.holdings_count || 0),
    0
  );
  const totalBalances = results.reduce(
    (sum, r) => sum + (r.balances_count || 0),
    0
  );

  console.log(`Total items processed: ${results.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total holdings stored: ${totalHoldings}`);
  console.log(`💰 Total balances stored: ${totalBalances}`);

  if (failed > 0) {
    console.log(`\n⚠️  Errors:`);
    results
      .filter((r) => !r.success)
      .forEach((r, i) => {
        console.log(`  ${i + 1}. Item ${r.item_id}: ${r.error}`);
      });
  }

  console.log("=".repeat(60) + "\n");

  // Exit with error code if there were failures
  if (failed > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

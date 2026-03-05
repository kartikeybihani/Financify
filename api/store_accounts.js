// /api/store_accounts.js
import { client } from "../lib/api/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import {
  verifyItemOwnership,
  verifyUserAuthorization,
} from "../lib/api/auth.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

// Retry utility for Plaid API calls with exponential backoff
async function retryPlaidOperation(operation, operationName, item_id = null, maxRetries = 3) {
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
        console.error(`❌ [${operationName}] Non-retryable error:`, error.message);
        throw error;
      }

      // Don't retry on rate limit errors immediately (wait longer)
      if (statusCode === 429) {
        const retryAfter = error?.response?.headers?.['retry-after'] || 60;
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
          `⚠️ [${operationName}] Attempt ${attempt + 1}/${maxRetries + 1} failed. Retrying in ${delay}ms...`,
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

async function enforceStoreAccountsRateLimit(
  req,
  res,
  { scope, userId, limit, windowMs, message }
) {
  const rateResult = await checkRateLimit(req, {
    scope,
    userId,
    limit,
    windowMs,
  });

  if (rateResult.allowed) {
    return true;
  }

  const retryAfter = formatRetryAfterSeconds(rateResult.retryAfterMs);
  if (retryAfter > 0) {
    res.setHeader("Retry-After", retryAfter);
  }

  res.status(429).json({
    error: message || "Too many requests. Please try again later.",
    retry_after: retryAfter,
  });
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { item_id, mode, user_id } = req.body;

  // Handle SnapTrade investment account population
  if (mode === "populate_investment_accounts") {
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }
    const { authorized, error: authError } = await verifyUserAuthorization(
      req,
      user_id
    );
    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }
    const allowed = await enforceStoreAccountsRateLimit(req, res, {
      scope: "store_accounts:populate_investments",
      userId: user_id,
      limit: 5,
      windowMs: 60 * 1000,
      message: "Too many investment account refreshes. Please try again soon.",
    });
    if (!allowed) return;
    return handleInvestmentAccountPopulation(req, res, user_id);
  }

  // Handle financial summary generation
  if (mode === "financial_summary") {
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }
    const { authorized, error: authError } = await verifyUserAuthorization(
      req,
      user_id
    );
    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }
    const allowed = await enforceStoreAccountsRateLimit(req, res, {
      scope: "store_accounts:financial_summary",
      userId: user_id,
      limit: 8,
      windowMs: 60 * 1000,
      message: "Too many summary requests. Please wait and try again.",
    });
    if (!allowed) return;
    return handleFinancialSummary(req, res, user_id);
  }

  // Handle cache clearing
  if (mode === "clear_cache") {
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }
    const { authorized, error: authError } = await verifyUserAuthorization(
      req,
      user_id
    );
    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }
    const allowed = await enforceStoreAccountsRateLimit(req, res, {
      scope: "store_accounts:clear_cache",
      userId: user_id,
      limit: 3,
      windowMs: 60 * 1000,
      message: "Cache clear requests are rate limited. Please wait a bit.",
    });
    if (!allowed) return;
    return handleClearCache(req, res, user_id);
  }

  // Handle regular Plaid account storage
  if (!item_id) {
    return res.status(400).json({ error: "Missing item_id" });
  }

  try {
    console.log(
      "🏦 Fetching and storing ALL financial data for item_id:",
      item_id
    );

    // 1. Verify user owns this item (authorization check)
    const {
      authorized,
      userId,
      error: authError,
    } = await verifyItemOwnership(req, item_id);

    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }

    const allowed = await enforceStoreAccountsRateLimit(req, res, {
      scope: "store_accounts:plaid_full_import",
      userId,
      limit: 5,
      windowMs: 2 * 60 * 1000,
      message:
        "Too many full account refreshes. Please wait before trying again.",
    });
    if (!allowed) return;

    // 2. Get access_token from Vault
    const { data: access_token, error: tokenError } = await supabase.rpc(
      "secure_get_plaid_token",
      { p_item_id: item_id, p_user_id: userId }
    );

    if (tokenError || !access_token) {
      console.error("Error retrieving Plaid token from Vault:", tokenError);
      return res.status(404).json({ error: "Access token not found" });
    }
    let storedData = {};

    // 2. Fetch and store ACCOUNTS
    // Use accountsBalanceGet for real-time balances (avoids stale cache from accountsGet).
    // Fall back to accountsGet if Balance product fails (e.g. unsupported item).
    let accounts = [];
    try {
      console.log("📊 Fetching accounts (real-time balances)...");
      try {
        const balanceResponse = await client.accountsBalanceGet({
          access_token,
        });
        accounts = balanceResponse.data?.accounts || [];
        console.log(
          `✅ accountsBalanceGet: real-time balances for ${accounts.length} accounts`
        );
      } catch (balanceErr) {
        const code = balanceErr?.response?.data?.error_code;
        console.warn(
          `⚠️ accountsBalanceGet failed (${code || balanceErr.message}), falling back to accountsGet:`,
          balanceErr.message
        );
        const accountsResponse = await client.accountsGet({ access_token });
        accounts = accountsResponse.data?.accounts || [];
        console.log(
          `✅ accountsGet fallback: cached balances for ${accounts.length} accounts`
        );
      }

      if (accounts.length > 0) {
        const accountsToStore = accounts.map((account) => {
          const current = account.balances?.current;
          const available = account.balances?.available;
          // Log for balance debugging (Plaid vs our stored values)
          console.log(
            `[BALANCE_DEBUG] Plaid raw: account_id=${account.account_id} type=${account.type} current=${current} available=${available}`
          );
          return {
            account_id: account.account_id,
            item_id: item_id,
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            official_name: account.official_name,
            current_balance: current,
            available_balance: available,
            last_balance_sync_at: new Date().toISOString(),
            balance_source: "plaid",
          };
        });

        const { error: accountsError } = await supabase
          .from("accounts")
          .upsert(accountsToStore, {
            onConflict: "account_id",
            ignoreDuplicates: false,
          });

        if (accountsError) throw accountsError;
        console.log(`✅ Stored ${accounts.length} accounts`);

        const anchorTimestamp = new Date().toISOString();
        const anchorRows = accounts.map((account) => ({
          user_id: userId,
          item_id: item_id,
          account_id: account.account_id,
          account_type: account.type || null,
          account_subtype: account.subtype || null,
          anchor_current: account.balances?.current ?? null,
          anchor_available: account.balances?.available ?? null,
          anchor_limit: account.balances?.limit ?? null,
          anchored_at: anchorTimestamp,
          anchor_source: "plaid_connect",
        }));
        const { error: anchorErr } = await supabase
          .from("account_balance_anchors")
          .insert(anchorRows);
        if (anchorErr) {
          console.error("⚠️ Failed to write balance anchors:", anchorErr.message);
        }

        storedData.accounts = accounts.length;
      }
    } catch (error) {
      console.error("⚠️ Accounts fetch failed:", error.message);
      storedData.accounts = 0;
    }

    // 3. Fetch and store INSTITUTION data
    try {
      console.log("🏢 Fetching institution...");
      const itemResponse = await client.itemGet({ access_token });
      const institutionId = itemResponse.data.item.institution_id;
      const institutionResponse = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: ["US"],
      });

      const institution = institutionResponse.data.institution;

      // Update the user_items table with institution info
      await supabase
        .from("user_items")
        .update({
          institution_id: institution.institution_id,
          institution_name: institution.name,
        })
        .eq("item_id", item_id);

      console.log(`✅ Updated institution: ${institution.name}`);
      storedData.institution = institution.name;
    } catch (error) {
      console.error("⚠️ Institution fetch failed:", error.message);
      storedData.institution = "Unknown";
    }

    // 4. Fetch and Store INVESTMENTS (optional - may not exist for all accounts)
    try {
      console.log("📈 Fetching investments...");
      
      // Retry Plaid API calls with exponential backoff
      const holdingsResponse = await retryPlaidOperation(
        () => client.investmentsHoldingsGet({ access_token }),
        "investmentsHoldingsGet",
        item_id
      );
      
      const transactionsResponse = await retryPlaidOperation(
        () => client.investmentsTransactionsGet({
          access_token,
          start_date: "2020-01-01",
          end_date: new Date().toISOString().split("T")[0],
        }),
        "investmentsTransactionsGet",
        item_id
      );

      const holdings = holdingsResponse.data.holdings || [];
      const securities = holdingsResponse.data.securities || [];
      const accounts = holdingsResponse.data.accounts || [];

      // Create a map of security_id -> security for quick lookup
      const securitiesMap = new Map();
      securities.forEach((security) => {
        securitiesMap.set(security.security_id, security);
      });

      // Create a map of account_id -> account for quick lookup
      const accountsMap = new Map();
      accounts.forEach((account) => {
        accountsMap.set(account.account_id, account);
      });

      if (holdings.length > 0) {
        console.log(
          `📊 Processing ${holdings.length} Plaid investment holdings...`
        );

        // Get existing holdings to calculate day_change
        const { data: existingHoldings } = await supabase
          .from("investment_holdings")
          .select("security_id, previous_market_value, market_value, plaid_account_id")
          .eq("user_id", userId)
          .eq("item_id", item_id)
          .eq("provider", "plaid")
          .eq("is_active", true);

        // Process holdings and prepare for upsert
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
            const currentPrice = holding.institution_price || security.close_price || 0;
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
              user_id: userId,
              provider: "plaid",
              item_id: item_id,
              plaid_account_id: holding.account_id,
              security_id: holding.security_id,
              symbol: security.ticker_symbol || security.name || null,
              description: security.name || null,
              currency_code: holding.iso_currency_code || security.iso_currency_code || "USD",
              exchange_code: security.market_identifier_code || null,
              exchange_name: null, // Plaid doesn't provide exchange name directly
              security_type: security.type || null,
              sector: security.sector || null,
              industry: security.industry || null,
              units: quantity,
              price: currentPrice,
              market_value: currentMarketValue,
              previous_market_value: currentMarketValue, // Set for next sync
              average_purchase_price: costBasis > 0 && quantity > 0 ? costBasis / quantity : null,
              total_cost_basis: costBasis,
              unrealized_pl: unrealizedPL,
              day_change: dayChange,
              day_change_percent: dayChangePercent,
              total_percent_change: totalPercentChange,
              is_active: true,
              last_updated: new Date().toISOString(),
              // SnapTrade fields (null for Plaid)
              snaptrade_user_id: null,
              account_id: holding.account_id, // Use plaid_account_id value for account_id (required field)
              symbol_id: null, // SnapTrade symbol_id
            };
          })
          .filter((h) => h !== null); // Remove null entries

        if (holdingsRows.length > 0) {
          // Upsert holdings (using the unique index columns) with fallback
          let holdingsError = null;
          
          try {
            const { error: upsertError } = await supabase
              .from("investment_holdings")
              .upsert(holdingsRows, {
                onConflict: "user_id,item_id,plaid_account_id,security_id",
                ignoreDuplicates: false,
              });

            if (upsertError) {
              holdingsError = upsertError;
              console.error("❌ Error upserting Plaid holdings (batch):", upsertError);
              
              // Fallback: Try individual upserts
              console.log("🔄 Attempting individual holdings upserts...");
              let successCount = 0;
              let failCount = 0;
              
              for (const holding of holdingsRows) {
                try {
                  const { error: individualError } = await supabase
                    .from("investment_holdings")
                    .upsert(holding, {
                      onConflict: "user_id,item_id,plaid_account_id,security_id",
                      ignoreDuplicates: false,
                    });
                  
                  if (individualError) {
                    console.error(`❌ Failed to upsert holding ${holding.symbol || holding.security_id}:`, individualError);
                    failCount++;
                  } else {
                    successCount++;
                  }
                } catch (err) {
                  console.error(`❌ Exception upserting holding ${holding.symbol || holding.security_id}:`, err);
                  failCount++;
                }
              }
              
              if (failCount > 0) {
                console.warn(`⚠️ ${failCount} holdings failed to upsert, ${successCount} succeeded`);
              } else {
                console.log(`✅ All ${successCount} holdings upserted individually`);
              }
            } else {
              console.log(
                `✅ Stored ${holdingsRows.length} Plaid investment holdings`
              );
            }
          } catch (err) {
            console.error("❌ Exception during holdings upsert:", err);
            holdingsError = err;
          }
          
          if (holdingsError && holdingsRows.length > 0) {
            // Log but don't throw - we want to continue with balance updates
            console.error("❌ Some holdings failed to upsert, but continuing with balance updates");
          }

          // Mark holdings as inactive if they're no longer in the Plaid response
          // Wait a moment for upsert to fully commit
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
              // Get all currently active holdings from database for this item
              const { data: allActiveHoldings, error: fetchError } =
                await supabase
                  .from("investment_holdings")
                  .select("security_id, plaid_account_id")
                  .eq("user_id", userId)
                  .eq("item_id", item_id)
                  .eq("provider", "plaid")
                  .eq("is_active", true);

              if (!fetchError && allActiveHoldings && allActiveHoldings.length > 0) {
                // Find holdings that are in DB but NOT in API response (sold/removed)
                const removedHoldings = allActiveHoldings.filter((h) => {
                  if (!h.security_id || !h.plaid_account_id) return false;
                  // Check if holding exists in API by security_id AND account_id
                  const exists =
                    activeSecurityIds.has(h.security_id) &&
                    activeAccountIds.has(h.plaid_account_id);
                  return !exists;
                });

                if (removedHoldings.length > 0) {
                  console.log(
                    `🔴 Found ${removedHoldings.length} removed holdings to deactivate`
                  );

                  const removedSecurityIds = removedHoldings
                    .map((h) => h.security_id)
                    .filter((id) => id);
                  const removedAccountIds = removedHoldings
                    .map((h) => h.plaid_account_id)
                    .filter((id) => id);

                  // Mark as inactive
                  const { error: deactivateError } = await supabase
                    .from("investment_holdings")
                    .update({
                      is_active: false,
                      last_updated: new Date().toISOString(),
                    })
                    .eq("user_id", userId)
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
          }

          // Process account balances
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
              .eq("user_id", userId)
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
              user_id: userId,
              provider: "plaid",
              item_id: item_id,
              plaid_account_id: account.account_id,
              currency_code: account.balances?.iso_currency_code || "USD",
              cash: cashBalance,
              buying_power: 0, // Plaid doesn't provide buying_power
              total_value: totalValue,
              previous_total_value: totalValue, // Set for next sync
              day_change: dayChange,
              day_change_percent: dayChangePercent,
              total_change: null, // Will be calculated from holdings
              total_change_percent: null, // Will be calculated from holdings
              is_current: true,
              last_updated: new Date().toISOString(),
              // SnapTrade fields (null for Plaid)
              snaptrade_user_id: null,
              account_id: account.account_id, // Use plaid_account_id value for account_id (required field)
            };
          })
        );

        if (balanceRows.length > 0) {
          // Backup current balances before update (for rollback)
          const { data: previousBalances } = await supabase
            .from("investment_balances")
            .select("*")
            .eq("user_id", userId)
            .eq("item_id", item_id)
            .eq("provider", "plaid")
            .eq("is_current", true);

          // Mark previous balances as not current (with error handling)
          const { error: markError } = await supabase
            .from("investment_balances")
            .update({ is_current: false })
            .eq("user_id", userId)
            .eq("item_id", item_id)
            .eq("provider", "plaid");

          if (markError) {
            console.error("❌ Error marking previous balances as not current:", markError);
            // Don't proceed with upsert if marking failed (data integrity)
            throw new Error(`Failed to mark previous balances: ${markError.message}`);
          }

          // Upsert balances (using the unique index columns)
          const { error: balancesError } = await supabase
            .from("investment_balances")
            .upsert(balanceRows, {
              onConflict: "user_id,item_id,plaid_account_id,currency_code",
              ignoreDuplicates: false,
            });

          if (balancesError) {
            console.error("❌ Error upserting Plaid balances:", balancesError);
            
            // Rollback: Restore previous balances as current
            if (previousBalances && previousBalances.length > 0) {
              console.log("🔄 Rolling back balance updates...");
              const rollbackData = previousBalances.map(b => ({
                ...b,
                is_current: true,
              }));
              
              const { error: rollbackError } = await supabase
                .from("investment_balances")
                .upsert(rollbackData, {
                  onConflict: "user_id,item_id,plaid_account_id,currency_code",
                });
              
              if (rollbackError) {
                console.error("❌ Critical: Failed to rollback balances:", rollbackError);
              } else {
                console.log("✅ Successfully rolled back balance updates");
              }
            }
            
            throw balancesError;
          } else {
            console.log(
              `✅ Stored ${balanceRows.length} Plaid investment account balances`
            );
            // Update accounts table so UI shows total_value (not cash-only) for Plaid investment accounts.
            // Use available_balance=0 so getAccountBalanceForTotal (current+available) = total_value, not total_value+cash.
            for (const row of balanceRows) {
              const { error: updateErr } = await supabase
                .from("accounts")
                .update({
                  current_balance: row.total_value,
                  available_balance: 0,
                  last_balance_sync_at: new Date().toISOString(),
                  balance_source: "plaid",
                })
                .eq("account_id", row.plaid_account_id)
                .eq("item_id", item_id);
              if (updateErr) {
                console.error(
                  `⚠️ Failed to update accounts table for Plaid investment ${row.plaid_account_id}:`,
                  updateErr.message
                );
              } else {
                console.log(
                  `[BALANCE_DEBUG] Updated accounts.current_balance=${row.total_value} (total_value) for Plaid investment ${row.plaid_account_id}`
                );
              }
            }
          }
        }
      }

      storedData.investments = {
        holdings: holdings.length,
        securities: securities.length,
        transactions: transactionsResponse.data.investment_transactions.length,
        stored: holdings.length > 0,
      };
      console.log(
        `✅ Found ${holdings.length} investment holdings (${holdings.length > 0 ? "stored" : "none to store"})`
      );
    } catch (error) {
      console.log("ℹ️ No investments found (this is normal for most accounts)");
      if (error.response?.data) {
        console.error("Plaid investments error:", error.response.data);
      }
      storedData.investments = { holdings: 0, securities: 0, transactions: 0, stored: false };
    }

    // 5. Fetch LIABILITIES (optional - credit cards, loans)
    try {
      console.log("💳 Fetching liabilities...");
      const liabilitiesResponse = await client.liabilitiesGet({ access_token });
      const liabilityCount = liabilitiesResponse.data.liabilities?.length || 0;
      storedData.liabilities = liabilityCount;
      console.log(`✅ Found ${liabilityCount} liabilities`);
    } catch (error) {
      console.log(
        "ℹ️ No liabilities found (this is normal for depository accounts)"
      );
      storedData.liabilities = 0;
    }

    // 6. Fetch IDENTITY (optional - account holder info)
    try {
      console.log("🆔 Fetching identity...");
      const identityResponse = await client.identityGet({ access_token });
      storedData.identity = identityResponse.data.accounts.length;
      console.log(
        `✅ Found identity for ${identityResponse.data.accounts.length} accounts`
      );
    } catch (error) {
      console.log("ℹ️ Identity not available (this is normal)");
      storedData.identity = 0;
    }

    console.log("🎉 Financial data storage complete:", storedData);

    return res.status(200).json({
      message: "Financial data stored successfully",
      stored: storedData,
      item_id: item_id,
    });
  } catch (error) {
    console.error("❌ store_accounts error:", error);
    const plaidError = error.response?.data;

    return res.status(500).json({
      error: plaidError?.error_message || error.message,
      details: plaidError || error,
    });
  }
}

// === SnapTrade Investment Account Population Handler ===
async function handleInvestmentAccountPopulation(req, res, user_id) {
  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  try {
    console.log("🔄 Populating investment accounts for user:", user_id);

    // Get all SnapTrade connections for this user
    const { data: connections, error: connError } = await supabase
      .from("snaptrade_connections")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (connError) throw connError;

    if (!connections || connections.length === 0) {
      return res.status(200).json({
        success: true,
        populated: 0,
        message: "No SnapTrade connections found",
      });
    }

    // Get current holdings and balances
    const { data: holdings, error: holdingsError } = await supabase
      .from("investment_holdings")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (holdingsError) throw holdingsError;

    const { data: balances, error: balancesError } = await supabase
      .from("investment_balances")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_current", true);

    if (balancesError) throw balancesError;

    let populatedCount = 0;

    for (const connection of connections) {
      try {
        // Use total_value from investment_balances as single source of truth
        // This is already calculated from active holdings + options + cash
        const balanceRecord = balances.find(
          (b) => b.account_id === connection.account_id
        );

        // Use total_value from investment_balances if available, otherwise calculate from holdings
        let totalValue = 0;
        if (
          balanceRecord &&
          balanceRecord.total_value !== null &&
          balanceRecord.total_value !== undefined
        ) {
          totalValue = balanceRecord.total_value;
          console.log(
            `✅ Using total_value from investment_balances: $${totalValue} for account ${connection.account_id}`
          );
        } else {
          // Fallback: Calculate from active holdings only
          const accountHoldings = holdings.filter(
            (h) =>
              h.account_id === connection.account_id && h.is_active === true
          );
          const totalHoldingsValue = accountHoldings.reduce(
            (sum, holding) => sum + (holding.market_value || 0),
            0
          );

          // Get cash balance
          const cashAmount = balanceRecord?.cash || 0;
          totalValue = totalHoldingsValue + cashAmount;
          console.log(
            `⚠️ Fallback: Calculated total_value from holdings: $${totalValue} (balance record not found or missing total_value)`
          );
        }

        // Get cash balance for available_balance field
        const cashAmount = balanceRecord?.cash || 0;

        // Create a unique item_id for SnapTrade accounts
        const investmentItemId = `snaptrade-${connection.account_id}`;

        // First, check if this investment account already exists
        const { data: existingAccount, error: checkError } = await supabase
          .from("accounts")
          .select("account_id")
          .eq("account_id", connection.account_id)
          .single();

        if (existingAccount) {
          console.log(
            `ℹ️ Investment account ${connection.account_id} already exists, updating balance...`
          );

          // Update the existing account with new balance
          const { error: updateError } = await supabase
            .from("accounts")
            .update({
              current_balance: totalValue,
              available_balance: cashAmount,
            })
            .eq("account_id", connection.account_id);

          if (updateError) {
            console.error(
              `❌ Failed to update investment account ${connection.account_id}:`,
              updateError
            );
          } else {
            console.log(
              `✅ Updated investment account ${
                connection.account_id
              } with balance: $${totalValue.toFixed(2)}`
            );
            populatedCount++;
          }
        } else {
          // Ensure a matching user_items row exists for the synthetic SnapTrade item_id
          const brokerageSlug = (
            connection.brokerage_name || "Investment Broker"
          )
            .toLowerCase()
            .replace(/\s+/g, "-");

          const { error: upsertItemError } = await supabase
            .from("user_items")
            .upsert(
              {
                user_id: user_id,
                item_id: investmentItemId,
                institution_name:
                  connection.brokerage_name || "Investment Broker",
                institution_id: `snaptrade-${brokerageSlug}`,
                has_new_accounts: false,
                requires_update_mode: false,
                last_synced_at:
                  connection.last_synced_at || new Date().toISOString(),
              },
              { onConflict: "item_id" }
            );

          if (upsertItemError) {
            console.error(
              `❌ Failed to ensure user_items entry for investment account:`,
              upsertItemError
            );
            continue; // Skip creating the account if user_items upsert fails
          } else {
            console.log(
              `✅ Ensured user_items entry exists for investment account item_id ${investmentItemId}`
            );
          }

          // Now create the investment account entry
          const investmentAccount = {
            account_id: connection.account_id,
            item_id: investmentItemId,
            name: connection.account_name || "Investment Account",
            mask: null,
            type: "investment",
            subtype: "investment",
            official_name: `${
              connection.brokerage_name || "Investment"
            } Account`,
            current_balance: totalValue,
            available_balance: cashAmount,
          };

          const { error: insertError } = await supabase
            .from("accounts")
            .insert(investmentAccount);

          if (insertError) {
            console.error(
              `❌ Failed to insert investment account ${connection.account_id}:`,
              insertError
            );
          } else {
            console.log(
              `✅ Created investment account ${
                connection.account_id
              } with balance: $${totalValue.toFixed(2)}`
            );
            populatedCount++;
          }
        }
      } catch (accountError) {
        console.error(
          `❌ Error processing investment account ${connection.account_id}:`,
          accountError
        );
      }
    }

    console.log(
      `✅ Investment accounts population completed: ${populatedCount} accounts processed`
    );
    return res.status(200).json({
      success: true,
      populated: populatedCount,
      message: `Successfully populated ${populatedCount} investment accounts`,
    });
  } catch (error) {
    console.error("❌ Failed to populate investment accounts:", error);
    return res.status(500).json({
      error: "Failed to populate investment accounts",
      details: error.message,
    });
  }
}

// === Financial Summary Handler ===
async function handleFinancialSummary(req, res, user_id) {
  if (!user_id) {
    return res.status(400).json({ error: "user_id required" });
  }

  try {
    console.log("📊 Generating financial summary for user:", user_id);

    // Get net worth from RPC
    const { data: netWorthData, error: nwErr } = await supabase.rpc(
      "get_net_worth",
      { p_user_id: user_id }
    );

    if (nwErr) {
      console.error("Error fetching net worth:", nwErr);
      return res.status(500).json({ error: nwErr.message });
    }

    // Get investments snapshot from RPC
    const { data: invSnap, error: invErr } = await supabase.rpc(
      "get_investment_snapshot",
      { p_user_id: user_id }
    );

    if (invErr) {
      console.error("Error fetching investments snapshot:", invErr);
      return res.status(500).json({ error: invErr.message });
    }

    // Get recent transactions (last 50 for better context)
    const { data: recentTxns, error: txnErr } = await supabase.rpc(
      "get_recent_transactions",
      { p_user_id: user_id, p_limit: 50 }
    );

    if (txnErr) {
      console.error("Error fetching recent transactions:", txnErr);
    }

    // Get spend by category for last 30 days (more dynamic than current month)
    const currentDate = new Date();
    const thirtyDaysAgo = new Date(currentDate);
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    const { data: spendByCategory, error: catErr } = await supabase.rpc(
      "get_spend_by_category",
      {
        p_user_id: user_id,
        p_start: thirtyDaysAgo.toISOString().split("T")[0],
        p_end: currentDate.toISOString().split("T")[0],
      }
    );

    if (catErr) {
      console.error("Error fetching spend by category:", catErr);
    }

    // Get cashflow for last 3 months
    const { data: cashflow, error: cfErr } = await supabase.rpc(
      "get_cashflow_monthly",
      { p_user_id: user_id, p_months: 3 }
    );

    if (cfErr) {
      console.error("Error fetching cashflow:", cfErr);
    }

    // Get active recurring streams
    const { data: recurringStreams, error: rsErr } = await supabase.rpc(
      "get_recurring_streams_active",
      { p_user_id: user_id }
    );

    if (rsErr) {
      console.error("Error fetching recurring streams:", rsErr);
    }

    // Get upcoming bills (recurring next dates)
    const { data: upcomingBills, error: billsErr } = await supabase.rpc(
      "get_recurring_next_dates",
      { p_user_id: user_id }
    );

    if (billsErr) {
      console.error("Error fetching upcoming bills:", billsErr);
    }

    // Get goals overview
    const { data: goalsOverview, error: goalsErr } = await supabase.rpc(
      "get_goals_overview",
      { p_user_id: user_id, p_limit: 5 }
    );

    if (goalsErr) {
      console.error("Error fetching goals overview:", goalsErr);
    }

    // Get detailed investment holdings
    const { data: investmentHoldings, error: holdingsErr } = await supabase.rpc(
      "get_investment_holdings_detailed",
      { p_user_id: user_id }
    );

    if (holdingsErr) {
      console.error("Error fetching investment holdings:", holdingsErr);
    }

    // Debug logging with proper serialization
    console.log("Net worth data:", JSON.stringify(netWorthData, null, 2));
    console.log("Investment snapshot data:", JSON.stringify(invSnap, null, 2));
    console.log("Recent transactions:", recentTxns?.length || 0);
    console.log("Spend by category:", spendByCategory?.length || 0);
    console.log("Cashflow months:", cashflow?.length || 0);
    console.log("Active recurring streams:", recurringStreams?.length || 0);
    console.log("Upcoming bills:", upcomingBills?.length || 0);
    console.log("Goals:", goalsOverview?.length || 0);
    console.log("Investment holdings:", investmentHoldings?.length || 0);

    // Log any missing data for debugging
    if (!netWorthData || netWorthData.length === 0) {
      console.warn("⚠️ No net worth data found for user:", user_id);
    }
    if (!recentTxns || recentTxns.length === 0) {
      console.warn("⚠️ No recent transactions found for user:", user_id);
    }
    if (!spendByCategory || spendByCategory.length === 0) {
      console.warn("⚠️ No spending category data found for user:", user_id);
    }

    // Return complete RPC data for Finny to use
    const netWorthRecord = netWorthData?.[0];
    const investmentRecord = invSnap?.[0];

    const summary = {
      summary: {
        netWorth: Math.round(Number(netWorthRecord?.net_worth ?? 0)),
        liquidAssets: Math.round(Number(netWorthRecord?.liquid_assets ?? 0)),
        investmentsTotal: Math.round(
          Number(netWorthRecord?.investments_total ?? 0)
        ),
        totalLiabilities: Math.round(
          Number(netWorthRecord?.total_liabilities ?? 0)
        ),
        investmentCash: Math.round(
          Number(investmentRecord?.investment_cash ?? 0)
        ),
      },
      bankAccounts: netWorthRecord?.bank_accounts || [],
      transactions: {
        recent: recentTxns || [],
        spendByCategory: spendByCategory || [],
        cashflow: cashflow || [],
      },
      recurring: {
        active: recurringStreams || [],
        upcoming: upcomingBills || [],
      },
      goals: goalsOverview || [],
      holdings: investmentHoldings || [],
      meta: {
        investmentsAsOf: investmentRecord?.as_of ?? null,
        rawNetWorthData: netWorthRecord,
        rawInvestmentData: investmentRecord,
      },
    };

    console.log("✅ Financial summary generated successfully");
    return res.status(200).json(summary);
  } catch (error) {
    console.error("❌ Failed to generate financial summary:", error);
    return res.status(500).json({
      error: "Failed to generate financial summary",
      details: error.message,
    });
  }
}

// === Cache Clearing Handler ===
async function handleClearCache(req, res, user_id) {
  if (!user_id) {
    return res.status(400).json({ error: "user_id required" });
  }

  try {
    console.log("🗑️ Clearing cache for user:", user_id);

    // Clear user-specific cache entries
    const { error: cacheError } = await supabase
      .from("web_scrape_cache")
      .delete()
      .eq("user_specific", true)
      .like("cache_key", `%_${user_id}`);

    if (cacheError) {
      console.error("Error clearing cache:", cacheError);
      return res.status(500).json({
        error: "Failed to clear cache",
        details: cacheError.message,
      });
    }

    console.log("✅ Cache cleared successfully for user:", user_id);
    return res.status(200).json({
      success: true,
      message: "Cache cleared successfully",
      user_id: user_id,
    });
  } catch (error) {
    console.error("❌ Failed to clear cache:", error);
    return res.status(500).json({
      error: "Failed to clear cache",
      details: error.message,
    });
  }
}

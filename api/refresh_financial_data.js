// /api/refresh_financial_data.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Helper function to get category from stream type
 */
function getCategoryFromStreamType(streamType) {
  const mapping = {
    subscription: "Subscriptions",
    income: "Income",
    bill: "Housing",
    other: "Other",
  };
  return mapping[streamType] || null;
}

/**
 * Backfill transactions with recurring stream links and categories
 * This runs after recurring streams are stored to link existing transactions
 */
async function backfillRecurringCategories(userId, recurringRows) {
  console.log(
    `📦 Backfilling recurring categories for ${recurringRows.length} streams...`
  );

  try {
    // Build a map of transaction_id -> stream data
    const transactionToStreamMap = new Map();

    recurringRows.forEach((stream) => {
      if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
        stream.transaction_ids.forEach((txId) => {
          transactionToStreamMap.set(txId, {
            streamId: stream.stream_id,
            streamType: stream.stream_type,
          });
        });
      }
    });

    const transactionIds = Array.from(transactionToStreamMap.keys());
    if (transactionIds.length === 0) {
      console.log("No transactions to backfill");
      return { updated: 0 };
    }

    console.log(
      `Found ${transactionIds.length} transactions to potentially update`
    );

    // Fetch these transactions from database
    const { data: transactions, error: fetchErr } = await supabase
      .from("transactions")
      .select(
        "id, plaid_transaction_id, recurring_stream_id, new_category, if_recurring"
      )
      .eq("user_id", userId)
      .in("plaid_transaction_id", transactionIds);

    if (fetchErr) {
      throw new Error(`Failed to fetch transactions: ${fetchErr.message}`);
    }

    if (!transactions || transactions.length === 0) {
      console.log("No matching transactions found in database");
      return { updated: 0 };
    }

    // Prepare updates
    const updates = [];

    transactions.forEach((tx) => {
      const streamData = transactionToStreamMap.get(tx.plaid_transaction_id);
      if (!streamData) return;

      const update = { id: tx.id, user_id: userId };
      let hasChanges = false;

      // Link to stream if not already linked
      if (!tx.recurring_stream_id) {
        update.recurring_stream_id = streamData.streamId;
        hasChanges = true;
      }

      // Set if_recurring flag
      // Note: If a transaction is part of a recurring stream, it IS recurring by definition.
      // We set it to "yes" regardless of previous value because stream membership is a fact.
      // If a user explicitly unmarked it as recurring, they would need to remove it from the stream.
      // This is intentional behavior - stream membership implies recurring status.
      if (tx.if_recurring !== "yes") {
        update.if_recurring = "yes";
        hasChanges = true;
      }

      // Set category ONLY if new_category is NULL (respect user overrides)
      if (!tx.new_category) {
        const categoryToSet = getCategoryFromStreamType(streamData.streamType);
        if (categoryToSet && streamData.streamType !== "other") {
          update.new_category = categoryToSet;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        updates.push(update);
      }
    });

    if (updates.length === 0) {
      console.log("No updates needed");
      return { updated: 0 };
    }

    console.log(`Applying ${updates.length} updates...`);

    // Apply updates in batch
    const { error: updateErr } = await supabase
      .from("transactions")
      .upsert(updates, { onConflict: "id", ignoreDuplicates: false });

    if (updateErr) {
      throw new Error(`Failed to update transactions: ${updateErr.message}`);
    }

    console.log(`✅ Successfully updated ${updates.length} transactions`);
    return { updated: updates.length };
  } catch (error) {
    console.error("Backfill error:", error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const {
    item_id,
    user_id,
    refresh_type = "both",
    include_recurring = false,
  } = req.body;

  if (!item_id) return res.status(400).json({ error: "Missing item_id" });

  // Validate refresh_type
  const validRefreshTypes = ["balances", "transactions", "both", "recurring"];
  if (!validRefreshTypes.includes(refresh_type)) {
    return res.status(400).json({
      error:
        "Invalid refresh_type. Must be 'balances', 'transactions', 'both', or 'recurring'",
    });
  }

  try {
    console.log(`🔄 Starting ${refresh_type} refresh for item_id: ${item_id}`);

    // 1) Look up user_id if not provided
    let actualUserId = user_id;
    if (!actualUserId) {
      const { data: item, error: userErr } = await supabase
        .from("user_items")
        .select("user_id")
        .eq("item_id", item_id)
        .single();

      if (userErr || !item) {
        return res.status(404).json({ error: "Item not found" });
      }
      actualUserId = item.user_id;
    }

    // 2) Get access token from Vault
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: actualUserId,
      }
    );

    if (tokenErr || !access_token) {
      console.error("Vault token fetch failed:", tokenErr);
      return res.status(404).json({ error: "Access token not found" });
    }

    const results = {
      balances: null,
      transactions: null,
      recurring: null,
      errors: [],
    };

    // 3) Handle balance refresh
    if (refresh_type === "balances" || refresh_type === "both") {
      try {
        console.log("🏦 Refreshing account balances...");

        const balanceResponse = await client.accountsBalanceGet({
          access_token: access_token,
        });

        const accounts = balanceResponse.data.accounts;
        console.log(`✅ Retrieved balances for ${accounts.length} accounts`);

        if (accounts && accounts.length > 0) {
          console.log("💾 Updating account balances in database...");

          const balanceUpdates = accounts.map((account) => ({
            account_id: account.account_id,
            item_id: item_id,
            current_balance: account.balances.current,
            available_balance: account.balances.available,
          }));

          // Batch upsert balances to minimize DB round-trips
          const { error: upsertError } = await supabase
            .from("accounts")
            .upsert(balanceUpdates, { onConflict: "account_id" });

          const successful = upsertError ? 0 : balanceUpdates.length;
          const failed = upsertError ? balanceUpdates.length : 0;

          if (upsertError) {
            console.error("Failed to batch update balances:", upsertError);
          }

          console.log(
            `✅ Balance update complete: ${successful} successful, ${failed} failed`
          );

          results.balances = {
            message: "Account balances refreshed successfully",
            updated: successful,
            failed: failed,
            total: accounts.length,
            balances: balanceUpdates.map((update) => ({
              account_id: update.account_id,
              current_balance: update.current_balance,
              available_balance: update.available_balance,
            })),
          };
        } else {
          results.balances = {
            message: "No accounts found to update",
            updated: 0,
            failed: 0,
            total: 0,
            balances: [],
          };
        }
      } catch (error) {
        console.error("❌ Balance refresh failed:", error);
        results.errors.push(`Balance refresh failed: ${error.message}`);
        results.balances = {
          message: "Balance refresh failed",
          updated: 0,
          failed: 0,
          total: 0,
          balances: [],
          error: error.message,
        };
      }
    }

    // 4) Handle transaction refresh
    if (refresh_type === "transactions" || refresh_type === "both") {
      try {
        console.log("📡 Calling Plaid transactions/refresh...");

        const refreshResponse = await client.transactionsRefresh({
          access_token: access_token,
        });

        console.log("✅ Refresh request sent to Plaid:", refreshResponse.data);

        // Update the refresh timestamp in our database
        await supabase
          .from("user_items")
          .update({
            last_refresh_requested_at: new Date().toISOString(),
          })
          .eq("item_id", item_id);

        results.transactions = {
          message: "Refresh initiated successfully",
          request_id: refreshResponse.data.request_id,
          note: "New transactions will be available via webhook soon",
        };
      } catch (error) {
        console.error("❌ Transaction refresh failed:", error);
        results.errors.push(`Transaction refresh failed: ${error.message}`);
        results.transactions = {
          message: "Transaction refresh failed",
          error: error.message,
        };
      }
    }

    // 5) Handle recurring transactions refresh
    if (refresh_type === "recurring" || include_recurring) {
      try {
        console.log("🔄 Refreshing recurring transactions...");

        // Get account IDs for this item
        const { data: accounts, error: accountsError } = await supabase
          .from("accounts")
          .select("account_id")
          .eq("item_id", item_id);

        if (accountsError) {
          console.error("Error fetching accounts:", accountsError);
          throw new Error("Failed to fetch accounts");
        }

        if (!accounts || accounts.length === 0) {
          console.log(`⚠️ No accounts found for item: ${item_id}`);
          results.recurring = {
            message: "No accounts found for recurring analysis",
            summary: {
              subscriptions: 0,
              income: 0,
              bills: 0,
              other: 0,
              total: 0,
            },
            stored: 0,
            debug: {
              item_id,
              accounts_found: 0,
              reason: "No accounts in database for this item",
            },
          };
        } else {
          const accountIds = accounts.map((acc) => acc.account_id);
          console.log(
            `📡 Calling Plaid transactions/recurring/get for ${accountIds.length} accounts...`
          );

          // Call Plaid's transactions/recurring/get endpoint
          const recurringResponse = await client.transactionsRecurringGet({
            access_token: access_token,
            account_ids: accountIds,
          });

          const recurringData = recurringResponse.data;
          console.log(
            `✅ Found ${recurringData.inflow_streams?.length || 0} inflow and ${
              recurringData.outflow_streams?.length || 0
            } outflow recurring streams`
          );

          // Process and categorize recurring transactions
          const processedStreams = {
            subscriptions: [],
            income: [],
            bills: [],
            other: [],
          };

          // Process outflow streams (subscriptions, bills, etc.)
          if (recurringData.outflow_streams) {
            recurringData.outflow_streams.forEach((stream) => {
              const streamData = {
                stream_id: stream.stream_id,
                description: stream.description,
                merchant_name: stream.merchant_name,
                category: stream.category?.[0] || "Other",
                frequency: stream.frequency,
                average_amount: stream.average_amount?.amount || 0,
                last_amount: stream.last_amount?.amount || 0,
                last_date: stream.last_date,
                first_date: stream.first_date,
                is_active: stream.is_active,
                account_id: stream.account_id,
                transaction_ids: stream.transaction_ids || [],
                iso_currency_code:
                  stream.average_amount?.iso_currency_code || "USD",
              };

              // Categorize based on category and merchant
              const category = stream.category?.[0]?.toLowerCase() || "";
              const merchant = (stream.merchant_name || "").toLowerCase();

              if (
                category.includes("subscription") ||
                merchant.includes("netflix") ||
                merchant.includes("spotify") ||
                merchant.includes("apple") ||
                merchant.includes("google") ||
                merchant.includes("amazon prime") ||
                merchant.includes("hulu") ||
                merchant.includes("disney") ||
                merchant.includes("youtube") ||
                merchant.includes("adobe") ||
                merchant.includes("microsoft")
              ) {
                processedStreams.subscriptions.push(streamData);
              } else if (
                category.includes("utilities") ||
                category.includes("rent") ||
                merchant.includes("electric") ||
                merchant.includes("gas") ||
                merchant.includes("water") ||
                merchant.includes("rent") ||
                merchant.includes("mortgage") ||
                merchant.includes("insurance") ||
                merchant.includes("phone") ||
                merchant.includes("internet")
              ) {
                processedStreams.bills.push(streamData);
              } else {
                processedStreams.other.push(streamData);
              }
            });
          }

          // Process inflow streams (income, etc.)
          if (recurringData.inflow_streams) {
            recurringData.inflow_streams.forEach((stream) => {
              processedStreams.income.push({
                stream_id: stream.stream_id,
                description: stream.description,
                merchant_name: stream.merchant_name,
                category: stream.category?.[0] || "Income",
                frequency: stream.frequency,
                average_amount: stream.average_amount?.amount || 0,
                last_amount: stream.last_amount?.amount || 0,
                last_date: stream.last_date,
                first_date: stream.first_date,
                is_active: stream.is_active,
                account_id: stream.account_id,
                transaction_ids: stream.transaction_ids || [],
                iso_currency_code:
                  stream.average_amount?.iso_currency_code || "USD",
              });
            });
          }

          // Store recurring streams in database
          let storedCount = 0;
          try {
            // First, mark all existing streams for this item as inactive
            await supabase
              .from("recurring_streams")
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq("item_id", item_id);

            // Prepare data for database insertion
            const recurringRows = [
              ...processedStreams.subscriptions.map((s) => ({
                user_id: actualUserId,
                item_id,
                account_id: s.account_id,
                stream_id: s.stream_id,
                stream_type: "subscription",
                flow_type: "outflow",
                description: s.description,
                merchant_name: s.merchant_name,
                category: s.category,
                average_amount: s.average_amount,
                last_amount: s.last_amount,
                iso_currency_code: s.iso_currency_code,
                frequency: s.frequency,
                first_date: s.first_date,
                last_date: s.last_date,
                is_active: s.is_active,
                transaction_ids: s.transaction_ids,
                last_synced_at: new Date().toISOString(),
              })),
              ...processedStreams.income.map((s) => ({
                user_id: actualUserId,
                item_id,
                account_id: s.account_id,
                stream_id: s.stream_id,
                stream_type: "income",
                flow_type: "inflow",
                description: s.description,
                merchant_name: s.merchant_name,
                category: s.category,
                average_amount: s.average_amount,
                last_amount: s.last_amount,
                iso_currency_code: s.iso_currency_code,
                frequency: s.frequency,
                first_date: s.first_date,
                last_date: s.last_date,
                is_active: s.is_active,
                transaction_ids: s.transaction_ids,
                last_synced_at: new Date().toISOString(),
              })),
              ...processedStreams.bills.map((s) => ({
                user_id: actualUserId,
                item_id,
                account_id: s.account_id,
                stream_id: s.stream_id,
                stream_type: "bill",
                flow_type: "outflow",
                description: s.description,
                merchant_name: s.merchant_name,
                category: s.category,
                average_amount: s.average_amount,
                last_amount: s.last_amount,
                iso_currency_code: s.iso_currency_code,
                frequency: s.frequency,
                first_date: s.first_date,
                last_date: s.last_date,
                is_active: s.is_active,
                transaction_ids: s.transaction_ids,
                last_synced_at: new Date().toISOString(),
              })),
              ...processedStreams.other.map((s) => ({
                user_id: actualUserId,
                item_id,
                account_id: s.account_id,
                stream_id: s.stream_id,
                stream_type: "other",
                flow_type: "outflow",
                description: s.description,
                merchant_name: s.merchant_name,
                category: s.category,
                average_amount: s.average_amount,
                last_amount: s.last_amount,
                iso_currency_code: s.iso_currency_code,
                frequency: s.frequency,
                first_date: s.first_date,
                last_date: s.last_date,
                is_active: s.is_active,
                transaction_ids: s.transaction_ids,
                last_synced_at: new Date().toISOString(),
              })),
            ];

            if (recurringRows.length > 0) {
              // Upsert recurring streams (insert or update based on stream_id)
              const { data: insertedData, error: upsertErr } = await supabase
                .from("recurring_streams")
                .upsert(recurringRows, {
                  onConflict: "stream_id",
                  ignoreDuplicates: false,
                })
                .select();

              if (upsertErr) {
                console.error(
                  "❌ Failed to store recurring streams:",
                  upsertErr
                );
                throw new Error(
                  `Database storage failed: ${upsertErr.message}`
                );
              }

              storedCount = insertedData?.length || recurringRows.length;
              console.log(
                `💾 Stored ${storedCount} recurring streams in database`
              );

              // Trigger backfill to link transactions to streams and set categories
              console.log(
                "🔄 Running backfill to link transactions to streams..."
              );
              try {
                const backfillResult = await backfillRecurringCategories(
                  actualUserId,
                  recurringRows
                );
                console.log(
                  `✅ Backfill complete: ${backfillResult.updated} transactions updated`
                );
              } catch (backfillError) {
                console.error(
                  "⚠️  Backfill failed (non-fatal):",
                  backfillError.message
                );
                // Don't fail the whole operation if backfill fails
              }
            }
          } catch (storageError) {
            console.error("❌ Recurring streams storage failed:", storageError);
            throw new Error(`Storage failed: ${storageError.message}`);
          }

          results.recurring = {
            message: "Recurring transactions refreshed and stored successfully",
            summary: {
              subscriptions: processedStreams.subscriptions.length,
              income: processedStreams.income.length,
              bills: processedStreams.bills.length,
              other: processedStreams.other.length,
              total:
                processedStreams.subscriptions.length +
                processedStreams.income.length +
                processedStreams.bills.length +
                processedStreams.other.length,
            },
            stored: storedCount,
            data: processedStreams,
          };
        }
      } catch (error) {
        console.error("❌ Recurring transactions refresh failed:", error);
        results.errors.push(
          `Recurring transactions refresh failed: ${error.message}`
        );
        results.recurring = {
          message: "Recurring transactions refresh failed",
          error: error.message,
        };
      }
    }

    // 6) Return combined results
    const hasErrors = results.errors.length > 0;
    const statusCode = hasErrors ? 207 : 200; // 207 = Multi-Status (partial success)

    return res.status(statusCode).json({
      message: `Refresh completed for ${refresh_type}`,
      refresh_type,
      results,
      errors: results.errors,
      success: !hasErrors,
    });
  } catch (error) {
    console.error(`❌ ${refresh_type} refresh failed:`, error);

    // Handle specific Plaid errors
    const plaidError = error.response?.data;
    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({
        error: "Item requires re-authentication",
        requires_update_mode: true,
      });
    }

    if (plaidError?.error_code === "INSUFFICIENT_TRANSACTION_HISTORY") {
      return res.status(400).json({
        error:
          "Insufficient transaction history for recurring analysis. Need at least 180 days of data.",
      });
    }

    if (plaidError?.error_code === "RATE_LIMIT_EXCEEDED") {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again later.",
      });
    }

    return res.status(500).json({
      error: plaidError?.error_message || error.message,
    });
  }
}

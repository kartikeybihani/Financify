// /api/plaid_management.js
import { client } from "../lib/api/plaidClient.js";
import {
  supabase,
  supabaseUrl,
  supabaseServiceKey,
} from "../lib/api/supabase.js";
import { snaptrade, isSandbox } from "../lib/api/snaptrade.js";
import {
  verifyAuth,
  verifyUserAuthorization,
  verifyItemOwnership,
} from "../lib/api/auth.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";
import { runRecurringAnalysis } from "../lib/recurringAnalysis.js";

function accountsMatch(account1, account2) {
  if (!account1 || !account2) return false;

  const name1 = account1.name?.toLowerCase().trim();
  const name2 = account2.name?.toLowerCase().trim();
  const mask1 = account1.mask?.trim();
  const mask2 = account2.mask?.trim();

  if (mask1 && mask2 && mask1 === mask2) {
    return true;
  }

  if (name1 && name2 && name1 === name2) {
    if (mask1 && mask2 && mask1 !== mask2) {
      return false;
    }
    return true;
  }

  return false;
}

async function checkForDuplicateItem(user_id, metadata) {
  if (!metadata || !metadata.institution?.institution_id) {
    console.log("⚠️ No institution_id in metadata, skipping duplicate check");
    return { isDuplicate: false };
  }

  const institution_id = metadata.institution.institution_id;
  const newAccounts = metadata.accounts || [];

  const { data: existingItems, error: itemsError } = await supabase
    .from("user_items")
    .select("item_id, institution_id, institution_name")
    .eq("user_id", user_id)
    .eq("institution_id", institution_id);

  if (itemsError) {
    console.error("⚠️ Error checking for duplicate items:", itemsError);
    return { isDuplicate: false };
  }

  if (!existingItems || existingItems.length === 0) {
    return { isDuplicate: false };
  }

  const existingItemIds = existingItems.map((item) => item.item_id);
  const { data: existingAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("account_id, item_id, name, mask, type, subtype")
    .in("item_id", existingItemIds);

  if (accountsError) {
    console.error("⚠️ Error fetching existing accounts:", accountsError);
    return { isDuplicate: false };
  }

  const matchingAccounts = [];
  for (const newAccount of newAccounts) {
    for (const existingAccount of existingAccounts || []) {
      if (accountsMatch(newAccount, existingAccount)) {
        matchingAccounts.push({
          new: newAccount,
          existing: existingAccount,
        });
      }
    }
  }

  if (matchingAccounts.length > 0) {
    const institutionName =
      metadata.institution.name ||
      existingItems[0]?.institution_name ||
      "this institution";

    const duplicateAccountNames = matchingAccounts
      .map((m) => m.new.name || `Account ending in ${m.new.mask || "****"}`)
      .filter(Boolean)
      .join(", ");

    if (!duplicateAccountNames || duplicateAccountNames.trim() === "") {
      return {
        isDuplicate: true,
        institutionName,
        duplicateAccountNames: "one or more accounts",
        existingItemIds,
      };
    }

    return {
      isDuplicate: true,
      institutionName,
      duplicateAccountNames,
      existingItemIds,
    };
  }

  return { isDuplicate: false };
}

async function handleAnalyzeRecurring(req, res) {
  const { user_id, item_id, trigger_source } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  const { authorized, error: authError } = await verifyUserAuthorization(
    req,
    user_id
  );
  if (!authorized) {
    return res
      .status(authError?.includes("Unauthorized") ? 401 : 403)
      .json({ error: authError || "Access denied" });
  }

  try {
    const result = await runRecurringAnalysis(
      supabase,
      user_id,
      item_id || null,
      trigger_source || "manual"
    );

    if (result.reason === "no_transactions") {
      return res.status(200).json({
        success: true,
        reason: "no_transactions",
        message: "No transactions to analyze",
      });
    }

    return res.status(200).json({
      success: true,
      analysis_id: result.analysisId,
      upserted: result.upserted,
      summary: result.analysisJson?.summary,
    });
  } catch (err) {
    console.error("analyze-recurring error:", err);
    return res.status(500).json({
      error: err.message || "Analysis failed",
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, item_id, user_id, userId, userSecret, public_token, metadata } =
    req.body;
  const redirect_uri =
    process.env.PLAID_REDIRECT_URI ||
    "https://financify-redirect.com/oauth-complete";

  let rateLimitUserId = null;
  if (user_id) {
    try {
      const { authorized } = await verifyUserAuthorization(req, user_id);
      if (authorized) {
        rateLimitUserId = user_id;
      }
    } catch (error) {
      console.warn("⚠️ Rate limit auth pre-check failed:", error?.message);
    }
  }

  const plaidMgmtRateLimit = await checkRateLimit(req, {
    scope: `plaid_management:${mode || "default"}`,
    userId: rateLimitUserId,
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (!plaidMgmtRateLimit.allowed) {
    const retryAfter = formatRetryAfterSeconds(plaidMgmtRateLimit.retryAfterMs);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", retryAfter);
    }
    return res
      .status(429)
      .json({ error: "Too many requests. Please try again later." });
  }

  try {
    if (mode === "analyze_recurring") {
      return handleAnalyzeRecurring(req, res);
    }

    if (mode === "exchange_public_token" || public_token) {
      if (!public_token || !user_id) {
        return res
          .status(400)
          .json({ error: "Missing public_token or user_id" });
      }

      const { authorized, error: authError } = await verifyUserAuthorization(
        req,
        user_id
      );

      if (!authorized) {
        return res
          .status(authError?.includes("Unauthorized") ? 401 : 403)
          .json({
            error: authError || "Access denied",
          });
      }

      const exchangeRateLimit = await checkRateLimit(req, {
        scope: "exchange_public_token",
        userId: user_id,
        limit: 5,
        windowMs: 60 * 1000,
      });

      if (!exchangeRateLimit.allowed) {
        const retryAfter = formatRetryAfterSeconds(
          exchangeRateLimit.retryAfterMs
        );
        if (retryAfter > 0) {
          res.setHeader("Retry-After", retryAfter);
        }
        return res.status(429).json({
          error: "Too many token exchange attempts. Please wait and try again.",
          retry_after: retryAfter,
        });
      }

      if (metadata) {
        console.log("🔍 Checking for duplicate items before token exchange...");
        const duplicateCheck = await checkForDuplicateItem(user_id, metadata);

        if (duplicateCheck.isDuplicate) {
          console.log("❌ Duplicate item detected:", {
            institution: duplicateCheck.institutionName,
            accounts: duplicateCheck.duplicateAccountNames,
          });

          return res.status(409).json({
            error: "DUPLICATE_ITEM",
            message: `You've already linked ${
              duplicateCheck.institutionName
            }. The account${
              duplicateCheck.duplicateAccountNames.includes(",") ? "s" : ""
            } ${duplicateCheck.duplicateAccountNames} ${
              duplicateCheck.duplicateAccountNames.includes(",") ? "are" : "is"
            } already connected to your account.`,
            institution_name: duplicateCheck.institutionName,
            duplicate_accounts: duplicateCheck.duplicateAccountNames,
          });
        }

        console.log(
          "✅ No duplicate items found, proceeding with token exchange"
        );
      }

      const { data } = await client.itemPublicTokenExchange({ public_token });

      if (!data || !data.access_token || !data.item_id) {
        console.error(
          "❌ Invalid Plaid response: missing access_token or item_id",
          data
        );
        return res.status(500).json({
          error: "Invalid token exchange response from Plaid",
        });
      }

      const { access_token, item_id: exchangedItemId } = data;

      let institution_id = null;
      let institution_name = null;

      try {
        const itemResponse = await client.itemGet({ access_token });
        const institutionId = itemResponse.data.item.institution_id;

        const institutionResponse = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: ["US"],
        });

        institution_id = institutionId;
        institution_name = institutionResponse.data.institution.name;

        console.log("✅ Institution metadata fetched:", {
          institution_id,
          institution_name,
        });
      } catch (instError) {
        console.error(
          "⚠️ Failed to fetch institution metadata (continuing anyway):",
          instError
        );
      }

      const { error: itemError } = await supabase.from("user_items").upsert(
        {
          user_id,
          item_id: exchangedItemId,
          institution_id,
          institution_name,
          webhook: `${process.env.APP_BASE_URL}/api/webhook`,
        },
        { onConflict: "item_id" }
      );

      if (itemError) throw itemError;

      const storeTokenResponse = await fetch(
        `${supabaseUrl}/functions/v1/store-plaid-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            item_id: exchangedItemId,
            user_id,
            access_token,
          }),
        }
      );

      if (!storeTokenResponse.ok) {
        const errorText = await storeTokenResponse.text();
        console.error("Failed to store token in Vault:", errorText);
        throw new Error("Failed to store access token securely");
      }

      console.log("✅ Token stored in Vault for item_id:", exchangedItemId);
      return res.status(200).json({ item_id: exchangedItemId });
    }

    // ------------------------------
    // REMOVE ACCOUNT MODE
    // ------------------------------
    if (mode === "remove_account") {
      console.log("🔄 Removing account:", { account_id: req.body.account_id });

      const { account_id } = req.body;

      if (!account_id || !user_id) {
        console.error("❌ Missing account_id or user_id in request");
        return res.status(400).json({ error: "Missing account_id or user_id" });
      }

      // Verify user authorization
      const { authorized, error: authError } = await verifyUserAuthorization(
        req,
        user_id
      );

      if (!authorized) {
        return res
          .status(authError?.includes("Unauthorized") ? 401 : 403)
          .json({
            error: authError || "Access denied",
          });
      }

      // 1. Call RPC function to delete account and related data
      console.log("🗑️ Deleting account and related data from database...");
      const { data: deleteResult, error: deleteError } = await supabase.rpc(
        "delete_account_and_related_data",
        { p_account_id: account_id, p_user_id: user_id }
      );

      if (deleteError) {
        console.error("❌ Database deletion failed:", deleteError);
        return res.status(500).json({
          error: "Failed to delete account",
          details: deleteError.message,
        });
      }

      console.log("✅ Account deleted from database:", deleteResult);

      // 2. If this was the last account for the item, remove from Plaid and Vault
      if (deleteResult.should_delete_item) {
        const item_id = deleteResult.item_id;
        console.log(
          "🔑 Last account for item - removing from Plaid and Vault:",
          item_id
        );

        // Track cleanup operations for error reporting
        const cleanupErrors = [];

        // Get access_token from Vault
        const { data: access_token, error: tokenError } = await supabase.rpc(
          "secure_get_plaid_token",
          { p_item_id: item_id, p_user_id: user_id }
        );

        if (tokenError || !access_token) {
          console.error(
            "⚠️ Error retrieving Plaid token from Vault:",
            tokenError
          );
          cleanupErrors.push("Failed to retrieve Plaid token");
        } else {
          // Remove item from Plaid
          try {
            console.log("🏦 Removing item from Plaid...");
            await client.itemRemove({ access_token });
            console.log("✅ Successfully removed item from Plaid");
          } catch (plaidError) {
            console.error("⚠️ Plaid item removal failed:", plaidError);
            cleanupErrors.push("Failed to remove item from Plaid");
            // Continue with cleanup - Plaid removal failure doesn't block DB cleanup
          }
        }

        // Remove access token from Vault
        console.log("🔐 Removing access token from Vault...");
        const { error: vaultDeleteError } = await supabase.rpc(
          "secure_delete_plaid_token",
          { p_item_id: item_id, p_user_id: user_id }
        );

        if (vaultDeleteError) {
          console.error(
            "⚠️ Could not remove token from Vault:",
            vaultDeleteError.message
          );
          cleanupErrors.push("Failed to remove token from Vault");
        } else {
          console.log("✅ Removed access token from Vault");
        }

        // Delete from user_items
        console.log("🗑️ Removing item from user_items table...");
        const { error: itemDeleteError } = await supabase
          .from("user_items")
          .delete()
          .eq("item_id", item_id);

        if (itemDeleteError) {
          console.error("⚠️ user_items deletion failed:", itemDeleteError);
          cleanupErrors.push("Failed to remove item from user_items");
        } else {
          console.log("✅ Successfully removed item from user_items");
        }

        // Return warning if cleanup had errors (but account was still deleted)
        if (cleanupErrors.length > 0) {
          console.warn(
            `⚠️ Account deleted but cleanup had ${cleanupErrors.length} error(s):`,
            cleanupErrors
          );
          return res.status(200).json({
            success: true,
            message: "Account removed successfully",
            deleted_account: {
              name: deleteResult.deleted_account_name,
              mask: deleteResult.deleted_account_mask,
            },
            item_also_deleted: deleteResult.should_delete_item,
            remaining_accounts: deleteResult.remaining_accounts,
            warnings: cleanupErrors,
          });
        }
      }

      console.log(
        `🎉 Account ${account_id} (${deleteResult.deleted_account_name}) removed successfully`
      );

      return res.status(200).json({
        success: true,
        message: "Account removed successfully",
        deleted_account: {
          name: deleteResult.deleted_account_name,
          mask: deleteResult.deleted_account_mask,
        },
        item_also_deleted: deleteResult.should_delete_item,
        remaining_accounts: deleteResult.remaining_accounts,
      });
    }

    // ------------------------------
    // REMOVE ITEM MODE
    // ------------------------------
    if (mode === "remove_item") {
      console.log("🔄 Removing item:", { item_id });

      if (!item_id) {
        console.error("❌ Missing item_id in request");
        return res.status(400).json({ error: "Missing item_id" });
      }

      // 1. Verify user owns this item (authorization check)
      const {
        authorized,
        userId,
        error: authError,
      } = await verifyItemOwnership(req, item_id);

      if (!authorized) {
        return res
          .status(authError?.includes("Unauthorized") ? 401 : 403)
          .json({
            error: authError || "Access denied",
          });
      }

      // Get institution_name for response
      const { data: userItem, error: fetchError } = await supabase
        .from("user_items")
        .select("institution_name")
        .eq("item_id", item_id)
        .eq("user_id", userId)
        .single();

      if (fetchError || !userItem) {
        console.error("❌ Item not found in database:", fetchError?.message);
        return res.status(404).json({ error: "Item not found" });
      }

      // 2. Get access_token from Vault
      console.log("🔑 Retrieving access token from Vault...");
      const { data: access_token, error: tokenError } = await supabase.rpc(
        "secure_get_plaid_token",
        { p_item_id: item_id, p_user_id: userId }
      );

      if (tokenError || !access_token) {
        console.error(
          "❌ Error retrieving Plaid token from Vault:",
          tokenError
        );
        return res.status(404).json({ error: "Access token not found" });
      }

      // 3. Remove item from Plaid
      console.log("🏦 Removing item from Plaid...");
      await client.itemRemove({ access_token });
      console.log("✅ Successfully removed item from Plaid");

      // 4. Remove access token from Vault
      console.log("🔐 Removing access token from Vault...");
      const { error: vaultDeleteError } = await supabase.rpc(
        "secure_delete_plaid_token",
        { p_item_id: item_id, p_user_id: userId }
      );

      if (vaultDeleteError) {
        console.warn(
          "⚠️ Could not remove token from Vault:",
          vaultDeleteError.message
        );
        // Don't fail the whole operation if vault deletion fails
      } else {
        console.log("✅ Removed access token from Vault");
      }

      // 5. Delete from user_items (this will cascade delete accounts and transactions)
      console.log("🗑️ Removing item from database...");
      const { error: deleteError } = await supabase
        .from("user_items")
        .delete()
        .eq("item_id", item_id);

      if (deleteError) {
        console.error("❌ Database deletion failed:", deleteError);
        throw deleteError;
      }

      console.log("✅ Successfully removed item from database");
      console.log(
        `🎉 Item ${item_id} (${userItem.institution_name}) removed successfully`
      );

      return res.status(200).json({
        success: true,
        message: "Item removed successfully",
        removed_institution: userItem.institution_name,
      });
    }

    // ------------------------------
    // SNAPTRADE MODE (handles both register and login)
    // ------------------------------
    if (mode === "snaptrade") {
      // CRITICAL: Verify user is authenticated via JWT token
      // Note: user_id in request body is SnapTrade userId, NOT Supabase user_id
      // We verify authentication but don't compare user_id for SnapTrade operations
      const { user: authenticatedUser, error: authError } = await verifyAuth(
        req
      );

      if (authError || !authenticatedUser) {
        return res
          .status(authError?.includes("Unauthorized") ? 401 : 403)
          .json({
            error: authError || "Unauthorized: Please log in to continue",
          });
      }

      // If userId and userSecret are provided, this is a login request
      if (userId && userSecret) {
        try {
          // Verify the authenticated user owns these SnapTrade credentials
          // This prevents users from accessing other users' SnapTrade accounts
          const { data: connection, error: connError } = await supabase
            .from("snaptrade_connections")
            .select("user_id")
            .eq("snaptrade_user_id", userId)
            .eq("user_id", authenticatedUser.id)
            .single();

          // If connection exists in DB, verify ownership
          // If not in DB yet (first-time login), allow but user must be authenticated
          if (connError && connError.code !== "PGRST116") {
            // PGRST116 = no rows returned, which is OK for first-time login
            console.warn(
              "⚠️ Error checking SnapTrade connection ownership:",
              connError
            );
          }

          const { broker, reconnect } = req.body; // Get broker and reconnect parameters

          // Login the user to get redirect URI
          const loginParams = {
            userId: userId,
            userSecret: userSecret,
          };

          // Add broker parameter if provided
          if (broker) {
            loginParams.broker = broker;
          }

          // Add reconnect parameter if provided (for fixing disabled connections)
          if (reconnect) {
            loginParams.reconnect = reconnect; // This is the connection_id/authorization_id
          }

          const loginResponse =
            await snaptrade.authentication.loginSnapTradeUser(loginParams);
          console.log("✅ Snaptrade Login Response: ", loginResponse);

          return res.status(200).json({
            redirectURI: loginResponse.data.redirectURI,
            sessionId: loginResponse.data.sessionId,
            environment: isSandbox ? "sandbox" : "production",
          });
        } catch (e) {
          console.error("Snaptrade login error:", e);
          return res
            .status(500)
            .json({ error: e.message || "Snaptrade login failed" });
        }
      }

      // If only user_id is provided, this is a registration request
      // user_id here is the SnapTrade userId (e.g., "financify-{supabase_user_id}-{timestamp}-{random}")
      if (user_id) {
        try {
          // Verify the SnapTrade user_id contains the authenticated user's Supabase ID
          // This ensures users can only register SnapTrade accounts for themselves
          if (!user_id.includes(authenticatedUser.id)) {
            console.error(
              "❌ Security: SnapTrade user_id does not match authenticated user"
            );
            return res.status(403).json({
              error:
                "Forbidden: Cannot register SnapTrade account for another user",
            });
          }

          // Register the user with SnapTrade
          const registerResponse =
            await snaptrade.authentication.registerSnapTradeUser({
              userId: user_id,
            });
          console.log(
            "✅ Snaptrade Registration Response --->: ",
            registerResponse
          );

          return res.status(200).json({
            userId: registerResponse.data.userId,
            userSecret: registerResponse.data.userSecret,
            environment: isSandbox ? "sandbox" : "production",
          });
        } catch (e) {
          console.error("Snaptrade registration error:", e);
          return res
            .status(500)
            .json({ error: e.message || "Snaptrade registration failed" });
        }
      }

      // If neither condition is met, return error
      return res.status(400).json({
        error:
          "Missing required parameters. Provide either user_id for registration or userId+userSecret for login",
      });
    }

    // ------------------------------
    // SNAPTRADE ACCOUNTS MODE
    // ------------------------------
    if (mode === "snaptrade_accounts") {
      if (!userId || !userSecret) {
        return res.status(400).json({ error: "Missing userId or userSecret" });
      }

      try {
        console.log("🔄 Fetching SnapTrade accounts for user:", userId);
        const response = await snaptrade.accountInformation.listUserAccounts({
          userId: userId,
          userSecret: userSecret,
        });
        console.log("✅ Snaptrade Accounts Response: ", response);
        return res.status(200).json({
          accounts: response.data,
          environment: isSandbox ? "sandbox" : "production",
        });
      } catch (e) {
        console.error("Snaptrade accounts error:", e);
        return res
          .status(500)
          .json({ error: e.message || "Failed to fetch Snaptrade accounts" });
      }
    }

    // ------------------------------
    // SNAPTRADE HOLDINGS MODE
    // ------------------------------
    if (mode === "snaptrade_holdings") {
      const { accountId } = req.body;

      if (!userId || !userSecret || !accountId) {
        return res.status(400).json({
          error: "Missing userId, userSecret, or accountId",
        });
      }

      try {
        console.log("🔄 Fetching Snaptrade holdings for account:", accountId);

        const response = await snaptrade.accountInformation.getUserHoldings({
          accountId: accountId,
          userId: userId,
          userSecret: userSecret,
        });

        console.log("✅ Snaptrade Holdings Response:", response.data);

        return res.status(200).json({
          holdings: response.data,
          environment: isSandbox ? "sandbox" : "production",
        });
      } catch (e) {
        console.error("Snaptrade holdings error:", e);
        return res
          .status(500)
          .json({ error: e.message || "Failed to fetch Snaptrade holdings" });
      }
    }

    // ------------------------------
    // PLAID UPDATE MODE
    // ------------------------------
    if (mode === "update" && item_id) {
      // Verify user owns this item (authorization check)
      const {
        authorized,
        userId,
        error: authError,
      } = await verifyItemOwnership(req, item_id);

      if (!authorized) {
        return res
          .status(authError?.includes("Unauthorized") ? 401 : 403)
          .json({
            error: authError || "Access denied",
          });
      }

      const { data: access_token, error: tokenError } = await supabase.rpc(
        "secure_get_plaid_token",
        { p_item_id: item_id, p_user_id: userId }
      );

      if (tokenError || !access_token) {
        console.error("Error retrieving Plaid token from Vault:", tokenError);
        return res.status(404).json({ error: "Access token not found" });
      }

      const { data: tokenData } = await client.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: "Financify",
        country_codes: ["US"],
        language: "en",
        webhook: `${process.env.APP_BASE_URL}/api/webhook`,
        redirect_uri,
        access_token: access_token,
        update: { account_selection_enabled: true },
        // Request 2 years (730 days) of transaction history for updates
        // Note: This only takes effect if Transactions is being added for the first time
        transactions: {
          days_requested: 730, // 2 years of transaction history
        },
      });

      return res.status(200).json({ link_token: tokenData.link_token });
    }

    // ------------------------------
    // PLAID CREATE MODE (default)
    // ------------------------------

    // Verify user authorization for create mode
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    const {
      authorized,
      user,
      error: authError,
    } = await verifyUserAuthorization(req, user_id);

    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }

    // Base link token parameters
    const linkTokenParams = {
      user: { client_user_id: user_id },
      client_name: "Financify",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      webhook: `${process.env.APP_BASE_URL}/api/webhook`,
      redirect_uri,
    };

    // Handle institution-specific connections
    if (req.body.institution_id) {
      console.log(
        "🏦 Creating link token for specific institution:",
        req.body.institution_id
      );
    }

    // Use the same products for all institutions (original configuration)
    linkTokenParams.products = ["transactions"];
    linkTokenParams.required_if_supported_products = ["investments"];
    linkTokenParams.optional_products = ["auth", "liabilities"];
    linkTokenParams.additional_consented_products = [];

    // Request 2 years (730 days) of transaction history
    // This only takes effect when Transactions is added to an Item for the first time
    linkTokenParams.transactions = {
      days_requested: 730, // 2 years of transaction history
    };

    console.log("🔧 Using standard product configuration for all connections");
    console.log("📅 Requesting 730 days (2 years) of transaction history");

    console.log(
      "📋 Final link token parameters:",
      JSON.stringify(linkTokenParams, null, 2)
    );

    const { data: tokenData } = await client.linkTokenCreate(linkTokenParams);

    console.log("✅ Link token created successfully");
    return res.status(200).json({
      link_token: tokenData.link_token,
      institution_id: req.body.institution_id || null,
    });
  } catch (err) {
    console.error(
      "❌ Error in plaid_management API:",
      err.response?.data || err.message
    );

    // Enhanced error logging for institution-specific issues
    if (
      req.body.institution_id &&
      err.response?.data?.error_code === "INVALID_INSTITUTION_ID"
    ) {
      console.error("🔍 Institution-specific error details:", {
        institution_id: req.body.institution_id,
        error_code: err.response.data.error_code,
        error_message: err.response.data.error_message,
        suggestion:
          "Institution may not support requested products or require OAuth registration",
      });
    }

    return res.status(500).json({
      error:
        err.response?.data?.error_message ||
        err.message ||
        "Internal server error",
      details: err.response?.data || {},
    });
  }
}

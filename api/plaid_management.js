// /api/plaid_management.js
import { client } from "../app/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import { snaptrade, isSandbox } from "../lib/api/snaptrade.js";
import {
  verifyUserAuthorization,
  verifyItemOwnership,
} from "../lib/api/auth.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, item_id, user_id, userId, userSecret } = req.body;
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
      // If userId and userSecret are provided, this is a login request
      // Note: userId here is SnapTrade userId, not Supabase user_id
      // We still need to verify the Supabase user_id if provided
      if (user_id) {
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
      }

      if (userId && userSecret) {
        try {
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
      if (user_id) {
        try {
          // Register the user
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

    // Handle institution-specific connections using Institution Select shortcut
    if (req.body.institution_id) {
      console.log(
        "🏦 Creating link token for specific institution:",
        req.body.institution_id
      );

      // For US institutions, use Institution Select shortcut with routing_number
      // This will pre-select the institution in Link without requiring institution_id
      if (req.body.routing_number) {
        linkTokenParams.institution_data = {
          routing_number: req.body.routing_number,
        };
        console.log(
          "🎯 Using Institution Select shortcut with routing number:",
          req.body.routing_number
        );
      }
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

// /api/exchange_public_token.js
import { client } from "../app/plaidClient.js";
import {
  supabase,
  supabaseUrl,
  supabaseServiceKey,
} from "../lib/api/supabase.js";
import { verifyUserAuthorization } from "../lib/api/auth.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

/**
 * Check if accounts match based on name and mask
 * Returns true if accounts are duplicates
 */
function accountsMatch(account1, account2) {
  // Both must have name or mask to compare
  if (!account1 || !account2) return false;

  const name1 = account1.name?.toLowerCase().trim();
  const name2 = account2.name?.toLowerCase().trim();
  const mask1 = account1.mask?.trim();
  const mask2 = account2.mask?.trim();

  // If both have masks, compare masks (most reliable)
  if (mask1 && mask2 && mask1 === mask2) {
    return true;
  }

  // If both have names, compare names (less reliable but better than nothing)
  if (name1 && name2 && name1 === name2) {
    // If masks are available and different, don't match
    if (mask1 && mask2 && mask1 !== mask2) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Check for duplicate items before exchanging token
 * Compares institution_id and account details (name, mask)
 */
async function checkForDuplicateItem(user_id, metadata) {
  if (!metadata || !metadata.institution?.institution_id) {
    // Can't check without institution_id, allow to proceed
    console.log("⚠️ No institution_id in metadata, skipping duplicate check");
    return { isDuplicate: false };
  }

  const institution_id = metadata.institution.institution_id;
  const newAccounts = metadata.accounts || [];

  // Get all existing items for this user with the same institution_id
  const { data: existingItems, error: itemsError } = await supabase
    .from("user_items")
    .select("item_id, institution_id, institution_name")
    .eq("user_id", user_id)
    .eq("institution_id", institution_id);

  if (itemsError) {
    console.error("⚠️ Error checking for duplicate items:", itemsError);
    // Don't block on error, allow to proceed
    return { isDuplicate: false };
  }

  if (!existingItems || existingItems.length === 0) {
    // No existing items for this institution, not a duplicate
    return { isDuplicate: false };
  }

  // Get all accounts for existing items
  const existingItemIds = existingItems.map((item) => item.item_id);
  const { data: existingAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("account_id, item_id, name, mask, type, subtype")
    .in("item_id", existingItemIds);

  if (accountsError) {
    console.error("⚠️ Error fetching existing accounts:", accountsError);
    // Don't block on error, allow to proceed
    return { isDuplicate: false };
  }

  // Check if any new accounts match existing accounts
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
    // Found duplicate accounts
    const institutionName =
      metadata.institution.name ||
      existingItems[0]?.institution_name ||
      "this institution";

    const duplicateAccountNames = matchingAccounts
      .map((m) => m.new.name || `Account ending in ${m.new.mask || "****"}`)
      .filter(Boolean)
      .join(", ");

    // Edge case: if somehow no account names/masks are available
    if (!duplicateAccountNames || duplicateAccountNames.trim() === "") {
      return {
        isDuplicate: true,
        institutionName,
        duplicateAccountNames: "one or more accounts",
        existingItemIds: existingItemIds,
      };
    }

    return {
      isDuplicate: true,
      institutionName,
      duplicateAccountNames,
      existingItemIds: existingItemIds,
    };
  }

  // No duplicates found
  return { isDuplicate: false };
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { public_token, user_id, metadata } = req.body;
  if (!public_token || !user_id) {
    return res.status(400).json({ error: "Missing public_token or user_id" });
  }

  // Verify user authorization
  const { authorized, error: authError } = await verifyUserAuthorization(
    req,
    user_id
  );

  if (!authorized) {
    return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
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
    const retryAfter = formatRetryAfterSeconds(exchangeRateLimit.retryAfterMs);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", retryAfter);
    }
    return res.status(429).json({
      error: "Too many token exchange attempts. Please wait and try again.",
      retry_after: retryAfter,
    });
  }

  try {
    // Check for duplicate items BEFORE exchanging token
    // This prevents unnecessary billing and duplicate items
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

    // Exchange public token for access token
    const { data } = await client.itemPublicTokenExchange({ public_token });
    
    if (!data || !data.access_token || !data.item_id) {
      console.error("❌ Invalid Plaid response: missing access_token or item_id", data);
      return res.status(500).json({ 
        error: "Invalid token exchange response from Plaid" 
      });
    }

    const { access_token, item_id } = data;

    // Fetch institution metadata using access_token
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
      // Don't fail the whole exchange if institution fetch fails
    }

    // Store item metadata in user_items (WITHOUT access_token)
    const { error: itemError } = await supabase.from("user_items").upsert(
      {
        user_id,
        item_id,
        institution_id,
        institution_name,
        webhook: `${process.env.APP_BASE_URL}/api/webhook`,
      },
      { onConflict: "item_id" }
    );

    if (itemError) throw itemError;

    // Store access_token securely in Vault via store-plaid-token function
    const storeTokenResponse = await fetch(
      `${supabaseUrl}/functions/v1/store-plaid-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ item_id, user_id, access_token }),
      }
    );

    if (!storeTokenResponse.ok) {
      const errorText = await storeTokenResponse.text();
      console.error("Failed to store token in Vault:", errorText);
      throw new Error("Failed to store access token securely");
    }

    console.log("✅ Token stored in Vault for item_id:", item_id);

    // Do NOT return access_token to the client
    return res.status(200).json({ item_id });
  } catch (e) {
    console.error("exchange error", e.response?.data || e);
    return res
      .status(500)
      .json({ error: e.response?.data?.error_message || e.message });
  }
}

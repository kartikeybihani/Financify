/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapPlaidToAppCategory, isInternalTransfer } from "./plaidCategoryMapper.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Plaid API configuration using native fetch
// Environment detection: explicit PLAID_ENV > default to sandbox
// Note: Supabase functions don't have VERCEL_ENV, so we rely on explicit env vars
const PLAID_ENV = Deno.env.get("PLAID_ENV") || "sandbox";
const isProduction = PLAID_ENV === "production";
const PLAID_BASE_URL = isProduction
  ? "https://production.plaid.com"
  : "https://sandbox.plaid.com";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID")!;
const PLAID_SECRET = isProduction
  ? Deno.env.get("PLAID_SECRET_PROD")!
  : Deno.env.get("PLAID_SECRET_DEV")!; // Use PLAID_SECRET_DEV for sandbox

// Category mapping is now handled by plaidCategoryMapper.ts

// Helper function to call Plaid API using fetch
async function callPlaidAPI(endpoint: string, body: any) {
  const response = await fetch(`${PLAID_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Plaid API error: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}

serve(async (req: Request) => {
  try {
    console.log("🔄 Starting transaction sync...");
    
    const { item_id, user_id } = (await req.json()) as {
      item_id: string;
      user_id: string;
    };
    
    console.log("📋 Sync request:", { item_id, user_id: user_id.substring(0, 8) + "..." });
    
    if (!item_id || !user_id) {
      console.error("❌ Missing required parameters");
      return new Response("Missing item_id or user_id", { status: 400 });
    }

    // Skip SnapTrade investment accounts (they start with "snaptrade-")
    if (item_id.startsWith('snaptrade-')) {
      console.log(`🚫 Skipping SnapTrade investment account: ${item_id}`);
      return new Response(JSON.stringify({
        message: "SnapTrade account skipped",
        added: 0,
        modified: 0,
        removed: 0,
        skipped: true
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. Fetch cursor from DB
    console.log("🔍 Fetching cursor from database...");
    const { data: ui, error: fetchErr } = await supabase
      .from("user_items")
      .select("transactions_cursor")
      .eq("item_id", item_id)
      .single();

    if (fetchErr || !ui) {
      console.error("❌ Item not found:", fetchErr);
      return new Response("Item not found", { status: 404 });
    }

    console.log("📍 Current cursor:", ui.transactions_cursor || "null (first sync)");

    // 2. Get decrypted access token from Vault via RPC
    console.log("🔑 Fetching access token from Vault...");
    const { data: access_token, error: tokenErr } = await supabase.rpc("secure_get_plaid_token", {
      p_item_id: item_id, 
      p_user_id: user_id
    });

    if (tokenErr || !access_token) {
      console.error("❌ Vault token fetch failed:", tokenErr);
      return new Response("Token not found", { status: 404 });
    }

    console.log("✅ Access token retrieved from Vault");

    // 3. Pull all pages with transactionsSync using fetch
    let cursor: string | null = ui.transactions_cursor || null;
    let added: any[] = [];
    let modified: any[] = [];
    let removed: any[] = [];
    let hasMore = true;
    let pageCount = 0;

    console.log("📥 Starting transaction sync with Plaid API...");

    while (hasMore) {
      pageCount++;
      console.log(`📄 Fetching page ${pageCount}...`);
      
      const syncBody: any = {
        access_token,
        count: 500,
        options: {
          include_original_description: true,
          include_personal_finance_category: true, // Request Plaid's enhanced categories
        },
      };
      
      if (cursor) {
        syncBody.cursor = cursor;
      }

      const data = await callPlaidAPI("/transactions/sync", syncBody);
      
      console.log(`📊 Page ${pageCount} results:`, {
        added: data.added?.length || 0,
        modified: data.modified?.length || 0,
        removed: data.removed?.length || 0,
        has_more: data.has_more
      });
      
      added.push(...(data.added || []));
      modified.push(...(data.modified || []));
      removed.push(...(data.removed || []));
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    console.log(`✅ Sync complete! Total: ${added.length} added, ${modified.length} modified, ${removed.length} removed`);

    // 4. Save new cursor and last_synced_at timestamp
    console.log("💾 Updating cursor in database...");
    const { error: cursorUpdateErr } = await supabase
      .from("user_items")
      .update({ 
        transactions_cursor: cursor,
        last_synced_at: new Date().toISOString()
      })
      .eq("item_id", item_id);

    if (cursorUpdateErr) {
      console.error("❌ Failed to update cursor:", cursorUpdateErr);
      return new Response("Failed to update cursor", { status: 500 });
    }

    console.log("✅ Cursor updated successfully");

    // 4.5. Fetch user's categories to build name -> category_id map for ID-based linking
    console.log("🏷️ Fetching user categories...");
    const { data: userCategories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (categoriesError) {
      console.error("⚠️ Error fetching user categories:", categoriesError);
    }

    // Build category name -> category_id map (case-insensitive for matching)
    const categoryIdMap = new Map<string, string>();
    if (userCategories) {
      userCategories.forEach((cat: { id: string; name: string }) => {
        // Store both exact name and lowercase for flexible matching
        categoryIdMap.set(cat.name, cat.id);
        categoryIdMap.set(cat.name.toLowerCase(), cat.id);
      });
    }
    console.log(`✅ Loaded ${categoryIdMap.size / 2} categories for category_id lookup`);

    // 4.5.5. Fetch active merchant rules (category_rules) for priority matching
    console.log("📋 Fetching merchant rules...");
    const { data: merchantRules, error: rulesError } = await supabase
      .from("category_rules")
      .select("merchant_name, transaction_name, top_category_id, match_field")
      .eq("user_id", user_id)
      .eq("active", true);

    if (rulesError) {
      console.error("⚠️ Error fetching merchant rules:", rulesError);
    }

    // Special marker UUID for internal transfer rules
    const INTERNAL_TRANSFER_MARKER_UUID = "00000000-0000-0000-0000-000000000001";

    // Build merchant rules lookup map
    const merchantRulesMap = new Map<string, string>();
    const transactionNameRulesMap = new Map<string, string>();
    const merchantInternalTransferMap = new Map<string, boolean>();
    const transactionNameInternalTransferMap = new Map<string, boolean>();
    
    if (merchantRules) {
      merchantRules.forEach((rule: { merchant_name: string | null; transaction_name: string | null; top_category_id: string; match_field: string | null }) => {
        // top_category_id is actually the category_id (despite the confusing name)
        const categoryId = rule.top_category_id;
        const matchField = rule.match_field || "merchant_name";
        const isInternalTransferRule = categoryId === INTERNAL_TRANSFER_MARKER_UUID;

        if (matchField === "merchant_name" && rule.merchant_name) {
          // Normalize merchant name for matching (case-insensitive)
          const key = rule.merchant_name.toLowerCase().trim();
          if (isInternalTransferRule) {
            merchantInternalTransferMap.set(key, true);
          } else {
            merchantRulesMap.set(key, categoryId);
          }
        } else if (
          (matchField === "transaction_name" || !rule.merchant_name) &&
          rule.transaction_name
        ) {
          // Normalize transaction name for matching (case-insensitive)
          const key = rule.transaction_name.toLowerCase().trim();
          if (isInternalTransferRule) {
            transactionNameInternalTransferMap.set(key, true);
          } else {
            transactionNameRulesMap.set(key, categoryId);
          }
        }
      });
    }
    console.log(`✅ Loaded ${merchantRulesMap.size + transactionNameRulesMap.size} merchant rules`);

    // Get "Other" category ID for fallback
    const { data: otherCategory } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", user_id)
      .eq("name", "Other")
      .maybeSingle();

    const otherCategoryId = otherCategory?.id || null;

    // 4.6. Get existing recurring streams for this user to check if transactions are recurring
    console.log("🔄 Fetching recurring streams...");
    const { data: recurringStreams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select("stream_id, stream_type, transaction_ids, account_id")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .eq("user_dismissed", false);

    if (streamsError) {
      console.error("⚠️ Error fetching recurring streams:", streamsError);
    }

    // Helper function to get category from stream type
    const getCategoryFromStreamType = (streamType: string): string | null => {
      const mapping: Record<string, string> = {
        subscription: "Subscriptions",
        income: "Income",
        bill: "Housing", // TODO: Update if user wants different category
        other: "Other",
      };
      return mapping[streamType] || null;
    };

    // Create a map for quick lookup of transaction_id -> stream data
    const transactionToStreamMap = new Map<string, { streamId: string; streamType: string }>();
    if (recurringStreams) {
      recurringStreams.forEach((stream: { stream_id: string; stream_type: string; transaction_ids: string[] | null; account_id: string }) => {
        if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
          stream.transaction_ids.forEach((transactionId: string) => {
            transactionToStreamMap.set(transactionId, {
              streamId: stream.stream_id,
              streamType: stream.stream_type,
            });
          });
        }
      });
    }

    console.log(`📋 Found ${transactionToStreamMap.size} transactions in recurring streams`);

    // 4.7. Fetch existing transactions for balance delta calculations
    const deltaIds = [
      ...modified.map((t) => t.transaction_id),
      ...removed.map((t) => t.transaction_id),
    ].filter(Boolean);

    let deltaExisting: any[] = [];
    if (deltaIds.length > 0) {
      const { data: deltaTxs, error: deltaErr } = await supabase
        .from("transactions")
        .select("plaid_transaction_id, amount, account_id, pending")
        .eq("user_id", user_id)
        .in("plaid_transaction_id", deltaIds);

      if (deltaErr) {
        console.error("⚠️ Failed to fetch delta transactions:", deltaErr);
      } else {
        deltaExisting = deltaTxs || [];
      }
    }

    // --- Pending → Posted metadata merge (Plaid uses delete + add, matched via pending_transaction_id) ---
    // Fetch metadata from removed (pending) transactions BEFORE processing, so we can copy user state
    // (is_reviewed, category_id, etc.) to the new posted transaction when it arrives in added.
    const removedMetadata = new Map<string, { 
      is_reviewed: boolean; 
      category_id: string | null; 
      new_category: string | null; 
      linked_goal_id: string | null; 
      if_recurring: string | null; 
    }>();
    if (removed.length > 0) {
      const removedIds = removed.map((r) => r.transaction_id);
      const { data: removedTxs, error: removedFetchErr } = await supabase
        .from("transactions")
        .select(
          "plaid_transaction_id, is_reviewed, category_id, new_category, linked_goal_id, if_recurring, recurring_stream_id"
        )
        .eq("user_id", user_id)
        .in("plaid_transaction_id", removedIds);

      if (removedFetchErr) {
        console.error(
          "⚠️ Failed to fetch removed transactions for pending→posted merge:",
          removedFetchErr
        );
      } else if (removedTxs) {
        removedTxs.forEach((tx: { 
          plaid_transaction_id: string; 
          is_reviewed: boolean | null; 
          category_id: string | null; 
          new_category: string | null; 
          linked_goal_id: string | null; 
          if_recurring: string | null; 
          recurring_stream_id: string | null; 
        }) => {
          removedMetadata.set(tx.plaid_transaction_id, {
            is_reviewed: tx.is_reviewed ?? false,
            category_id: tx.category_id ?? null,
            new_category: tx.new_category ?? null,
            linked_goal_id: tx.linked_goal_id ?? null,
            // Only copy if_recurring when user manually set it (not from stream)
            if_recurring:
              !tx.recurring_stream_id && tx.if_recurring === "yes"
                ? "yes"
                : null,
          });
        });
        console.log(
          `📋 Fetched metadata for ${removedMetadata.size} removed transactions for pending→posted merge`
        );
      }
    }

    // 5. Upsert new and modified transactions into database
    if (added.length || modified.length) {
      console.log(`💽 Saving ${added.length + modified.length} transactions to database...`);
      
      const rows = [...added, ...modified].map((txn) => {
        // Extract Plaid categories with proper fallback hierarchy
        const primary = txn.personal_finance_category?.primary || null;
        const detailed = txn.personal_finance_category?.detailed || null;
        
        // Keep original category for reference (prefer detailed, fallback to primary)
        const category = detailed || primary || null;
        
        // Check if this is an internal transfer using both Plaid categories and transaction names/descriptions
        const detectedAsInternalTransfer = isInternalTransfer(
          primary,
          detailed,
          txn.name || null,
          txn.merchant_name || null,
          txn.original_description || null
        );
        
        // Apply comprehensive category mapping using both primary and detailed
        // (internal transfers will be detected and mapped to INTERNAL_TRANSFER)
        const mappedCategory = mapPlaidToAppCategory(primary, detailed);
        
        // Check if this transaction is part of a recurring stream
        const streamData = transactionToStreamMap.get(txn.transaction_id);
        const recurringStreamId = streamData?.streamId || null;
        
        // Check merchant rules and internal transfer rules
        const merchantName = txn.merchant_name || null;
        const transactionName = txn.name || null;
        let ruleIndicatesInternalTransfer = false;
        let categoryId: string | null = null;

        // Priority 1: Check merchant rules (highest priority for new transactions)
        // Also check for internal transfer rules (special marker UUID)
        if (!detectedAsInternalTransfer) {
          // Check merchant_name rules first
          if (merchantName) {
            const merchantKey = merchantName.toLowerCase().trim();
            // Check for internal transfer rule first
            if (merchantInternalTransferMap.get(merchantKey)) {
              ruleIndicatesInternalTransfer = true;
            } else {
              const ruleCategoryId = merchantRulesMap.get(merchantKey);
              if (ruleCategoryId) {
                categoryId = ruleCategoryId;
              }
            }
          }

          // If no merchant rule match, check transaction_name rules
          if (!categoryId && !ruleIndicatesInternalTransfer && transactionName) {
            const transactionKey = transactionName.toLowerCase().trim();
            // Check for internal transfer rule first
            if (transactionNameInternalTransferMap.get(transactionKey)) {
              ruleIndicatesInternalTransfer = true;
            } else {
              const ruleCategoryId = transactionNameRulesMap.get(transactionKey);
              if (ruleCategoryId) {
                categoryId = ruleCategoryId;
              }
            }
          }
        }

        // Set new_category and determine if internal transfer
        let newCategory: string | null = null;
        let ifRecurring: "yes" | "no" = "no"; // Default to 'no'

        // Priority 2: Internal transfers (from rules or detection) don't get category_id
        if (ruleIndicatesInternalTransfer || detectedAsInternalTransfer) {
          newCategory = "INTERNAL_TRANSFER";
          categoryId = null; // Explicitly null for internal transfers
          ifRecurring = "no"; // Internal transfers are not recurring
        } else if (streamData) {
          // Priority 3: Transaction is part of a recurring stream
          ifRecurring = "yes";

          // Set category based on stream type (will be used as new_category)
          // Note: This will only be set if the transaction doesn't already have new_category
          const categoryFromStream = getCategoryFromStreamType(streamData.streamType);
          if (categoryFromStream && streamData.streamType !== "other") {
            newCategory = categoryFromStream;
          }
        }
        
        // If category is "Subscriptions", automatically mark as recurring
        // (Subscriptions are inherently recurring, even if not in a Plaid stream)
        // But skip if it's an internal transfer
        if (!ruleIndicatesInternalTransfer && !detectedAsInternalTransfer) {
          const finalCategory = newCategory || mappedCategory.top;
          if (finalCategory === "Subscriptions") {
            ifRecurring = "yes";
          }
        }
        
        // Look up category_id from categories table if not already set by merchant rules
        // Priority: Merchant Rules (already checked) > Stream Category > Plaid Category > Fallback to "Other"
        if (!categoryId && !ruleIndicatesInternalTransfer && !detectedAsInternalTransfer) {
          // Priority 3: Stream-based category (if no merchant rule matched)
          if (newCategory && newCategory !== "INTERNAL_TRANSFER") {
            // Look up category_id for user-set category (from stream or override)
            categoryId = categoryIdMap.get(newCategory) || categoryIdMap.get(newCategory.toLowerCase()) || null;
          }
          // Priority 4: Plaid mapped category (if no merchant rule or stream match)
          else if (!newCategory && mappedCategory.top && mappedCategory.top !== "INTERNAL_TRANSFER") {
            // Look up category_id for top_category (Plaid mapped category)
            categoryId = categoryIdMap.get(mappedCategory.top) || categoryIdMap.get(mappedCategory.top.toLowerCase()) || null;
          }

          // Priority 5: Fallback to "Other" if no match found
          if (!categoryId && otherCategoryId) {
            categoryId = otherCategoryId;
          }
        }
        
        // Debug log for categories
        if (added.length <= 5) { // Only log first few to avoid spam
          const logPrefix = detectedAsInternalTransfer ? "🔄 INTERNAL TRANSFER" : "🏷️ Category Mapping";
          const streamInfo = streamData ? `🔄 RECURRING (${streamData.streamType})` : "";
          console.log(`${logPrefix}: "${txn.name}" → Plaid Primary: "${primary || "N/A"}" → Detailed: "${detailed || "N/A"}" → Mapped: "${mappedCategory.top} > ${mappedCategory.sub}" → Final: "${newCategory || mappedCategory.top}" → category_id: ${categoryId || "null"} ${streamInfo} → Recurring: "${ifRecurring}"`);
        }
        
        const row: any = {
          user_id,
          account_id: txn.account_id, // must exist in public.accounts due to FK
          plaid_transaction_id: txn.transaction_id,
          date: txn.date,
          authorized_date: txn.authorized_date || null, // When transaction was authorized (when user actually made it)
          amount: txn.amount,
          iso_currency_code: txn.iso_currency_code || null,
          name: txn.name || null,
          merchant_name: txn.merchant_name || null,
          category: category, // Keep original Plaid category (detailed or primary)
          top_category: mappedCategory.top, // Mapped top category
          sub_category: mappedCategory.sub, // Mapped sub category
          new_category: newCategory, // Only set for INTERNAL_TRANSFER or stream categories (legacy support)
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId, // Link to recurring stream if applicable
          if_recurring: ifRecurring, // Set recurring flag based on internal transfer detection and category
          category_id: categoryId, // Set category_id for ID-based linking (preferred method)
          is_reviewed: false, // Default; overwritten below when pending→posted merge applies
          linked_goal_id: null, // Default; overwritten below when pending→posted merge applies
        };

        // Pending → Posted merge: copy user metadata from removed (pending) to new posted transaction
        const pendingId = txn.pending_transaction_id ?? null;
        if (pendingId && removedMetadata.has(pendingId)) {
          const meta = removedMetadata.get(pendingId)!;
          row.is_reviewed = meta.is_reviewed;
          if (meta.category_id != null) row.category_id = meta.category_id;
          if (meta.new_category != null) row.new_category = meta.new_category;
          if (meta.linked_goal_id != null) row.linked_goal_id = meta.linked_goal_id;
          if (meta.if_recurring === "yes") row.if_recurring = "yes";
        }

        return row;
      });

      // IMPORTANT: We use a custom upsert strategy to protect user overrides
      // Strategy: For new transactions, set new_category from internal transfer detection
      //           For existing transactions, only update if new_category is NULL
      // CRITICAL: If we can't fetch existing transactions, we MUST NOT set new_category
      //           to avoid overwriting user overrides

      // CRITICAL: Validate account_ids exist before processing transactions
      const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))];
      if (accountIds.length > 0) {
        const { data: existingAccounts, error: accountsErr } = await supabase
          .from("accounts")
          .select("account_id")
          .in("account_id", accountIds);
        
        if (accountsErr) {
          console.error("❌ Failed to validate accounts:", accountsErr);
          throw new Error(`Failed to validate accounts: ${accountsErr.message}`);
        }
        
        const validAccountIds = new Set(existingAccounts?.map((a) => a.account_id) || []);
        const invalidRows = rows.filter((r) => !validAccountIds.has(r.account_id));
        
        if (invalidRows.length > 0) {
          const invalidAccountIds = [...new Set(invalidRows.map((r) => r.account_id))];
          console.warn(`⚠️ Skipping ${invalidRows.length} transactions for deleted accounts (account_ids: ${invalidAccountIds.join(", ")})`);
          // Filter out transactions with invalid account_ids instead of throwing error
          rows = rows.filter((r) => validAccountIds.has(r.account_id));
        }
      }

      // First, get existing transactions to check which ones already have new_category, category_id, if_recurring, and is_reviewed
      const plaidTxIds = rows.map((r) => r.plaid_transaction_id);
      const { data: existingTxs, error: fetchErr } = await supabase
        .from("transactions")
        .select("plaid_transaction_id, new_category, category_id, if_recurring, recurring_stream_id, amount, account_id, pending, is_reviewed")
        .eq("user_id", user_id)
        .in("plaid_transaction_id", plaidTxIds);

      // CRITICAL FIX: If fetch fails, we cannot safely set new_category or if_recurring
      // because we don't know which transactions have user overrides or manual recurring flags.
      const canSafelySetCategories =
        !fetchErr && existingTxs !== null && existingTxs !== undefined;

      if (fetchErr) {
        console.error(
          "⚠️ CRITICAL: Error fetching existing transactions to preserve user overrides:",
          fetchErr
        );
        console.error(
          "⚠️ Skipping new_category and if_recurring updates to protect user data integrity"
        );
      }

      // Create maps of existing transactions with new_category, category_id, if_recurring, and is_reviewed
      const existingCategoryMap = new Map<string, string>();
      const existingCategoryIdMap = new Map<string, string>();
      const existingRecurringMap = new Map<string, string>();
      const existingReviewedMap = new Map<string, boolean>();
      if (canSafelySetCategories) {
        existingTxs.forEach((tx: { plaid_transaction_id: string; new_category: string | null; category_id: string | null; if_recurring: string | null; recurring_stream_id: string | null; is_reviewed: boolean | null }) => {
          if (tx.new_category) {
            existingCategoryMap.set(tx.plaid_transaction_id, tx.new_category);
          }
          // Preserve existing category_id if set (user may have manually assigned)
          if (tx.category_id) {
            existingCategoryIdMap.set(tx.plaid_transaction_id, tx.category_id);
          }
          // Track if_recurring for transactions NOT in streams (user might have manually set it)
          if (!tx.recurring_stream_id && tx.if_recurring === "yes") {
            existingRecurringMap.set(tx.plaid_transaction_id, tx.if_recurring);
          }
          // Preserve existing is_reviewed status
          if (tx.is_reviewed !== null && tx.is_reviewed !== undefined) {
            existingReviewedMap.set(tx.plaid_transaction_id, tx.is_reviewed);
          }
        });
      }

      // Update rows to preserve existing new_category and if_recurring values
      const finalRows = rows.map((row) => {
        if (!canSafelySetCategories) {
          // If we can't verify existing overrides, omit user-modifiable fields
          // to avoid overwriting existing user choices
          const { new_category, if_recurring, ...rowWithoutUserFields } = row;
          return rowWithoutUserFields;
        }

        // We can safely verify - check if this is an existing transaction
        const existingTx = existingTxs.find(
          (tx: { plaid_transaction_id: string; new_category: string | null; category_id: string | null; if_recurring: string | null; recurring_stream_id: string | null }) => tx.plaid_transaction_id === row.plaid_transaction_id
        );
        const isNewTransaction = !existingTx;

        // Preserve user overrides for existing transactions
        const existingCategory = existingCategoryMap.get(
          row.plaid_transaction_id
        );
        const existingCategoryId = existingCategoryIdMap.get(
          row.plaid_transaction_id
        );
        const existingRecurring = existingRecurringMap.get(
          row.plaid_transaction_id
        );

        const updatedRow = { ...row };

        if (isNewTransaction) {
          // New transaction - keep all fields including new_category from internal transfer detection
          // No existing user choices to protect
          // Keep is_reviewed from pending→posted merge if it was set, otherwise default to false
          // (row.is_reviewed is already set during row mapping, either from merge or default false)
          return updatedRow;
        }

        // Existing transaction - preserve user overrides
        if (existingCategoryId) {
          // User has set category_id - preserve it (highest priority)
          updatedRow.category_id = existingCategoryId;
          // If category_id exists, we don't need to set new_category (except for INTERNAL_TRANSFER)
          if (existingCategory === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.category_id = null; // INTERNAL_TRANSFER doesn't have a category_id
          } else {
            // Clear new_category since we're using category_id
            updatedRow.new_category = null;
          }
        } else if (existingCategory) {
          // User has overridden category via new_category - preserve it and look up category_id
          updatedRow.new_category = existingCategory;
          if (existingCategory !== "INTERNAL_TRANSFER") {
            // Try to look up category_id for the existing category name
            updatedRow.category_id = categoryIdMap.get(existingCategory) || categoryIdMap.get(existingCategory.toLowerCase()) || null;
          } else {
            updatedRow.category_id = null; // INTERNAL_TRANSFER doesn't have a category_id
          }
        } else {
          // No user override - check if top_category indicates internal transfer
          // (mapper already detected it from Plaid categories)
          if (row.top_category === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.category_id = null;
            updatedRow.if_recurring = "no"; // Internal transfers are not recurring
          } else {
            // No override - use the category_id we looked up in the row mapping
            // (already set in the row, just keep it)
          }
        }

        // Determine final category for recurring check
        const finalCategory =
          updatedRow.new_category || row.new_category || row.top_category;

        // Check if transaction is in a stream (from existing data, not from Plaid since we don't fetch streams here)
        const existingTxRecurringStreamId = existingTx?.recurring_stream_id || null;

        // If transaction is NOT in a stream but user manually set if_recurring = 'yes', preserve it
        if (!existingTxRecurringStreamId && existingRecurring === "yes") {
          updatedRow.if_recurring = existingRecurring;
        }
        // If transaction IS in a stream, if_recurring should be 'yes' (already set in row, safe to keep)
        // OR if category is "Subscriptions", automatically mark as recurring
        // BUT skip if it's an internal transfer
        else if (
          finalCategory === "Subscriptions" &&
          updatedRow.if_recurring !== "yes" &&
          updatedRow.new_category !== "INTERNAL_TRANSFER"
        ) {
          updatedRow.if_recurring = "yes";
        }

        // Preserve existing is_reviewed status for existing transactions
        const existingReviewed = existingReviewedMap.get(row.plaid_transaction_id);
        if (existingReviewed !== undefined) {
          updatedRow.is_reviewed = existingReviewed;
        }

        return updatedRow;
      });

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(finalRows, { onConflict: "plaid_transaction_id" });

      if (upsertErr) {
        console.error("❌ Transaction upsert error:", upsertErr);
        return new Response("Failed to save transactions", { status: 500 });
      }
      
      console.log("✅ Transactions saved successfully");
    } else {
      console.log("ℹ️ No transactions to save");
    }

    // 6. Delete removed transactions
    if (removed.length) {
      console.log(`🗑️ Removing ${removed.length} deleted transactions...`);
      
      const { error: deleteErr } = await supabase
        .from("transactions")
        .delete()
        .in("plaid_transaction_id", removed.map((r) => r.transaction_id));

      if (deleteErr) {
        console.error("❌ Failed to delete transactions:", deleteErr);
        // Don't fail the whole operation for delete errors
      } else {
        console.log("✅ Deleted transactions removed successfully");
      }
    }

    // 7. Update derived balances based on transaction deltas
    const derivedBalancesUpdated = await updateDerivedBalances(
      user_id,
      added,
      modified,
      removed,
      deltaExisting
    );

    const summary = {
      message: "Sync complete",
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      derivedBalancesUpdated,
      item_id,
    };

    console.log("🎉 Transaction sync completed successfully:", summary);

    // 8. Return summary
    return new Response(
      JSON.stringify(summary),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("❌ Sync error:", error);
    
    const errorResponse = {
      error: "Sync failed",
      details: (error as Error).message,
      item_id: (error as any)?.item_id || "unknown",
    };

    return new Response(
      JSON.stringify(errorResponse),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function updateDerivedBalances(
  user_id: string,
  added: any[],
  modified: any[],
  removed: any[],
  existingTxs: any[]
) {
  const existingMap = new Map<
    string,
    { amount: number; account_id: string; pending: boolean }
  >();
  existingTxs.forEach((tx: any) => {
    existingMap.set(tx.plaid_transaction_id, {
      amount: Number(tx.amount || 0),
      account_id: tx.account_id,
      pending: tx.pending === true,
    });
  });

  const deltas = new Map<string, number>();
  const addDelta = (accountId: string | null, delta: number) => {
    if (!accountId || !Number.isFinite(delta)) return;
    deltas.set(accountId, (deltas.get(accountId) || 0) + delta);
  };

  added.forEach((txn: any) => {
    if (txn.pending === true) return;
    addDelta(txn.account_id, -Number(txn.amount || 0));
  });

  modified.forEach((txn: any) => {
    const prev = existingMap.get(txn.transaction_id);
    if (!prev) return;

    const prevPending = prev.pending === true;
    const nextPending = txn.pending === true;
    const prevAccount = prev.account_id;
    const prevAmount = Number(prev.amount || 0);
    const nextAccount = txn.account_id;
    const nextAmount = Number(txn.amount || 0);

    if (prevPending && nextPending) return;

    if (prevPending && !nextPending) {
      addDelta(nextAccount || prevAccount, -nextAmount);
      return;
    }

    if (!prevPending && nextPending) {
      addDelta(prevAccount || nextAccount, prevAmount);
      return;
    }

    if (prevAccount && nextAccount && prevAccount !== nextAccount) {
      addDelta(prevAccount, prevAmount);
      addDelta(nextAccount, -nextAmount);
      return;
    }

    addDelta(prevAccount || nextAccount, prevAmount - nextAmount);
  });

  removed.forEach((txn: any) => {
    const prev = existingMap.get(txn.transaction_id);
    if (!prev) return;
    if (prev.pending === true) return;
    addDelta(prev.account_id, Number(prev.amount || 0));
  });

  if (deltas.size === 0) return 0;

  let updated = 0;
  for (const [accountId, delta] of deltas.entries()) {
    const { data: accountRow, error: accountErr } = await supabase
      .from("accounts")
      .select("current_balance, available_balance")
      .eq("account_id", accountId)
      .single();

    if (accountErr || !accountRow) {
      console.error("⚠️ Account not found for derived balance update:", accountId);
      continue;
    }

    const current = Number(accountRow.current_balance || 0) + delta;
    const updatePayload: {
      current_balance: number;
      balance_source: string;
      available_balance?: number;
    } = {
      current_balance: current,
      balance_source: "derived",
    };

    if (accountRow.available_balance !== null && accountRow.available_balance !== undefined) {
      updatePayload.available_balance = Number(accountRow.available_balance) + delta;
    }

    const { error: updateErr } = await supabase
      .from("accounts")
      .update(updatePayload)
      .eq("account_id", accountId);

    if (updateErr) {
      console.error("⚠️ Failed derived balance update:", updateErr);
      continue;
    }

    updated++;
  }

  return updated;
}

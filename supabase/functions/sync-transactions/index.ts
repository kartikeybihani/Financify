/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapPlaidToAppCategory, isInternalTransfer } from "./plaidCategoryMapper.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Plaid API configuration using native fetch
const PLAID_ENV = Deno.env.get("PLAID_ENV") || "sandbox";
const PLAID_BASE_URL = PLAID_ENV === "production" 
  ? "https://production.plaid.com" 
  : "https://sandbox.plaid.com";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID")!;
const PLAID_SECRET = Deno.env.get("PLAID_SECRET")!;

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

    // 4.5. Get existing recurring streams for this user to check if transactions are recurring
    console.log("🔄 Fetching recurring streams...");
    const { data: recurringStreams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select("stream_id, stream_type, transaction_ids, account_id")
      .eq("user_id", user_id)
      .eq("is_active", true);

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
        
        // Set new_category if internal transfer detected (mapper returns INTERNAL_TRANSFER)
        let newCategory = detectedAsInternalTransfer || mappedCategory.top === "INTERNAL_TRANSFER" 
          ? "INTERNAL_TRANSFER" 
          : null;
        
        // Determine recurring status
        let ifRecurring: "yes" | "no" = "no"; // Default to 'no'
        
        // Priority 1: Internal transfer detection (highest priority)
        if (detectedAsInternalTransfer) {
          newCategory = "INTERNAL_TRANSFER";
          // Internal transfers are not recurring (they're account movements)
          ifRecurring = "no";
        } else if (streamData) {
          // Priority 2: Transaction is part of a recurring stream
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
        if (!detectedAsInternalTransfer) {
          const finalCategory = newCategory || mappedCategory.top;
          if (finalCategory === "Subscriptions") {
            ifRecurring = "yes";
          }
        }
        
        // Debug log for categories
        if (added.length <= 5) { // Only log first few to avoid spam
          const logPrefix = detectedAsInternalTransfer ? "🔄 INTERNAL TRANSFER" : "🏷️ Category Mapping";
          const streamInfo = streamData ? `🔄 RECURRING (${streamData.streamType})` : "";
          console.log(`${logPrefix}: "${txn.name}" → Plaid Primary: "${primary || "N/A"}" → Detailed: "${detailed || "N/A"}" → Mapped: "${mappedCategory.top} > ${mappedCategory.sub}" → Final: "${newCategory || mappedCategory.top}" ${streamInfo} → Recurring: "${ifRecurring}"`);
        }
        
        return {
          user_id,
          account_id: txn.account_id, // must exist in public.accounts due to FK
          plaid_transaction_id: txn.transaction_id,
          date: txn.date,
          amount: txn.amount,
          iso_currency_code: txn.iso_currency_code || null,
          name: txn.name || null,
          merchant_name: txn.merchant_name || null,
          category: category, // Keep original Plaid category (detailed or primary)
          top_category: mappedCategory.top, // Mapped top category
          sub_category: mappedCategory.sub, // Mapped sub category
          new_category: newCategory, // Set to INTERNAL_TRANSFER if detected, or from stream type
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId, // Link to recurring stream if applicable
          if_recurring: ifRecurring, // Set recurring flag based on internal transfer detection and category
        };
      });

      // IMPORTANT: We use a custom upsert strategy to protect user overrides
      // Strategy: For new transactions, set new_category from internal transfer detection
      //           For existing transactions, only update if new_category is NULL
      // CRITICAL: If we can't fetch existing transactions, we MUST NOT set new_category
      //           to avoid overwriting user overrides

      // First, get existing transactions to check which ones already have new_category and if_recurring
      const plaidTxIds = rows.map((r) => r.plaid_transaction_id);
      const { data: existingTxs, error: fetchErr } = await supabase
        .from("transactions")
        .select("plaid_transaction_id, new_category, if_recurring, recurring_stream_id")
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

      // Create maps of existing transactions with new_category and if_recurring
      const existingCategoryMap = new Map<string, string>();
      const existingRecurringMap = new Map<string, string>();
      if (canSafelySetCategories) {
        existingTxs.forEach((tx: { plaid_transaction_id: string; new_category: string | null; if_recurring: string | null; recurring_stream_id: string | null }) => {
          if (tx.new_category) {
            existingCategoryMap.set(tx.plaid_transaction_id, tx.new_category);
          }
          // Track if_recurring for transactions NOT in streams (user might have manually set it)
          if (!tx.recurring_stream_id && tx.if_recurring === "yes") {
            existingRecurringMap.set(tx.plaid_transaction_id, tx.if_recurring);
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
          (tx: { plaid_transaction_id: string; new_category: string | null; if_recurring: string | null; recurring_stream_id: string | null }) => tx.plaid_transaction_id === row.plaid_transaction_id
        );
        const isNewTransaction = !existingTx;

        // Preserve user overrides for existing transactions
        const existingCategory = existingCategoryMap.get(
          row.plaid_transaction_id
        );
        const existingRecurring = existingRecurringMap.get(
          row.plaid_transaction_id
        );

        const updatedRow = { ...row };

        if (isNewTransaction) {
          // New transaction - keep all fields including new_category from internal transfer detection
          // No existing user choices to protect
          return updatedRow;
        }

        // Existing transaction - preserve user overrides
        if (existingCategory) {
          // User has overridden this category - preserve it
          // This includes if user manually set INTERNAL_TRANSFER
          updatedRow.new_category = existingCategory;
        } else {
          // No user override - check if top_category indicates internal transfer
          // (mapper already detected it from Plaid categories)
          if (row.top_category === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.if_recurring = "no"; // Internal transfers are not recurring
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

    const summary = {
      message: "Sync complete",
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      item_id,
    };

    console.log("🎉 Transaction sync completed successfully:", summary);

    // 7. Return summary
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

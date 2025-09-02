/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // 5. Upsert new and modified transactions into database
    if (added.length || modified.length) {
      console.log(`💽 Saving ${added.length + modified.length} transactions to database...`);
      
      const rows = [...added, ...modified].map((txn) => {
        const category = txn.personal_finance_category?.primary || null;
        
        // Debug log for categories
        if (added.length <= 5) { // Only log first few to avoid spam
          console.log(`🏷️ Transaction: "${txn.name}" → Category: "${category}"`);
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
          category: category,
          transaction_type: txn.transaction_type || null,
          pending: txn.pending ?? false,
        };
      });

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "plaid_transaction_id" });

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

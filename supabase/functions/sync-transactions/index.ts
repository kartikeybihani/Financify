/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PlaidApi, Configuration, PlaidEnvironments } from "https://esm.sh/plaid@11.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments.production, // set to development or production per env
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": Deno.env.get("PLAID_CLIENT_ID")!,
      "PLAID-SECRET": Deno.env.get("PLAID_SECRET")!,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

serve(async (req: Request) => {
  try {
    const { item_id, user_id } = (await req.json()) as {
      item_id: string;
      user_id: string;
    };
    if (!item_id || !user_id) {
      return new Response("Missing item_id or user_id", { status: 400 });
    }

    // 1 fetch cursor from DB
    const { data: ui, error: fetchErr } = await supabase
      .from("user_items")
      .select("transactions_cursor")
      .eq("item_id", item_id)
      .single();

    if (fetchErr || !ui) {
      console.error("Item not found:", fetchErr);
      return new Response("Item not found", { status: 404 });
    }

    // 2 get decrypted access token from Vault via RPC
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure.get_plaid_token",
      { p_item_id: item_id, p_user_id: user_id as any }
    );

    if (tokenErr || !access_token) {
      console.error("Vault token fetch failed:", tokenErr);
      return new Response("Token not found", { status: 404 });
    }

    // 3 pull all pages with transactionsSync
    let cursor: string | null = ui.transactions_cursor || null;
    let added: any[] = [];
    let modified: any[] = [];
    let removed: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const resp = await plaidClient.transactionsSync({
        access_token,
        cursor,
        count: 500,
      });
      const data = resp.data;
      added.push(...data.added);
      modified.push(...data.modified);
      removed.push(...data.removed);
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    // 4 save new cursor and last_synced_at timestamp
    await supabase
      .from("user_items")
      .update({ 
        transactions_cursor: cursor,
        last_synced_at: new Date().toISOString()
      })
      .eq("item_id", item_id);

    // 5 upsert new and modified into your transactions table
    if (added.length || modified.length) {
      const rows = [...added, ...modified].map((txn) => ({
        user_id,
        account_id: txn.account_id, // must exist in public.accounts due to FK
        plaid_transaction_id: txn.transaction_id,
        date: txn.date,
        amount: txn.amount,
        iso_currency_code: txn.iso_currency_code || null,
        name: txn.name || null,
        merchant_name: txn.merchant_name || null,
        category: txn.category?.join(", ") || null,
        transaction_type: txn.transaction_type || null,
        pending: txn.pending ?? false,
      }));

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "plaid_transaction_id" });

      if (upsertErr) {
        console.error("Insert error:", upsertErr);
        return new Response("Failed to save transactions", { status: 500 });
      }
    }

    // 6 delete removed
    if (removed.length) {
      await supabase
        .from("transactions")
        .delete()
        .in("plaid_transaction_id", removed.map((r) => r.transaction_id));
    }

    // 7 return summary
    return new Response(
      JSON.stringify({
        message: "Sync complete",
        added: added.length,
        modified: modified.length,
        removed: removed.length,
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        error: "Sync failed",
        details: (error as Error).message,
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});

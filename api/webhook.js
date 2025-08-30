// /api/webhook.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL, // server-side env var with fallback
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY // server-side env var with fallback
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { webhook_type, webhook_code, item_id } = req.body || {};
  if (!item_id) {
    // Plaid normally sends item_id; log and 200 to avoid retries
    console.warn("Webhook missing item_id", req.body);
    return res.status(200).json({ ok: true });
  }

  try {
    // --- ITEM webhooks ---
    if (webhook_type === "ITEM") {
      if (webhook_code === "NEW_ACCOUNTS_AVAILABLE") {
        await supabase
          .from("user_items")
          .update({ has_new_accounts: true })
          .eq("item_id", item_id);

        // tell your app to launch UPDATE mode with account select
        return res.status(200).json({ ok: true, prompt_update_mode: true });
      }

      if (
        webhook_code === "ITEM_LOGIN_REQUIRED" ||
        webhook_code === "PENDING_EXPIRATION" ||
        webhook_code === "PENDING_DISCONNECT"
      ) {
        await supabase
          .from("user_items")
          .update({ requires_update_mode: true })
          .eq("item_id", item_id);

        return res.status(200).json({ ok: true, requires_update_mode: true });
      }
    }

    // --- TRANSACTIONS webhooks ---
    if (webhook_type === "TRANSACTIONS") {
      const shouldSync =
        webhook_code === "INITIAL_UPDATE" ||
        webhook_code === "HISTORICAL_UPDATE" ||
        webhook_code === "SYNC_UPDATES_AVAILABLE";

      if (shouldSync) {
        try {
          fetch(`https://financify-rose.vercel.app/api/transactions_sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_id }),
          }).catch((e) => console.error("enqueue sync failed", e));
        } catch (e) {
          console.error("enqueue error", e);
        }
      }

      // Always ack quickly so Plaid doesn't retry
      return res.status(200).json({ ok: true, trigger_sync: !!shouldSync });
    }

    // default: acknowledge
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    // still 200 to avoid retries; log internally
    return res.status(200).json({ ok: true });
  }
}

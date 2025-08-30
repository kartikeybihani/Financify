// /api/exchange_public_token.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL, // server-only
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY // server-only
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { public_token, user_id, institution_id, institution_name } = req.body;
  if (!public_token || !user_id) {
    return res.status(400).json({ error: "Missing public_token or user_id" });
  }

  try {
    const { data } = await client.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = data;

    // Idempotent write: upsert on unique item_id
    const { error } = await supabase.from("user_items").upsert(
      {
        user_id,
        item_id,
        access_token,
        institution_id: institution_id ?? null,
        institution_name: institution_name ?? null,
        webhook: "https://financify-rose.vercel.app/api/webhook",
      },
      { onConflict: "item_id" }
    );

    if (error) throw error;

    // Do NOT return access_token to the client
    return res.status(200).json({ item_id });
  } catch (e) {
    console.error("exchange error", e.response?.data || e);
    return res
      .status(500)
      .json({ error: e.response?.data?.error_message || e.message });
  }
}

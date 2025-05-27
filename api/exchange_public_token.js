import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // 👈 only use this on the backend
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { public_token, user_id } = req.body;

  try {
    const response = await client.itemPublicTokenExchange({ public_token });
    const access_token = response.data.access_token;
    const item_id = response.data.item_id;

    // Store in Supabase
    const { error } = await supabase.from("user_tokens").upsert({
      id: user_id,
      access_token,
      item_id,
    });

    if (error) {
      console.error("❌ Error inserting to Supabase:", error.message);
    }

    res.status(200).json({ access_token, item_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

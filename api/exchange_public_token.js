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

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { public_token, user_id } = req.body;
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
    const { data } = await client.itemPublicTokenExchange({ public_token });
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

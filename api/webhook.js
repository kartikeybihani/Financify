// /api/webhook.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("📩 Webhook received:", req.body);

  // Optionally, handle specific webhook types/codes
  const { webhook_type, webhook_code } = req.body;

  if (webhook_type === "ITEM" && webhook_code === "NEW_ACCOUNTS_AVAILABLE") {
    // Trigger item update logic if needed
    console.log("👉 New accounts available, should update access.");
  } else if (
    webhook_code === "PENDING_EXPIRATION" ||
    webhook_code === "ITEM_LOGIN_REQUIRED" ||
    webhook_code === "PENDING_DISCONNECT"
  ) {
    console.log("👉 Item pending expiration, should update access.");
    console.log("🛑 Item requires update mode:", webhook_code, webhook_type);
    res.status(200).json({ requires_update_mode: true });
  } else {
    console.log("👉 Webhook received:", req.body);
  }
  // res.status(200).json({ received: true });
}

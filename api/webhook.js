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
  }

  res.status(200).json({ received: true });
}

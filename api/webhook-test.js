// /api/webhook-test.js
// Test endpoint to verify webhook URL is accessible
export default async function handler(req, res) {
  console.log("🧪 Webhook test endpoint called:", {
    method: req.method,
    timestamp: new Date().toISOString(),
    headers: req.headers,
    body: req.body,
  });

  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message: "Webhook endpoint is accessible",
      url: "https://financify-rose.vercel.app/api/webhook",
      timestamp: new Date().toISOString(),
      instructions: {
        step1: "Configure this URL in SnapTrade dashboard",
        step2: "Set webhook URL to: https://financify-rose.vercel.app/api/webhook",
        step3: "Set webhook secret (optional) in SNAPTRADE_WEBHOOK_SECRET env var",
        step4: "Test by triggering a connection event in SnapTrade",
      },
    });
  }

  if (req.method === "POST") {
    // Echo back the request for testing
    return res.status(200).json({
      success: true,
      message: "Test webhook received",
      received: {
        method: req.method,
        headers: req.headers,
        body: req.body,
        timestamp: new Date().toISOString(),
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}


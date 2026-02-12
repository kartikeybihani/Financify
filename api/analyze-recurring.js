// /api/analyze-recurring.js
// POST: Run Finny recurring analysis for user. Saves to finny_recurring_analysis, upserts into recurring_streams.

import { supabase } from "../lib/api/supabase.js";
import { verifyUserAuthorization } from "../lib/api/auth.js";
import { runRecurringAnalysis } from "../lib/recurringAnalysis.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user_id, item_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  const { authorized, error: authError } = await verifyUserAuthorization(
    req,
    user_id
  );

  if (!authorized) {
    return res
      .status(authError?.includes("Unauthorized") ? 401 : 403)
      .json({ error: authError || "Access denied" });
  }

  try {
    const triggerSource = req.body.trigger_source || "manual";
    const result = await runRecurringAnalysis(
      supabase,
      user_id,
      item_id || null,
      triggerSource
    );

    if (result.reason === "no_transactions") {
      return res.status(200).json({
        success: true,
        reason: "no_transactions",
        message: "No transactions to analyze",
      });
    }

    return res.status(200).json({
      success: true,
      analysis_id: result.analysisId,
      upserted: result.upserted,
      summary: result.analysisJson?.summary,
    });
  } catch (err) {
    console.error("analyze-recurring error:", err);
    return res.status(500).json({
      error: err.message || "Analysis failed",
    });
  }
}

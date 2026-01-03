// ESM module: shared helpers for classification orchestration

export function decideClarificationAction(classification) {
  try {
    const risk = classification?.decision_risk;
    const suff = classification?.info_sufficiency;
    const reasons = classification?.clarification_reasons || [];
    const need = classification?.clarification_needed;

    const clarify = need === true || risk === "high" || suff !== "sufficient";
    const rationale = clarify
      ? `High-risk decision (${risk}) or insufficient info (${suff}). Reasons: ${reasons.join(
          ", "
        )}`
      : "Sufficient info and acceptable risk.";

    return { action: clarify ? "clarify" : "proceed", rationale };
  } catch (e) {
    return {
      action: "proceed",
      rationale: "Default proceed due to decision error",
    };
  }
}

export function generateClarifyingQuestion(
  classification,
  userMessage,
  userContextSummary = null,
  memoryRefs = []
) {
  // Prefer model-provided clarification_note if present; otherwise pick top reason(s)
  const note =
    classification?.clarification_note &&
    typeof classification.clarification_note === "string"
      ? classification.clarification_note.trim()
      : null;
  const reasons = Array.isArray(classification?.clarification_reasons)
    ? classification.clarification_reasons
    : [];

  let hint = note || "";
  if (!hint && reasons.length) {
    const top = reasons.slice(0, 2).join(" and ").replace(/_/g, " ");
    hint = `I need ${top}`;
  }
  if (!hint) {
    hint = "I need one key detail to tailor the answer";
  }

  // Simple personalization: if we appear to have estimates for cashflow, avoid asking for them again
  const hasExpenses = !!userContextSummary?.cashflow?.monthly_expenses_est;
  const hasIncome = !!userContextSummary?.cashflow?.monthly_income_est;
  const personalization =
    hasExpenses || hasIncome
      ? " Given what I know about your expenses and income,"
      : "";

  return `To guide you best,${personalization} I need a bit more info: ${hint}. Could you share that?`;
}

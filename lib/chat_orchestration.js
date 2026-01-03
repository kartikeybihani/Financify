// ESM module: shared helpers for classification orchestration

export function decideClarificationAction(classification) {
  try {
    const risk = classification?.decision_risk;
    const suff = classification?.info_sufficiency;
    const reasons = classification?.clarification_reasons || [];
    const need = classification?.clarification_needed;

    const clarify = need === true || risk === 'high' || suff !== 'sufficient';
    const rationale = clarify
      ? `High-risk decision (${risk}) or insufficient info (${suff}). Reasons: ${reasons.join(', ')}`
      : 'Sufficient info and acceptable risk.';

    return { action: clarify ? 'clarify' : 'proceed', rationale };
  } catch (e) {
    return { action: 'proceed', rationale: 'Default proceed due to decision error' };
  }
}

export function generateClarifyingQuestion(classification, userMessage, userContextSummary = null, memoryRefs = []) {
  const intent = classification?.intent;
  const reasons = Array.isArray(classification?.clarification_reasons) ? classification.clarification_reasons : [];
  const noteRaw = typeof classification?.clarification_note === 'string' ? classification.clarification_note.trim() : '';

  // If we have targeted reasons, ask one concise targeted question
  if (reasons.length) {
    const top = reasons[0].replace(/_/g, ' ');
    return `Quick check: ${top}?`;
  }

  // If no reasons but a note exists, use a compact phrasing
  if (noteRaw) {
    return `To move forward, ${noteRaw}.`;
  }

  // Intent-specific fallback (avoid generic phrasing)
  if (intent === 'ask_personalized') {
    return "What timeline are you considering, and how will you replace your current income during the transition?";
  }
  if (intent === 'goal_conversation') {
    return "What's your target amount and timeline for this goal?";
  }
  if (intent === 'stock_query') {
    return "Which ticker and what time horizon are you focused on?";
  }

  // Final generic fallback
  return "Could you share the one key detail that would help me give a precise answer?";
}

import assert from "node:assert/strict";

if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
}

const {
  deriveContinuityDirective,
  buildContinuityClassification,
  buildClassificationHint,
  analyzeContinuityDirective,
} = await import("../core/finny/services/ContinuityService.js");

function baseLastTurnMeta(overrides = {}) {
  return {
    chat_id: "chat-123",
    assistant_route: "ask",
    assistant_intent: "ask_personalized",
    advisory_job: "improve",
    response_contract: "spending_tip_grounded",
    subject: "Travel",
    topic: "spending",
    was_finance_advice: true,
    grounded_answer: true,
    question_count: 0,
    previous_user_message: "Give me a spending tip",
    previous_assistant_message_excerpt:
      "The clearest place to cut is travel.",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function main() {
  const repairDirective = deriveContinuityDirective({
    message: "But that's your job",
    lastTurnMeta: baseLastTurnMeta(),
    currentAction: "message",
  });
  assert.equal(repairDirective?.mode, "repair_previous_answer");
  assert.equal(repairDirective?.source_subject, "Travel");

  const repairDirectiveCurly = deriveContinuityDirective({
    message: "But that’s your job",
    lastTurnMeta: baseLastTurnMeta(),
    currentAction: "message",
  });
  assert.equal(repairDirectiveCurly?.mode, "repair_previous_answer");

  const followupDirective = deriveContinuityDirective({
    message: "why?",
    lastTurnMeta: baseLastTurnMeta(),
    currentAction: "message",
  });
  assert.equal(followupDirective?.mode, "ask_followup_contextual");

  const noDirective = deriveContinuityDirective({
    message: "Can I afford a watch?",
    lastTurnMeta: baseLastTurnMeta(),
    currentAction: "message",
  });
  assert.equal(noDirective, null);

  const offTopicPreviousTurnDirective = deriveContinuityDirective({
    message: "why?",
    lastTurnMeta: baseLastTurnMeta({ was_finance_advice: false }),
    currentAction: "message",
  });
  assert.equal(offTopicPreviousTurnDirective, null);

  const continuityClassification = buildContinuityClassification(
    repairDirective,
  );
  assert.equal(continuityClassification.intent, "ask_personalized");
  assert.equal(continuityClassification.needs_user_data, true);

  const hint = buildClassificationHint(baseLastTurnMeta());
  assert.deepEqual(hint, {
    same_chat_last_turn_was_finance_advice: true,
    previous_contract: "spending_tip_grounded",
    previous_subject: "Travel",
  });

  const analysis = analyzeContinuityDirective({
    message: "But that’s your job",
    lastTurnMeta: baseLastTurnMeta(),
    currentAction: "message",
  });
  assert.equal(analysis.reason, "complaint_match");

  console.log("✅ continuity routing checks passed");
}

main();

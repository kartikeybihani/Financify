import { supabase } from "../../../lib/api/supabase.js";
import { withTimeout } from "../utils/timeout.js";

const COMPLAINT_PATTERNS = [
  /\bthat'?s your job\b/i,
  /\bthats your job\b/i,
  /\bthat was generic\b/i,
  /\bbe specific\b/i,
  /\buse my data\b/i,
  /\bthat didn'?t answer\b/i,
  /\bnot what i asked\b/i,
  /\byou already have my (?:data|spending)\b/i,
  /\bdon'?t tell me to track\b/i,
  /\b(?:generic|useless|stupid|bullshit|shit answer)\b/i,
];

const REFERENTIAL_PATTERNS = [
  /^\s*why\??\s*$/i,
  /^\s*why not\??\s*$/i,
  /^\s*how so\??\s*$/i,
  /^\s*what do you mean\??\s*$/i,
  /^\s*based on what\??\s*$/i,
  /^\s*which one\??\s*$/i,
];

const STANDALONE_FINANCE_PATTERNS = [
  /\bcan i afford\b/i,
  /\bshould i buy\b/i,
  /\bhow much\b/i,
  /\bhelp me\b/i,
  /\bwhat should i\b/i,
  /\bwhat do i do\b/i,
  /\bhow do i\b/i,
];

function trimExcerpt(text = "", max = 320) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function normalizeContinuityText(text = "") {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isComplaintLikeMessage(message = "") {
  const text = normalizeContinuityText(message);
  if (!text) return false;
  return COMPLAINT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isReferentialFollowupMessage(message = "") {
  const text = normalizeContinuityText(message);
  if (!text) return false;
  return REFERENTIAL_PATTERNS.some((pattern) => pattern.test(text));
}

function isStandaloneFinanceQuery(message = "") {
  const text = normalizeContinuityText(message);
  if (!text) return false;
  if (text.length <= 24 && !/\$/.test(text)) return false;
  return STANDALONE_FINANCE_PATTERNS.some((pattern) => pattern.test(text));
}

function continuityHintFromContract(responseContract = null) {
  if (responseContract === "factual_lookup") return "factual";
  if (responseContract === "education_explainer") return "exploratory";
  if (responseContract === "followup_contextual") return "exploratory";
  return "actionable";
}

export function buildContinuityClassification(continuityDirective = null) {
  const intentType = continuityHintFromContract(
    continuityDirective?.source_contract || null,
  );
  return {
    intent: "ask_personalized",
    intent_type: intentType,
    emotional_state: "neutral",
    needs_web: false,
    needs_user_data: true,
    needs_clarification: false,
    info_sufficiency: "sufficient",
    missing_fields: [],
    decision_risk: "low",
    state: null,
    entities: [],
    ticker: null,
    confidence: 1,
    continuity_override: true,
    data_requirements: {
      required_packs: ["summary_min"],
      optional_packs: [],
      filters: {},
      granularity: "summary_level",
      time_range: "current",
    },
  };
}

export function buildClassificationHint(lastTurnMeta = null) {
  if (!lastTurnMeta) return null;
  return {
    same_chat_last_turn_was_finance_advice: !!lastTurnMeta.was_finance_advice,
    previous_contract: lastTurnMeta.response_contract || null,
    previous_subject: lastTurnMeta.subject || null,
  };
}

export function buildContinuityPromptHeader(continuityDirective = null) {
  if (!continuityDirective?.mode) return null;

  if (continuityDirective.mode === "repair_previous_answer") {
    return [
      "CONTINUITY_OVERRIDE:",
      "- mode: repair_previous_answer",
      `- original_user_question: ${continuityDirective.source_user_message || "unknown"}`,
      `- previous_answer_excerpt: ${continuityDirective.source_assistant_message_excerpt || "unknown"}`,
      "- instruction: Replace the previous answer directly. Do not defend it.",
    ].join("\n");
  }

  if (continuityDirective.mode === "ask_followup_contextual") {
    return [
      "CONTINUITY_OVERRIDE:",
      "- mode: ask_followup_contextual",
      `- original_user_question: ${continuityDirective.source_user_message || "unknown"}`,
      `- previous_answer_excerpt: ${continuityDirective.source_assistant_message_excerpt || "unknown"}`,
      "- instruction: Continue the same subject directly. Do not restart or redirect.",
    ].join("\n");
  }

  return null;
}

export function buildLastTurnMeta({
  route = "ask",
  classificationResult = null,
  advisoryRuntime = null,
  responseContract = null,
  assistantText = "",
  userMessage = "",
  chatId = null,
  groundedAnswer = false,
  subject = null,
  topic = null,
}) {
  const decisionSubject = subject || advisoryRuntime?.decision?.subject || null;
  const resolvedTopic =
    topic ||
    (responseContract === "spending_tip_grounded"
      ? "spending"
      : responseContract === "affordability_decision"
        ? "affordability"
        : classificationResult?.intent || null);

  return {
    chat_id: chatId || null,
    assistant_route: route,
    assistant_intent: classificationResult?.intent || null,
    advisory_job: advisoryRuntime?.advisory_job || null,
    response_contract: responseContract || null,
    subject: decisionSubject,
    topic: resolvedTopic,
    was_finance_advice: route === "ask",
    grounded_answer: !!groundedAnswer,
    question_count: (String(assistantText || "").match(/\?/g) || []).length,
    previous_user_message: trimExcerpt(userMessage, 240),
    previous_assistant_message_excerpt: trimExcerpt(assistantText, 320),
    timestamp: new Date().toISOString(),
  };
}

export async function loadLastTurnMeta({
  userId,
  chatId,
  sessionState = {},
}) {
  const sessionMeta = sessionState?.last_turn_meta || null;
  if (sessionMeta && sessionMeta.chat_id === chatId) {
    return sessionMeta;
  }

  if (!userId || !chatId) return null;

  try {
    const sessionResult = await withTimeout(
      supabase
        .from("chat_sessions")
        .select("last_turn_meta,last_finance_turn_meta")
        .eq("id", chatId)
        .eq("user_id", userId)
        .maybeSingle(),
      1500,
      null,
    );

    if (sessionResult && !sessionResult.error && sessionResult.data) {
      const sessionData = sessionResult.data;
      if (
        sessionData?.last_turn_meta &&
        sessionData.last_turn_meta.chat_id === chatId
      ) {
        return sessionData.last_turn_meta;
      }
      if (
        sessionData?.last_finance_turn_meta &&
        sessionData.last_finance_turn_meta.chat_id === chatId
      ) {
        return sessionData.last_finance_turn_meta;
      }
    }

    const result = await withTimeout(
      supabase
        .from("conversation_logs")
        .select("metrics,timestamp,user_message,finny_response,intent")
        .eq("user_id", userId)
        .eq("chat_id", chatId)
        .order("timestamp", { ascending: false })
        .limit(1),
      1500,
      null,
    );

    if (!result || result.error || !Array.isArray(result.data) || result.data.length === 0) {
      return null;
    }

    const row = result.data[0];
    const meta = row?.metrics?.finny_turn_meta || null;
    if (!meta) return null;
    return meta;
  } catch {
    return null;
  }
}

export async function persistLastTurnMeta({
  userId,
  chatId,
  lastTurnMeta,
}) {
  if (!userId || !chatId || !lastTurnMeta) return { persisted: false };

  const payload = {
    last_turn_meta: lastTurnMeta,
    updated_at: new Date().toISOString(),
  };

  if (lastTurnMeta.was_finance_advice) {
    payload.last_finance_turn_meta = lastTurnMeta;
  }

  try {
    const result = await withTimeout(
      supabase
        .from("chat_sessions")
        .update(payload)
        .eq("id", chatId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle(),
      2000,
      null,
    );

    if (!result || result.error) {
      return {
        persisted: false,
        reason: result?.error?.message || "chat_session_update_failed",
      };
    }

    if (!result.data?.id) {
      return { persisted: false, reason: "chat_session_not_found" };
    }

    return { persisted: true };
  } catch (error) {
    return {
      persisted: false,
      reason: error?.message || "chat_session_update_exception",
    };
  }
}

export function analyzeContinuityDirective({
  message,
  lastTurnMeta,
  activeGoalFlow = null,
  currentAction = "message",
}) {
  if (currentAction !== "message") {
    return { directive: null, reason: "not_message_action" };
  }
  if (!lastTurnMeta) {
    return { directive: null, reason: "no_last_turn_meta" };
  }
  if (!lastTurnMeta?.was_finance_advice) {
    return { directive: null, reason: "last_turn_not_finance_advice" };
  }
  if (activeGoalFlow?.active) {
    return { directive: null, reason: "active_goal_flow" };
  }

  const text = normalizeContinuityText(message);
  if (!text) {
    return { directive: null, reason: "empty_message" };
  }
  if (isStandaloneFinanceQuery(text)) {
    return { directive: null, reason: "standalone_finance_query" };
  }

  const baseDirective = {
    source_user_message: lastTurnMeta.previous_user_message || "",
    source_assistant_message_excerpt:
      lastTurnMeta.previous_assistant_message_excerpt || "",
    source_contract: lastTurnMeta.response_contract || null,
    source_advisory_job: lastTurnMeta.advisory_job || null,
    source_subject: lastTurnMeta.subject || null,
  };

  if (isComplaintLikeMessage(text)) {
    return {
      directive: { mode: "repair_previous_answer", ...baseDirective },
      reason: "complaint_match",
    };
  }

  if (isReferentialFollowupMessage(text)) {
    return {
      directive: { mode: "ask_followup_contextual", ...baseDirective },
      reason: "referential_followup_match",
    };
  }

  return { directive: null, reason: "no_pattern_match" };
}

export function deriveContinuityDirective(options = {}) {
  return analyzeContinuityDirective(options).directive;
}

export function createContinuityShadowLog(message = "", lastTurnMeta = null) {
  return {
    message_preview: trimExcerpt(message, 80),
    normalized_message_preview: trimExcerpt(normalizeContinuityText(message), 80),
    previous_contract: lastTurnMeta?.response_contract || null,
    previous_subject: lastTurnMeta?.subject || null,
    was_finance_advice: !!lastTurnMeta?.was_finance_advice,
  };
}

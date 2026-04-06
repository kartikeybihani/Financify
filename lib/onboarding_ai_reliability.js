const RETRYABLE_REASON_CODES = new Set([
  "FAIL_LLM_HTTP_429",
  "FAIL_LLM_HTTP_5XX",
  "FAIL_LLM_TIMEOUT",
  "FAIL_LLM_NETWORK",
]);

const NETWORK_ERROR_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const MAX_ERROR_MESSAGE_LENGTH = 4000;

const toMessage = (error) => {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error?.message === "string") return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const truncate = (text, max = MAX_ERROR_MESSAGE_LENGTH) => {
  const value = String(text || "").trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}...` : value;
};

const inferHttpStatus = (error, message) => {
  if (Number.isFinite(error?.httpStatus)) {
    return Number(error.httpStatus);
  }
  if (Number.isFinite(error?.status)) {
    return Number(error.status);
  }
  const match = String(message || "").match(/OpenRouter error\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
};

const isTimeoutError = (error, message) => {
  if (error?.name === "AbortError") return true;
  if (error?.isTimeout === true) return true;
  if (String(error?.code || "").toUpperCase() === "ETIMEDOUT") return true;
  return /timeout|timed out|aborted/i.test(String(message || ""));
};

const isNetworkError = (error, message) => {
  if (error?.isNetworkError === true) return true;
  const code = String(error?.code || "").toUpperCase();
  if (NETWORK_ERROR_CODES.has(code)) return true;
  return /network|fetch failed|socket|dns|econn|enotfound|refused|reset/i.test(
    String(message || ""),
  );
};

export const shouldRetryOnboardingFailure = (reasonCode) =>
  RETRYABLE_REASON_CODES.has(String(reasonCode || "").trim());

export const classifyOnboardingAiFailure = ({ error, stage } = {}) => {
  const failureStage = String(stage || "llm_request");
  const rawMessage = toMessage(error);
  const failureMessage = truncate(rawMessage);
  const httpStatus = inferHttpStatus(error, rawMessage);

  if (failureStage === "profile_fetch") {
    return {
      reasonCode: "FAIL_PROFILE_FETCH",
      stage: "profile_fetch",
      httpStatus,
      retryable: false,
      failureMessage,
    };
  }

  if (failureStage === "tx_fetch") {
    return {
      reasonCode: "FAIL_TX_FETCH",
      stage: "tx_fetch",
      httpStatus,
      retryable: false,
      failureMessage,
    };
  }

  if (failureStage === "persist") {
    return {
      reasonCode: "FAIL_PROFILE_UPSERT",
      stage: "persist",
      httpStatus,
      retryable: false,
      failureMessage,
    };
  }

  if (failureStage === "llm_parse") {
    return {
      reasonCode: "FAIL_LLM_INVALID_JSON",
      stage: "llm_parse",
      httpStatus,
      retryable: false,
      failureMessage,
    };
  }

  if (httpStatus === 401) {
    return {
      reasonCode: "FAIL_LLM_HTTP_401",
      stage: "llm_request",
      httpStatus,
      retryable: false,
      failureMessage,
    };
  }

  if (httpStatus === 403) {
    return {
      reasonCode: "FAIL_LLM_HTTP_403",
      stage: "llm_request",
      httpStatus,
      retryable: false,
      failureMessage,
    };
  }

  if (httpStatus === 429) {
    return {
      reasonCode: "FAIL_LLM_HTTP_429",
      stage: "llm_request",
      httpStatus,
      retryable: true,
      failureMessage,
    };
  }

  if (httpStatus >= 500 && httpStatus <= 599) {
    return {
      reasonCode: "FAIL_LLM_HTTP_5XX",
      stage: "llm_request",
      httpStatus,
      retryable: true,
      failureMessage,
    };
  }

  if (/no llm content returned|empty content/i.test(String(rawMessage || ""))) {
    return {
      reasonCode: "FAIL_LLM_EMPTY_CONTENT",
      stage: "llm_request",
      httpStatus,
      retryable: false,
      failureMessage,
    };
  }

  if (isTimeoutError(error, rawMessage)) {
    return {
      reasonCode: "FAIL_LLM_TIMEOUT",
      stage: "llm_request",
      httpStatus,
      retryable: true,
      failureMessage,
    };
  }

  if (isNetworkError(error, rawMessage)) {
    return {
      reasonCode: "FAIL_LLM_NETWORK",
      stage: "llm_request",
      httpStatus,
      retryable: true,
      failureMessage,
    };
  }

  return {
    reasonCode: "FAIL_UNKNOWN",
    stage: "llm_request",
    httpStatus,
    retryable: false,
    failureMessage,
  };
};

export const buildStructuredLlmFailureMarker = ({
  reasonCode,
  stage,
  httpStatus,
  retryable,
  attempts,
  model,
  requestId,
  apiBuild,
  failureMessage,
}) => ({
  error: "LLM_FAILED",
  status: "failed",
  reason_code: reasonCode || "FAIL_UNKNOWN",
  stage: stage || "llm_request",
  http_status: Number.isFinite(httpStatus) ? Number(httpStatus) : null,
  retryable: retryable === true,
  attempts: Number.isFinite(attempts) ? Number(attempts) : 1,
  model: model || null,
  failed_at: new Date().toISOString(),
  request_id: requestId || null,
  api_build: apiBuild || null,
  error_message: truncate(failureMessage),
});

export const createAiEnrichmentSummary = () => ({
  early_insights: {
    status: "not_requested",
    reason_code: null,
    attempts: 0,
    model: null,
    http_status: null,
    retryable: null,
    run_id: null,
  },
  base_analysis: {
    status: "not_requested",
    reason_code: null,
    attempts: 0,
    model: null,
    http_status: null,
    retryable: null,
    run_id: null,
  },
});

export const applyAiSummary = (target, patch = {}) => ({
  ...(target || {}),
  status: patch.status || target?.status || "not_requested",
  reason_code:
    patch.reason_code === undefined
      ? (target?.reason_code ?? null)
      : patch.reason_code,
  attempts:
    patch.attempts === undefined
      ? Number(target?.attempts || 0)
      : Number(patch.attempts || 0),
  model:
    patch.model === undefined
      ? (target?.model ?? null)
      : patch.model || null,
  http_status:
    patch.http_status === undefined
      ? (target?.http_status ?? null)
      : Number.isFinite(patch.http_status)
        ? Number(patch.http_status)
        : null,
  retryable:
    patch.retryable === undefined
      ? (target?.retryable ?? null)
      : patch.retryable === null
        ? null
        : patch.retryable === true,
  run_id:
    patch.run_id === undefined
      ? (target?.run_id ?? null)
      : patch.run_id || null,
});

export const getConsentStateForRun = ({
  hasOnboardingAiConsent,
  hasChatMemoryConsent,
}) => {
  if (hasOnboardingAiConsent) return "onboarding";
  if (hasChatMemoryConsent) return "chat_fallback";
  return "none";
};

export async function runAskAction({
  message,
  safeContext,
  effectiveClassification,
  timings,
  wantsStreaming,
  res,
  handleAsk,
}) {
  const askIntent =
    effectiveClassification?.intent === "stock_query"
      ? "stock_query"
      : "ask_personalized";

  return handleAsk(
    message,
    safeContext,
    askIntent,
    effectiveClassification,
    timings,
    wantsStreaming,
    wantsStreaming ? res : null,
  );
}

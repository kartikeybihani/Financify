export async function runStockQueryAction({
  message,
  safeContext,
  effectiveClassification,
  timings,
  wantsStreaming,
  res,
  handleAsk,
}) {
  return handleAsk(
    message,
    safeContext,
    "stock_query",
    effectiveClassification,
    timings,
    wantsStreaming,
    wantsStreaming ? res : null,
  );
}

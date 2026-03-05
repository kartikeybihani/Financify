export async function runOffTopicAction({
  message,
  safeContext,
  effectiveClassification,
  wantsStreaming,
  res,
  handleOffTopic,
}) {
  const offTopicContext = {
    ...safeContext,
    classification_result: effectiveClassification,
  };

  return handleOffTopic(
    message,
    offTopicContext,
    wantsStreaming,
    wantsStreaming ? res : null,
  );
}

export async function runClassifyAction({
  message,
  safeContext,
  handleClassify,
  timings,
  classificationCache,
  generateClassificationCacheKey,
}) {
  const classifyStartTime = Date.now();
  let response = await handleClassify(message, safeContext);
  timings.classification_ms = Date.now() - classifyStartTime;

  // CRITICAL FINAL CHECK: Never return heuristic results
  if (
    response &&
    Object.prototype.hasOwnProperty.call(response, "heuristic") &&
    (response.heuristic === true ||
      response.heuristic === "true" ||
      response.heuristic === 1)
  ) {
    console.log(
      "🚨 [FINNY] CRITICAL: Response has heuristic flag! Blocking return and forcing fresh LLM classification.",
    );
    console.log("🚨 [FINNY] Response was:", JSON.stringify(response, null, 2));

    const key = generateClassificationCacheKey(message);
    classificationCache.delete(key);

    response = await handleClassify(message, safeContext);

    if (
      response &&
      Object.prototype.hasOwnProperty.call(response, "heuristic") &&
      response.heuristic
    ) {
      console.log(
        "🚨 [FINNY] CRITICAL ERROR: LLM returned heuristic! This should never happen. Removing flag.",
      );
      delete response.heuristic;
    }
  }

  return response;
}

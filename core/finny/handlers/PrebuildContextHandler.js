export async function runPrebuildContextAction({
  finalUserId,
  shouldSuppressLogs,
  handlePrebuildContext,
}) {
  return handlePrebuildContext(finalUserId, shouldSuppressLogs);
}

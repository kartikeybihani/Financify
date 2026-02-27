export function buildMainAskMessages({ system, recentTurns = [], userMessage }) {
  const safeRecentTurns = Array.isArray(recentTurns) ? recentTurns : [];

  return [
    { role: "system", content: system ?? "" },
    ...safeRecentTurns,
    { role: "user", content: userMessage ?? "" },
  ];
}

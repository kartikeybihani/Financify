function indentBlock(text, prefix) {
  const safe = text === undefined || text === null ? "" : String(text);
  return safe
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function formatHeaderLine(label, meta = null) {
  const metaText = meta ? ` ${meta}` : "";
  return `\n=== ${label}${metaText} ===`;
}

function getMessageRole(m) {
  if (!m || typeof m !== "object") return "unknown";
  return typeof m.role === "string" ? m.role : "unknown";
}

function getMessageContent(m) {
  if (!m || typeof m !== "object") return "";
  return m.content === undefined || m.content === null ? "" : String(m.content);
}

export function shouldLogLLMPrompt() {
  const v = process.env.LOG_LLM_PROMPT;
  return v === "1" || v === "true";
}

export function buildMainAskMessages({ system, recentTurns = [], userMessage }) {
  const safeRecentTurns = Array.isArray(recentTurns) ? recentTurns : [];

  return [
    { role: "system", content: system ?? "" },
    ...safeRecentTurns,
    { role: "user", content: userMessage ?? "" },
  ];
}

export function formatMainAskPromptLog({
  model,
  systemBuild,
  recentTurns = [],
  userMessage,
}) {
  const layers = Array.isArray(systemBuild?.layers) ? systemBuild.layers : [];
  const system =
    systemBuild?.system === undefined || systemBuild?.system === null
      ? ""
      : String(systemBuild.system);

  const meta = systemBuild?.meta || {};
  const intent = meta?.intent?.intent || "unknown";
  const intentType = meta?.intent?.intent_type || "unknown";
  const decisionRisk = meta?.decisionRisk || "unknown";
  const strategies = Array.isArray(meta?.strategies) ? meta.strategies : [];
  const memoriesCount = Number.isFinite(meta?.memoriesCount)
    ? meta.memoriesCount
    : null;

  const lines = [];
  lines.push(
    `🧾 [LLM_PROMPT] Main ask (layered)${model ? ` | model=${model}` : ""}`,
  );
  lines.push(
    `meta: intent=${intent} (${intentType}), decisionRisk=${decisionRisk}, strategies=${strategies.length}${
      memoriesCount !== null ? `, memories=${memoriesCount}` : ""
    }`,
  );

  lines.push(
    formatHeaderLine(
      "SYSTEM",
      `(layers=${layers.length}, chars=${system.length})`,
    ),
  );

  if (layers.length > 0) {
    layers.forEach((layer, idx) => {
      const title = layer?.title || layer?.id || `Layer ${idx + 1}`;
      const content =
        layer?.content === undefined || layer?.content === null
          ? ""
          : String(layer.content);
      lines.push(
        `\n--- [SYSTEM L${idx + 1}/${layers.length}] ${title} (chars=${content.length}) ---`,
      );
      lines.push(indentBlock(content, "  "));
    });
  } else {
    lines.push(indentBlock(system, "  "));
  }

  const safeRecentTurns = Array.isArray(recentTurns) ? recentTurns : [];
  lines.push(
    formatHeaderLine(
      "RECENT_TURNS",
      `(messages=${safeRecentTurns.length})`,
    ),
  );
  safeRecentTurns.forEach((m, i) => {
    const role = getMessageRole(m);
    const content = getMessageContent(m);
    lines.push(`\n--- [TURN ${i + 1}/${safeRecentTurns.length}] role=${role} (chars=${content.length}) ---`);
    lines.push(indentBlock(content, "  "));
  });

  const safeUser = userMessage === undefined || userMessage === null ? "" : String(userMessage);
  lines.push(formatHeaderLine("USER", `(chars=${safeUser.length})`));
  lines.push(indentBlock(safeUser, "  "));

  return lines.join("\n");
}


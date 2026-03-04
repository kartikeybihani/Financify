// Archived on 2026-03-04.
// This file intentionally preserves the removed legacy Supermemory transcript
// and chat-feedback helpers for rollback/reference only.
// It must never be imported into production code.

function buildSupermemoryContent(
  userMessage,
  finnyResponse,
  userName = null,
  userId = null
) {
  const parts = [];

  const userIdentifier = userName
    ? userName
    : userId
    ? `User (${userId})`
    : "User";

  parts.push(`${userIdentifier} said: "${userMessage}"`);
  parts.push(
    `Finny responded: ${finnyResponse.substring(0, 2000)}${
      finnyResponse.length > 2000 ? "..." : ""
    }`
  );

  return parts.join("\n\n");
}

function buildSupermemoryMetadata(
  userId,
  userMessage,
  finnyResponse,
  additionalMetadata = {}
) {
  const tags = extractSupermemoryFinancialTags(userMessage);
  const contextType = determineSupermemoryContextType(userMessage);
  const financialRelevance =
    determineSupermemoryFinancialRelevance(userMessage);

  return {
    user_id: userId,
    timestamp: new Date().toISOString(),
    context_type: contextType,
    financial_relevance: financialRelevance,
    tags: tags,
    emotional_state: extractSupermemoryEmotionalState(userMessage),
    financial_impact: assessSupermemoryFinancialImpact(userMessage),
    ...additionalMetadata,
  };
}

function extractSupermemoryFinancialTags(message) {
  const tags = [];
  const lower = message.toLowerCase();

  const SUPERMEMORY_FINANCIAL_TAG_RULES = [
    {
      tag: "goal_mentioned",
      regex:
        /want|wanna|tryna|trying to|goal|plan|planning|dream|dreaming|target|save for|manifest/,
    },
    {
      tag: "travel_interest",
      regex:
        /travel|trip|vacation|vacay|getaway|japan|europe|visit|holiday|roadtrip|road trip|solo trip|backpack|backpacking|flight|flights|plane ticket/,
    },
    {
      tag: "purchase_interest",
      regex:
        /buy|purchase|cop|cop a|grab|acquire|pick up|upgrade|afford|macbook|laptop|phone|iphone|car|tesla|whip|ride|house|home|apartment|place of my own|down payment|dp on a house/,
    },
    {
      tag: "debt_concern",
      regex:
        /debt|loan|loans|student debt|student loans|credit card|cc debt|owe|pay off|payoff|in the red|collections|interest payments|minimum payment|min payment|maxed out|maxed/,
    },
    {
      tag: "savings_discussion",
      regex:
        /save|saving up|savings|stacking|stack cash|stack bread|stash|rainy day fund|emergency fund|emergency money|safety net|cushion/,
    },
    {
      tag: "investment_discussion",
      regex:
        /invest|investment|investing|stocks?|stock market|etf|index fund|index funds|portfolio|brokerage|retirement|401k|ira|roth|roth ira|crypto|bitcoin|btc|eth|ethereum|bag|long term hold|lt hold/,
    },
    {
      tag: "budget_discussion",
      regex:
        /budget|budgeting|spending|expense|expenses|spend|spending too much|overspend|overspending|broke|burning cash|living paycheck to paycheck|paycheck to paycheck|tight on money|tight on cash|cut back|cutting back/,
    },
    {
      tag: "income_discussion",
      regex:
        /salary|income|earn|earning|paycheck|pay check|pay day|payday|wage|hourly|raise|bonus|side hustle|side gig|freelance|freelancing|contracting|overtime|ot pay/,
    },
  ];

  SUPERMEMORY_FINANCIAL_TAG_RULES.forEach(({ tag, regex }) => {
    if (regex.test(lower)) {
      tags.push(tag);
    }
  });

  return tags;
}

function determineSupermemoryContextType(message) {
  const lower = message.toLowerCase();

  if (/goal|want|plan|dream|target/.test(lower)) return "goal";
  if (/debt|loan|owe|pay off/.test(lower)) return "constraint";
  if (/job|work|salary|income|raise|promotion/.test(lower)) return "life_event";
  if (/prefer|like|don't like|hate|love/.test(lower)) return "preference";
  if (/buy|purchase|afford|can i/.test(lower)) return "decision";

  return "general";
}

function determineSupermemoryFinancialRelevance(message) {
  const lower = message.toLowerCase();
  const highRelevance =
    /money|afford|budget|save|invest|debt|income|salary|spend|expense|goal|financial/.test(
      lower
    );
  return highRelevance ? "high" : "medium";
}

function extractSupermemoryEmotionalState(message) {
  const lower = message.toLowerCase();
  if (/stressed|worried|anxious|overwhelmed|scared|fear/.test(lower))
    return "anxious";
  if (/excited|happy|great|awesome|amazing|love/.test(lower)) return "excited";
  if (/confused|don't understand|unclear|unsure|don't know/.test(lower))
    return "confused";
  if (/confident|sure|certain|know|understand/.test(lower)) return "confident";
  return "neutral";
}

function assessSupermemoryFinancialImpact(message) {
  const hasAmounts = /\$[\d,]+/.test(message);
  const hasTimelines = /\d+\s*(month|year|week)/.test(message);
  const hasGoals = /goal|target|plan|want/.test(message.toLowerCase());

  if (hasAmounts && hasTimelines && hasGoals) return "high";
  if (hasAmounts || hasGoals) return "medium";
  return "low";
}

async function storeConversationMemory(
  userId,
  userMessage,
  finnyResponse,
  metadata = {}
) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, skipping memory storage"
    );
    return null;
  }

  if (!userId) {
    console.warn(
      "⚠️ [SUPERMEMORY] No userId provided, skipping memory storage"
    );
    return null;
  }

  if (
    metadata?.action === "prebuild_context" ||
    metadata?.skipStorage === true ||
    metadata?.intent === "prebuild_context"
  ) {
    console.log(
      "⏭️ [SUPERMEMORY] Skipping memory storage for prebuild_context action"
    );
    return null;
  }

  if (!userMessage || userMessage.trim() === "") {
    console.log(
      "⏭️ [SUPERMEMORY] Skipping memory storage - no user message provided"
    );
    return null;
  }

  const userName = metadata?.userName || metadata?.name || null;
  const memoryContent = buildSupermemoryContent(
    userMessage,
    finnyResponse,
    userName,
    userId
  );

  const memoryMetadata = buildSupermemoryMetadata(
    userId,
    userMessage,
    finnyResponse,
    metadata
  );

  const cleanedMetadata = Object.fromEntries(
    Object.entries(memoryMetadata).filter(([key, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "object" && !Array.isArray(value)) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );

  const requestBody = {
    content: memoryContent,
    metadata: cleanedMetadata,
    containerTags: [`user_${userId}`],
  };

  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY_MS = 1000;
  const MAX_RETRY_DELAY_MS = 8000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${SUPERMEMORY_BASE_URL}/v3/documents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        SUPERMEMORY_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        const errorMessage = `Supermemory API error: ${
          errorData.message || response.statusText
        } (${response.status})`;

        if (response.status >= 400 && response.status < 500) {
          throw new Error(errorMessage);
        }

        const retryableError = new Error(errorMessage);
        retryableError.isRetryable = true;
        retryableError.statusCode = response.status;
        throw retryableError;
      }

      const result = await response.json();
      console.log(
        `✅ [SUPERMEMORY] Stored memory for user ${userId}${
          attempt > 0
            ? ` (after ${attempt} retry${attempt > 1 ? "ies" : ""})`
            : ""
        }: ${result.id || "success"}`
      );

      await invalidateSupermemoryDocumentsCache(userId);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const isTimeout = error.message?.includes("timeout");
      const isServerError = error.statusCode >= 500 && error.statusCode < 600;
      const isRetryable =
        error.isRetryable ||
        isServerError ||
        isTimeout ||
        error.message?.includes("network") ||
        error.message?.includes("ECONNRESET") ||
        error.message?.includes("ETIMEDOUT");

      if (isLastAttempt || !isRetryable) {
        if (isPrebuildContextActive(userId)) {
          return null;
        }

        const isNetworkError =
          error.message?.includes("fetch failed") ||
          error.message?.includes("network") ||
          error.message?.includes("ECONNRESET") ||
          error.message?.includes("ETIMEDOUT");

        if (isNetworkError) {
          console.warn(
            `⚠️ [SUPERMEMORY] Memory storage failed${
              isLastAttempt ? ` (after ${MAX_RETRIES} retries)` : ""
            } (network error, likely from previous request):`,
            error.message
          );
        } else {
          console.error(
            `❌ [SUPERMEMORY] Error storing memory${
              isLastAttempt ? ` (after ${MAX_RETRIES} retries)` : ""
            }:`,
            error.message
          );
        }
        return null;
      }

      const baseDelay = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
        MAX_RETRY_DELAY_MS
      );
      const jitter = Math.random() * 0.3 * baseDelay;
      const delay = baseDelay + jitter;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

function extractResponseCharacteristics(finnyResponse, messageMetadata = {}) {
  if (!finnyResponse || typeof finnyResponse !== "string") {
    return {};
  }

  const response = finnyResponse.toLowerCase();
  const length = finnyResponse.length;
  const wordCount = finnyResponse.split(/\s+/).length;

  let messageLength = "medium";
  if (length < 200 || wordCount < 30) {
    messageLength = "short";
  } else if (length > 800 || wordCount > 120) {
    messageLength = "long";
  }

  const hasExamples =
    /for example|for instance|like when|such as|imagine|let's say|suppose/.test(
      response
    );
  const hasActionItems =
    /do this|try|set up|here's what|action|step|1\.|2\.|3\.|first|second|third/.test(
      response
    );
  const hasNumbers = /\$[\d,]+|[\d]+%|\d+\/\d+|\d+ months?|\d+ years?/.test(
    finnyResponse
  );

  let emotionalTone = "neutral";
  if (
    /great|awesome|amazing|excellent|fantastic|wonderful|love|excited/.test(
      response
    )
  ) {
    emotionalTone = "encouraging";
  } else if (
    /real|honest|truth|reality|actually|fact|numbers|data/.test(response)
  ) {
    emotionalTone = "matter_of_fact";
  } else if (
    /support|help|here for|with you|together|we'll|let's/.test(response)
  ) {
    emotionalTone = "supportive";
  }

  let responseStyle = "conversational";
  if (messageMetadata.finny_style) {
    responseStyle = messageMetadata.finny_style;
  } else {
    if (/here's|the answer|bottom line|facts|data|numbers/.test(response)) {
      responseStyle = "direct";
    } else if (/haha|lol|funny|joke|😄|😂|😅|humor|witty/.test(response)) {
      responseStyle = "witty";
    }
  }

  const topics = [];
  if (/save|saving|savings|emergency fund/.test(response)) {
    topics.push("savings");
  }
  if (/debt|loan|owe|pay off|credit card/.test(response)) {
    topics.push("debt");
  }
  if (/invest|investment|stocks|portfolio|retirement/.test(response)) {
    topics.push("investment");
  }
  if (/goal|target|plan|dream/.test(response)) {
    topics.push("goal_planning");
  }
  if (/budget|spending|expense|money management/.test(response)) {
    topics.push("budgeting");
  }
  if (topics.length === 0) {
    topics.push("general");
  }

  return {
    messageLength,
    hasExamples,
    hasActionItems,
    hasNumbers,
    emotionalTone,
    responseStyle,
    topics: topics.slice(0, 3),
    wordCount,
    characterCount: length,
  };
}

async function storeMessageFeedback(
  userId,
  messageId,
  feedbackType,
  finnyResponse,
  userMessage,
  messageMetadata = {},
  reportText = null
) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, skipping feedback storage"
    );
    return null;
  }

  if (!userId) {
    console.warn(
      "⚠️ [SUPERMEMORY] No userId provided, skipping feedback storage"
    );
    return null;
  }

  if (!finnyResponse || !userMessage) {
    console.warn(
      "⚠️ [SUPERMEMORY] Missing finnyResponse or userMessage, skipping feedback storage"
    );
    return null;
  }

  const characteristics = extractResponseCharacteristics(
    finnyResponse,
    messageMetadata
  );
  const userName = messageMetadata?.userName || messageMetadata?.name || null;
  const userIdentifier = userName
    ? userName
    : userId
    ? `User (${userId})`
    : "User";

  const contentParts = [];
  if (feedbackType === "positive") {
    contentParts.push(
      `${userIdentifier} liked Finny's response about ${characteristics.topics.join(
        ", "
      )}.`
    );
    contentParts.push(`Finny's response was: "${finnyResponse}"`);
    contentParts.push(`${userIdentifier}'s question was: "${userMessage}"`);
  } else {
    contentParts.push(
      `${userIdentifier} disliked Finny's response about ${characteristics.topics.join(
        ", "
      )}.`
    );
    contentParts.push(`Finny's response was: "${finnyResponse}"`);
    if (reportText) {
      contentParts.push(`${userIdentifier} reported: "${reportText}"`);
    }
    contentParts.push(`${userIdentifier}'s question was: "${userMessage}"`);
  }

  const memoryContent = contentParts.join("\n\n");
  const tags = ["response_preference", "style_learning", "feedback"];
  if (characteristics.topics.length > 0) {
    tags.push(...characteristics.topics.map((t) => `topic_${t}`));
  }
  if (feedbackType === "negative") {
    tags.push("negative_feedback");
  } else {
    tags.push("positive_feedback");
  }

  const metadata = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    memory_type: "message_feedback",
    feedback_type: feedbackType,
    message_id: messageId,
    source: "chat_feedback",
    response_style: characteristics.responseStyle,
    message_length: characteristics.messageLength,
    has_examples: characteristics.hasExamples,
    has_action_items: characteristics.hasActionItems,
    has_numbers: characteristics.hasNumbers,
    emotional_tone: characteristics.emotionalTone,
    topics: characteristics.topics,
    message_type: messageMetadata.messageType || "text",
    has_actions: messageMetadata.hasActions || false,
    has_goal_offer: messageMetadata.hasGoalOffer || false,
    tags: tags,
    financial_relevance: "medium",
    context_type: "preference",
  };

  const cleanedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "object" && !Array.isArray(value)) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );

  const requestBody = {
    content: memoryContent,
    metadata: cleanedMetadata,
    containerTags: [`user_${userId}`],
  };

  try {
    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v3/documents`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    const result = await response.json();
    await invalidateSupermemoryDocumentsCache(userId);
    return result;
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error storing feedback:`, error.message);
    return null;
  }
}

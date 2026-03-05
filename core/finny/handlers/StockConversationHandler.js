export async function runStockConversationAction({
  message,
  safeContext,
  sessionState,
  finalUserId,
  otherParams,
  timings,
  wantsStreaming,
  res,
  handleAsk,
  mergeSessionState,
  logError,
}) {
  const stockFlow = sessionState?.stock_flow;
  let response;

  if (message === "confirm_stock") {
    if (!stockFlow?.ticker) {
      return {
        message:
          "I couldn't find a ticker to analyze. Please tell me which stock you want.",
        type: "assistant",
      };
    }

    const stockContext = {
      ...safeContext,
      skip_stock_confirmation: true,
      stock_override: { ticker: stockFlow.ticker },
    };

    try {
      response = await handleAsk(
        stockFlow.original_message || `${stockFlow.ticker} stock`,
        stockContext,
        "ask_personalized",
        null,
        timings,
        wantsStreaming,
        wantsStreaming ? res : null,
      );

      console.log(
        "🔍 [CONFIRM_STOCK] Response received from handleAsk:",
        typeof response,
        response?.hideActions,
        response?.hideFeedback,
      );

      if (response && typeof response === "object") {
        response.hideActions = true;
        response.hideFeedback = false;
        response.actions = [];

        console.log(
          `✅ [CONFIRM_STOCK] Response flags set - hideActions: ${response.hideActions}, hideFeedback: ${response.hideFeedback}`,
        );
      } else {
        response = {
          message: response || "Stock analysis completed",
          type: "assistant",
          hideActions: true,
          hideFeedback: false,
          actions: [],
        };
        console.log(
          `✅ [CONFIRM_STOCK] Wrapped response with flags - hideActions: ${response.hideActions}, hideFeedback: ${response.hideFeedback}`,
        );
      }

      mergeSessionState(finalUserId, { stock_flow: null });
    } catch (error) {
      logError("❌ [STOCK] Error during stock analysis:", error);
      response = {
        message: "Something went wrong analyzing the stock. Please try again.",
        type: "assistant",
        stock_candidate: { ticker: stockFlow.ticker },
        hideFeedback: true,
        actions: [
          {
            label: "Retry",
            action: "confirm_stock",
            style: "primary",
          },
          {
            label: "Change Ticker",
            action: "change_stock",
            style: "secondary",
          },
        ],
      };
    }

    return response;
  }

  if (message === "update_stock_ticker") {
    const rawTicker = otherParams?.ticker || otherParams?.stock_ticker;
    if (!rawTicker || typeof rawTicker !== "string") {
      return {
        message: "Please provide a valid ticker symbol.",
        type: "assistant",
        intent: "ask_personalized",
      };
    }

    const updatedTicker = rawTicker.toUpperCase().trim().slice(0, 5);
    if (!/^[A-Z]{1,5}$/.test(updatedTicker)) {
      return {
        message:
          "That doesn't look like a valid ticker. Please enter 1-5 letters.",
        type: "assistant",
        intent: "ask_personalized",
        actions: [
          {
            label: "Change Ticker",
            action: "change_stock",
            style: "secondary",
          },
        ],
      };
    }

    const updatedFlow = {
      active: true,
      ticker: updatedTicker,
      original_message: stockFlow?.original_message || null,
      stage: "awaiting_confirmation",
      entities: [updatedTicker],
      source: "manual",
    };

    mergeSessionState(finalUserId, { stock_flow: updatedFlow });

    return {
      message: `I found **${updatedTicker}**. Would you like me to analyze this stock?`,
      type: "assistant",
      intent: "ask_personalized",
      stock_candidate: { ticker: updatedTicker },
      hideFeedback: true,
      hideActions: false,
      actions: [
        {
          label: "Yes",
          action: "confirm_stock",
          style: "primary",
        },
        {
          label: "Change Ticker",
          action: "change_stock",
          style: "secondary",
        },
      ],
    };
  }

  return {
    message: "I can analyze a specific stock if you share a ticker symbol.",
    type: "assistant",
  };
}

export async function runGoalConversationAction({
  message,
  safeContext,
  finalUserId,
  handleGoalConversation,
  handleGoalCreation,
  mergeSessionState,
  logError,
  responseHasVisibleContent,
}) {
  let response;

  if (message === "cancel_goal") {
    response = {
      message: "No worries! Let me know if you have any other questions. 😊",
      type: "assistant",
      intent: "goal_conversation",
      goal_flow: { active: false },
    };
  } else if (message === "start_over_goal") {
    response = {
      message: "Sure! Let's start over. What goal would you like to create?",
      type: "assistant",
      intent: "goal_conversation",
      goal_flow: { active: false },
    };
  } else if (message === "skip_category") {
    const currentFlow = safeContext?.session?.goal_flow;
    if (currentFlow && currentFlow.slots) {
      const updatedSlots = { ...currentFlow.slots, category: "other" };
      const goalContext = {
        ...safeContext,
        goal_flow: { ...currentFlow, slots: updatedSlots },
      };

      response = await handleGoalCreation(
        { extracted: updatedSlots },
        goalContext,
        message,
      );
    } else {
      response = {
        message: "I couldn't find your goal details. Let's start over.",
        type: "assistant",
        intent: "goal_conversation",
        goal_flow: { active: false },
      };
    }
  } else if (message === "confirm_create_goal") {
    const currentFlow = safeContext?.session?.goal_flow;
    if (currentFlow && currentFlow.slots && currentFlow.analysis) {
      const { createGoalFromSlots } = await import("../../../api/goals.js");
      response = await createGoalFromSlots(
        currentFlow.slots,
        safeContext,
        currentFlow.analysis,
        false,
      );
    } else {
      response = {
        message: "I couldn't find your goal details. Let's start over.",
        type: "assistant",
        intent: "goal_conversation",
        goal_flow: { active: false },
      };
    }
  } else if (message === "edit_goal") {
    response = {
      message: "Sure! Let's edit your goal details. What would you like to change?",
      type: "assistant",
      intent: "goal_conversation",
      goal_flow: { active: false },
    };
  } else {
    const goalContext = safeContext?.session?.goal_flow
      ? { ...safeContext, goal_flow: safeContext.session.goal_flow }
      : safeContext;

    try {
      response = await handleGoalConversation(message, goalContext);
    } catch (goalError) {
      logError("❌ [GOAL] Goal conversation failed:", goalError);
      response = {
        message:
          "Sorry — I hit an issue while updating your goal. Please try again.",
        type: "assistant",
        intent: "goal_conversation",
        hideActions: true,
        goal_flow: { active: false },
      };
    }
  }

  if (!responseHasVisibleContent(response)) {
    response = {
      message: "Sorry — I didn't get a full reply for your goal. Please try again.",
      type: "assistant",
      intent: "goal_conversation",
      hideActions: true,
      goal_flow: { active: false },
    };
  }

  if (response?.goal_flow) {
    mergeSessionState(finalUserId, { goal_flow: response.goal_flow });
  } else if (
    safeContext?.session?.goal_flow &&
    response?.intent === "goal_conversation"
  ) {
    const goalFlow = safeContext.session.goal_flow;
    if (goalFlow && goalFlow.active === false) {
      mergeSessionState(finalUserId, { goal_flow: null });
    }
  }

  return response;
}

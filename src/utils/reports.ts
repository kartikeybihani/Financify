import { supabase } from "@/src/lib/supabase/supabase";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

interface SubmitChatMessageReportParams {
  reportText: string;
  messageId: string;
  messageContent: string;
  messageSender: "user" | "finny";
  chatSessionId?: string | null;
  messageMetadata?: Record<string, any>;
}

interface SubmitGeneralFeedbackParams {
  reportText: string;
  userName?: string;
  additionalContext?: Record<string, any>;
}

/**
 * Get device and app context for reports
 */
function getAdditionalContext(): Record<string, any> {
  return {
    app_version: Constants.expoConfig?.version || "unknown",
    platform: Platform.OS,
    device_model: Device.modelName || "unknown",
    device_brand: Device.brand || "unknown",
    device_os_version: Device.osVersion || "unknown",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Submit a chat message report
 */
export async function submitChatMessageReport({
  reportText,
  messageId,
  messageContent,
  messageSender,
  chatSessionId,
  messageMetadata = {},
}: SubmitChatMessageReportParams): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const additionalContext = {
      ...getAdditionalContext(),
      ...messageMetadata,
    };

    const { error } = await supabase.from("reports").insert({
      user_id: user.id,
      report_type: "chat_message",
      chat_session_id: chatSessionId || null,
      reported_message_id: messageId,
      reported_message_content: messageContent,
      reported_message_sender: messageSender,
      reported_message_metadata: messageMetadata,
      report_text: reportText,
      additional_context: additionalContext,
      status: "pending",
    });

    if (error) {
      console.error("Error submitting chat message report:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Exception submitting chat message report:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

/**
 * Submit general feedback/report
 */
export async function submitGeneralFeedback({
  reportText,
  userName,
  additionalContext = {},
}: SubmitGeneralFeedbackParams): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const context = {
      ...getAdditionalContext(),
      user_name: userName,
      ...additionalContext,
    };

    const { error } = await supabase.from("reports").insert({
      user_id: user.id,
      report_type: "general_feedback",
      report_text: reportText,
      additional_context: context,
      status: "pending",
    });

    if (error) {
      console.error("Error submitting general feedback:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Exception submitting general feedback:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

interface SubmitLoveItParams {
  messageId: string;
  messageContent: string;
  messageSender: "user" | "finny";
  chatSessionId?: string | null;
  messageMetadata?: Record<string, any>;
}

/**
 * Submit thumbs up / love it feedback for a chat message
 */
export async function submitLoveIt({
  messageId,
  messageContent,
  messageSender,
  chatSessionId,
  messageMetadata = {},
}: SubmitLoveItParams): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const additionalContext = {
      ...getAdditionalContext(),
      ...messageMetadata,
    };

    const { error } = await supabase.from("reports").insert({
      user_id: user.id,
      report_type: "love_it",
      chat_session_id: chatSessionId || null,
      reported_message_id: messageId,
      reported_message_content: messageContent,
      reported_message_sender: messageSender,
      reported_message_metadata: messageMetadata,
      report_text: null, // love_it doesn't require report text
      additional_context: additionalContext,
      status: "pending",
    });

    if (error) {
      console.error("Error submitting love it feedback:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Exception submitting love it feedback:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}


/**
 * Plaid Link Analytics - Track Link events for conversion analytics
 * Logs events to Supabase plaid_link_events table
 */

import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import type { LinkEvent, LinkExit, LinkSuccessMetadata } from "react-native-plaid-link-sdk";

export interface LinkEventLog {
  user_id: string;
  link_session_id: string;
  event_name: string;
  event_type?: string;
  institution_id?: string;
  institution_name?: string;
  view_name?: string;
  error_code?: string;
  error_type?: string;
  error_message?: string;
  status?: string;
  request_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Log a Plaid Link event to Supabase
 */
export async function logLinkEvent(eventLog: LinkEventLog): Promise<void> {
  try {
    const { error } = await supabase.from("plaid_link_events").insert({
      user_id: eventLog.user_id,
      link_session_id: eventLog.link_session_id,
      event_name: eventLog.event_name,
      event_type: eventLog.event_type,
      institution_id: eventLog.institution_id,
      institution_name: eventLog.institution_name,
      view_name: eventLog.view_name,
      error_code: eventLog.error_code,
      error_type: eventLog.error_type,
      error_message: eventLog.error_message,
      status: eventLog.status,
      request_id: eventLog.request_id,
      metadata: eventLog.metadata || {},
      timestamp: new Date().toISOString(),
    });

    if (error) {
      logger.error("❌ Failed to log Link event:", error);
      // Don't throw - analytics failures shouldn't break the flow
    } else {
      logger.debug(`📊 Logged Link event: ${eventLog.event_name}`, {
        session: eventLog.link_session_id,
        institution: eventLog.institution_name,
      });
    }
  } catch (error) {
    logger.error("❌ Error logging Link event:", error);
    // Don't throw - analytics failures shouldn't break the flow
  }
}

/**
 * Log a Plaid Link onEvent callback event
 */
export async function logLinkEventCallback(
  userId: string,
  event: LinkEvent
): Promise<void> {
  // Validate required fields
  if (!userId || !event?.metadata?.linkSessionId) {
    logger.warn("⚠️ Skipping Link event log - missing required fields", {
      hasUserId: !!userId,
      hasLinkSessionId: !!event?.metadata?.linkSessionId,
    });
    return;
  }

  const eventLog: LinkEventLog = {
    user_id: userId,
    link_session_id: event.metadata.linkSessionId,
    event_name: event.eventName,
    event_type: "event",
    institution_id: event.metadata.institutionId,
    institution_name: event.metadata.institutionName,
    view_name: event.metadata.viewName,
    error_code: event.metadata.errorCode,
    error_type: event.metadata.errorType,
    error_message: event.metadata.errorMessage,
    request_id: event.metadata.requestId,
    metadata: {
      accountNumberMask: event.metadata.accountNumberMask,
      mfaType: event.metadata.mfaType,
      exitStatus: event.metadata.exitStatus,
      institutionSearchQuery: event.metadata.institutionSearchQuery,
      isUpdateMode: event.metadata.isUpdateMode,
      matchReason: event.metadata.matchReason,
      issueId: event.metadata.issueId,
      issueDescription: event.metadata.issueDescription,
      issueDetectedAt: event.metadata.issueDetectedAt,
      selection: event.metadata.selection,
      timestamp: event.metadata.timestamp,
      raw_metadata_json: event.metadata.metadata_json,
    },
  };

  await logLinkEvent(eventLog);
}

/**
 * Log a Plaid Link onExit callback event
 */
export async function logLinkExitEvent(
  userId: string,
  exit: LinkExit
): Promise<void> {
  // Validate required fields
  if (!userId || !exit?.metadata?.linkSessionId) {
    logger.warn("⚠️ Skipping EXIT event log - missing required fields", {
      hasUserId: !!userId,
      hasLinkSessionId: !!exit?.metadata?.linkSessionId,
    });
    return;
  }

  const eventLog: LinkEventLog = {
    user_id: userId,
    link_session_id: exit.metadata.linkSessionId,
    event_name: "EXIT",
    event_type: "exit",
    institution_id: exit.metadata.institution?.id,
    institution_name: exit.metadata.institution?.name,
    status: exit.metadata.status,
    request_id: exit.metadata.requestId,
    error_code: exit.error?.errorCode,
    error_type: exit.error?.errorType,
    error_message: exit.error?.errorMessage || exit.error?.displayMessage,
    metadata: {
      raw_metadata_json: exit.metadata.metadataJson,
      error_json: exit.error?.errorJson,
    },
  };

  await logLinkEvent(eventLog);
}

/**
 * Log a Plaid Link onSuccess callback (HANDOFF event)
 */
export async function logLinkSuccessEvent(
  userId: string,
  metadata: LinkSuccessMetadata
): Promise<void> {
  // Validate required fields
  if (!userId || !metadata?.linkSessionId) {
    logger.warn("⚠️ Skipping HANDOFF event log - missing required fields", {
      hasUserId: !!userId,
      hasLinkSessionId: !!metadata?.linkSessionId,
    });
    return;
  }

  const eventLog: LinkEventLog = {
    user_id: userId,
    link_session_id: metadata.linkSessionId,
    event_name: "HANDOFF",
    event_type: "success",
    institution_id: metadata.institution?.id,
    institution_name: metadata.institution?.name,
    metadata: {
      account_count: metadata.accounts?.length || 0,
      accounts: metadata.accounts?.map((acc) => ({
        id: acc.id,
        name: acc.name,
        mask: acc.mask,
        type: acc.type,
      })),
      raw_metadata_json: metadata.metadataJson,
    },
  };

  await logLinkEvent(eventLog);
}

/**
 * Get conversion metrics for a time period
 * Returns: { total_sessions, successful_connections, conversion_rate }
 */
export async function getLinkConversionMetrics(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  total_sessions: number;
  successful_connections: number;
  conversion_rate: number;
  failed_sessions: number;
}> {
  try {
    let query = supabase
      .from("plaid_link_events")
      .select("link_session_id, event_name")
      .eq("user_id", userId);

    if (startDate) {
      query = query.gte("timestamp", startDate.toISOString());
    }
    if (endDate) {
      query = query.lte("timestamp", endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    // Get unique sessions (based on link_session_id)
    const uniqueSessions = new Set<string>();
    const successfulSessions = new Set<string>();
    const failedSessions = new Set<string>();

    data?.forEach((event) => {
      uniqueSessions.add(event.link_session_id);
      if (event.event_name === "HANDOFF") {
        successfulSessions.add(event.link_session_id);
      }
      if (event.event_name === "EXIT" && !successfulSessions.has(event.link_session_id)) {
        failedSessions.add(event.link_session_id);
      }
    });

    const totalSessions = uniqueSessions.size;
    const successful = successfulSessions.size;
    const failed = failedSessions.size;
    const conversionRate = totalSessions > 0 ? (successful / totalSessions) * 100 : 0;

    return {
      total_sessions: totalSessions,
      successful_connections: successful,
      conversion_rate: conversionRate,
      failed_sessions: failed,
    };
  } catch (error) {
    logger.error("❌ Error getting conversion metrics:", error);
    return {
      total_sessions: 0,
      successful_connections: 0,
      conversion_rate: 0,
      failed_sessions: 0,
    };
  }
}



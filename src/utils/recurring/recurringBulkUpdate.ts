// Utility functions for bulk updating recurring status across similar transactions
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { clearRecurringCache } from "@/src/shared/utils/recurringCache";
import { clearTransactionsCache } from "@/src/shared/utils/transactionCache";
import { DeviceEventEmitter } from "react-native";

export interface SimilarTransactionMatch {
  merchant_name?: string | null;
  name?: string | null;
  recurring_stream_id?: string | null; // Priority: Use this first if available
}

/**
 * Find all similar transactions by merchant_name or name
 * Priority: merchant_name > name
 */
export async function findSimilarTransactions(
  userId: string,
  transaction: SimilarTransactionMatch
): Promise<string[]> {
  try {
    if (!userId || (!transaction.merchant_name && !transaction.name)) {
      logger.warn("❌ [RECURRING BULK] Cannot find similar transactions without merchant_name or name");
      return [];
    }

    // Build query to find similar transactions
    let query = supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId);

    // Priority: merchant_name first, then name
    if (transaction.merchant_name && transaction.merchant_name.trim() !== "") {
      query = query.eq("merchant_name", transaction.merchant_name);
    } else if (transaction.name && transaction.name.trim() !== "") {
      query = query.eq("name", transaction.name);
    } else {
      return [];
    }

    const { data, error } = await query;

    if (error) {
      logger.error("❌ [RECURRING BULK] Error finding similar transactions:", error);
      return [];
    }

    const transactionIds = (data || []).map((tx) => tx.id);
    logger.info(`✅ [RECURRING BULK] Found ${transactionIds.length} similar transactions`);
    return transactionIds;
  } catch (error) {
    logger.error("❌ [RECURRING BULK] Error in findSimilarTransactions:", error);
    return [];
  }
}

/**
 * Find transactions by recurring_stream_id (priority method)
 */
async function findTransactionsByStreamId(
  userId: string,
  recurring_stream_id: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("recurring_stream_id", recurring_stream_id);

    if (error) {
      logger.error("❌ [RECURRING BULK] Error finding transactions by stream ID:", error);
      return [];
    }

    const transactionIds = (data || []).map((tx) => tx.id);
    logger.info(`✅ [RECURRING BULK] Found ${transactionIds.length} transactions with stream_id: ${recurring_stream_id}`);
    return transactionIds;
  } catch (error) {
    logger.error("❌ [RECURRING BULK] Error in findTransactionsByStreamId:", error);
    return [];
  }
}

/**
 * Bulk update recurring status for similar transactions
 * @param userId - User ID
 * @param transaction - Transaction to match against (recurring_stream_id takes priority, then merchant_name or name)
 * @param isRecurring - New recurring status ('yes' or 'no')
 * @param clearRecurringStreamId - Whether to clear recurring_stream_id (default: true when removing)
 */
export async function bulkUpdateRecurringStatus(
  userId: string,
  transaction: SimilarTransactionMatch,
  isRecurring: "yes" | "no",
  clearRecurringStreamId: boolean = isRecurring === "no"
): Promise<{ updated: number; transactionIds: string[] }> {
  try {
    let similarTransactionIds: string[] = [];

    // Priority 1: If recurring_stream_id is provided, use it to find transactions
    if (transaction.recurring_stream_id && transaction.recurring_stream_id.trim() !== "") {
      similarTransactionIds = await findTransactionsByStreamId(userId, transaction.recurring_stream_id);
      logger.info(`🔍 [RECURRING BULK] Using recurring_stream_id matching: ${transaction.recurring_stream_id}`);
    }

    // Priority 2: Fall back to name/merchant_name matching if no stream_id or no transactions found
    if (similarTransactionIds.length === 0) {
      similarTransactionIds = await findSimilarTransactions(userId, transaction);
      logger.info(`🔍 [RECURRING BULK] Using name/merchant_name matching (fallback)`);
    }

    if (similarTransactionIds.length === 0) {
      logger.warn("⚠️ [RECURRING BULK] No similar transactions found");
      return { updated: 0, transactionIds: [] };
    }

    // Build update object
    const updateData: any = {
      if_recurring: isRecurring,
    };

    // Clear recurring_stream_id if removing recurring status
    // (User-marked recurring transactions shouldn't have a stream_id)
    if (clearRecurringStreamId) {
      updateData.recurring_stream_id = null;
    }

    // Bulk update all similar transactions
    const { data, error } = await supabase
      .from("transactions")
      .update(updateData)
      .in("id", similarTransactionIds)
      .select("id");

    if (error) {
      logger.error("❌ [RECURRING BULK] Error updating transactions:", error);
      throw error;
    }

    const updatedCount = data?.length || 0;
    const updatedIds = (data || []).map((tx) => tx.id);

    logger.info(
      `✅ [RECURRING BULK] Updated ${updatedCount} transactions to if_recurring='${isRecurring}'`
    );

    // Clear caches
    await Promise.all([
      clearRecurringCache(userId),
      clearTransactionsCache(userId),
    ]);

    // Emit events for each updated transaction
    updatedIds.forEach((txId) => {
      DeviceEventEmitter.emit("transactionRecurringUpdated", {
        transactionId: txId,
        isRecurring: isRecurring === "yes",
      });
    });

    // Emit a bulk update event for components that need to refresh
    DeviceEventEmitter.emit("recurringBulkUpdate", {
      transactionIds: updatedIds,
      isRecurring: isRecurring === "yes",
      count: updatedCount,
    });

    return { updated: updatedCount, transactionIds: updatedIds };
  } catch (error) {
    logger.error("❌ [RECURRING BULK] Error in bulkUpdateRecurringStatus:", error);
    throw error;
  }
}

/**
 * Mark a Plaid recurring stream as user-dismissed.
 * Hides it from the Recurring section and prevents future syncs from re-applying recurring status.
 * Only applies to Plaid streams (stream_id in recurring_streams), not user-marked pseudo-streams.
 */
export async function dismissRecurringStream(
  userId: string,
  streamId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userId || !streamId || streamId.startsWith("user-marked-")) {
      return { success: false, error: "Invalid stream or user-marked streams cannot be dismissed" };
    }

    const { error } = await supabase
      .from("recurring_streams")
      .update({ user_dismissed: true, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("stream_id", streamId);

    if (error) {
      logger.error("❌ [RECURRING] Error dismissing stream:", error);
      return { success: false, error: error.message };
    }

    logger.info(`✅ [RECURRING] Dismissed stream: ${streamId}`);
    await clearRecurringCache(userId);
    DeviceEventEmitter.emit("recurringBulkUpdate", { streamDismissed: streamId });

    return { success: true };
  } catch (err) {
    logger.error("❌ [RECURRING] Error in dismissRecurringStream:", err);
    return { success: false, error: String(err) };
  }
}

// Default export for Expo Router compatibility
export default {
  findSimilarTransactions,
  bulkUpdateRecurringStatus,
  dismissRecurringStream,
};

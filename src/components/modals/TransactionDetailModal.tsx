import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Modal,
  Alert,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useCategories } from "@/src/hooks/useCategories";
import { supabase } from "@/src/lib/supabase/supabase";
import { DeviceEventEmitter } from "react-native";
import CategorySelectorModal from "@/src/components/modals/CategorySelectorModal";
import AccountDetailModal from "@/src/components/modals/AccountDetailModal";
import AccountCard from "@/src/components/shared/AccountCard";
import TransactionActionAlert from "@/src/components/shared/TransactionActionAlert";
import { Transaction, TransactionDetailModalProps } from "@/src/types/plaid";
import { OptimisticUpdateManager } from "@/src/shared/utils/optimisticUpdates";
import {
  getDisplayCategory as getDisplayCategoryUtil,
  shouldShowRecurringChip,
} from "@/src/utils/categories/transactionCategory";
import { bulkUpdateRecurringStatus } from "@/src/utils/recurring/recurringBulkUpdate";
import { generateUUID } from "@/src/utils/core/uuid";

const getCategoryBackgroundColorForName = (categoryName: string): string => {
  const map: { [key: string]: string } = {
    Payment: "#e8f5e8",
    Transfer: "#e8f5e8",
    Deposit: "#e8f4fd",
    Income: "#e8f4fd",
    "Food and Drink": "#fff3e0",
    Shops: "#f3e5f5",
    Recreation: "#ffebee",
    Transportation: "#e0f2f1",
    Travel: "#e1f5fe",
    Healthcare: "#f9fbe7",
    Service: "#fce4ec",
    Community: "#e8f5e8",
    "Government and Non-Profit": "#e3f2fd",
    Other: "#f5f5f5",
  };

  if (map[categoryName]) return map[categoryName];
  const name = categoryName.toLowerCase();
  if (
    name.includes("food") ||
    name.includes("restaurant") ||
    name.includes("dining")
  )
    return "#fff3e0";
  if (
    name.includes("shop") ||
    name.includes("retail") ||
    name.includes("store")
  )
    return "#f3e5f5";
  if (
    name.includes("transport") ||
    name.includes("car") ||
    name.includes("gas")
  )
    return "#e0f2f1";
  if (name.includes("health") || name.includes("medical")) return "#f9fbe7";
  if (name.includes("travel") || name.includes("hotel")) return "#e1f5fe";
  if (name.includes("entertainment") || name.includes("recreation"))
    return "#ffebee";
  if (name.includes("payment") || name.includes("transfer")) return "#e8f5e8";
  if (
    name.includes("income") ||
    name.includes("deposit") ||
    name.includes("salary")
  )
    return "#e8f4fd";
  return "#f8f9fa";
};

// Helper function to get the display category with local override support
// This wraps the utility function to handle the modal's temporary category updates
const getDisplayCategory = (
  updatedCategory: string | null | undefined,
  transaction: Transaction | null
): string => {
  if (!transaction) return "Other";

  // If there's a local override (updatedCategory), create a temporary transaction object
  // Otherwise, use the utility function directly
  if (updatedCategory !== undefined && updatedCategory !== null) {
    // Create a temporary transaction with the updated category for the utility function
    const tempTransaction: Transaction = {
      ...transaction,
      new_category: updatedCategory,
    };
    return getDisplayCategoryUtil(tempTransaction);
  }

  // Use the utility function with the original transaction
  return getDisplayCategoryUtil(transaction);
};

export default function TransactionDetailModal({
  visible,
  transactionId,
  transaction: initialTransaction,
  onClose,
}: TransactionDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [updatedCategory, setUpdatedCategory] = useState<
    string | null | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [isInternalTransfer, setIsInternalTransfer] = useState<boolean>(false);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [showTransactionActionAlert, setShowTransactionActionAlert] =
    useState(false);

  // Account Detail Modal state
  const [showAccountDetailModal, setShowAccountDetailModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [selectedAccountData, setSelectedAccountData] = useState<any>(null);
  const [selectedAccountPerformance, setSelectedAccountPerformance] =
    useState<any>(null);
  const [accountDataLoading, setAccountDataLoading] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  // Fetch user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
        }
      } catch (error) {
        console.error("Error fetching user ID:", error);
      }
    };
    fetchUserId();
  }, []);

  const {
    categories,
    getCategoryIcon,
    getCategoryColor,
    formatCategoryName: formatCategoryFromHook,
  } = useCategories(userId);

  // Responsive layout flags
  const isLandscape = width > height;
  const isSmallPhone = height < 700;
  const isTallPhone = height >= 840;

  // Load transaction data - use passed data or fallback to database call
  useEffect(() => {
    const loadTransaction = async () => {
      if (!transactionId || !visible) return;

      // If we have transaction data passed as prop, use it immediately
      if (initialTransaction && initialTransaction.id === transactionId) {
        setLoading(false);
        // Apply optimistic updates if any
        const updatedTransaction =
          OptimisticUpdateManager.applyCategoryUpdateToTransaction(
            initialTransaction
          );
        setTransaction(updatedTransaction);
        setIsInternalTransfer(
          updatedTransaction.new_category === "INTERNAL_TRANSFER"
        );
        setIsRecurring(shouldShowRecurringChip(updatedTransaction));
        return;
      }

      // Fallback to database call if no transaction data provided
      try {
        setLoading(true);
        setTransaction(null);

        const { data, error } = await supabase
          .from("transactions")
          .select(
            `
            *,
            accounts:account_id (
              name,
              mask,
              type,
              subtype,
              item_id,
              user_items:item_id (
                institution_name
              )
            ),
            recurring_streams:recurring_stream_id (
              stream_id,
              stream_type,
              is_active
            ),
            categories:category_id (
              id,
              name,
              slug,
              icon,
              color
            ),
            goal:linked_goal_id (
              label
            )
          `
          )
          .eq("id", transactionId)
          .single();

        if (error) throw error;

        if (visible && transactionId === data?.id) {
          const transformedTransaction = {
            ...data,
            account_name: data.accounts?.name || "Unknown Account",
            account_type: data.accounts?.type || "depository",
            account_subtype: data.accounts?.subtype || null,
            institution_name:
              data.accounts?.user_items?.institution_name ||
              "Unknown Institution",
            account_mask: data.accounts?.mask,
            goal_label: data.goal?.label || null,
          };

          // Apply optimistic updates if any
          const updatedTransaction =
            OptimisticUpdateManager.applyCategoryUpdateToTransaction(
              transformedTransaction
            );
          setTransaction(updatedTransaction);
          setIsInternalTransfer(
            updatedTransaction.new_category === "INTERNAL_TRANSFER"
          );
          setIsRecurring(shouldShowRecurringChip(updatedTransaction));
        }
      } catch (error) {
        console.error("Error loading transaction:", error);
        if (visible) {
          setTransaction(null);
        }
      } finally {
        if (visible) {
          setLoading(false);
        }
      }
    };

    if (visible && transactionId) {
      loadTransaction();
    }
  }, [transactionId, visible, initialTransaction]);

  // Listen for category updates
  useEffect(() => {
    const categorySubscription = DeviceEventEmitter.addListener(
      "transactionCategoryUpdated",
      (data) => {
        const isCurrentTransaction =
          data.transactionId === transaction?.id ||
          (data.affectedTransactions &&
            data.affectedTransactions.some(
              (affected: any) => affected.transactionId === transaction?.id
            ));

        if (isCurrentTransaction && transaction?.id) {
          setUpdatedCategory(data.newCategory);

          // Apply optimistic update to transaction object immediately
          const optimisticUpdate = OptimisticUpdateManager.getCategoryUpdate(
            transaction.id
          );
          if (optimisticUpdate) {
            const updatedTransaction =
              OptimisticUpdateManager.applyCategoryUpdateToTransaction(
                transaction
              );
            setTransaction(updatedTransaction);
          }

          // Close the CategorySelectorModal first
          setShowCategorySelector(false);

          // Close the TransactionDetailModal immediately so it can unmount
          handleClose();

          // Emit event to open review modal only after detail modal has had time to close
          // (avoids overlay blocking the review modal / button)
          setTimeout(() => {
            DeviceEventEmitter.emit("openTransactionReviewModal");
          }, 550);
        }
      }
    );

    const recurringSubscription = DeviceEventEmitter.addListener(
      "transactionRecurringUpdated",
      (data) => {
        if (data.transactionId === transaction?.id) {
          setIsRecurring(data.isRecurring);
        }
      }
    );

    return () => {
      categorySubscription.remove();
      recurringSubscription.remove();
    };
  }, [transaction?.id]);

  // Reset modal state when it becomes invisible
  useEffect(() => {
    if (!visible) {
      setTransaction(null);
      setUpdatedCategory(undefined);
      setIsInternalTransfer(false);
      setIsRecurring(false);
      setLoading(true);
      setShowCategorySelector(false);
      setShowTransactionActionAlert(false);
      setShowAccountDetailModal(false);
      setSelectedAccountId(null);
      setSelectedAccountData(null);
      setAccountDataLoading(false);
    }
  }, [visible]);

  const handleClose = () => {
    // Reset state immediately without delay to prevent race conditions
    setTransaction(null);
    setUpdatedCategory(null);
    setIsInternalTransfer(false);
    setIsRecurring(false);
    setLoading(true);
    setShowCategorySelector(false);
    setShowTransactionActionAlert(false);
    setShowAccountDetailModal(false);
    setSelectedAccountId(null);
    setSelectedAccountData(null);
    setAccountDataLoading(false);
    onClose();
  };

  const handleCategoryPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCategorySelector(true);
  };

  // Fetch real investment performance data from Supabase
  const getInvestmentPerformance = async (account: any) => {
    if (account?.type !== "investment") return null;

    try {
      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        console.log("No authenticated user found");
        return null;
      }

      // First, get the snaptrade connection for this account
      const { data: connection, error: connectionError } = await supabase
        .from("snaptrade_connections")
        .select("snaptrade_user_id, account_id")
        .eq("user_id", user.id)
        .eq("account_id", account.account_id)
        .eq("is_active", true)
        .single();

      if (connectionError || !connection) {
        console.log(
          "No Snaptrade connection found for account:",
          account.account_id
        );
        return null;
      }

      // Fetch the latest investment balance data
      const { data: balanceData, error: balanceError } = await supabase
        .from("investment_balances")
        .select(
          "day_change, day_change_percent, total_change, total_change_percent, total_value"
        )
        .eq("user_id", user.id)
        .eq("snaptrade_user_id", connection.snaptrade_user_id)
        .eq("account_id", connection.account_id)
        .eq("is_current", true)
        .single();

      if (balanceError || !balanceData) {
        console.log(
          "No investment balance data found for account:",
          account.account_id
        );
        return null;
      }

      return {
        todayPerformance: {
          amount: balanceData.day_change || 0,
          percentage: balanceData.day_change_percent || 0,
        },
        totalPerformance: {
          amount: balanceData.total_change || 0,
          percentage: balanceData.total_change_percent || 0,
        },
      };
    } catch (error) {
      console.error("Error fetching investment performance:", error);
      return null;
    }
  };

  const handleAccountPress = async () => {
    if (transaction?.account_id) {
      setSelectedAccountId(transaction.account_id);
      setShowAccountDetailModal(true);
      setAccountDataLoading(true);

      // Fetch full account data from database
      try {
        const { data: accountData, error } = await supabase
          .from("accounts")
          .select(
            `
            *,
            user_items:item_id (
              institution_name
            )
          `
          )
          .eq("account_id", transaction.account_id)
          .single();

        if (error) throw error;

        if (accountData) {
          const transformedAccount = {
            ...accountData,
            institution_name:
              accountData.user_items?.institution_name ||
              transaction.institution_name ||
              "Unknown Institution",
            balances: {
              current: accountData.current_balance || 0,
              available: accountData.available_balance || 0,
            },
          };
          // console.log("Account data fetched:", transformedAccount);
          setSelectedAccountData(transformedAccount);

          // Fetch performance data for investment accounts
          if (transformedAccount?.type === "investment") {
            const performanceData = await getInvestmentPerformance(
              transformedAccount
            );
            setSelectedAccountPerformance(performanceData);
          } else {
            setSelectedAccountPerformance(null);
          }
        }
      } catch (error) {
        console.error("Error fetching account data:", error);
        // Fallback to basic account data from transaction
        setSelectedAccountData({
          account_id: transaction.account_id,
          name: transaction.account_name || "Unknown Account",
          type: "depository",
          subtype: "checking",
          institution_name:
            transaction.institution_name || "Unknown Institution",
          balances: {
            current: 0,
            available: 0,
          },
        });
      } finally {
        setAccountDataLoading(false);
      }
    }
  };

  const handleFilterPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowTransactionActionAlert(true);
  };

  const handleSelectGoal = async (goalId: string, goalLabel: string) => {
    try {
      if (!transaction) return;
      const txAmount = Math.abs(Number(transaction.amount) || 0);
      const previousGoalId = (transaction as any)?.linked_goal_id || null;

      // If moving from a different goal, decrement previous goal
      if (previousGoalId && previousGoalId !== goalId) {
        const { error: decErrRpc } = await supabase.rpc(
          "increment_goal_amount",
          { p_goal_id: previousGoalId, p_amount: -txAmount }
        );
        if (decErrRpc) {
          const { data: prevGoal, error: prevReadErr } = await supabase
            .from("goals")
            .select("current_amount")
            .eq("id", previousGoalId)
            .single();
          if (!prevReadErr) {
            const prevAmt = Number(prevGoal?.current_amount || 0);
            const newPrevAmt = Math.max(0, prevAmt - txAmount);
            await supabase
              .from("goals")
              .update({ current_amount: newPrevAmt })
              .eq("id", previousGoalId);
          }
        }
      }
      // Link transaction to goal
      const { error: linkError } = await supabase
        .from("transactions")
        .update({ linked_goal_id: goalId })
        .eq("id", transaction.id);
      if (linkError) throw linkError;

      // Increment goal progress (current_amount)
      const { error: goalError } = await supabase.rpc("increment_goal_amount", {
        p_goal_id: goalId,
        p_amount: txAmount,
      });

      if (goalError) {
        // Fallback if RPC not present: read-then-update
        const { data: goalData, error: readErr } = await supabase
          .from("goals")
          .select("current_amount")
          .eq("id", goalId)
          .single();
        if (readErr) throw readErr;
        const currentAmt = Number(goalData?.current_amount || 0);
        const newAmt = currentAmt + txAmount;
        const { error: updErr } = await supabase
          .from("goals")
          .update({ current_amount: newAmt })
          .eq("id", goalId);
        if (updErr) throw updErr;
      }

      // Update local state
      setTransaction({
        ...transaction,
        linked_goal_id: goalId,
        goal_label: goalLabel,
      } as any);

      DeviceEventEmitter.emit("transactionGoalLinked", {
        transactionId: transaction.id,
        goalId,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.error("Error linking transaction to goal:", e);
      Alert.alert("Error", "Failed to add to goal. Please try again.");
    }
  };

  const handleInternalTransferToggle = async () => {
    try {
      if (!transaction || !userId) {
        Alert.alert("Error", "Transaction or user information missing.");
        return;
      }

      // Use the same logic as the UI to determine current state
      const currentlyInternalTransfer =
        updatedCategory === "INTERNAL_TRANSFER" ||
        (updatedCategory === undefined &&
          transaction?.new_category === "INTERNAL_TRANSFER");

      // INTERNAL_TRANSFER is a special marker (not a real category)
      // Set category_id to NULL and use new_category as marker
      const updateData = currentlyInternalTransfer
        ? { category_id: null, new_category: null } // Remove internal transfer marker
        : { category_id: null, new_category: "INTERNAL_TRANSFER" }; // Set internal transfer marker

      // Update the database
      const { error } = await supabase
        .from("transactions")
        .update(updateData)
        .eq("id", transaction?.id);

      if (error) {
        console.error("Error updating transaction category:", error);
        Alert.alert("Error", "Failed to update transaction. Please try again.");
        return;
      }

      // If marking as internal transfer (not removing), create a category rule for future transactions
      if (!currentlyInternalTransfer) {
        try {
          const merchantName = transaction.merchant_name;
          const transactionName = transaction.name;

          // Determine which field to use for matching: merchant_name first, then transaction name
          const useMerchantName = merchantName && merchantName.trim() !== "";
          const useTransactionName =
            !useMerchantName &&
            transactionName &&
            transactionName.trim() !== "";

          if (useMerchantName || useTransactionName) {
            // For internal transfers, we need to store the rule differently since INTERNAL_TRANSFER
            // is not a real category. We'll use a special approach: store the rule with a marker.
            // Since category_rules requires top_category_id, we'll need to handle this specially.
            // For now, we'll insert a rule that we can identify later by checking if the category
            // doesn't exist in the user's categories (which INTERNAL_TRANSFER won't).

            // Actually, a better approach: Check if there's an "Other" category and use that as a placeholder,
            // but mark it specially. Or, we can check for rules where merchant_name/transaction_name matches
            // and the transaction's new_category is INTERNAL_TRANSFER.

            // Simplest approach: Store the rule with merchant_name/transaction_name, and in the sync function,
            // check if a rule matches and if the transaction should be marked as internal transfer.
            // We'll use a special UUID or marker for internal transfer rules.

            // For now, let's create a rule entry that we can identify. Since we can't easily modify schema,
            // we'll use a workaround: create the rule with a special marker category_id.
            // But actually, the sync function already checks merchant rules first, so we just need to
            // ensure that when a rule matches, if it's an internal transfer rule, we set new_category.

            // Let me use a simpler approach: Create a rule entry, and in sync, check if merchant_name/transaction_name
            // matches AND if we should treat it as internal transfer. We can do this by checking existing
            // transactions with the same merchant_name/transaction_name that are marked as INTERNAL_TRANSFER.

            // Actually, the cleanest solution: When creating the rule, we can check if there are other transactions
            // with the same merchant_name/transaction_name that are INTERNAL_TRANSFER, and if so, treat future
            // matches as internal transfer. But that's complex.

            // For now, let's create a simple rule: Insert into category_rules with merchant_name/transaction_name,
            // and use a special approach in sync to detect internal transfer rules.
            // Since INTERNAL_TRANSFER is not a category, we'll need to handle this differently.

            // Workaround: Create a rule with merchant_name/transaction_name, and in the sync function,
            // check if merchant_name/transaction_name matches AND if there's a pattern indicating internal transfer.
            // We can do this by checking if the matched rule's category_id doesn't exist in categories (special marker).

            // Actually, simplest solution: Don't create a category_rules entry for internal transfers.
            // Instead, in the sync function, check if merchant_name/transaction_name matches any existing
            // transactions that are marked as INTERNAL_TRANSFER, and if so, mark new transactions the same way.

            // But that's inefficient. Better: Create a special internal_transfer_rules table or use a marker.

            // For MVP: Let's create a rule entry with merchant_name/transaction_name, and use a special
            // category_id that we can identify. We can use a UUID like "00000000-0000-0000-0000-000000000001"
            // as a marker for internal transfers.

            const matchValue = useMerchantName ? merchantName : transactionName;
            const matchField = useMerchantName
              ? "merchant_name"
              : "transaction_name";

            // Use a special marker UUID for internal transfer rules
            // This UUID will be recognized in the sync function as a marker for internal transfers
            const INTERNAL_TRANSFER_MARKER_UUID =
              "00000000-0000-0000-0000-000000000001";

            // Check if rule already exists
            const { data: existingRule } = await supabase
              .from("category_rules")
              .select("id")
              .eq("user_id", userId)
              .eq("active", true)
              .eq(matchField, matchValue)
              .maybeSingle();

            if (!existingRule) {
              // Create the rule with the special marker UUID
              const { error: ruleError } = await supabase
                .from("category_rules")
                .insert({
                  id: generateUUID(),
                  user_id: userId,
                  [matchField]: matchValue,
                  top_category_id: INTERNAL_TRANSFER_MARKER_UUID, // Special marker
                  sub_category_id: INTERNAL_TRANSFER_MARKER_UUID, // Special marker
                  match_field: matchField,
                  active: true,
                });

              if (ruleError) {
                console.error(
                  "Error creating internal transfer rule:",
                  ruleError
                );
                // Don't fail the whole operation if rule creation fails
              } else {
                console.log(
                  "✅ Created internal transfer rule for",
                  matchField,
                  matchValue
                );
              }
            }
          }
        } catch (ruleErr) {
          console.error("Exception creating internal transfer rule:", ruleErr);
          // Don't fail the whole operation
        }
      } else {
        // If removing internal transfer marker, we could also remove the rule, but let's keep it
        // in case the user wants to re-enable it later
      }

      // Update local state
      setIsInternalTransfer(!currentlyInternalTransfer);
      setUpdatedCategory(updateData.new_category);

      // Emit event to notify other components
      DeviceEventEmitter.emit("transactionCategoryUpdated", {
        transactionId: transaction?.id,
        newCategory: updateData.new_category,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error("Error updating transaction:", error);
      Alert.alert("Error", "Failed to update transaction. Please try again.");
    }
  };

  const handleRecurringToggle = async () => {
    try {
      if (!transaction || !userId) {
        Alert.alert("Error", "Transaction or user information missing.");
        return;
      }

      const currentIsRecurring = transaction?.if_recurring === "yes";
      const newRecurringValue = currentIsRecurring ? "no" : "yes";

      // Update all similar transactions
      // Priority: Use recurring_stream_id if available (Plaid streams), otherwise use name/merchant_name
      const result = await bulkUpdateRecurringStatus(
        userId,
        {
          recurring_stream_id: transaction.recurring_stream_id || undefined,
          merchant_name: transaction.merchant_name,
          name: transaction.name,
        },
        newRecurringValue,
        newRecurringValue === "no" // Clear stream_id when removing
      );

      if (result.updated === 0) {
        Alert.alert(
          "Error",
          "Failed to update transactions. Please try again."
        );
        return;
      }

      // Update the transaction object directly
      setTransaction({
        ...transaction,
        if_recurring: newRecurringValue,
        recurring_stream_id:
          newRecurringValue === "no"
            ? undefined
            : transaction.recurring_stream_id || undefined,
      });

      // Update local state for consistency
      setIsRecurring(!currentIsRecurring);

      // Show success message with count
      if (result.updated > 1) {
        Alert.alert(
          "Success",
          `Updated ${result.updated} similar transactions to ${
            newRecurringValue === "yes" ? "recurring" : "non-recurring"
          }.`
        );
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error("Error updating transaction:", error);
      Alert.alert("Error", "Failed to update transaction. Please try again.");
    }
  };

  const formatDate = (dateStr: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return new Date(dateStr).toLocaleDateString("en-US", options);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.container}>
              {/* Drag Handle */}
              <View style={styles.dragHandle} />

              {/* Header with Transaction Label and Menu */}
              <View style={styles.headerContainer}>
                <Text style={styles.transactionLabel}>
                  {updatedCategory === "INTERNAL_TRANSFER" ||
                  (updatedCategory === undefined &&
                    transaction?.new_category === "INTERNAL_TRANSFER")
                    ? "Internal Transfer"
                    : "Transaction"}
                </Text>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={handleFilterPress}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="filter"
                    size={20}
                    color="rgba(255, 255, 255, 0.8)"
                  />
                </TouchableOpacity>
              </View>

              {loading ? (
                <ScrollView
                  style={styles.scrollContainer}
                  contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 20 },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Core Details - Loading State */}
                  <View style={styles.coreDetailsContainer}>
                    <View style={styles.loadingTransactionName} />
                    <View style={styles.loadingAmountValue} />
                    <View style={styles.loadingDate} />
                    <View style={styles.loadingCategoryPill} />
                  </View>

                  {/* Account Card - Loading State */}
                  <View style={styles.accountSection}>
                    <View style={styles.loadingAccountCard} />
                  </View>

                  {/* Loading Indicator */}
                  <View style={styles.loadingIndicatorContainer}>
                    <ActivityIndicator size="large" color="#4A90E2" />
                    <Text style={styles.loadingText}>
                      Loading transaction...
                    </Text>
                  </View>
                </ScrollView>
              ) : !transaction ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>Transaction not found</Text>
                  <TouchableOpacity
                    style={styles.errorCloseButton}
                    onPress={handleClose}
                  >
                    <Text style={styles.errorCloseButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView
                  style={styles.scrollContainer}
                  contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 20 },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Core Details */}
                  <View style={styles.coreDetailsContainer}>
                    <Text style={styles.transactionName}>
                      {transaction.name}
                    </Text>
                    <Text
                      style={[
                        styles.amountValue,
                        {
                          color: transaction.amount < 0 ? "#27AE60" : "#4A90E2",
                        },
                      ]}
                    >
                      {transaction.amount < 0
                        ? `+$${Math.abs(transaction.amount).toFixed(2)}`
                        : `-$${Math.abs(transaction.amount).toFixed(2)}`}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(transaction.date)}
                    </Text>

                    {/* Category and Recurring/Goal Tags Container */}
                    <View style={styles.tagsContainer}>
                      {/* Category Pill - Only show when NOT an internal transfer */}
                      {!(
                        updatedCategory === "INTERNAL_TRANSFER" ||
                        (updatedCategory === undefined &&
                          transaction.new_category === "INTERNAL_TRANSFER")
                      ) && (
                        <TouchableOpacity
                          style={[
                            styles.categoryPill,
                            {
                              backgroundColor:
                                getCategoryBackgroundColorForName(
                                  getDisplayCategory(
                                    updatedCategory,
                                    transaction
                                  )
                                ),
                              borderColor:
                                getCategoryColor(
                                  getDisplayCategory(
                                    updatedCategory,
                                    transaction
                                  )
                                ) + "40",
                            },
                          ]}
                          onPress={handleCategoryPress}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.categoryEmojiText}>
                            {getCategoryIcon(
                              getDisplayCategory(updatedCategory, transaction)
                            )}
                          </Text>
                          <Text
                            style={[
                              styles.categoryPillText,
                              {
                                color: getCategoryColor(
                                  getDisplayCategory(
                                    updatedCategory,
                                    transaction
                                  )
                                ),
                              },
                            ]}
                          >
                            {formatCategoryFromHook(
                              getDisplayCategory(updatedCategory, transaction)
                            )}
                          </Text>
                          <AntDesign
                            name="caret-right"
                            size={14}
                            style={{
                              color: getCategoryColor(
                                getDisplayCategory(updatedCategory, transaction)
                              ),
                              marginLeft: 4,
                            }}
                          />
                        </TouchableOpacity>
                      )}

                      {/* Recurring Tag - Show based on transaction.if_recurring regardless of internal transfer status */}
                      {transaction?.if_recurring === "yes" && (
                        <View style={styles.recurringTag}>
                          <Text style={styles.recurringText}>RECURRING</Text>
                        </View>
                      )}

                      {/* Goal Tag */}
                      {(transaction as any)?.linked_goal_id && (
                        <View style={styles.recurringTag}>
                          <Text style={styles.recurringText}>
                            {(transaction as any)?.goal_label || "Goal"}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Account Card */}
                  {(transaction.account_name ||
                    transaction.institution_name ||
                    transaction.account_mask) && (
                    <View style={styles.accountSection}>
                      <AccountCard
                        account={{
                          account_id: transaction.account_id || "unknown",
                          name: transaction.account_name || "Unknown Account",
                          mask: transaction.account_mask,
                          type: transaction.account_type || "depository",
                          subtype: (transaction as any).account_subtype || null,
                          institution_name: transaction.institution_name,
                        }}
                        onPress={handleAccountPress}
                        height={isSmallPhone ? 65 : isLandscape ? 105 : 85}
                      />
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {/* Category Selector Modal */}
      <CategorySelectorModal
        visible={showCategorySelector}
        transactionId={transaction?.id || null}
        merchantName={transaction?.merchant_name}
        transactionName={transaction?.name}
        currentCategoryName={getDisplayCategory(updatedCategory, transaction)}
        onClose={() => setShowCategorySelector(false)}
      />

      {/* Transaction Action Alert */}
      <TransactionActionAlert
        visible={showTransactionActionAlert}
        onClose={() => setShowTransactionActionAlert(false)}
        onInternalTransfer={handleInternalTransferToggle}
        onSetRecurring={handleRecurringToggle}
        isInternalTransfer={
          updatedCategory === "INTERNAL_TRANSFER" ||
          (updatedCategory === undefined &&
            transaction?.new_category === "INTERNAL_TRANSFER")
        }
        isRecurring={transaction?.if_recurring === "yes"}
        onSelectGoal={handleSelectGoal}
      />

      {/* Account Detail Modal */}
      <AccountDetailModal
        visible={showAccountDetailModal}
        accountId={selectedAccountId}
        account={selectedAccountData}
        loading={accountDataLoading}
        onClose={() => {
          setShowAccountDetailModal(false);
          setSelectedAccountId(null);
          setSelectedAccountData(null);
          setAccountDataLoading(false);
          // Close the parent TransactionDetailModal when AccountDetailModal is closed
          handleClose();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    maxHeight: "80%",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
    marginTop: 5,
    position: "relative",
  },
  transactionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(232, 229, 229, 0.55)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  menuButton: {
    position: "absolute",
    right: 20,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 16,
    opacity: 0.8,
  },
  loadingIndicatorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingTransactionName: {
    width: "80%",
    height: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 8,
  },
  loadingAmountValue: {
    width: "60%",
    height: 32,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 8,
  },
  loadingDate: {
    width: "50%",
    height: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 20,
  },
  loadingCategoryPill: {
    width: "40%",
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 24,
  },
  loadingAccountCard: {
    width: "100%",
    height: 65,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
  },
  errorContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#fff",
    fontSize: 18,
    marginBottom: 20,
  },
  errorCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  errorCloseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollContainer: {
    maxHeight: 500,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  coreDetailsContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  transactionName: {
    fontSize: 20,
    color: "#ffffff",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  transactionDate: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "500",
    marginBottom: 20,
  },
  tagsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
  },
  categoryEmojiText: {
    fontSize: 14,
    marginRight: 8,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  categoryArrow: {
    marginLeft: 6,
    opacity: 0.7,
    fontSize: 14,
  },
  recurringTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  recurringText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4A90E2",
    letterSpacing: 0.2,
  },
  accountSection: {
    marginBottom: 20,
  },
});

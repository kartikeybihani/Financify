import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useUnreviewedTransactions, UnreviewedTransaction } from "@/src/hooks/useUnreviewedTransactions";
import { getDisplayCategory } from "@/src/utils/categories/transactionCategory";
import { useCategories } from "@/src/hooks/useCategories";
import TransactionDetailModal from "@/src/components/modals/TransactionDetailModal";
import * as Haptics from "expo-haptics";

interface TransactionReviewCardProps {
  userId?: string;
}

export function TransactionReviewCard({ userId }: TransactionReviewCardProps) {
  const {
    transactions,
    loading,
    count,
    markAsReviewed,
    markAllAsReviewed,
  } = useUnreviewedTransactions();

  const { getCategoryIcon, getCategoryColor, formatCategoryName } = useCategories(userId);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<UnreviewedTransaction | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  // Don't render if no unreviewed transactions
  if (!loading && count === 0) {
    return null;
  }

  // Get the first transaction as preview
  const previewTransaction = transactions[0];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const formatAmount = (amount: number) => {
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? "+" : "-";
    return `${sign}$${absAmount.toFixed(2)}`;
  };

  const handleTransactionPress = (transaction: UnreviewedTransaction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTransaction(transaction);
    setSelectedTransactionId(transaction.id);
    setShowDetailModal(true);
  };

  const handleMarkAsReviewed = async (transactionId: string, transaction: UnreviewedTransaction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Add to animating set
    setAnimatingIds((prev) => new Set(prev).add(transactionId));

    // Wait for animation
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mark as reviewed
    await markAsReviewed(transactionId);

    // Remove from animating set after a short delay
    setTimeout(() => {
      setAnimatingIds((prev) => {
        const next = new Set(prev);
        next.delete(transactionId);
        return next;
      });
    }, 100);
  };

  const handleMarkAsUnreviewed = async (transactionId: string) => {
    // For now, same behavior as reviewed (just dismiss)
    await handleMarkAsReviewed(transactionId, previewTransaction!);
  };

  const handleReviewAll = async () => {
    if (transactions.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Add all to animating set
    setAnimatingIds(new Set(transactions.map((tx) => tx.id)));

    // Animate out all transactions
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mark all as reviewed
    await markAllAsReviewed();

    // Clear animating set
    setAnimatingIds(new Set());
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <ActivityIndicator size="small" color="#4A90E2" />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      </View>
    );
  }

  if (!previewTransaction) {
    return null;
  }

  const displayCategory = getDisplayCategory(previewTransaction);
  const categoryIcon = getCategoryIcon(displayCategory);
  const categoryColor = getCategoryColor(displayCategory);
  const isAnimating = animatingIds.has(previewTransaction.id);

  return (
    <>
      <View style={styles.container}>
        <View style={[styles.card, isAnimating && styles.animating]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Review Transactions</Text>
              {count > 1 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              )}
            </View>
            {count > 1 && (
              <TouchableOpacity
                onPress={handleReviewAll}
                style={styles.reviewAllButton}
                activeOpacity={0.7}
              >
                <Text style={styles.reviewAllText}>Review All</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() => handleTransactionPress(previewTransaction)}
            activeOpacity={0.8}
            style={styles.transactionCard}
            disabled={isAnimating}
          >
            <View style={styles.transactionLeft}>
              <View style={[styles.categoryIcon, { backgroundColor: `${categoryColor}20` }]}>
                <Text style={styles.categoryIconText}>{categoryIcon}</Text>
              </View>
              <View style={styles.transactionDetails}>
                <Text style={styles.transactionName} numberOfLines={1}>
                  {previewTransaction.merchant_name || previewTransaction.name}
                </Text>
                <Text style={styles.transactionMeta}>
                  {formatDate(previewTransaction.date)} • {formatCategoryName(displayCategory)}
                </Text>
              </View>
            </View>
            <View style={styles.transactionRight}>
              <Text
                style={[
                  styles.transactionAmount,
                  { color: previewTransaction.amount < 0 ? "#4ECDC4" : "#FF6B6B" },
                ]}
              >
                {formatAmount(previewTransaction.amount)}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => handleMarkAsReviewed(previewTransaction.id, previewTransaction)}
              style={[styles.actionButton, styles.checkButton]}
              activeOpacity={0.7}
              disabled={isAnimating}
            >
              <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              <Text style={styles.actionButtonText}>Reviewed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleMarkAsUnreviewed(previewTransaction.id)}
              style={[styles.actionButton, styles.crossButton]}
              activeOpacity={0.7}
              disabled={isAnimating}
            >
              <Ionicons name="close-circle" size={24} color="#FF6B6B" />
              <Text style={styles.actionButtonText}>Unreviewed</Text>
            </TouchableOpacity>
          </View>

          {count > 1 && (
            <TouchableOpacity
              onPress={() => setShowAllModal(true)}
              style={styles.viewAllButton}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>
                View all {count} transactions →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        visible={showDetailModal}
        transactionId={selectedTransactionId}
        transaction={selectedTransaction || undefined}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTransactionId(null);
          setSelectedTransaction(null);
        }}
      />

      {/* All Transactions Modal */}
      <Modal
        visible={showAllModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAllModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Review Transactions</Text>
              <TouchableOpacity
                onPress={() => setShowAllModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {transactions.map((transaction) => {
                const displayCategory = getDisplayCategory(transaction);
                const categoryIcon = getCategoryIcon(displayCategory);
                const categoryColor = getCategoryColor(displayCategory);
                const isAnimating = animatingIds.has(transaction.id);

                return (
                  <View
                    key={transaction.id}
                    style={[styles.modalTransactionItem, isAnimating && styles.animating]}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setShowAllModal(false);
                        handleTransactionPress(transaction);
                      }}
                      style={styles.modalTransactionTouchable}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modalTransactionLeft}>
                        <View
                          style={[
                            styles.modalCategoryIcon,
                            { backgroundColor: `${categoryColor}20` },
                          ]}
                        >
                          <Text style={styles.modalCategoryIconText}>{categoryIcon}</Text>
                        </View>
                        <View style={styles.modalTransactionDetails}>
                          <Text style={styles.modalTransactionName} numberOfLines={1}>
                            {transaction.merchant_name || transaction.name}
                          </Text>
                          <Text style={styles.modalTransactionMeta}>
                            {formatDate(transaction.date)} • {formatCategoryName(displayCategory)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.modalTransactionRight}>
                        <Text
                          style={[
                            styles.modalTransactionAmount,
                            {
                              color: transaction.amount < 0 ? "#4ECDC4" : "#FF6B6B",
                            },
                          ]}
                        >
                          {formatAmount(transaction.amount)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        onPress={() => handleMarkAsReviewed(transaction.id, transaction)}
                        style={[styles.modalActionButton, styles.modalCheckButton]}
                        activeOpacity={0.7}
                        disabled={isAnimating}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="#4ECDC4" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMarkAsUnreviewed(transaction.id)}
                        style={[styles.modalActionButton, styles.modalCrossButton]}
                        activeOpacity={0.7}
                        disabled={isAnimating}
                      >
                        <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            {transactions.length > 0 && (
              <TouchableOpacity
                onPress={handleReviewAll}
                style={styles.modalReviewAllButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalReviewAllText}>Review All ({count})</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  animating: {
    opacity: 0,
    transform: [{ translateY: -20 }],
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  badge: {
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  reviewAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
  },
  reviewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A90E2",
  },
  transactionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    marginBottom: 12,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  categoryIconText: {
    fontSize: 18,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  transactionMeta: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  checkButton: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
  },
  crossButton: {
    backgroundColor: "rgba(255, 107, 107, 0.15)",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  viewAllButton: {
    paddingVertical: 8,
    alignItems: "center",
  },
  viewAllText: {
    fontSize: 13,
    color: "#4A90E2",
    fontWeight: "600",
  },
  loadingText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalTransactionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  modalTransactionTouchable: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTransactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  modalCategoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  modalCategoryIconText: {
    fontSize: 16,
  },
  modalTransactionDetails: {
    flex: 1,
  },
  modalTransactionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  modalTransactionMeta: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
  },
  modalTransactionRight: {
    alignItems: "flex-end",
  },
  modalTransactionAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCheckButton: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
  },
  modalCrossButton: {
    backgroundColor: "rgba(255, 107, 107, 0.15)",
  },
  modalReviewAllButton: {
    margin: 20,
    padding: 16,
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    alignItems: "center",
  },
  modalReviewAllText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});

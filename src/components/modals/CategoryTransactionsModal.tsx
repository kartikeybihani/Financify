import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CategoryTransaction, BudgetData } from "@/src/types/budget";
import { useWindowDimensions } from "react-native";
import TransactionDetailModal from "@/src/components/modals/TransactionDetailModal";
import FinnyLoadingIndicator from "@/src/components/shared/FinnyLoadingIndicator";

export interface CategoryTransactionsModalProps {
  visible: boolean;
  category: BudgetData | null;
  parentLabel?: string | null;
  transactions: CategoryTransaction[];
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onManage?: () => void;
}

const CategoryTransactionsModal: React.FC<CategoryTransactionsModalProps> = ({
  visible,
  category,
  parentLabel,
  transactions,
  loading,
  error,
  onClose,
  onManage,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const containerMaxHeight = screenHeight * 0.7;
  const [currentCategory, setCurrentCategory] = useState(category);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (visible && category) {
      setCurrentCategory(category);
    }
  }, [visible, category]);

  if (!visible || !currentCategory) return null;

  const categoryColor = currentCategory.color || "#4A90E2";

  const monthKey = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  };

  const monthLabel = (key: string) => {
    const [year, month] = key.split("-").map((v) => parseInt(v, 10));
    const names = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const now = new Date();
    const isThisMonth =
      now.getFullYear() === year && now.getMonth() + 1 === month;
    return `${names[month - 1]} ${year}${isThisMonth ? " (This month)" : ""}`;
  };

  const grouped = transactions.reduce(
    (acc: Map<string, CategoryTransaction[]>, tx: CategoryTransaction) => {
      const effectiveDate = tx.authorized_date || tx.date;
      const key = monthKey(effectiveDate);
      const existing = acc.get(key) || [];
      existing.push(tx);
      acc.set(key, existing);
      return acc;
    },
    new Map()
  );

  const monthKeys = Array.from(grouped.keys()).sort((a, b) =>
    b.localeCompare(a)
  );

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      accessibilityLabel={`${currentCategory.category} transactions`}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.txOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.txContainer,
                {
                  height: containerMaxHeight,
                },
              ]}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.txHeaderRow}>
                <View style={styles.txHeaderText}>
                  <Text
                    style={styles.txTitle}
                    accessibilityRole="header"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {currentCategory.category}
                  </Text>
                  {parentLabel && (
                    <Text style={styles.txSubtitle}>
                      Child of {parentLabel}
                    </Text>
                  )}
                </View>
                {onManage ? (
                  <TouchableOpacity
                    onPress={onManage}
                    activeOpacity={0.7}
                    style={styles.txManageButton}
                  >
                    <Ionicons
                      name="options-outline"
                      size={18}
                      color="#4A90E2"
                    />
                    <Text style={styles.txManageText}>Manage</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.txHeaderSpacer} />

              <View style={styles.txList}>
                {loading ? (
                  <FinnyLoadingIndicator
                    message="Loading transactions"
                    color={categoryColor}
                  />
                ) : error ? (
                  <Text style={styles.txEmpty}>{error}</Text>
                ) : transactions.length === 0 ? (
                  <Text style={styles.txEmpty}>No transactions found</Text>
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 16, gap: 10 }}
                  >
                    {monthKeys.map((key) => {
                      const txs = grouped.get(key) || [];
                      return (
                        <View key={key} style={styles.txMonthBlock}>
                          <Text style={styles.txMonthLabel}>
                            {monthLabel(key)}
                          </Text>
                          {txs.map((tx: CategoryTransaction, idx: number) => {
                            const effectiveDate = tx.authorized_date || tx.date;
                            const displayName =
                              tx.merchant_name || tx.name || "Transaction";
                            const formattedDate = new Date(
                              effectiveDate + "T00:00:00"
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                            return (
                              <TouchableOpacity
                                key={tx.id || `${key}-${idx}`}
                                style={styles.txItem}
                                activeOpacity={0.75}
                                onPress={() => {
                                  if (isTransitioning) return;
                                  const nextId = tx.id || null;
                                  if (!nextId) return;
                                  setIsTransitioning(true);

                                  if (showDetailModal) {
                                    setShowDetailModal(false);
                                    setSelectedTxId(null);
                                    requestAnimationFrame(() => {
                                      setSelectedTxId(nextId);
                                      setShowDetailModal(true);
                                      setIsTransitioning(false);
                                    });
                                  } else {
                                    setSelectedTxId(nextId);
                                    setShowDetailModal(true);
                                    setIsTransitioning(false);
                                  }
                                }}
                              >
                                <View style={styles.txItemLeft}>
                                  <View
                                    style={[
                                      styles.txDot,
                                      {
                                        backgroundColor:
                                          currentCategory.color || "#4A90E2",
                                      },
                                    ]}
                                  />
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={styles.txItemTitle}
                                      numberOfLines={1}
                                    >
                                      {displayName}
                                    </Text>
                                    <Text style={styles.txItemDate}>
                                      {formattedDate}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={styles.txItemAmount}>
                                  $
                                  {tx.amount.toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>

          <TransactionDetailModal
            key={`tx-detail-${selectedTxId || "none"}`}
            visible={showDetailModal}
            transactionId={selectedTxId}
            transaction={null}
            onClose={() => {
              setShowDetailModal(false);
              setSelectedTxId(null);
              setIsTransitioning(false);
            }}
          />
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  txOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  txContainer: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 8,
  },
  txHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
    paddingTop: 0,
    paddingHorizontal: 2,
    gap: 10,
    position: "relative",
  },
  txHeaderSpacer: {
    height: 16,
  },
  txHeaderText: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  txTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  txSubtitle: {
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
    fontSize: 13,
    textAlign: "center",
  },
  txManageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(74,144,226,0.16)",
    borderWidth: 1,
    borderColor: "rgba(74,144,226,0.35)",
    gap: 6,
    position: "absolute",
    right: 0,
  },
  txManageText: {
    color: "#4A90E2",
    fontWeight: "700",
    fontSize: 13,
  },
  txList: {
    flex: 1,
    minHeight: 0,
  },
  txMonthBlock: {
    marginBottom: 16,
  },
  txMonthLabel: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
  },
  txItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  txItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  txItemTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  txItemDate: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  txItemAmount: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 12,
  },
  txEmpty: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 13,
  },
  txDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

export default CategoryTransactionsModal;

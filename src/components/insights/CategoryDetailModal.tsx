import React, { useState, useMemo, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "@/src/styles/insightsStyles";
import TransactionDetailModal from "@/src/components/modals/TransactionDetailModal";
import { Transaction } from "@/src/types/plaid";
import { getDisplayCategory } from "@/src/utils/categories/transactionCategory";
import { useCategories } from "@/src/hooks/useCategories";
import { supabase } from "@/src/lib/supabase/supabase";

interface CategoryData {
  amount: number;
  percentage: number;
  color: string;
}

interface CategoryDetailModalProps {
  visible: boolean;
  onClose: () => void;
  category: string;
  data: CategoryData;
  transactions: Transaction[];
  formatCategoryName: (category: string) => string;
  formatDate: (date: string) => string;
  categoryId?: string | null; // Optional category ID for more reliable filtering
}

const CategoryDetailModal: React.FC<CategoryDetailModalProps> = ({
  visible,
  onClose,
  category,
  data,
  transactions,
  formatCategoryName,
  formatDate,
  categoryId: providedCategoryId,
}) => {
  const [userId, setUserId] = useState<string | undefined>(undefined);

  // Fetch user ID when modal becomes visible
  useEffect(() => {
    if (visible) {
      const fetchUserId = async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            setUserId(user.id);
          }
        } catch (error) {
          console.error("[CategoryDetailModal] Error fetching user ID:", error);
        }
      };
      fetchUserId();
    }
  }, [visible]);

  const { getCategoryByName } = useCategories(userId);

  // Try to find category ID from name if not provided
  const resolvedCategoryId = useMemo(() => {
    if (providedCategoryId) return providedCategoryId;
    const foundCategory = getCategoryByName(category);
    if (__DEV__ && visible) {
      console.log(
        `[CategoryDetailModal] Resolving category ID: category="${category}", foundCategory=${foundCategory ? foundCategory.id : null}`
      );
    }
    return foundCategory?.id || null;
  }, [providedCategoryId, category, getCategoryByName, visible]);

  // Map category names to Ionicons
  const getCategoryIcon = (
    categoryName: string
  ): keyof typeof Ionicons.glyphMap => {
    const iconMap: { [key: string]: keyof typeof Ionicons.glyphMap } = {
      Groceries: "storefront-outline",
      Food: "restaurant-outline",
      "Food & Dining": "restaurant-outline",
      "Dining Out": "restaurant-outline",
      Housing: "home-outline",
      Transportation: "car-outline",
      Shopping: "bag-outline",
      Entertainment: "film-outline",
      Subscriptions: "phone-portrait-outline",
      "Health & Fitness": "fitness-outline",
      Health: "medical-outline",
      "Bills & Utilities": "flash-outline",
      "Personal Care": "person-outline",
      Travel: "airplane-outline",
      Education: "school-outline",
      "Savings & Investments": "diamond-outline",
      Savings: "diamond-outline",
      Income: "cash-outline",
      Other: "cube-outline",
    };

    return iconMap[categoryName] || "cube-outline";
  };

  // Filter transactions by category_id first (more reliable), then fall back to name matching
  const categoryTransactions = useMemo(() => {
    const filtered = transactions.filter((tx) => {
      // Priority 1: Match by category_id if available
      if (resolvedCategoryId && tx.category_id) {
        const matches = tx.category_id === resolvedCategoryId;
        if (__DEV__ && visible) {
          console.log(
            `[CategoryDetailModal] Checking tx ${tx.id}: category_id=${tx.category_id}, resolvedCategoryId=${resolvedCategoryId}, matches=${matches}`
          );
        }
        return matches;
      }

      // Priority 2: Match by category name using getDisplayCategory
      const displayCategory = getDisplayCategory(tx);
      const matches = displayCategory === category;
      
      if (__DEV__ && visible) {
        console.log(
          `[CategoryDetailModal] Checking tx ${tx.id}: displayCategory="${displayCategory}", targetCategory="${category}", category_id=${tx.category_id}, matches=${matches}`
        );
      }
      
      return matches;
    });

    if (__DEV__ && visible) {
      console.log(
        `[CategoryDetailModal] Filtering results:`,
        {
          category,
          resolvedCategoryId,
          totalTransactions: transactions.length,
          filteredCount: filtered.length,
          sampleTransaction: filtered[0] ? {
            id: filtered[0].id,
            name: filtered[0].name,
            category_id: filtered[0].category_id,
            displayCategory: getDisplayCategory(filtered[0]),
            categories: filtered[0].categories,
          } : null,
        }
      );
    }

    return filtered;
  }, [transactions, category, resolvedCategoryId, visible]);

  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isModalTransitioning, setIsModalTransitioning] = useState(false);

  const averageTransaction =
    categoryTransactions.length > 0
      ? data.amount / categoryTransactions.length
      : 0;

  // Calculate max height for transactions list (70% of screen minus header/stats space ~200px)
  const screenHeight = Dimensions.get("window").height;
  const maxTransactionsHeight = screenHeight * 0.7 - 200;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.categoryDetailModal}
        >
          <View style={styles.categoryDetailHeader}>
            <View
              style={[
                styles.categoryDetailIcon,
                { backgroundColor: data.color },
              ]}
            >
              <Ionicons
                name={getCategoryIcon(category)}
                size={24}
                color="white"
              />
            </View>
            <View>
              <Text style={styles.categoryDetailTitle}>
                {formatCategoryName(category)}
              </Text>
              <Text style={styles.categoryDetailSubtitle}>
                {data.percentage.toFixed(0)}% of this month's spending
              </Text>
            </View>
          </View>

          <View style={styles.categoryDetailStats}>
            <View style={styles.categoryDetailStat}>
              <Text style={styles.categoryDetailStatLabel}>Total Spent</Text>
              <Text style={styles.categoryDetailStatValue}>
                ${data.amount.toLocaleString()}
              </Text>
            </View>
            <View style={styles.categoryDetailStat}>
              <Text style={styles.categoryDetailStatLabel}>Transactions</Text>
              <Text style={styles.categoryDetailStatValue}>
                {categoryTransactions.length}
              </Text>
            </View>
            <View style={styles.categoryDetailStat}>
              <Text style={styles.categoryDetailStatLabel}>Average</Text>
              <Text style={styles.categoryDetailStatValue}>
                ${averageTransaction.toFixed(0)}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.categoryTransactionsList,
              { maxHeight: maxTransactionsHeight },
            ]}
          >
            {categoryTransactions.length > 0 ? (
              <ScrollView
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {categoryTransactions.map((tx, idx) => (
                  <TouchableOpacity
                    key={tx.plaid_transaction_id || tx.id || idx}
                    style={styles.categoryTransactionItem}
                    onPress={() => {
                      if (isModalTransitioning) return;
                      setIsModalTransitioning(true);

                      if (showDetailModal) {
                        setShowDetailModal(false);
                        setSelectedTransactionId(null);
                        requestAnimationFrame(() => {
                          setSelectedTransactionId(tx.id || null);
                          setShowDetailModal(true);
                          setIsModalTransitioning(false);
                        });
                      } else {
                        setSelectedTransactionId(tx.id || null);
                        setShowDetailModal(true);
                        setIsModalTransitioning(false);
                      }
                    }}
                    activeOpacity={0.7}
                    delayPressIn={0}
                    delayPressOut={0}
                  >
                    <View style={styles.categoryTransactionInfo}>
                      <View style={styles.categoryTransactionHeader}>
                        <Text style={styles.categoryTransactionName}>
                          {tx.name}
                        </Text>
                        {tx.if_recurring === "yes" && (
                          <View style={styles.recurringChip}>
                            <Text style={styles.recurringChipText}>
                              RECURRING
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.categoryTransactionDate}>
                        {formatDate(tx.authorized_date || tx.date)}
                      </Text>
                    </View>
                    <Text style={styles.categoryTransactionAmount}>
                      -${tx.amount.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyTransactionsContainer}>
                <Text style={styles.emptyTransactionsText}>
                  No transactions in this category for the current month
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
      {/* // Transaction Detail Modal (opens when a transaction is tapped) */}
      <TransactionDetailModal
        key={`modal-${selectedTransactionId || "closed"}`}
        visible={showDetailModal}
        transactionId={selectedTransactionId}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTransactionId(null);
          setIsModalTransitioning(false);
        }}
      />
    </Modal>
  );
};

export default CategoryDetailModal;

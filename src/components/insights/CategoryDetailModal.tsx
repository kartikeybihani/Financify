import React, { useState } from "react";
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
}

const CategoryDetailModal: React.FC<CategoryDetailModalProps> = ({
  visible,
  onClose,
  category,
  data,
  transactions,
  formatCategoryName,
  formatDate,
}) => {
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
  const categoryTransactions = transactions.filter(
    (tx) => getDisplayCategory(tx) === category
  );

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
                        {formatDate(tx.date)}
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

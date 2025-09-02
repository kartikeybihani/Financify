import React from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles/insightsStyles";

interface CategoryData {
  amount: number;
  percentage: number;
  color: string;
}

interface Transaction {
  amount: number;
  date: string;
  name: string;
  category?: string; // Primary category from Plaid stored as string
  personal_finance_category?: {
    primary: string;
  };
}

interface CategoryDetailModalProps {
  visible: boolean;
  onClose: () => void;
  category: string;
  data: CategoryData;
  transactions: Transaction[];
  formatCategoryName: (category: string) => string;
  getCategoryIcon: (category: string) => keyof typeof Ionicons.glyphMap;
  formatDate: (date: string) => string;
}

const CategoryDetailModal: React.FC<CategoryDetailModalProps> = ({
  visible,
  onClose,
  category,
  data,
  transactions,
  formatCategoryName,
  getCategoryIcon,
  formatDate,
}) => {
  const categoryTransactions = transactions.filter(
    (tx) => (tx.category || "Other") === category
  );

  const averageTransaction =
    categoryTransactions.length > 0
      ? data.amount / categoryTransactions.length
      : 0;

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
        <View style={styles.categoryDetailModal}>
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
                color="#fff"
              />
            </View>
            <View>
              <Text style={styles.categoryDetailTitle}>
                {formatCategoryName(category)}
              </Text>
              <Text style={styles.categoryDetailSubtitle}>
                {data.percentage.toFixed(0)}% of total spending
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

          <ScrollView style={styles.categoryTransactionsList}>
            {categoryTransactions.map((tx, idx) => (
              <View key={idx} style={styles.categoryTransactionItem}>
                <View style={styles.categoryTransactionInfo}>
                  <Text style={styles.categoryTransactionName}>{tx.name}</Text>
                  <Text style={styles.categoryTransactionDate}>
                    {formatDate(tx.date)}
                  </Text>
                </View>
                <Text style={styles.categoryTransactionAmount}>
                  -${tx.amount.toFixed(2)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export default CategoryDetailModal;

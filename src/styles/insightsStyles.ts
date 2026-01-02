// @refresh reset
import { StyleSheet, Dimensions, Platform } from "react-native";

const { width } = Dimensions.get('window');
const cardWidth = width * 0.8;

export const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: "#121212",
    },
    container: {
      padding: 20,
      paddingBottom: 60,
    },
    headerContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: Platform.OS === "ios" ? 8 : 12,
      paddingBottom: 10,
      backgroundColor: "#121212",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(74, 144, 226, 0.1)",
    },
    titleContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconContainer: {
      backgroundColor: "rgba(74, 144, 226, 0.1)",
      padding: 10,
      borderRadius: 12,
      marginRight: 12,
      borderWidth: 1,
      borderColor: "rgba(74, 144, 226, 0.2)",
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: "#fff",
      letterSpacing: 0.3,
    },
    headerSubtitle: {
      fontSize: 12,
      color: "rgba(255, 255, 255, 0.6)",
      marginTop: 2,
      letterSpacing: 0.2,
    },
    sectionLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: "#ccc",
      marginBottom: 14,
    },
    card: {
      backgroundColor: "#1f1f1f",
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: "#fff",
      marginBottom: 6,
    },
    cardDescription: {
      fontSize: 14,
      color: "#aaa",
    },
    cardDetails: {
      marginTop: 12,
      fontSize: 13,
      color: "#ccc",
      borderTopWidth: 1,
      borderTopColor: "#2a2a2a",
      paddingTop: 10,
    },
    txItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: "#2a2a2a",
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    txInfo: {
      flex: 1,
      marginRight: 12,
    },
    txName: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "500",
      marginBottom: 4,
    },
    txMeta: {
      color: "#888",
      fontSize: 12,
      marginBottom: 2,
    },
    txCategory: {
      color: "#4A90E2",
      fontSize: 11,
      fontWeight: "500",
    },
    txAmountContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },
    txAmount: {
      fontSize: 16,
      fontWeight: "600",
    },
    categoryText: {
      color: "#ccc",
      fontSize: 14,
      marginBottom: 4,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 30,
      marginBottom: 14,
    },
    headerButtonsContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    refreshAccountsButton: {
      backgroundColor: "rgba(74, 144, 226, 0.1)",
      borderRadius: 8,
      padding: 8,
      borderWidth: 1,
      borderColor: "rgba(74, 144, 226, 0.2)",
    },
    filterButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(102, 126, 234, 0.08)",
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "rgba(102, 126, 234, 0.2)",
      shadowColor: "#667eea",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    filterButtonText: {
      color: "#667eea",
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    dropdownArrow: {
      marginLeft: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: "#1f1f1f",
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      maxHeight: "70%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: "#2a2a2a",
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: "#fff",
    },
    filterItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#2a2a2a",
    },
    selectedFilterItem: {
      backgroundColor: "rgba(74, 144, 226, 0.1)",
      borderRadius: 8,
      paddingHorizontal: 12,
    },
    filterItemText: {
      fontSize: 16,
      color: "#ccc",
    },
    selectedFilterItemText: {
      color: "#4A90E2",
      fontWeight: "500",
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#121212",
    },
    categoryBreakdownContainer: {
      marginTop: 16,
      backgroundColor: "#1a1a1a",
      borderRadius: 16,
      padding: 16,
    },
    categoryItem: {
      marginBottom: 16,
    },
    categoryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    categoryLabelContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    categoryDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: 8,
    },
    categoryLabel: {
      fontSize: 16,
      color: "#fff",
      fontWeight: "500",
    },
    categoryAmount: {
      fontSize: 16,
      color: "#fff",
      fontWeight: "600",
    },
    progressBarBackground: {
      height: 8,
      backgroundColor: "#2a2a2a",
      borderRadius: 4,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 4,
    },
    categoryPercentage: {
      fontSize: 12,
      color: "#888",
      marginTop: 4,
      textAlign: "right",
    },
    categoryGridContainer: {
      marginTop: 16,
      marginBottom: 24,
    },
    totalSpendingCard: {
      backgroundColor: "#1f1f1f",
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "rgba(74, 144, 226, 0.1)",
    },
    totalSpendingLabel: {
      color: "#888",
      fontSize: 14,
      marginBottom: 4,
    },
    totalSpendingAmount: {
      color: "#fff",
      fontSize: 28,
      fontWeight: "600",
      marginBottom: 4,
    },
    totalSpendingPeriod: {
      color: "#4A90E2",
      fontSize: 13,
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: 12,
    },
    categoryGridItem: {
      width: "48%",
      backgroundColor: "#1f1f1f",
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(74, 144, 226, 0.1)",
    },
    categoryGridHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    categoryIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },
    gridCategoryPercentage: {
      color: "#4A90E2",
      fontSize: 14,
      fontWeight: "600",
    },
    gridCategoryLabel: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "500",
    },
    recurringChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 12,
      backgroundColor: "rgba(74, 144, 226, 0.15)",
      borderWidth: 1,
      borderColor: "rgba(74, 144, 226, 0.3)",
    },
    recurringChipText: {
      fontSize: 8,
      fontWeight: "700",
      color: "#4A90E2",
      letterSpacing: 0.2,
    },
    gridCategoryAmount: {
      color: "#888",
      fontSize: 13,
      marginBottom: 8,
    },
    miniProgressBar: {
      height: 4,
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderRadius: 2,
      overflow: "hidden",
    },
    miniProgressFill: {
      height: "100%",
      borderRadius: 2,
    },
    insightsScrollContainer: {
      paddingHorizontal: 4,
      paddingBottom: 16,
    },
    insightCard: {
      width: cardWidth,
      backgroundColor: "#1a1a1a",
      borderRadius: 16,
      padding: 20,
      marginRight: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    selectedInsightCard: {
      backgroundColor: "#1f1f1f",
      borderColor: "#4A90E2",
      borderWidth: 1,
    },
    insightIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#4A90E2",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    insightTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: "#fff",
      marginBottom: 8,
    },
    insightDescription: {
      fontSize: 14,
      color: "#aaa",
      marginBottom: 16,
    },
    insightDetailsContainer: {
      backgroundColor: "#2a2a2a",
      borderRadius: 12,
      padding: 16,
      marginTop: 16,
    },
    insightDetails: {
      fontSize: 14,
      color: "#ccc",
      lineHeight: 20,
    },
    categoryDetailModal: {
      backgroundColor: "#1f1f1f",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: "60%",
    },
    categoryDetailHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    categoryDetailIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 16,
    },
    categoryDetailTitle: {
      fontSize: 24,
      fontWeight: "600",
      color: "#fff",
      marginBottom: 4,
    },
    categoryDetailSubtitle: {
      fontSize: 16,
      color: "#888",
    },
    categoryDetailStats: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#2a2a2a",
    },
    categoryDetailStat: {
      alignItems: "center",
    },
    categoryDetailStatLabel: {
      fontSize: 12,
      color: "#888",
      marginBottom: 4,
    },
    categoryDetailStatValue: {
      fontSize: 18,
      fontWeight: "600",
      color: "#fff",
    },
    categoryTransactionsList: {
      marginBottom: 20,
    },
    categoryTransactionsHeader: {
      fontSize: 16,
      fontWeight: "600",
      color: "#fff",
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    categoryTransactionItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "#2a2a2a",
    },
    categoryTransactionInfo: {
      flex: 1,
      marginRight: 16,
    },
    categoryTransactionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
      flexWrap: "wrap",
    },
    categoryTransactionName: {
      fontSize: 16,
      color: "#fff",
      flex: 1,
      marginRight: 8,
    },
    subCategoryBadge: {
      backgroundColor: "rgba(74, 144, 226, 0.15)",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "rgba(74, 144, 226, 0.3)",
    },
    subCategoryText: {
      fontSize: 10,
      color: "#4A90E2",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    categoryTransactionDate: {
      fontSize: 12,
      color: "#888",
    },
    categoryTransactionAmount: {
      fontSize: 16,
      fontWeight: "600",
      color: "#ff6b6b",
    },
    emptyTransactionsContainer: {
      padding: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTransactionsText: {
      fontSize: 14,
      color: "#888",
      textAlign: "center",
      fontStyle: "italic",
    },
  });

// Header Refresh Icons Styles
export const headerRefreshStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  syncStatusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(76, 175, 80, 0.3)",
  },
});

// Update Modal Styles
export const updateModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "#333",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#333",
  },
  updateButton: {
    backgroundColor: "#4A90E2",
  },
  cancelButtonText: {
    color: "#A0A0A0",
    fontSize: 16,
    fontWeight: "600",
  },
  updateButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

// Transaction Info Styles
export const transactionInfoStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#16213E",
    borderRadius: 8,
    marginBottom: 16,
  },
  text: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
  },
});

// Load More Button Styles
export const loadMoreStyles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  indicator: {
    marginVertical: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#16213E",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4A90E2",
    gap: 8,
  },
  buttonText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "600",
  },
  endText: {
    color: "#666",
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 8,
  },
});

// Section Content Styles
export const sectionContentStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  placeholderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginTop: 16,
    marginBottom: 12,
    textAlign: "center",
  },
  placeholderText: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
  },
});

// Floating Action Button Styles (Fixed to screen)
export const fabStyles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 110,
    right: 34,
    zIndex: 1000,
  },
  button: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 28,
    backgroundColor: "#638ea8",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
  
export default styles;
  
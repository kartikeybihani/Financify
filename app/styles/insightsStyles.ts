import { StyleSheet, Dimensions } from "react-native";

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
    headerCentered: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 20,
      backgroundColor: "#121212",
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: "#fff",
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
      paddingVertical: 10,
    },
    txName: {
      color: "#fff",
      fontSize: 14,
    },
    txAmount: {
      color: "#ff6b6b",
      fontSize: 14,
    },
    txMeta: {
      color: "#888",
      fontSize: 12,
      marginTop: 2,
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
    filterButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#1f1f1f",
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "rgba(74, 144, 226, 0.3)",
    },
    filterButtonText: {
      color: "#4A90E2",
      fontSize: 14,
      fontWeight: "500",
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
    },
    totalSpendingCard: {
      backgroundColor: "#1a1a1a",
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      alignItems: "center",
    },
    totalSpendingLabel: {
      fontSize: 14,
      color: "#888",
      marginBottom: 8,
    },
    totalSpendingAmount: {
      fontSize: 32,
      fontWeight: "700",
      color: "#fff",
      marginBottom: 4,
    },
    totalSpendingPeriod: {
      fontSize: 14,
      color: "#666",
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginHorizontal: -8,
    },
    categoryGridItem: {
      width: "48%",
      backgroundColor: "#1a1a1a",
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    categoryGridHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    categoryIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    gridCategoryLabel: {
      fontSize: 14,
      color: "#fff",
      fontWeight: "500",
      marginBottom: 4,
    },
    gridCategoryAmount: {
      fontSize: 16,
      color: "#fff",
      fontWeight: "600",
      marginBottom: 8,
    },
    gridCategoryPercentage: {
      fontSize: 12,
      color: "#888",
      fontWeight: "500",
    },
    miniProgressBar: {
      height: 4,
      backgroundColor: "#2a2a2a",
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
  });
  
export default styles;
  
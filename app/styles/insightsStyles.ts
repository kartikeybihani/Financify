import { StyleSheet } from "react-native";

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
  });
  
export default styles;
  
import { StyleSheet, Platform, Dimensions } from "react-native";

const { width } = Dimensions.get('window');

// Font size constants for consistency
const FONTS = {
  xs: 10,
  sm: 13,
  base: 14,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 16,
    paddingBottom: 12,
    backgroundColor: "#121212",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  greetingText: {
    fontSize: FONTS.lg,
    marginBottom: 2,
    fontWeight: "600",
    color: "#fff",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  subGreeting: {
    fontSize: FONTS.sm,
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
  },
  content: {
    paddingBottom: 32,
    paddingHorizontal: 0,
  },
  
  // Hero Portfolio Value Section
  portfolioHero: {
    backgroundColor: "rgba(31, 31, 31, 0.8)",
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.2)",
  },
  portfolioContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  portfolioLeft: {
    flex: 1,
    marginRight: 20,
  },
  portfolioRight: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  lastSync: {
    fontSize: FONTS.sm,
    color: "rgba(255, 255, 255, 0.7)",
  },
  accountNameSmall: {
    fontSize: FONTS.sm,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "right",
    marginBottom: 2,
  },
  lastSyncSmall: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "right",
  },
  portfolioValueLabel: {
    fontSize: FONTS.sm,
    color: "rgba(255, 255, 255, 0.7)",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
    fontWeight: "500",
    textAlign: "left",
  },
  portfolioValue: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
    textAlign: "left",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  portfolioChange: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
    width: 130,
  },
  portfolioChangeText: {
    color: "#4ECDC4",
    fontSize: FONTS.xs,
    fontWeight: "600",
    marginLeft: 3,
    letterSpacing: 0.3,
  },
  
  // Sync Button (Header)
  syncButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  syncButtonDisabled: {
    backgroundColor: "rgba(102, 102, 102, 0.1)",
    opacity: 0.6,
  },
  
  // Error Container
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderColor: "#F44336",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: FONTS.base,
    color: "#F44336",
    fontWeight: "500",
  },
  
  // Holdings Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: "#4A90E2",
    letterSpacing: 0.3,
  },
  cashInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    marginBottom: 16,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cashLabel: {
    fontSize: FONTS.sm,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "500",
  },
  cashValue: {
    fontSize: FONTS.lg,
    color: "#4A90E2",
    fontWeight: "700",
  },
  
  // Holdings Cards
  holdingsGrid: {
    gap: 16,
  },
  holdingCard: {
    backgroundColor: "rgba(31, 31, 31, 0.8)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  holdingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  holdingSymbolContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  companyLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  holdingSymbolInfo: {
    flex: 1,
  },
  holdingSymbol: {
    fontSize: FONTS.base,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  holdingValue: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  holdingDescription: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.6)",
    lineHeight: 14,
  },
  holdingDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  holdingDetail: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  holdingDetailLabel: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.6)",
    marginRight: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  holdingDetailValue: {
    fontSize: FONTS.sm,
    color: "#fff",
    fontWeight: "600",
  },
  holdingPnL: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  holdingPnLPositive: {
    color: "#4ECDC4",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  holdingPnLNegative: {
    color: "#FF6B6B",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
  },
  
  // Options Cards
  optionCard: {
    backgroundColor: "rgba(31, 31, 31, 0.8)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 152, 0, 0.2)",
    shadowColor: "#FF9800",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  optionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  optionSymbol: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  optionValue: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: "#FF9800",
  },
  optionDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  optionDetail: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  optionDetailLabel: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.6)",
    marginRight: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  optionDetailValue: {
    fontSize: FONTS.sm,
    color: "#FF9800",
    fontWeight: "600",
  },
  
  
  // Empty States
  emptyState: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
  },
  emptyStateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: FONTS.base,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    lineHeight: 20,
  },
  
  // Loading States
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#fff",
    fontSize: FONTS.lg,
    marginTop: 16,
    fontWeight: "500",
  },
});

export default styles;

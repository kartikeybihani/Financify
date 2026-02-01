// @refresh reset
import { StyleSheet, Platform, Dimensions } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Font size constants for consistency
const FONTS = {
  xs: 10,
  sm: 13,
  base: 14,
  lg: 16,
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
  content: {
    paddingTop: 0,
    marginTop: 0,
    paddingBottom: 32,
    paddingHorizontal: 0,
  },
  
  // Sticky Header Container
  stickyHeaderContainer: {
    backgroundColor: "#121212",
    paddingTop: 0,
    zIndex: 10,
    elevation: 4,
  },
  
  // Portfolio Summary Section
  portfolioSummaryContainer: {
    marginBottom: 24,
    position: "relative",
    zIndex: 1,
  },
  portfolioSummaryContent: {
    marginBottom: 24,
  },
  portfolioInfo: {
    marginBottom: 12,
  },
  portfolioLabel: {
    fontSize: FONTS.sm,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1.0,
    marginBottom: 6,
  },
  portfolioValue: {
    fontSize: FONTS.xxxl,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  profitLossIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  profitLossText: {
    fontSize: FONTS.base,
    fontWeight: "600",
    marginLeft: 4,
  },
  accountInfo: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  accountChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
    marginRight: 12,
    marginBottom: -8,
  },
  accountChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    minHeight: 36,
    marginRight: 8,
    marginBottom: 8,
  },
  accountChipSelected: {
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    borderColor: "rgba(74, 144, 226, 0.4)",
  },
  accountChipLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  accountChipContent: {
    flex: 1,
    minWidth: 0,
  },
  accountChipName: {
    fontSize: FONTS.sm - 1,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "600",
    marginBottom: 1,
  },
  accountChipNameSelected: {
    color: "#4A90E2",
  },
  accountChipTime: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.6)",
  },
  accountChipTimeSelected: {
    color: "rgba(74, 144, 226, 0.8)",
  },
  addAccountTopRight: {
    position: "absolute",
    top: 10,
    right: 0,
    zIndex: 100,
    elevation: 10,
  },
  brokerageInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  brokerageLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  brokerageDetails: {
    flex: 1,
    marginRight: 8,
  },
  accountName: {
    fontSize: FONTS.base,
    color: "#fff",
    fontWeight: "600",
    marginBottom: 2,
  },
  lastSyncText: {
    fontSize: FONTS.sm,
    color: "rgba(255, 255, 255, 0.6)",
  },
  availableCash: {
    fontSize: FONTS.sm,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
  },
  todayPerformanceContainer: {
    marginTop: 6,
  },
  todayPerformanceText: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    marginLeft: 2,
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
  
  // Investment Group Styles
  investmentGroup: {
    marginBottom: 16, // Reduced from 24
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.9)",
    marginBottom: 8, // Reduced from 12
    marginLeft: 0, // Removed left margin for cleaner alignment
  },
  glassContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    paddingVertical: 1,
  },
  flexRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  primaryLabel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
    flex: 1,
  },
  cashAmountText: {
    fontSize: 18,
    color: "#4A90E2",
    fontWeight: "600",
  },
  
  // Holdings Row Styles
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  holdingLeft: {  
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  holdingRight: {
    alignItems: "flex-end",
  },
  stockLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  optionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stockInfo: {
    flex: 1,
  },
  stockSymbol: {
    fontSize: FONTS.base,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  stockDescription: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.6)",
    lineHeight: 14,
  },
  stockQuantity: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  stockMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  todayPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  todayPillText: {
    fontSize: FONTS.xs,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
  },
  stockValue: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: "#4ECDC4",
    marginBottom: 4,
  },
  stockDetails: {
    alignItems: "flex-end",
  },
  stockDetail: {
    fontSize: FONTS.xs,
    color: "rgba(255, 255, 255, 0.5)",
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginLeft: 44,
    marginRight: 16,
  },
  pnlText: {
    fontSize: FONTS.xs,
    fontWeight: "600",
  },
  pnlPositive: {
    color: "#4ECDC4",
  },
  pnlNegative: {
    color: "#FF6B6B",
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
  buttonGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  
  // Error Container
  disabledBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#FF6B6B",
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 8,
    gap: 12,
  },
  disabledBannerContent: {
    flex: 1,
  },
  disabledBannerText: {
    color: "#FF6B6B",
    fontSize: FONTS.base,
    marginBottom: 8,
    lineHeight: 20,
  },
  reconnectButton: {
    backgroundColor: "#FF6B6B",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  reconnectButtonText: {
    color: "#fff",
    fontSize: FONTS.base,
    fontWeight: "600",
  },
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
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  filterIconContainer: {
    width: 27,
    height: 27,
    borderRadius: 16,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
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
  
  // Portfolio Loading State
  portfolioLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  portfolioLoadingText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: FONTS.base,
    marginLeft: 8,
    fontWeight: "500",
  },
  
  // Security Type Filter Chips
  securityTypeChipsContainer: {
    marginBottom: 16,
    paddingHorizontal: 4,
    marginTop: -20, // Remove space between brokerage info and chips
    marginLeft: -2,
  },
  securityTypeChipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  securityTypeChip: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minWidth: 60,
    alignItems: "center",
  },
  securityTypeChipSelected: {
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    borderColor: "rgba(74, 144, 226, 0.4)",
  },
  securityTypeChipText: {
    fontSize: FONTS.sm - 1,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  securityTypeChipTextSelected: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  
  // Sort Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: SCREEN_HEIGHT * 0.3,
    maxHeight: SCREEN_HEIGHT * 0.5,
    width: SCREEN_WIDTH,
  },
  modalHeader: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  modalTitle: {
    fontSize: Math.max(18, SCREEN_WIDTH * 0.05),
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  sortOptionsContainer: {
    padding: Math.max(20, SCREEN_WIDTH * 0.05),
  },
  sortOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sortOptionText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
  },
  sortOptionTextSelected: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  
  // Percentage Chip Styles
  percentageChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  percentageChipText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  
  // Loading State Styles
  loadingStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 80,
    minHeight: SCREEN_HEIGHT * 0.5,
  },
  loadingStateContent: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 320,
  },
  loadingStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  loadingStateTitle: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  loadingStateMessage: {
    fontSize: FONTS.base,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
  
  // Empty State Styles
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 80,
    minHeight: SCREEN_HEIGHT * 0.5,
  },
  emptyStateContent: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 320,
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  emptyStateTitle: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateMessage: {
    fontSize: FONTS.base,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyStateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4A90E2",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyStateButtonText: {
    color: "#fff",
    fontSize: FONTS.base,
    fontWeight: "600",
  },
});

export default styles;

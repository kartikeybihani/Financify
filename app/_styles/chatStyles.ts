import { StyleSheet, Platform, Dimensions } from "react-native";

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Responsive breakpoints
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

// Responsive calculations
const responsiveWidth = (percentage: number) => screenWidth * (percentage / 100);
const responsiveHeight = (percentage: number) => screenHeight * (percentage / 100);
const responsiveFontSize = (baseSize: number) => {
  if (isSmallScreen) return baseSize * 0.9;
  if (isLargeScreen) return baseSize * 1.1;
  return baseSize;
};
const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.8;
  if (isLargeScreen) return basePadding * 1.2;
  return basePadding;
};

// Orientation-aware calculations
const isLandscape = screenWidth > screenHeight;
const responsiveOrientationPadding = (basePadding: number) => {
  return isLandscape ? basePadding * 0.7 : basePadding;
};

export default StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
    minHeight: screenHeight,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: responsivePadding(20),
    paddingTop: Platform.OS === "ios" ? responsivePadding(8) : responsivePadding(12),
    paddingBottom: responsivePadding(16),
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(74, 144, 226, 0.1)",
    position: 'relative',
    minHeight: responsiveHeight(8),
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? responsiveHeight(12) : responsiveHeight(15),
    zIndex: -1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  mascotContainer: {
    width: responsiveWidth(12),
    height: responsiveWidth(12),
    borderRadius: responsiveWidth(6),
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: 2,
    borderWidth: 1.5,
    borderColor: "rgba(74, 144, 226, 0.3)",
    overflow: 'hidden',
    marginRight: responsivePadding(12),
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mascotImage: {
    width: '100%',
    height: '100%',
    borderRadius: responsiveWidth(5.5),
  },
  sparkleContainer: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  sparkleTopRight: {
    top: -8,
    right: -8,
  },
  sparkleTopLeft: {
    top: -6,
    left: -6,
  },
  sparkleBottomRight: {
    bottom: -6,
    right: -6,
  },
  sparkleBottomLeft: {
    bottom: -8,
    left: -8,
  },
  headerContent: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    flex: 1,
  },
  headerTitle: {
    fontSize: responsiveFontSize(20),
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: responsiveFontSize(13),
    color: "rgba(255, 255, 255, 0.7)",
    letterSpacing: 0.3,
    fontWeight: "500",
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    padding: responsivePadding(10),
    width: responsiveWidth(10),
    height: responsiveWidth(10),
    borderRadius: responsiveWidth(5),
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.25)",
    shadowColor: "#FF3B30",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  clearButtonText: {
    color: "#FF3B30",
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 4,
    letterSpacing: 0.2,
  },
  tabSwitcher: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#1c1c1c",
    borderRadius: 12,
    marginHorizontal: responsivePadding(20),
    marginBottom: responsivePadding(10),
  },
  tabButton: {
    paddingVertical: responsivePadding(10),
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: "#2e2e2e",
  },
  tabText: {
    color: "#aaa",
    fontSize: responsiveFontSize(14),
  },
  activeText: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  chatContainer: {
    flex: 1,
    paddingBottom: responsiveHeight(12),
  },
  chatScroll: {
    flex: 1,
    paddingHorizontal: responsivePadding(14),
    paddingTop: responsivePadding(12),
  },
  chatBubble: {
    maxWidth: isSmallScreen ? "85%" : "80%",
    padding: responsivePadding(12),
    borderRadius: 18,
    marginVertical: responsivePadding(6),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chatLeft: {
    alignSelf: "flex-start",
    backgroundColor: "#2c2c2c",
    borderTopLeftRadius: 4,
  },
  chatRight: {
    alignSelf: "flex-end",
    backgroundColor: "#4A90E2",
    borderTopRightRadius: 4,
  },
  chatText: {
    color: "#fff",
    fontSize: responsiveFontSize(15),
    lineHeight: responsiveFontSize(22),
    letterSpacing: 0.2,
  },
  chatMoney: {
    fontWeight: "600",
    color: "#4A90E2",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: responsivePadding(8),
    paddingRight: responsivePadding(8),
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    paddingBottom: responsivePadding(4),
    marginHorizontal: responsivePadding(10),
    marginBottom: 0,
    borderWidth: 1.5,
    borderColor: "rgba(74, 144, 226, 0.25)",
    paddingTop: responsivePadding(4),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    minHeight: responsiveHeight(6),
  },
  plusButton: {
    padding: responsivePadding(2),
    marginRight: responsivePadding(4),
  },
  sendButton: {
    // backgroundColor: "#4A90E2",
    // width: 35,
    // height: 35,
    // borderRadius: 17.5,
    // justifyContent: "center",
    // alignItems: "center",
    // marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: responsiveFontSize(14),
    color: "#fff",
    paddingVertical: responsivePadding(4),
    marginHorizontal: responsivePadding(4),
    minHeight: responsiveHeight(4),
  },
  nudgeContainer: {
    marginBottom: responsivePadding(16),
    paddingHorizontal: responsivePadding(10),
  },
  nudgeHeaderText: {
    color: "#888",
    fontSize: responsiveFontSize(13),
    marginBottom: responsivePadding(8),
    marginLeft: responsivePadding(2),
    fontWeight: "500",
    textAlign: "center",
  },
  nudgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  nudgeBox: {
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    padding: responsivePadding(6),
    marginBottom: responsivePadding(8),
    width: isSmallScreen ? "47%" : "48%",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  nudgeText: {
    color: "#fff",
    fontSize: responsiveFontSize(12),
    textAlign: "center",
    lineHeight: responsiveFontSize(16),
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4A90E2",
    marginHorizontal: 2,
  },
  inputBarContainer: {
    position: 'absolute',
    bottom: -5,
    left: 0,
    right: 0,
    backgroundColor: "#121212",
    paddingTop: responsivePadding(2),
    paddingBottom: Platform.OS === "ios" ? responsivePadding(8) : responsivePadding(4),
    borderTopWidth: 1,
    borderTopColor: "rgba(44, 44, 44, 0.8)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
    minHeight: responsiveHeight(8),
  },
  suggestionsContainer: {
    flexDirection: "row",
    paddingHorizontal: responsivePadding(10),
    paddingVertical: responsivePadding(10),
    marginBottom: responsivePadding(6),
    marginTop: responsivePadding(2),
    // Optionally add backdrop blur here if using a BlurView wrapper in the component
  },
  suggestionChip: {
    paddingHorizontal: responsivePadding(14),
    paddingVertical: responsivePadding(8),
    borderRadius: 16,
    marginRight: responsivePadding(8),
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    opacity: 0.95,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.25)",
    backgroundColor: "rgba(26, 61, 102, 0.35)", // glassy blue
    minHeight: responsiveHeight(4),
    // If BlurView is used, backgroundColor can be more transparent
  },
  suggestionIcon: {
    marginRight: responsivePadding(5),
  },
  suggestionText: {
    fontSize: responsiveFontSize(13),
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  scrollToBottomButton: {
    position: 'absolute',
    right: responsivePadding(16),
    bottom: responsiveHeight(20),
    width: responsiveWidth(9),
    height: responsiveWidth(9),
    borderRadius: responsiveWidth(4.5),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  scrollButtonTouchable: {
    width: '100%',
    height: '100%',
    borderRadius: responsiveWidth(4.5),
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: responsiveWidth(4.5),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
  },
}); 
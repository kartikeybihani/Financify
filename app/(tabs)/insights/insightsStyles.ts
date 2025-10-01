import { StyleSheet } from "react-native";

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

// Prevent Expo Router from treating this as a route by providing a no-op default export
export default function InsightsStylesPlaceholder() { return null; }

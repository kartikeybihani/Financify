import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as WebBrowser from "expo-web-browser";
import {
  registerSnaptradeUser,
  fetchSnaptradeAccounts,
  hasSnaptradeConnection,
  fetchSnaptradeAccountsFromStorage,
  getStoredSnaptradeCredentials,
  fetchSnaptradeHoldingsFromStorage,
  fetchSnaptradeHoldings,
} from "../../utils/plaid";
import { storeSnaptradeCredentials } from "../../utils/snaptradeStorage";

interface Institution {
  id: string;
  name: string;
  color: string;
  initials: string;
}

interface InstitutionSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onInstitutionSelect: (institutionId: string) => void;
  onReopenFinancialSheet?: () => void;
}

const institutions: Institution[] = [
  {
    id: "american_express",
    name: "American Express",
    color: "#006FCF",
    initials: "AE",
  },
  {
    id: "capital_one",
    name: "Capital One",
    color: "#FF0000",
    initials: "CO",
  },
  {
    id: "chase",
    name: "Chase",
    color: "#117ACA",
    initials: "CH",
  },
  {
    id: "fidelity",
    name: "Fidelity",
    color: "#00A651",
    initials: "FI",
  },
  {
    id: "wells_fargo",
    name: "Wells Fargo",
    color: "#D71921",
    initials: "WF",
  },
  {
    id: "alpaca",
    name: "Alpaca",
    color: "#FFC107",
    initials: "AL",
  },
  {
    id: "charles_schwab",
    name: "Charles Schwab",
    color: "#00A0DF",
    initials: "CS",
  },
  {
    id: "coinbase",
    name: "Coinbase",
    color: "#0052FF",
    initials: "CB",
  },
  {
    id: "etrade",
    name: "E*TRADE",
    color: "#9013FE",
    initials: "ET",
  },
  {
    id: "interactive_brokers",
    name: "Interactive Brokers",
    color: "#DC143C",
    initials: "IB",
  },
  {
    id: "public",
    name: "Public",
    color: "#212121",
    initials: "PU",
  },
  {
    id: "robinhood",
    name: "Robinhood",
    color: "#00C805",
    initials: "RH",
  },
  {
    id: "wealthfront",
    name: "Wealthfront",
    color: "#4840BB",
    initials: "WF",
  },
  {
    id: "webull",
    name: "Webull",
    color: "#1976D2",
    initials: "WB",
  },
];

export default function InstitutionSelectionModal({
  visible,
  onClose,
  onInstitutionSelect,
  onReopenFinancialSheet,
}: InstitutionSelectionModalProps) {
  const { height } = useWindowDimensions();
  const maxHeight = height * 0.85;
  const [isConnecting, setIsConnecting] = useState(false);

  const handleFidelityConnection = async () => {
    console.log("🔄 Starting Fidelity connection...");
    setIsConnecting(true);

    try {
      // First, check if user already has a valid Snaptrade connection
      const hasExistingConnection = await hasSnaptradeConnection();

      if (hasExistingConnection) {
        console.log(
          "✅ Found existing Snaptrade connection, fetching accounts..."
        );

        try {
          const accounts = await fetchSnaptradeAccountsFromStorage();
          console.log("✅ Existing Snaptrade accounts fetched:", accounts);

          // Fetch holdings for the first account using stored credentials
          if (accounts.length > 0) {
            const firstAccount = accounts[0];
            if (firstAccount && firstAccount.id) {
              try {
                console.log(
                  "🔄 Fetching holdings for account:",
                  firstAccount.id
                );
                await fetchSnaptradeHoldingsFromStorage(firstAccount.id);
              } catch (holdingsError) {
                console.error(
                  "⚠️ Failed to fetch holdings (continuing anyway):",
                  holdingsError
                );
                // Don't fail the whole flow if holdings fetch fails
              }
            }
          }

          if (accounts.length === 0) {
            // No accounts found - allow user to connect
            console.log(
              "🔄 No accounts found, proceeding with new connection..."
            );
            // Continue with new connection flow below
          } else {
            Alert.alert(
              "Fidelity Account Connected",
              `You already have a Fidelity account connected with ${accounts.length} account(s). Holdings data has been fetched and logged to console.`,
              [
                {
                  text: "OK",
                  onPress: () => {
                    setIsConnecting(false);
                    onClose();
                  },
                },
              ]
            );
            return;
          }
        } catch (accountError) {
          console.error(
            "❌ Failed to fetch existing accounts, proceeding with new connection:",
            accountError
          );
          // Continue with new connection flow if fetching existing accounts fails
        }
      }

      // No existing connection or failed to fetch existing accounts - proceed with new connection
      console.log(
        "🔄 Starting new Snaptrade user registration for Fidelity..."
      );
      const snaptradeData = await registerSnaptradeUser();
      console.log("✅ Snaptrade user registered successfully:", snaptradeData);

      // Open the redirect URI in a web browser
      if (snaptradeData.redirectURI) {
        console.log(
          "🌐 Opening Snaptrade redirect URI:",
          snaptradeData.redirectURI
        );

        const result = await WebBrowser.openBrowserAsync(
          snaptradeData.redirectURI,
          {
            presentationStyle:
              WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
          }
        );

        console.log("🔗 WebBrowser result:", result);

        // After the user completes the connection, fetch their accounts
        if (result.type === "cancel") {
          console.log("🔄 User completed connection, fetching accounts...");
          try {
            const accounts = await fetchSnaptradeAccounts(
              snaptradeData.snaptrade.userId,
              snaptradeData.snaptrade.userSecret
            );
            console.log("✅ Snaptrade accounts fetched:", accounts);

            // Store credentials in AsyncStorage for future use
            try {
              await storeSnaptradeCredentials(
                snaptradeData.snaptrade.userId,
                snaptradeData.snaptrade.userSecret
              );
              console.log("✅ Snaptrade credentials stored successfully");
            } catch (storageError) {
              console.error(
                "⚠️ Failed to store credentials (continuing anyway):",
                storageError
              );
              // Don't fail the whole connection if storage fails
            }

            // Fetch holdings for the first account using new credentials
            if (accounts.length > 0) {
              const firstAccount = accounts[0];
              if (firstAccount && firstAccount.id) {
                try {
                  console.log(
                    "🔄 Fetching holdings for new account:",
                    firstAccount.id
                  );
                  await fetchSnaptradeHoldings(
                    snaptradeData.snaptrade.userId,
                    snaptradeData.snaptrade.userSecret,
                    firstAccount.id
                  );
                } catch (holdingsError) {
                  console.error(
                    "⚠️ Failed to fetch holdings (continuing anyway):",
                    holdingsError
                  );
                  // Don't fail the whole flow if holdings fetch fails
                }
              }
            }

            Alert.alert(
              "Success!",
              `Fidelity account connected successfully! Found ${accounts.length} account(s). Holdings data has been fetched and logged to console.`,
              [
                {
                  text: "OK",
                  onPress: () => {
                    setIsConnecting(false);
                    onClose();
                  },
                },
              ]
            );
          } catch (accountError) {
            console.error("❌ Failed to fetch accounts:", accountError);

            // Still store credentials even if account fetch fails
            try {
              await storeSnaptradeCredentials(
                snaptradeData.snaptrade.userId,
                snaptradeData.snaptrade.userSecret
              );
              console.log(
                "✅ Snaptrade credentials stored despite account fetch failure"
              );
            } catch (storageError) {
              console.error("⚠️ Failed to store credentials:", storageError);
            }

            Alert.alert(
              "Connection Successful",
              "Fidelity account connected, but couldn't fetch account details.",
              [
                {
                  text: "OK",
                  onPress: () => {
                    setIsConnecting(false);
                    onClose();
                  },
                },
              ]
            );
          }
        } else {
          // User cancelled or there was an error
          setIsConnecting(false);
        }
      } else {
        throw new Error("No redirect URI received from Snaptrade");
      }
    } catch (error) {
      console.error("❌ Failed to connect Fidelity account:", error);
      Alert.alert(
        "Connection Failed",
        `Failed to connect Fidelity account: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        [
          {
            text: "OK",
            onPress: () => setIsConnecting(false),
          },
        ]
      );
    }
  };

  const handleInstitutionPress = (institutionId: string) => {
    if (institutionId === "fidelity") {
      handleFidelityConnection();
    } else {
      onInstitutionSelect(institutionId);
      onClose();
    }
  };

  const handleOtherInstitutions = () => {
    // Handle "Other Institutions" selection
    onInstitutionSelect("other");
    onClose();
  };

  const handleClose = () => {
    onClose();
    // Reopen the financial sheet after a short delay
    setTimeout(() => {
      onReopenFinancialSheet?.();
    }, 300);
  };

  const renderInstitutionCard = (institution: Institution) => {
    const isLoadingFidelity = isConnecting && institution.id === "fidelity";

    return (
      <TouchableOpacity
        key={institution.id}
        style={[
          styles.institutionCard,
          isLoadingFidelity && styles.institutionCardLoading,
        ]}
        onPress={() => handleInstitutionPress(institution.id)}
        activeOpacity={0.8}
        disabled={isLoadingFidelity}
      >
        <View style={styles.institutionContent}>
          <View style={styles.logoContainer}>
            <View
              style={[
                styles.logoPlaceholder,
                { backgroundColor: institution.color },
              ]}
            >
              {isLoadingFidelity ? (
                <Ionicons name="hourglass" size={20} color="#fff" />
              ) : (
                <Text style={styles.logoText}>{institution.initials}</Text>
              )}
            </View>
          </View>
          <Text style={styles.institutionName}>
            {isLoadingFidelity ? "Connecting..." : institution.name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <BlurView intensity={50} style={StyleSheet.absoluteFill} tint="dark" />
        <View style={styles.modalContainer}>
          <View style={[styles.sheet, { height: maxHeight }]}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            <View style={styles.header}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Select your institution</Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
              >
                <View style={styles.closeButtonContainer}>
                  <Ionicons name="close" size={20} color="#888" />
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={styles.institutionsGrid}>
                {institutions.map((institution) =>
                  renderInstitutionCard(institution)
                )}

                {/* Other Institutions Card */}
                <TouchableOpacity
                  style={[styles.institutionCard, styles.otherInstitutionsCard]}
                  onPress={handleOtherInstitutions}
                  activeOpacity={0.8}
                >
                  <View style={styles.institutionContent}>
                    <View style={styles.otherInstitutionsIcon}>
                      <Ionicons
                        name="business-outline"
                        size={24}
                        color="#4A90E2"
                      />
                    </View>
                    <Text style={styles.institutionName}>
                      Other Institutions
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  modalContainer: {
    width: "100%",
    backgroundColor: "transparent",
  },
  sheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
  },
  handleContainer: {
    width: "100%",
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 10,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#fff",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.3,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },
  institutionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
  },
  institutionCard: {
    width: "47%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    minHeight: 120,
  },
  institutionCardLoading: {
    opacity: 0.6,
    backgroundColor: "rgba(0, 166, 81, 0.1)",
    borderColor: "rgba(0, 166, 81, 0.3)",
  },
  otherInstitutionsCard: {
    borderStyle: "dashed",
    borderColor: "rgba(74, 144, 226, 0.3)",
    backgroundColor: "rgba(74, 144, 226, 0.05)",
  },
  institutionContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  otherInstitutionsIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
  },
  institutionName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#fff",
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
    lineHeight: 18,
  },
});

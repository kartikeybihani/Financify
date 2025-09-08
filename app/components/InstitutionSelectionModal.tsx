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
import { Snaptrade } from "snaptrade-typescript-sdk";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";

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

  // SnapTrade configuration - using environment variable pattern from docs
  const snaptradeConfig = {
    consumerKey: "VNXDUFrjam8GNo7AvoHteYHGbve7rb7XWpBvEZoIi49Mvwze7t",
    clientId: "FINANCIFY-TEST-NXIOI",
  };

  console.log("🔧 Initializing SnapTrade with config:", {
    clientId: snaptradeConfig.clientId,
    consumerKeyLength: snaptradeConfig.consumerKey.length,
  });

  // Initialize SnapTrade inside the function to avoid crypto initialization issues
  let snaptrade: Snaptrade;

  // for production
  // production consumer key: 9s69C4vWTbgLItVj4O3RzGNMx64ckNp1qj8NTURTmBX4E4Y7iw
  // client id: FINANCIFY-SIWQW

  // for development
  // consumer key: VNXDUFrjam8GNo7AvoHteYHGbve7rb7XWpBvEZoIi49Mvwze7t
  // client id: FINANCIFY-TEST-NXIOI

  // Helper function to add timeout to promises
  const withTimeout = (promise: Promise<any>, timeoutMs: number) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  };

  // Generate UUID using the pattern from SnapTrade npm docs
  const generateUserId = () => {
    try {
      // First try Expo's crypto
      return Crypto.randomUUID();
    } catch (error) {
      console.warn("Expo crypto not available, using SnapTrade docs pattern");
      // Use the exact pattern from SnapTrade npm docs
      var d = new Date().getTime(); //Timestamp
      var d2 =
        (typeof performance !== "undefined" &&
          performance.now &&
          performance.now() * 1000) ||
        0; //Time in microseconds since page-load or 0 if unsupported
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          var r = Math.random() * 16; //random number between 0 and 16
          if (d > 0) {
            //Use timestamp until depleted
            r = (d + r) % 16 | 0;
            d = Math.floor(d / 16);
          } else {
            //Use microseconds since page-load if supported
            r = (d2 + r) % 16 | 0;
            d2 = Math.floor(d2 / 16);
          }
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        }
      );
    }
  };

  const handleFidelityConnection = async () => {
    try {
      setIsConnecting(true);
      Alert.alert("Connecting", "Setting up your Fidelity connection...");

      // Step 1: Initialize SnapTrade client inside function (avoid crypto init issues)
      console.log("🔧 Initializing SnapTrade client...");
      snaptrade = new Snaptrade(snaptradeConfig);

      // Step 2: Register SnapTrade User
      const userId = generateUserId();
      console.log("🔄 Registering user with ID:", userId);
      console.log("🔄 SnapTrade config:", {
        clientId: snaptradeConfig.clientId,
        consumerKeyLength: snaptradeConfig.consumerKey.length,
      });

      // Test network connectivity first
      try {
        console.log("🌐 Testing network connectivity...");
        const testResponse = await fetch("https://httpbin.org/status/200", {
          method: "GET",
        });
        console.log(
          "✅ Network connectivity test passed:",
          testResponse.status
        );
      } catch (networkError) {
        console.error("❌ Network connectivity test failed:", networkError);
        throw new Error(
          "Network connectivity issue. Please check your internet connection."
        );
      }

      let userSecret;
      try {
        console.log("🔄 Making registration API call with 30s timeout...");
        console.log("📤 Request payload:", { userId: userId });

        // Debug crypto state before API call
        console.log("🔍 Crypto debug:", {
          cryptoExists: !!global.crypto,
          getRandomValuesExists: !!(
            global.crypto && global.crypto.getRandomValues
          ),
          subtleExists: !!(global.crypto && global.crypto.subtle),
          webCryptoExists: !!(
            global.crypto &&
            global.crypto.subtle &&
            global.crypto.subtle.sign
          ),
        });

        // Step 3: Check API status first (from official docs)
        console.log("🔄 Checking SnapTrade API status...");
        try {
          const status = await withTimeout(
            snaptrade.apiStatus.check(),
            10000 // 10 second timeout for status check
          );
          console.log("✅ SnapTrade API status:", status.data);
        } catch (statusError) {
          console.warn(
            "⚠️ API status check failed, continuing anyway:",
            statusError
          );
        }

        // Step 4: Register user using official SDK pattern
        console.log("🔄 Using official SDK registration pattern...");
        const registerResponse = await withTimeout(
          snaptrade.authentication.registerSnapTradeUser({ userId }),
          30000 // 30 second timeout
        );

        console.log("✅ Registration API call completed");
        console.log("📋 Registration response:", registerResponse.data);

        // Extract userSecret using destructuring as in the example
        userSecret = registerResponse.data.userSecret;
      } catch (registrationError: any) {
        console.error("❌ Registration API call failed:", registrationError);
        console.error("❌ Error details:", {
          message: registrationError.message,
          status: registrationError.status,
          response: registrationError.response?.data,
          stack: registrationError.stack?.substring(0, 200),
        });

        if (registrationError.message?.includes("timed out")) {
          console.error("❌ This appears to be a network timeout issue");
        }
        throw registrationError;
      }

      if (!userSecret) {
        console.error("❌ No userSecret in registration response");
        throw new Error("Failed to get user secret from registration");
      }

      console.log("✅ User registered successfully, userSecret:", userSecret);

      // Step 2: Generate Connection Portal URL
      console.log("🔗 Generating connection portal URL...");
      const loginResponse = await snaptrade.authentication.loginSnapTradeUser({
        userId: userId,
        userSecret: userSecret,
        broker: "FIDELITY",
        immediateRedirect: true,
        customRedirect: "https://snaptrade.com",
        connectionPortalVersion: "v4",
      });

      console.log("🔗 Login response:", loginResponse.data);
      const redirectURI = (loginResponse.data as any).redirectURI;
      const sessionId = (loginResponse.data as any).sessionId;

      console.log("🔗 Extracted redirectURI:", redirectURI);
      console.log("🔗 Extracted sessionId:", sessionId);

      if (!redirectURI) {
        console.error(
          "❌ No redirectURI in login response:",
          loginResponse.data
        );
        throw new Error("Failed to get redirect URI from login response");
      }

      // Step 3: Open Connection Portal
      Alert.alert(
        "Connect Account",
        "You'll be redirected to Fidelity to connect your account. Please complete the connection and then return to the app.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setIsConnecting(false),
          },
          {
            text: "Continue",
            onPress: async () => {
              try {
                const result = await WebBrowser.openBrowserAsync(redirectURI);
                console.log("WebBrowser result:", result);

                // After user returns from browser, list accounts
                if (result.type === "dismiss" || result.type === "cancel") {
                  Alert.alert(
                    "Connection Status",
                    "Please check if your account was connected successfully.",
                    [
                      {
                        text: "Check Accounts",
                        onPress: () => listUserAccounts(userId, userSecret),
                      },
                      {
                        text: "Cancel",
                        style: "cancel",
                        onPress: () => setIsConnecting(false),
                      },
                    ]
                  );
                }
              } catch (error) {
                console.error("Error opening browser:", error);
                Alert.alert("Error", "Failed to open connection portal");
                setIsConnecting(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("❌ SnapTrade connection error:", error);

      // Provide more specific error messages
      let errorMessage = "Failed to connect to SnapTrade. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("importKey")) {
          errorMessage =
            "Crypto initialization failed. Please restart the app and try again.";
        } else if (error.message.includes("userSecret")) {
          errorMessage =
            "Failed to register user with SnapTrade. Please try again.";
        } else if (error.message.includes("redirectURI")) {
          errorMessage = "Failed to generate connection URL. Please try again.";
        } else {
          errorMessage = `Connection failed: ${error.message}`;
        }
      }

      Alert.alert("Connection Error", errorMessage);
      setIsConnecting(false);
    }
  };

  const listUserAccounts = async (userId: string, userSecret: string) => {
    try {
      console.log("Listing user accounts...");
      const accountsResponse =
        await snaptrade.accountInformation.listUserAccounts({
          userId: userId,
          userSecret: userSecret,
        });

      console.log("User accounts:", accountsResponse.data);
      Alert.alert(
        "Success!",
        `Connected ${accountsResponse.data.length} account(s) successfully!`,
        [
          {
            text: "OK",
            onPress: () => {
              setIsConnecting(false);
              onInstitutionSelect("fidelity");
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error listing accounts:", error);
      Alert.alert(
        "Error",
        "Failed to retrieve accounts. The connection might still be in progress."
      );
      setIsConnecting(false);
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

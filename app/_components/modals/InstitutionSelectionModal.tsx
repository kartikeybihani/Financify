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
  handleSnapTradeRegister,
  handleSnapTradeLogin,
  callSnapTradeAPI,
  fetchSnaptradeAccounts,
  hasSnaptradeConnection,
  fetchSnaptradeAccountsFromStorage,
  getStoredSnaptradeCredentials,
  fetchSnaptradeHoldingsFromStorage,
  fetchSnaptradeHoldings,
  storeSnaptradeCredentials,
  syncSnaptradeInvestments,
  getSnaptradeHoldingsFromDB,
  getSnaptradeOptionsFromDB,
  getSnaptradeBalancesFromDB,
  getSnaptradeConnectionsFromDB,
} from "../../_utils/snaptrade";
import { supabase } from "../../_lib/supabase/supabase";

interface Institution {
  id: string;
  name: string;
  color: string;
  initials: string;
}

interface Holding {
  symbol: string;
  description: string;
  units: number;
  price: number;
  market_value: number;
  unrealized_pl: number | null;
}

interface Option {
  underlying_symbol: string;
  option_type: string;
  strike_price: number;
  expiration_date: string;
  units: number;
  price: number;
  market_value: number;
}

interface Balance {
  cash: number;
  buying_power: number;
  currency_code: string;
}

interface Connection {
  account_id: string;
  brokerage_name: string;
  account_name: string;
  last_synced_at: string | null;
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
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [investmentData, setInvestmentData] = useState<{
    holdings: Holding[];
    options: Option[];
    balances: Balance[];
    connections: Connection[];
  }>({
    holdings: [],
    options: [],
    balances: [],
    connections: [],
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Load investment data from database
  const loadInvestmentData = async () => {
    try {
      console.log("🔄 Loading investment data from database...");
      const [holdings, options, balances, connections] = await Promise.all([
        getSnaptradeHoldingsFromDB(),
        getSnaptradeOptionsFromDB(),
        getSnaptradeBalancesFromDB(),
        getSnaptradeConnectionsFromDB(),
      ]);

      setInvestmentData({
        holdings: holdings || [],
        options: options || [],
        balances: balances || [],
        connections: connections || [],
      });

      console.log("✅ Investment data loaded:", {
        holdings: holdings?.length || 0,
        options: options?.length || 0,
        balances: balances?.length || 0,
        connections: connections?.length || 0,
      });
    } catch (error) {
      console.error("❌ Failed to load investment data:", error);
    }
  };

  // Sync investment data
  const handleSyncInvestments = async () => {
    setIsSyncing(true);
    try {
      const credentials = await getStoredSnaptradeCredentials();
      if (credentials && investmentData.connections.length > 0) {
        const connection = investmentData.connections[0];
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await syncSnaptradeInvestments(user.id, connection.account_id);
          // Reload data after sync
          await loadInvestmentData();
          Alert.alert("Success", "Investment data synced successfully!");
        }
      }
    } catch (error) {
      console.error("❌ Failed to sync investments:", error);
      Alert.alert(
        "Sync Failed",
        "Failed to sync investment data. Please try again."
      );
    } finally {
      setIsSyncing(false);
    }
  };

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

          // Sync investments data to database for existing connection
          if (accounts.length > 0) {
            const firstAccount = accounts[0];
            if (firstAccount && firstAccount.id) {
              try {
                console.log(
                  "🔄 Syncing existing investments data to database for account:",
                  firstAccount.id
                );
                const credentials = await getStoredSnaptradeCredentials();
                if (credentials) {
                  // Get the actual authenticated user ID
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();
                  if (user) {
                    await syncSnaptradeInvestments(
                      user.id, // Actual authenticated user ID
                      firstAccount.id
                    );
                    console.log(
                      "✅ Existing investments data synced to database successfully"
                    );
                  }
                }
              } catch (syncError) {
                console.error(
                  "⚠️ Failed to sync existing investments to database (continuing anyway):",
                  syncError
                );
                // Don't fail the whole flow if sync fails
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
            // Load investment data and show modal
            await loadInvestmentData();
            setIsConnecting(false);
            setShowInvestmentModal(true);
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
      const registerResponse = await registerSnaptradeUser();
      console.log(
        "✅ Snaptrade user registered successfully:",
        registerResponse
      );

      // Now login to get the redirect URI
      const loginResponse = await handleSnapTradeLogin(
        registerResponse.userId,
        registerResponse.userSecret
      );
      console.log("✅ Snaptrade user logged in successfully:", loginResponse);

      // Open the redirect URI in a web browser
      if (loginResponse.redirectURI) {
        console.log(
          "🌐 Opening Snaptrade redirect URI:",
          loginResponse.redirectURI
        );

        const result = await WebBrowser.openBrowserAsync(
          loginResponse.redirectURI,
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
              registerResponse.userId,
              registerResponse.userSecret
            );
            console.log("✅ Snaptrade accounts fetched:", accounts);

            // Store credentials securely in database
            try {
              // Get the actual authenticated user ID
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (user) {
                await storeSnaptradeCredentials(
                  user.id, // Actual authenticated user ID
                  registerResponse.userId, // SnapTrade user ID
                  accounts[0].id, // Account ID
                  registerResponse.userSecret,
                  {
                    brokerage_name: "Fidelity",
                    account_name: accounts[0].name || "Fidelity Account",
                    account_type: "investment",
                  }
                );
                console.log(
                  "✅ SnapTrade credentials stored securely in database"
                );
              }
            } catch (storageError) {
              console.error(
                "⚠️ Failed to store credentials in database (continuing anyway):",
                storageError
              );
              // Don't fail the whole connection if storage fails
            }

            // Sync investments data to database
            if (accounts.length > 0) {
              const firstAccount = accounts[0];
              if (firstAccount && firstAccount.id) {
                try {
                  console.log(
                    "🔄 Syncing investments data to database for account:",
                    firstAccount.id
                  );
                  // Get the actual authenticated user ID
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();
                  if (user) {
                    await syncSnaptradeInvestments(
                      user.id, // Actual authenticated user ID
                      firstAccount.id
                    );
                  }
                  console.log(
                    "✅ Investments data synced to database successfully"
                  );
                } catch (syncError) {
                  console.error(
                    "⚠️ Failed to sync investments to database (continuing anyway):",
                    syncError
                  );
                  // Don't fail the whole flow if sync fails
                }
              }
            }

            // Load investment data and show modal
            await loadInvestmentData();
            setIsConnecting(false);
            setShowInvestmentModal(true);
          } catch (accountError) {
            console.error("❌ Failed to fetch accounts:", accountError);

            // Still store credentials in database even if account fetch fails
            try {
              // Get the actual authenticated user ID
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (user) {
                await storeSnaptradeCredentials(
                  user.id, // Actual authenticated user ID
                  registerResponse.userId, // SnapTrade user ID
                  "unknown", // Account ID unknown due to fetch failure
                  registerResponse.userSecret,
                  {
                    brokerage_name: "Fidelity",
                    account_name: "Fidelity Account",
                    account_type: "investment",
                  }
                );
                console.log(
                  "✅ SnapTrade credentials stored in database despite account fetch failure"
                );
              }
            } catch (storageError) {
              console.error(
                "⚠️ Failed to store credentials in database:",
                storageError
              );
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

  // Investment Data Modal Component
  const renderInvestmentModal = () => {
    if (!showInvestmentModal) return null;

    const totalHoldingsValue = investmentData.holdings.reduce(
      (sum, holding) => sum + (holding.market_value || 0),
      0
    );
    const totalOptionsValue = investmentData.options.reduce(
      (sum, option) => sum + (option.market_value || 0),
      0
    );

    return (
      <Modal
        visible={showInvestmentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInvestmentModal(false)}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={styles.overlay}>
          <BlurView
            intensity={50}
            style={StyleSheet.absoluteFill}
            tint="dark"
          />
          <View style={styles.modalContainer}>
            <View style={[styles.sheet, { height: maxHeight }]}>
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>

              <View style={styles.header}>
                <View style={styles.titleContainer}>
                  <Text style={styles.title}>
                    Fidelity Investment Portfolio
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowInvestmentModal(false)}
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
                {/* Sync Button */}
                <TouchableOpacity
                  style={[
                    styles.syncButton,
                    isSyncing && styles.syncButtonDisabled,
                  ]}
                  onPress={handleSyncInvestments}
                  disabled={isSyncing}
                >
                  <Ionicons
                    name={isSyncing ? "hourglass" : "refresh"}
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.syncButtonText}>
                    {isSyncing ? "Syncing..." : "Sync Data"}
                  </Text>
                </TouchableOpacity>

                {/* Account Balances */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>💰 Account Balances</Text>
                  {investmentData.balances.length > 0 ? (
                    investmentData.balances.map((balance, index) => (
                      <View key={index} style={styles.balanceCard}>
                        <Text style={styles.balanceLabel}>Cash</Text>
                        <Text style={styles.balanceValue}>
                          ${balance.cash?.toFixed(2) || "0.00"}
                        </Text>
                        <Text style={styles.balanceLabel}>Buying Power</Text>
                        <Text style={styles.balanceValue}>
                          ${balance.buying_power?.toFixed(2) || "0.00"}
                        </Text>
                        <Text style={styles.balanceCurrency}>
                          {balance.currency_code || "USD"}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noDataText}>
                      No balance data available
                    </Text>
                  )}
                </View>

                {/* Holdings */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    📈 Holdings ({investmentData.holdings.length})
                  </Text>
                  <Text style={styles.totalValue}>
                    Total Value: ${totalHoldingsValue.toFixed(2)}
                  </Text>
                  {investmentData.holdings.length > 0 ? (
                    investmentData.holdings
                      .slice(0, 5)
                      .map((holding, index) => (
                        <View key={index} style={styles.holdingCard}>
                          <View style={styles.holdingHeader}>
                            <Text style={styles.holdingSymbol}>
                              {holding.symbol}
                            </Text>
                            <Text style={styles.holdingValue}>
                              ${holding.market_value?.toFixed(2) || "0.00"}
                            </Text>
                          </View>
                          <Text style={styles.holdingDescription}>
                            {holding.description}
                          </Text>
                          <View style={styles.holdingDetails}>
                            <Text style={styles.holdingDetail}>
                              Units: {holding.units}
                            </Text>
                            <Text style={styles.holdingDetail}>
                              Price: ${holding.price?.toFixed(2) || "0.00"}
                            </Text>
                            {holding.unrealized_pl !== null && (
                              <Text
                                style={[
                                  styles.holdingDetail,
                                  {
                                    color:
                                      holding.unrealized_pl >= 0
                                        ? "#4CAF50"
                                        : "#F44336",
                                  },
                                ]}
                              >
                                P&L: $
                                {holding.unrealized_pl?.toFixed(2) || "0.00"}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))
                  ) : (
                    <Text style={styles.noDataText}>
                      No holdings data available
                    </Text>
                  )}
                  {investmentData.holdings.length > 5 && (
                    <Text style={styles.moreText}>
                      +{investmentData.holdings.length - 5} more holdings
                    </Text>
                  )}
                </View>

                {/* Options */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    📊 Options ({investmentData.options.length})
                  </Text>
                  <Text style={styles.totalValue}>
                    Total Value: ${totalOptionsValue.toFixed(2)}
                  </Text>
                  {investmentData.options.length > 0 ? (
                    investmentData.options.slice(0, 3).map((option, index) => (
                      <View key={index} style={styles.optionCard}>
                        <View style={styles.optionHeader}>
                          <Text style={styles.optionSymbol}>
                            {option.underlying_symbol} {option.option_type}
                          </Text>
                          <Text style={styles.optionValue}>
                            ${option.market_value?.toFixed(2) || "0.00"}
                          </Text>
                        </View>
                        <Text style={styles.optionDescription}>
                          Strike: ${option.strike_price} | Exp:{" "}
                          {option.expiration_date}
                        </Text>
                        <View style={styles.optionDetails}>
                          <Text style={styles.optionDetail}>
                            Contracts: {option.units}
                          </Text>
                          <Text style={styles.optionDetail}>
                            Price: ${option.price?.toFixed(2) || "0.00"}
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noDataText}>
                      No options data available
                    </Text>
                  )}
                  {investmentData.options.length > 3 && (
                    <Text style={styles.moreText}>
                      +{investmentData.options.length - 3} more options
                    </Text>
                  )}
                </View>

                {/* Connection Info */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🔗 Connection Info</Text>
                  {investmentData.connections.length > 0 ? (
                    investmentData.connections.map((connection, index) => (
                      <View key={index} style={styles.connectionCard}>
                        <Text style={styles.connectionText}>
                          Brokerage: {connection.brokerage_name || "Fidelity"}
                        </Text>
                        <Text style={styles.connectionText}>
                          Account:{" "}
                          {connection.account_name || "Investment Account"}
                        </Text>
                        <Text style={styles.connectionText}>
                          Last Synced:{" "}
                          {connection.last_synced_at
                            ? new Date(
                                connection.last_synced_at
                              ).toLocaleDateString()
                            : "Never"}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noDataText}>
                      No connection data available
                    </Text>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    );
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
    <>
      {renderInvestmentModal()}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={styles.overlay}>
          <BlurView
            intensity={50}
            style={StyleSheet.absoluteFill}
            tint="dark"
          />
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
                    style={[
                      styles.institutionCard,
                      styles.otherInstitutionsCard,
                    ]}
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
    </>
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

  // Investment Modal Styles
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  syncButtonDisabled: {
    backgroundColor: "#666",
    opacity: 0.6,
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#4CAF50",
    marginBottom: 12,
  },
  balanceCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  balanceLabel: {
    fontSize: 14,
    color: "#888",
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  balanceCurrency: {
    fontSize: 12,
    color: "#888",
    textAlign: "right",
  },
  holdingCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  holdingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  holdingSymbol: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  holdingValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4CAF50",
  },
  holdingDescription: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
  },
  holdingDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  holdingDetail: {
    fontSize: 12,
    color: "#ccc",
  },
  optionCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  optionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  optionSymbol: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  optionValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF9800",
  },
  optionDescription: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
  },
  optionDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  optionDetail: {
    fontSize: 12,
    color: "#ccc",
  },
  connectionCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  connectionText: {
    fontSize: 14,
    color: "#ccc",
    marginBottom: 4,
  },
  noDataText: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
    textAlign: "center",
    padding: 20,
  },
  moreText: {
    fontSize: 14,
    color: "#4CAF50",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
});

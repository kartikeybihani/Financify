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
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import {
  registerSnaptradeUser,
  handleSnapTradeLogin,
  fetchSnaptradeAccounts,
  hasSnaptradeConnection,
  fetchSnaptradeAccountsFromStorage,
  getStoredSnaptradeCredentials,
  storeSnaptradeCredentials,
  syncSnaptradeInvestments,
  getSnaptradeConnectionsFromDB,
} from "../../_utils/snaptrade";
import { supabase } from "../../_lib/supabase/supabase";
import logger from "../../_utils/logger";

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
  const router = useRouter();

  // Map institution ids to local logo assets
  const institutionLogoMap: Record<string, any> = {
    american_express: require("../../../assets/invest_logo/amex.png"),
    capital_one: require("../../../assets/invest_logo/capitalone.png"),
    chase: require("../../../assets/invest_logo/chase.png"),
    wells_fargo: require("../../../assets/invest_logo/wellsfargo.png"),
    alpaca: require("../../../assets/invest_logo/alpaca.png"),
    charles_schwab: require("../../../assets/invest_logo/charles.png"),
    coinbase: require("../../../assets/invest_logo/coinbase.png"),
    etrade: require("../../../assets/invest_logo/etrade.png"),
    public: require("../../../assets/invest_logo/public.png"),
    robinhood: require("../../../assets/invest_logo/robinhood.png"),
    wealthfront: require("../../../assets/invest_logo/wealthfront.png"),
    webull: require("../../../assets/invest_logo/webull.png"),
    fidelity: require("../../../assets/invest_logo/fidelity.png"),
    interactive_brokers: require("../../../assets/invest_logo/ib.png"),
  };

  // Logos that use dark text/mark; use lighter bg for contrast
  const lightBgLogoIds = new Set<string>([
    "public",
    "capital_one",
    "etrade",
    "alpaca",
  ]);

  const handleFidelityConnection = async () => {
    logger.info("🔄 Starting Fidelity connection...");
    setIsConnecting(true);

    try {
      // If there is already investment data in DB, skip API calls and navigate to investments screen
      const existingConnectionsInDb = await getSnaptradeConnectionsFromDB();
      if (existingConnectionsInDb && existingConnectionsInDb.length > 0) {
        logger.info(
          "✅ Found existing Snaptrade data in DB, navigating to /investments without API calls..."
        );
        setIsConnecting(false);
        router.push("/investments" as any);
        onClose();
        return;
      }

      // First, check if user already has a valid Snaptrade connection
      const hasExistingConnection = await hasSnaptradeConnection();

      if (hasExistingConnection) {
        logger.info(
          "✅ Found existing Snaptrade connection, fetching accounts..."
        );

        try {
          const accounts = await fetchSnaptradeAccountsFromStorage();
          logger.info("✅ Existing Snaptrade accounts fetched:", accounts);

          // Sync investments data to database for existing connection
          if (accounts.length > 0) {
            const firstAccount = accounts[0];
            if (firstAccount && firstAccount.id) {
              try {
                logger.info(
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
                    logger.info(
                      "✅ Existing investments data synced to database successfully"
                    );
                  }
                }
              } catch (syncError) {
                logger.error(
                  "⚠️ Failed to sync existing investments to database (continuing anyway):",
                  syncError
                );
                // Don't fail the whole flow if sync fails
              }
            }
          }

          if (accounts.length === 0) {
            // No accounts found - allow user to connect
            logger.info(
              "🔄 No accounts found, proceeding with new connection..."
            );
            // Continue with new connection flow below
          } else {
            // Navigate to investments screen to display DB data
            setIsConnecting(false);
            router.push("/investments" as any);
            return;
          }
        } catch (accountError) {
          logger.error(
            "❌ Failed to fetch existing accounts, proceeding with new connection:",
            accountError
          );
          // Continue with new connection flow if fetching existing accounts fails
        }
      }

      // No existing connection or failed to fetch existing accounts - proceed with new connection
      logger.info(
        "🔄 Starting new Snaptrade user registration for Fidelity..."
      );
      const registerResponse = await registerSnaptradeUser();
      logger.info(
        "✅ Snaptrade user registered successfully:",
        registerResponse
      );

      logger.info("registerResponse --->: ", registerResponse);
      logger.info("registerResponse.userId --->: ", registerResponse.userId);
      logger.info(
        "registerResponse.userSecret --->: ",
        registerResponse.userSecret
      );
      // Now login to get the redirect URI
      const loginResponse = await handleSnapTradeLogin(
        registerResponse.userId,
        registerResponse.userSecret
      );
      logger.info("✅ Snaptrade user logged in successfully:", loginResponse);

      // Open the redirect URI in a web browser
      if (loginResponse.redirectURI) {
        logger.info(
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

        logger.info("🔗 WebBrowser result:", result);

        // After the user completes the connection, fetch their accounts
        if (result.type === "cancel") {
          logger.info("🔄 User completed connection, fetching accounts...");
          try {
            const accounts = await fetchSnaptradeAccounts(
              registerResponse.userId,
              registerResponse.userSecret
            );
            logger.info("✅ Snaptrade accounts fetched:", accounts);

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
                logger.info(
                  "✅ SnapTrade credentials stored securely in database"
                );
              }
            } catch (storageError) {
              logger.error(
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
                  logger.info(
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
                  logger.info(
                    "✅ Investments data synced to database successfully"
                  );
                } catch (syncError) {
                  logger.error(
                    "⚠️ Failed to sync investments to database (continuing anyway):",
                    syncError
                  );
                  // Don't fail the whole flow if sync fails
                }
              }
            }

            // Navigate to investments screen to show data
            setIsConnecting(false);
            router.push("/investments" as any);
          } catch (accountError) {
            logger.error("❌ Failed to fetch accounts:", accountError);

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
                logger.info(
                  "✅ SnapTrade credentials stored in database despite account fetch failure"
                );
              }
            } catch (storageError) {
              logger.error(
                "⚠️ Failed to store credentials in database:",
                storageError
              );
            }

            setIsConnecting(false);
          }
        } else {
          // User cancelled or there was an error
          setIsConnecting(false);
        }
      } else {
        throw new Error("No redirect URI received from Snaptrade");
      }
    } catch (error) {
      logger.error("❌ Failed to connect Fidelity account:", error);
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
    const logoSource = (institutionLogoMap as any)[institution.id];
    const useLightBg = lightBgLogoIds.has(institution.id);

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
            {isLoadingFidelity ? (
              <Ionicons name="hourglass" size={32} color="#000" />
            ) : logoSource ? (
              <Image
                source={logoSource}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel={`${institution.name} logo`}
              />
            ) : (
              <View
                style={[
                  styles.logoPlaceholder,
                  { backgroundColor: institution.color },
                ]}
              >
                <Text style={styles.logoText}>{institution.initials}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <>
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
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
    minHeight: 80,
  },
  institutionCardLoading: {
    opacity: 0.6,
    backgroundColor: "#f0f0f0",
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
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 124,
    height: 114,
  },
  logoText: {
    color: "#000",
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

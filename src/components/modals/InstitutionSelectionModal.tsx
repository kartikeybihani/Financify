import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  Pressable,
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import IconButton from "@/src/components/shared/IconButton";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import {
  registerSnaptradeUser,
  handleSnapTradeLogin,
  fetchSnaptradeAccounts,
  storeSnaptradeCredentials,
  syncSnaptradeInvestments,
  refreshSnaptradeInvestments,
  recalculateInvestmentBalances,
  populateInvestmentAccountsInDB,
  getSnaptradeCredentialsWithFallback,
} from "@/src/utils/integrations/snaptrade";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import {
  INVESTMENT_INSTITUTIONS,
  INSTITUTION_LOGO_MAP,
  LIGHT_BG_LOGO_IDS,
  type Institution,
} from "../shared/modal-constants";
import ConnectionSuccessModal from "./ConnectionSuccessModal";

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
  /** Called when an investment account is successfully connected; use to show post-connect UI (e.g. gathering-data modal). */
  onConnectionSuccess?: (
    institutionName: string,
    institutionId: string,
  ) => void;
}

export default function InstitutionSelectionModal({
  visible,
  onClose,
  onInstitutionSelect,
  onReopenFinancialSheet,
  onConnectionSuccess,
}: InstitutionSelectionModalProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingInstitution, setConnectingInstitution] = useState<
    string | null
  >(null);
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
  const [showConnectionSuccessModal, setShowConnectionSuccessModal] =
    useState(false);
  const [connectedInstitutionName, setConnectedInstitutionName] =
    useState<string>("");
  const [connectedInstitutionId, setConnectedInstitutionId] =
    useState<string>("");
  const router = useRouter();

  // Refs to track polling intervals and browser state
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const browserOpenRef = useRef<boolean>(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Helper function to stop polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    browserOpenRef.current = false;
  };

  // Helper function to handle successful account connection
  const handleAccountConnectionSuccess = async (
    accounts: any[],
    registerResponse: { userId: string; userSecret: string },
    institutionName: string,
    institutionId: string,
  ) => {
    // Stop polling since we found accounts
    stopPolling();

    // Determine the actual institution name (for "Other Institutions", use the brokerage name from account)
    const firstAccount = accounts[0];
    const actualInstitutionName =
      institutionId === "other"
        ? firstAccount?.brokerage || "Other Institutions"
        : institutionName;

    // Store credentials securely in database
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const connectionId = firstAccount?.brokerage_authorization || null;

        await storeSnaptradeCredentials(
          user.id,
          registerResponse.userId,
          firstAccount.id,
          registerResponse.userSecret,
          {
            brokerage_name: actualInstitutionName,
            account_name:
              firstAccount.name || `${actualInstitutionName} Account`,
            account_type: "investment",
            connection_id: connectionId,
            brokerage_authorization: connectionId,
          },
        );
        logger.info(
          "✅ SnapTrade credentials stored securely in database",
          connectionId
            ? `with connection_id: ${connectionId}`
            : "without connection_id",
        );
      }
    } catch (storageError) {
      logger.error(
        "⚠️ Failed to store credentials in database (continuing anyway):",
        storageError,
      );
    }

    // Sync runs when ConnectionSuccessModal is shown (performRefresh)

    setIsConnecting(false);
    setConnectingInstitution(null);

    // Close the institution selection modal first
    onClose();

    // Show connection success modal for investment accounts
    setConnectedInstitutionName(actualInstitutionName);
    setConnectedInstitutionId(institutionId);
    setTimeout(() => {
      setShowConnectionSuccessModal(true);
    }, 300);

    // Call onConnectionSuccess callback
    onConnectionSuccess?.(actualInstitutionName, institutionId);
  };

  // Helper function to start polling for accounts
  const startAccountPolling = (
    registerResponse: { userId: string; userSecret: string },
    institutionName: string,
    institutionId: string,
  ) => {
    browserOpenRef.current = true;

    // Start polling every 5 seconds
    pollingIntervalRef.current = setInterval(async () => {
      if (!browserOpenRef.current) {
        stopPolling();
        return;
      }

      try {
        logger.info("🔄 Polling for SnapTrade accounts...");
        const accounts = await fetchSnaptradeAccounts(
          registerResponse.userId,
          registerResponse.userSecret,
        );

        if (accounts && accounts.length > 0) {
          logger.info("✅ Accounts found! Closing browser automatically...");

          // Close the browser programmatically
          try {
            await WebBrowser.dismissBrowser();
          } catch (dismissError) {
            logger.warn(
              "⚠️ Could not dismiss browser programmatically:",
              dismissError,
            );
            // Browser might already be closed, continue anyway
          }

          // Handle successful connection
          await handleAccountConnectionSuccess(
            accounts,
            registerResponse,
            institutionName,
            institutionId,
          );
        } else {
          logger.info("⏳ No accounts found yet, continuing to poll...");
        }
      } catch (pollError) {
        logger.error("❌ Error during account polling:", pollError);
        // Continue polling on error - might be temporary
      }
    }, 5000); // Poll every 5 seconds
  };

  const handleInstitutionConnection = async (institutionId: string) => {
    logger.info(`🔄 Starting ${institutionId} connection...`);
    setIsConnecting(true);
    setConnectingInstitution(institutionId);

    try {
      // Check if user is authenticated first
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        logger.error(
          `❌ User not authenticated for ${institutionId} connection:`,
          authError,
        );
        throw new Error("Please log in to connect your investment account.");
      }

      // Get institution name and broker for this specific institution
      const institutionName = getInstitutionName(institutionId);
      const brokerName = getSnapTradeBrokerName(institutionId);

      logger.info(
        `🔄 Starting new Snaptrade user registration for ${institutionName}${
          brokerName ? ` (${brokerName})` : ""
        }...`,
      );

      const registerResponse = await registerSnaptradeUser();
      logger.info(
        "✅ Snaptrade user registered successfully:",
        registerResponse,
      );

      logger.info("registerResponse --->: ", registerResponse);
      logger.info("registerResponse.userId --->: ", registerResponse.userId);
      logger.info(
        "registerResponse.userSecret --->: ",
        registerResponse.userSecret,
      );

      // Now login to get the redirect URI with the specific broker
      const loginResponse = await handleSnapTradeLogin(
        registerResponse.userId,
        registerResponse.userSecret,
        brokerName, // Pass the broker name for specific institutions
      );
      logger.info("✅ Snaptrade user logged in successfully:", loginResponse);

      // Open the redirect URI in a web browser
      if (loginResponse.redirectURI) {
        logger.info(
          "🌐 Opening Snaptrade redirect URI:",
          loginResponse.redirectURI,
        );

        // Start polling for accounts immediately when browser opens
        startAccountPolling(registerResponse, institutionName, institutionId);

        // Open browser and wait for it to close
        const result = await WebBrowser.openBrowserAsync(
          loginResponse.redirectURI,
          {
            presentationStyle:
              WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
          },
        );

        logger.info("🔗 WebBrowser result:", result);

        // Stop polling when browser closes (user may have closed manually)
        stopPolling();

        // After the browser closes, verify connection was successful
        // Note: result.type === "cancel" means browser was dismissed (could be completed OR cancelled)
        // We need to verify by checking if accounts exist
        if (result.type === "cancel" || result.type === "dismiss") {
          logger.info("🔄 Browser closed, verifying connection...");

          // Wait a moment for SnapTrade to process the connection
          await new Promise((resolve) => setTimeout(resolve, 2000));

          try {
            const accounts = await fetchSnaptradeAccounts(
              registerResponse.userId,
              registerResponse.userSecret,
            );
            logger.info("✅ Snaptrade accounts fetched:", accounts);

            // CRITICAL: Verify connection was actually successful
            if (!accounts || accounts.length === 0) {
              logger.warn(
                "⚠️ No accounts found - user may have cancelled connection",
              );
              setIsConnecting(false);
              setConnectingInstitution(null);
              // Optionally show error message to user
              return;
            }

            // If accounts were found but polling didn't catch it (race condition), handle it now
            await handleAccountConnectionSuccess(
              accounts,
              registerResponse,
              institutionName,
              institutionId,
            );
          } catch (accountError) {
            logger.error("❌ Failed to fetch accounts:", accountError);

            // Still store credentials in database even if account fetch fails
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (user) {
                await storeSnaptradeCredentials(
                  user.id,
                  registerResponse.userId,
                  "unknown",
                  registerResponse.userSecret,
                  {
                    brokerage_name: institutionName,
                    account_name: `${institutionName} Account`,
                    account_type: "investment",
                  },
                );
                logger.info(
                  "✅ SnapTrade credentials stored in database despite account fetch failure",
                );
              }
            } catch (storageError) {
              logger.error(
                "⚠️ Failed to store credentials in database:",
                storageError,
              );
            }

            setIsConnecting(false);
            setConnectingInstitution(null);
          }
        } else {
          // User cancelled or there was an error
          setIsConnecting(false);
          setConnectingInstitution(null);
        }
      } else {
        throw new Error("No redirect URI received from Snaptrade");
      }
    } catch (error) {
      logger.error(`❌ Failed to connect ${institutionId} account:`, error);
      stopPolling(); // Stop polling on error
      setIsConnecting(false);
      setConnectingInstitution(null);
    }
  };

  // Helper function to get institution name from ID
  const getInstitutionName = (institutionId: string): string => {
    const institution = INVESTMENT_INSTITUTIONS.find(
      (inst) => inst.id === institutionId,
    );
    return institution ? institution.name : institutionId;
  };

  // Helper function to get SnapTrade broker name from institution ID
  const getSnapTradeBrokerName = (
    institutionId: string,
  ): string | undefined => {
    const brokerMapping: Record<string, string> = {
      fidelity: "FIDELITY",
      wells_fargo: "WELLS-FARGO",
      alpaca: "ALPACA",
      charles_schwab: "SCHWAB",
      robinhood: "ROBINHOOD",
      coinbase: "COINBASE",
      etrade: "ETRADE",
      interactive_brokers: "INTERACTIVE-BROKERS-FLEX",
      public: "PUBLIC",
      webull: "WEBULL",
    };
    return brokerMapping[institutionId];
  };

  const handleInstitutionPress = async (institutionId: string) => {
    // All investment institutions now use SnapTrade
    handleInstitutionConnection(institutionId);
  };

  const handleOtherInstitutions = async () => {
    // Handle "Other Institutions" selection - this will also use SnapTrade but without a specific broker
    logger.info("🔄 Starting connection for Other Institutions...");
    setIsConnecting(true);
    setConnectingInstitution("other");

    try {
      // Check if user is authenticated first
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        logger.error(
          "❌ User not authenticated for Other Institutions connection:",
          authError,
        );
        throw new Error("Please log in to connect your investment account.");
      }

      // Use the same connection flow but without a specific institution name
      const registerResponse = await registerSnaptradeUser();
      logger.info(
        "✅ Snaptrade user registered successfully:",
        registerResponse,
      );

      // Don't pass a broker parameter for "Other Institutions" - let SnapTrade show all available brokers
      const loginResponse = await handleSnapTradeLogin(
        registerResponse.userId,
        registerResponse.userSecret,
      );
      logger.info("✅ Snaptrade user logged in successfully:", loginResponse);

      if (loginResponse.redirectURI) {
        logger.info(
          "🌐 Opening Snaptrade redirect URI:",
          loginResponse.redirectURI,
        );

        // Start polling for accounts immediately when browser opens
        startAccountPolling(registerResponse, "Other Institutions", "other");

        // Open browser and wait for it to close
        const result = await WebBrowser.openBrowserAsync(
          loginResponse.redirectURI,
          {
            presentationStyle:
              WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
          },
        );

        logger.info("🔗 WebBrowser result:", result);

        // Stop polling when browser closes (user may have closed manually)
        stopPolling();

        // After the browser closes, verify connection was successful
        if (result.type === "cancel" || result.type === "dismiss") {
          logger.info("🔄 Browser closed, verifying connection...");

          // Wait a moment for SnapTrade to process the connection
          await new Promise((resolve) => setTimeout(resolve, 2000));

          try {
            const accounts = await fetchSnaptradeAccounts(
              registerResponse.userId,
              registerResponse.userSecret,
            );
            logger.info("✅ Snaptrade accounts fetched:", accounts);

            // CRITICAL: Verify connection was actually successful
            if (!accounts || accounts.length === 0) {
              logger.warn(
                "⚠️ No accounts found - user may have cancelled connection",
              );
              setIsConnecting(false);
              setConnectingInstitution(null);
              return;
            }

            // If accounts were found but polling didn't catch it (race condition), handle it now
            const otherName = accounts[0]?.brokerage || "Other Institutions";
            await handleAccountConnectionSuccess(
              accounts,
              registerResponse,
              otherName,
              "other",
            );
          } catch (accountError) {
            logger.error("❌ Failed to fetch accounts:", accountError);
            setIsConnecting(false);
            setConnectingInstitution(null);
          }
        } else {
          logger.warn("⚠️ Unexpected browser result type:", result.type);
          setIsConnecting(false);
          setConnectingInstitution(null);
        }
      } else {
        throw new Error("No redirect URI received from Snaptrade");
      }
    } catch (error) {
      logger.error("❌ Failed to connect other institutions:", error);
      stopPolling(); // Stop polling on error
      setIsConnecting(false);
      setConnectingInstitution(null);
    }
  };

  const handleClose = () => {
    // Don't allow closing while "Connecting" is showing (account connection in progress)
    if (isConnecting) return;

    // Stop any active polling
    stopPolling();

    // Reset all modal states before closing
    setShowConnectionSuccessModal(false);
    setIsConnecting(false);
    setConnectingInstitution(null);
    setConnectedInstitutionName("");
    setConnectedInstitutionId("");
    onClose();
    // Only reopen financial sheet if we're not navigating away
    // (i.e., if ConnectionSuccessModal is not showing)
    if (!showConnectionSuccessModal) {
      setTimeout(() => {
        onReopenFinancialSheet?.();
      }, 300);
    }
  };

  const renderInstitutionCard = (institution: Institution) => {
    const isLoadingInstitution =
      isConnecting && connectingInstitution === institution.id;
    const logoSource = (INSTITUTION_LOGO_MAP as any)[institution.id];
    const useLightBg = LIGHT_BG_LOGO_IDS.has(institution.id);

    return (
      <TouchableOpacity
        key={institution.id}
        style={[
          styles.institutionCard,
          isLoadingInstitution && styles.institutionCardLoading,
        ]}
        onPress={() => handleInstitutionPress(institution.id)}
        activeOpacity={0.8}
        disabled={isConnecting}
      >
        {isLoadingInstitution ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="small" color="#000" />
            <Text style={styles.connectingText}>Connecting</Text>
          </View>
        ) : (
          <View style={styles.institutionContent}>
            <View style={styles.logoContainer}>
              {logoSource ? (
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
        )}
      </TouchableOpacity>
    );
  };

  const handleConnectionSuccessComplete = async () => {
    // Close ConnectionSuccessModal first
    setShowConnectionSuccessModal(false);

    // Reset all modal states to ensure clean state
    setIsConnecting(false);
    setConnectingInstitution(null);
    setConnectedInstitutionName("");
    setConnectedInstitutionId("");

    // Close InstitutionSelectionModal to ensure no modals are blocking UI
    // This ensures the parent component knows the modal is closed
    onClose();

    // Small delay to ensure modals are fully closed and animations complete before navigation
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Navigate to insights tab with investments section
    // First navigate to the tab, then emit event to switch to investments section
    router.push("/(tabs)/insights?section=investments");
    // Also emit event in case insights screen is already mounted
    setTimeout(() => {
      DeviceEventEmitter.emit("navigateToInsightsSection", {
        section: "investments",
      });
    }, 100);
  };

  const performRefresh = async () => {
    // This is called by ConnectionSuccessModal while showing loading state
    // Full sync (same as investments screen sync button) for fresh data
    try {
      logger.info("🔄 ConnectionSuccessModal refresh triggered");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const credentials = await getSnaptradeCredentialsWithFallback();
        if (credentials?.accountId) {
          await refreshSnaptradeInvestments(user.id, credentials.accountId);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await syncSnaptradeInvestments(user.id, credentials.accountId);
          await recalculateInvestmentBalances(user.id, credentials.accountId);
          await populateInvestmentAccountsInDB();
          logger.info("✅ ConnectionSuccessModal refresh completed");
        }
      }
      DeviceEventEmitter.emit("financialDataRefreshed", {
        accountConnected: true,
      });
    } catch (error) {
      logger.error(
        "⚠️ ConnectionSuccessModal refresh failed (non-blocking):",
        error,
      );
      DeviceEventEmitter.emit("financialDataRefreshed", {
        accountConnected: true,
      });
    }
  };

  if (!visible && !showConnectionSuccessModal) return null;

  return (
    <>
      {/* Connection Success Modal - shown after successful investment account connection */}
      <ConnectionSuccessModal
        visible={showConnectionSuccessModal}
        institutionName={connectedInstitutionName}
        institutionId={connectedInstitutionId}
        onComplete={handleConnectionSuccessComplete}
        performRefresh={performRefresh}
      />

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
            intensity={30}
            style={StyleSheet.absoluteFill}
            tint="dark"
          />
          <Pressable style={styles.overlay} onPress={handleClose}>
            <View style={styles.modalContainer}>
              <View style={styles.sheet}>
                <Pressable onPress={(e) => e.stopPropagation()}>
                  <View style={styles.handleContainer}>
                    <View style={styles.handle} />
                  </View>

                  <View style={styles.header}>
                    <View style={styles.titleContainer}>
                      <Text style={styles.title}>Select your institution</Text>
                    </View>
                    <IconButton
                      onPress={handleClose}
                      icon="close"
                      size={18}
                      disabled={isConnecting}
                    />
                  </View>

                  <View style={styles.content}>
                    <View style={styles.institutionsGrid}>
                      {INVESTMENT_INSTITUTIONS.map((institution) =>
                        renderInstitutionCard(institution),
                      )}

                      {/* Other Institutions Card */}
                      <TouchableOpacity
                        style={[
                          styles.institutionCard,
                          styles.otherInstitutionsCard,
                          isConnecting &&
                            connectingInstitution === "other" && [
                              styles.institutionCardLoading,
                              { padding: 0 },
                            ],
                        ]}
                        onPress={handleOtherInstitutions}
                        activeOpacity={0.8}
                        disabled={isConnecting}
                      >
                        {isConnecting && connectingInstitution === "other" ? (
                          <View style={styles.connectingContainer}>
                            <ActivityIndicator size="small" color="#000" />
                            <Text style={styles.connectingText}>
                              Connecting
                            </Text>
                          </View>
                        ) : (
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
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
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
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
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
  content: {
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
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
    minHeight: 70,
  },
  institutionCardLoading: {
    opacity: 0.6,
    backgroundColor: "#ffffff",
    borderColor: "rgba(0, 166, 81, 0.3)",
    padding: 0,
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
    width: 55,
    height: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  logoPlaceholder: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 120,
    height: 120,
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
  connectingContainer: {
    flex: 1,
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    minHeight: 70,
  },
  connectingText: {
    fontSize: 13,
    fontStyle: "italic",
    color: "#000",
    marginTop: 8,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
});

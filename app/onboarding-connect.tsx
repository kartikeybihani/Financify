import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  Animated,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchLinkToken, handlePlaidConnect } from "@/src/utils/plaid/plaid";
import { BlurView } from "expo-blur";
import * as WebBrowser from "expo-web-browser";
import logger from "@/src/utils/core/logger";
import { logOnboardingEvent } from "@/src/utils/auth/onboarding";
import AppStorage from "@/src/utils/storage/storage";
import { useDemoMode } from "@/src/contexts/DemoContext";

interface ConnectedAccount {
  account_id: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
  official_name: string;
  current_balance: number;
  available_balance: number;
  institution_name: string;
}

type TransactionPreviewRow = {
  date: string;
  amount: number;
  merchant_name: string | null;
  name: string | null;
  category: any;
  top_category: string | null;
  new_category: string | null;
};

interface AccountAnalysisResult {
  should_ask_for_more_accounts: boolean;
  message: string | null;
  reasoning?: string;
  error?: string;
  error_message?: string;
}

export default function AccountConnectionScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { enterDemoMode } = useDemoMode();
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isClosingPlaid, setIsClosingPlaid] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [hasConnectedBank, setHasConnectedBank] = useState(false);
  const [hasUpdatedStage, setHasUpdatedStage] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<
    ConnectedAccount[]
  >([]);
  const [accountAnalysis, setAccountAnalysis] =
    useState<AccountAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFirstConnection, setIsFirstConnection] = useState(true);
  const finnyCardOpacity = React.useRef(new Animated.Value(0)).current;

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
  };

  const getTxPreviewKey = (userId: string, itemId?: string) => {
    const suffix = itemId ? `:${itemId}` : "";
    return `onboarding:tx_preview_logged:${userId}${suffix}`;
  };

  const fetchLast30DaysTransactions = async (userId: string) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);

    const startDateStr = formatDate(start);
    const endDateStr = formatDate(end);

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        "date, amount, merchant_name, name, category, top_category, new_category",
      )
      .eq("user_id", userId)
      .gte("date", startDateStr)
      .lte("date", endDateStr)
      .order("date", { ascending: false })
      .limit(60);

    if (txError) throw txError;
    return {
      startDateStr,
      endDateStr,
      transactions: (transactions || []) as TransactionPreviewRow[],
    };
  };

  const pollForTransactionsSync = async (userId: string) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const startDateStr = formatDate(start);
    const endDateStr = formatDate(end);

    const timeoutMs = 25000;
    const intervalMs = 2500;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("date", startDateStr)
        .lte("date", endDateStr);

      if (error) {
        logger.warn("⚠️ tx preview: count failed (continuing)", error);
      } else if ((count || 0) > 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  const logLast30DaysTransactionsPreview = async (
    userId: string,
    itemId?: string,
  ) => {
    const key = getTxPreviewKey(userId, itemId);
    const alreadyLogged = AppStorage.getItemSync(key);
    if (alreadyLogged) return;

    await pollForTransactionsSync(userId);

    const { startDateStr, endDateStr, transactions } =
      await fetchLast30DaysTransactions(userId);

    logger.info("🧾 Transactions preview (last 30 days)", {
      startDate: startDateStr,
      endDate: endDateStr,
      count: transactions.length,
    });

    if (transactions.length === 0) {
      logger.info(
        "🧾 Transactions preview: no transactions found in last 30 days",
      );
      AppStorage.setItemSync(key, "1");
      return;
    }

    const lines = transactions.slice(0, 40).map((tx) => {
      const effectiveName =
        (tx.merchant_name || tx.name || "Unknown").toString().trim() ||
        "Unknown";
      const effectiveCategory =
        (tx.new_category || tx.top_category || "Other")?.toString() || "Other";

      const kind = tx.amount > 0 ? "expense" : "income/refund";
      const amountStr = `${formatMoney(tx.amount)} (${kind})`;

      return `${tx.date} | ${effectiveName.slice(
        0,
        34,
      )} | ${amountStr} | ${effectiveCategory.slice(0, 22)}`;
    });

    logger.info("🧾 Transactions preview sample (up to 40)", {
      preview: lines,
    });

    AppStorage.setItemSync(key, "1");
  };

  useEffect(() => {
    logOnboardingEvent({ stage: "plaid", action: "view" });

    const initializePlaid = async () => {
      try {
        const token = await fetchLinkToken();
        setLinkToken(token ?? null);
      } catch (error) {
        logger.error("Error fetching link token:", error);
        Alert.alert(
          "Connection Error",
          "Unable to initialize bank connection. Please try again.",
        );
      }
    };

    const checkExistingAccounts = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const accounts = await fetchConnectedAccounts(user.id);
        if (accounts.length > 0) {
          setHasConnectedBank(true);
          setConnectedAccounts(accounts);
          // If accounts already exist, this is not the first connection
          setIsFirstConnection(false);

          // Load existing base_analysis if it exists
          const { data: profile } = await supabase
            .from("profiles")
            .select("base_analysis")
            .eq("id", user.id)
            .maybeSingle();

          if (profile?.base_analysis) {
            const analysis = profile.base_analysis as any;
            // Check if it's a valid result (not an error marker)
            if (
              typeof analysis === "object" &&
              typeof analysis.should_ask_for_more_accounts === "boolean"
            ) {
              setAccountAnalysis(analysis);
              // Animate Finny card in
              Animated.timing(finnyCardOpacity, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
              }).start();
            } else if (analysis?.error) {
              // Show error state if it exists
              setAccountAnalysis({
                should_ask_for_more_accounts: false,
                message: null,
                error: analysis.error,
                error_message: analysis.error_message,
              });
            }
          }
        }
      } catch (error) {
        logger.error("Error checking existing accounts:", error);
      }
    };

    initializePlaid();
    checkExistingAccounts();
  }, []);

  const fetchConnectedAccounts = async (
    userId: string,
  ): Promise<ConnectedAccount[]> => {
    try {
      const { data: accounts, error } = await supabase
        .from("accounts")
        .select(
          `
          account_id,
          name,
          mask,
          type,
          subtype,
          official_name,
          current_balance,
          available_balance,
          user_items!inner(institution_name, user_id)
        `,
        )
        .eq("user_items.user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (
        accounts?.map((acc: any) => ({
          ...acc,
          institution_name: acc.user_items.institution_name,
        })) || []
      );
    } catch (error) {
      logger.error("Error fetching connected accounts:", error);
      return [];
    }
  };

  const analyzeAccountCompleteness = async (userId: string) => {
    try {
      setIsAnalyzing(true);

      // Wait a bit for transactions to sync and analysis to complete
      // The analysis runs automatically in transactions_sync.js
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Poll for the analysis result from profiles.base_analysis
      let attempts = 0;
      const maxAttempts = 6; // 6 attempts = 30 seconds total
      const pollInterval = 5000; // 5 seconds between attempts

      while (attempts < maxAttempts) {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("base_analysis")
          .eq("id", userId)
          .maybeSingle();

        if (error) {
          logger.warn("⚠️ Error fetching base_analysis:", error);
        } else if (profile?.base_analysis) {
          const analysis = profile.base_analysis as any;

          // Check if it's an error marker
          if (analysis?.error) {
            setAccountAnalysis({
              should_ask_for_more_accounts: false,
              message: null,
              error: analysis.error,
              error_message: analysis.error_message,
            });
            setIsAnalyzing(false);
            return;
          }

          // Check if it's a valid result (not an error marker)
          if (
            typeof analysis === "object" &&
            typeof analysis.should_ask_for_more_accounts === "boolean"
          ) {
            setAccountAnalysis(analysis);

            // Animate Finny card in
            Animated.timing(finnyCardOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }).start();
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      }

      // If we didn't get a result, set a default
      setAccountAnalysis({
        should_ask_for_more_accounts: false,
        message: null,
      });
    } catch (error) {
      // Don't show error to user - just proceed without analysis
      setAccountAnalysis({
        should_ask_for_more_accounts: false,
        message: null,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConnect = async () => {
    if (!linkToken) {
      Alert.alert(
        "Not Ready",
        "Please try again in 5 seconds while we prepare...",
      );
      return;
    }
    setIsLoading(true);

    try {
      await handlePlaidConnect(
        linkToken,
        async (itemId: string) => {
          setIsLoading(false);
          setIsClosingPlaid(true);
          setIsConnecting(true);

          // Wait a bit for accounts to be stored in the database
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Fetch the newly connected accounts
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            const accounts = await fetchConnectedAccounts(user.id);
            const previousAccountCount = connectedAccounts.length;
            setConnectedAccounts(accounts);
            setHasConnectedBank(true);

            // Log a clean preview of what transactions look like (last 30 days), once.
            // This is for onboarding/debugging visibility only.
            try {
              await logLast30DaysTransactionsPreview(user.id, itemId);
            } catch (e) {
              logger.warn("⚠️ Failed to log tx preview", e);
            }

            // Run account completeness analysis only on first account connection
            if (previousAccountCount === 0 && isFirstConnection) {
              setIsFirstConnection(false);
              // Run analysis in background (don't block UI)
              analyzeAccountCompleteness(user.id).catch(() => {
                // Silently fail - UI will handle gracefully
              });
            }
          }

          setIsConnecting(false);
          setIsClosingPlaid(false);

          logger.info(
            "✅ AccountConnectionScreen: Successfully connected account",
          );
          logOnboardingEvent({ stage: "plaid", action: "success" });

          // Refresh link token for next connection
          const newToken = await fetchLinkToken();
          setLinkToken(newToken ?? null);
        },
        // onExit:
        (error?: any) => {
          setIsLoading(false);
          setIsClosingPlaid(true);

          // Reset after a short delay to allow the closing animation
          setTimeout(() => {
            setIsClosingPlaid(false);
            setIsConnecting(false);
          }, 500);

          logger.info("❌ Plaid connection error:", error);
          logOnboardingEvent({
            stage: "plaid",
            action: "error",
            errorCode: error?.message || error?.error?.errorCode,
          });

          if (error?.error?.errorCode === "INVALID_LINK_TOKEN") {
            Alert.alert(
              "Connection Expired",
              "The link expired. Trying again...",
              [
                {
                  text: "OK",
                  onPress: async () =>
                    setLinkToken((await fetchLinkToken()) ?? null),
                },
              ],
            );
          } else if (error?.message) {
            // This handles our token exchange errors
            Alert.alert(
              "Connection Failed",
              `Unable to connect your bank account: ${error.message}`,
              [{ text: "Try Again" }],
            );
          } else if (error) {
            Alert.alert("Connection Cancelled", "You can try again anytime.", [
              { text: "OK" },
            ]);
          }
        },
      );
    } catch (error) {
      logger.error("Error connecting bank:", error);
      logOnboardingEvent({
        stage: "plaid",
        action: "error",
        errorCode: (error as any)?.message,
      });
      Alert.alert(
        "Connection Failed",
        "Unable to connect your bank account. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    try {
      logger.info(
        "🧭 AccountConnectionScreen: Moving to final onboarding stage",
      );

      // Update profiles step -> 4 (final screen next)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          await supabase
            .from("profiles")
            .update({ onboarding_step: 4 })
            .eq("id", user.id);
        }
      } catch (e) {
        logger.error(
          "❌ AccountConnectionScreen: profiles step update failed",
          e,
        );
      }

      logger.info(
        "✅ AccountConnectionScreen: Moved to final onboarding stage",
      );
      logOnboardingEvent({ stage: "plaid", action: "continue" });

      // Navigate immediately to final screen to avoid waiting for gate refresh
      router.replace("/(onboarding-complete)" as any);
    } catch (error) {
      logger.error("❌ Error moving to final onboarding stage:", error);
      Alert.alert(
        "Could not continue",
        "We couldn't move to the next step. Please try again.",
        [{ text: "OK" }],
      );
    }
  };

  const formatBalance = (balance: number | null) => {
    if (balance === null || balance === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(balance);
  };

  const getAccountIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case "depository":
        return "wallet";
      case "credit":
        return "card";
      case "investment":
        return "trending-up";
      case "loan":
        return "receipt";
      default:
        return "cash";
    }
  };

  return (
    <LinearGradient
      colors={["#1A1A2E", "#16213E", "#0D1117"]}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        {!hasConnectedBank ? (
          <>
            <View style={styles.topBar}>
              <View style={styles.topBarSpacer} />
              <TouchableOpacity
                style={styles.skipButton}
                onPress={async () => {
                  logOnboardingEvent({ stage: "plaid", action: "skip_demo" });
                  try {
                    const {
                      data: { user },
                    } = await supabase.auth.getUser();
                    if (user?.id) {
                      await supabase
                        .from("profiles")
                        .update({
                          skipped_to_demo_at: new Date().toISOString(),
                        })
                        .eq("id", user.id);
                    }
                  } catch (e) {
                    logger.warn("Failed to record skip_demo in profiles", e);
                  }
                  enterDemoMode();
                }}
              >
                <Text style={styles.skipButtonText}>Skip: Checkout demo</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={[styles.preConnectScrollView, { paddingBottom: 10 }]}
              contentContainerStyle={styles.preConnectScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header - Clear and direct */}
              <View style={styles.header}>
                <Text style={styles.title}>Connect your accounts</Text>
                <Text style={styles.description}>
                  Add your accounts to get started!
                </Text>
              </View>

              {/* Transparency - What we can/cannot do */}
              <View style={styles.transparencySection}>
                <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
                <View style={styles.transparencyCard}>
                  <View style={styles.dataFlowRow}>
                    <View style={styles.dataFlowItem}>
                      <MaterialCommunityIcons
                        name="bank"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.dataFlowLabel}>Your Bank</Text>
                    </View>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color="rgba(255,255,255,0.4)"
                    />
                    <View style={styles.dataFlowItem}>
                      <View style={styles.plaidBadge}>
                        <Text style={styles.plaidBadgeText}>Plaid</Text>
                      </View>
                      <Text style={styles.dataFlowLabel}>Encrypted</Text>
                    </View>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color="rgba(255,255,255,0.4)"
                    />
                    <View style={styles.dataFlowItem}>
                      <Text style={styles.finnyEmoji}>🐬</Text>
                      <Text style={styles.dataFlowLabel}>Read-only</Text>
                    </View>
                  </View>

                  <View style={styles.permissionsList}>
                    <View style={styles.permissionRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color="#00D4AA"
                      />
                      <Text style={styles.permissionText}>
                        Finny can see transaction history & balances
                      </Text>
                    </View>
                    <View style={styles.permissionRow}>
                      <Ionicons name="close-circle" size={16} color="#FF6B6B" />
                      <Text style={styles.permissionText}>
                        Finny cannot move money or make payments
                      </Text>
                    </View>
                    <View style={styles.permissionRow}>
                      <Ionicons name="close-circle" size={16} color="#FF6B6B" />
                      <Text style={styles.permissionText}>
                        Finny never sees your bank password
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Control section - You're in control */}
              <View style={styles.controlSection}>
                <View style={styles.controlCard}>
                  <Ionicons name="settings-outline" size={20} color="#4A90E2" />
                  <View style={styles.controlContent}>
                    <Text style={styles.controlTitle}>You're in control</Text>
                    <Text style={styles.controlSubtitle}>
                      Disconnect anytime • Delete all data with one tap
                    </Text>
                  </View>
                </View>
              </View>

              {/* Plaid credibility - Emphasized */}
              <View style={styles.plaidSection}>
                <View style={styles.plaidCard}>
                  <View style={styles.plaidHeader}>
                    <View style={styles.plaidLogoBadge}>
                      <Text style={styles.plaidLogoText}>Plaid</Text>
                    </View>
                    <View style={styles.plaidVerified}>
                      <Ionicons
                        name="shield-checkmark"
                        size={12}
                        color="#00D4AA"
                      />
                      <Text style={styles.plaidVerifiedText}>
                        Verified Partner
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.plaidDescription}>
                    Plaid powers bank connections for Venmo, Robinhood,
                    Coinbase, and 8,000+ apps.
                  </Text>
                </View>
              </View>

              {/* Connect button */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[
                    styles.connectButton,
                    isLoading && styles.connectButtonDisabled,
                  ]}
                  onPress={handleConnect}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.connectButtonText}>
                        Connect my accounts
                      </Text>
                      {/* <Ionicons name="arrow-forward" size={18} color="#fff" /> */}
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.timeEstimate}>Takes about 60 seconds</Text>
                <TouchableOpacity
                  style={styles.safetyLinkButton}
                  onPress={async () => {
                    try {
                      await WebBrowser.openBrowserAsync(
                        "https://www.usefinny.com/safety",
                        {
                          presentationStyle:
                            WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
                          controlsColor: "#4A90E2",
                          showTitle: true,
                        },
                      );
                    } catch (error) {
                      Alert.alert("Error", "Cannot open safety page");
                      logger.error("Failed to open safety page:", error);
                    }
                  }}
                >
                  <Text style={styles.safetyLinkText}>
                    Learn more about Finny's safety commitment
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </>
        ) : (
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {connectedAccounts.length}{" "}
                {connectedAccounts.length === 1 ? "Account" : "Accounts"}{" "}
                connected
              </Text>
              <Text style={styles.addMoreText}>
                You can always add more accounts later!
              </Text>
            </View>

            <ScrollView
              style={styles.accountsList}
              contentContainerStyle={styles.accountsListContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Finny Analysis Card */}
              {accountAnalysis &&
                accountAnalysis.should_ask_for_more_accounts &&
                accountAnalysis.message && (
                  <Animated.View
                    style={[styles.finnyCard, { opacity: finnyCardOpacity }]}
                  >
                    <View style={styles.finnyCardHeader}>
                      <Image
                        source={require("../assets/images/finnylap1.png")}
                        style={styles.finnyAvatar}
                      />
                      <Text style={styles.finnyLabel}>Finny</Text>
                    </View>
                    <Text style={styles.finnyMessage}>
                      {accountAnalysis.message}
                    </Text>
                  </Animated.View>
                )}

              {/* Fixed question if account is complete */}
              {accountAnalysis &&
                !accountAnalysis.should_ask_for_more_accounts &&
                !isAnalyzing && (
                  <Animated.View
                    style={[styles.finnyCard, { opacity: finnyCardOpacity }]}
                  >
                    <View style={styles.finnyCardHeader}>
                      <View style={styles.finnyAvatar}>
                        <Ionicons
                          name="chatbubble-ellipses"
                          size={20}
                          color="#4A90E2"
                        />
                      </View>
                      <Text style={styles.finnyLabel}>Finny</Text>
                    </View>
                    <Text style={styles.finnyMessage}>
                      Have you added all your accounts? We strongly recommend
                      adding all accounts to help Finny understand better.
                    </Text>
                  </Animated.View>
                )}

              {/* Loading state for analysis */}
              {isAnalyzing && (
                <View style={styles.finnyCard}>
                  <View style={styles.finnyCardHeader}>
                    <View style={styles.finnyAvatar}>
                      <ActivityIndicator size="small" color="#4A90E2" />
                    </View>
                    <Text style={styles.finnyLabel}>Finny</Text>
                  </View>
                  <Text style={styles.finnyMessage}>
                    Taking a quick look at your accounts...
                  </Text>
                </View>
              )}

              {/* Error state */}
              {accountAnalysis?.error && (
                <Animated.View
                  style={[
                    styles.finnyCard,
                    styles.finnyCardError,
                    { opacity: finnyCardOpacity },
                  ]}
                >
                  <Text style={styles.finnyLabel}>Finny</Text>
                  <Text style={styles.finnyMessage}>
                    {accountAnalysis.error_message}
                  </Text>
                </Animated.View>
              )}

              {connectedAccounts.map((account) => (
                <View key={account.account_id} style={styles.accountCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardInfo}>
                      <Text style={styles.institutionName}>
                        {account.institution_name}
                      </Text>
                      <Text style={styles.accountName}>
                        {account.official_name || account.name}
                        {account.mask && ` ••${account.mask}`}
                      </Text>
                      <Text style={styles.accountType}>
                        {account.subtype || account.type}
                      </Text>
                    </View>
                    <View style={styles.balanceSection}>
                      <Text style={styles.balanceLabel}>Balance</Text>
                      <Text style={styles.balanceAmount}>
                        {formatBalance(account.current_balance)}
                      </Text>
                      {account.available_balance !== null &&
                        account.available_balance !==
                          account.current_balance && (
                          <Text style={styles.availableBalance}>
                            Available:{" "}
                            {formatBalance(account.available_balance)}
                          </Text>
                        )}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.addAccountButton,
                  isLoading && styles.connectButtonDisabled,
                ]}
                onPress={handleConnect}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#4A90E2" />
                ) : (
                  <>
                    <Ionicons
                      name="add-circle-outline"
                      size={20}
                      color="#4A90E2"
                    />
                    <Text style={styles.addAccountButtonText}>
                      Add Another Account
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinue}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {(isLoading || isConnecting || isClosingPlaid) && (
          <View style={styles.loadingOverlay}>
            <BlurView
              intensity={95}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color="#4A90E2" />
              <Text style={styles.loadingText}>
                {isClosingPlaid
                  ? "Closing Plaid..."
                  : isConnecting
                    ? "Loading your accounts..."
                    : "Working with Plaid..."}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 4 : 6,
    paddingBottom: 4,
  },
  topBarSpacer: {
    flex: 1,
  },
  skipButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  skipButtonText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 40 : 20,
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 50,
    justifyContent: "space-between",
  },
  preConnectScrollView: {
    flex: 1,
  },
  preConnectScrollContent: {
    padding: 24,
    paddingTop: 5,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 10,
    textAlign: "left",
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 18,
    color: "#4A90E2",
    lineHeight: 24,
    textAlign: "left",
    fontWeight: "600",
  },
  description: {
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.75)",
    lineHeight: 22,
    textAlign: "left",
  },
  // Section label style
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 1,
    marginBottom: 10,
  },
  // What You'll Discover section
  discoverSection: {
    marginBottom: 20,
  },
  discoverCard: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: 14,
  },
  discoverItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  discoverIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  discoverText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    flex: 1,
    lineHeight: 20,
  },
  // Transparency section
  transparencySection: {
    marginBottom: 16,
  },
  transparencyCard: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  dataFlowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  dataFlowItem: {
    alignItems: "center",
    gap: 6,
  },
  dataFlowLabel: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
  plaidBadge: {
    backgroundColor: "#000",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  plaidBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  finnyEmoji: {
    fontSize: 20,
  },
  permissionsList: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 14,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  permissionText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
  },
  // Control section
  controlSection: {
    marginBottom: 16,
    marginTop: 10,
  },
  controlCard: {
    backgroundColor: "rgba(74, 144, 226, 0.08)",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.15)",
  },
  controlContent: {
    flex: 1,
  },
  controlTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  controlSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
  },
  // Plaid credibility section
  plaidSection: {
    marginBottom: 14,
    marginTop: 15,
  },
  plaidCard: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  plaidHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  plaidLogoBadge: {
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  plaidLogoText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#000",
  },
  plaidVerified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  plaidVerifiedText: {
    fontSize: 11,
    color: "#00D4AA",
    fontWeight: "500",
  },
  plaidDescription: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 19,
  },
  // Time estimate
  timeEstimate: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    // marginTop: 12,
  },
  // Safety link button
  safetyLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    // marginTop: 16,
    paddingVertical: 1,
  },
  safetyLinkText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
    textDecorationLine: "underline",
  },
  // Legacy trust styles (keeping for reference, can remove later)
  trustSection: {
    gap: 16,
    marginBottom: 40,
  },
  trustCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  trustIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  trustContent: {
    flex: 1,
  },
  trustTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  trustSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 20,
  },
  accountsList: {
    flex: 1,
    marginBottom: 16,
  },
  accountsListContent: {
    gap: 16,
    paddingBottom: 16,
  },
  accountCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 100,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flex: 1,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  institutionName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  accountName: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.9)",
  },
  accountType: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.6)",
    textTransform: "capitalize",
  },
  balanceSection: {
    alignItems: "flex-end",
    gap: 2,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#00D4AA",
  },
  availableBalance: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
  },
  addMoreText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "left",
    marginTop: 5,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 20,
  },
  connectButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 26,
    padding: 16,
    alignItems: "center",
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  addAccountButton: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderRadius: 26,
    padding: 16,
    alignItems: "center",
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  addAccountButtonText: {
    color: "#4A90E2",
    fontSize: 16,
    fontWeight: "600",
  },
  continueButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 26,
    padding: 16,
    alignItems: "center",
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  continueButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonIcon: {
    marginLeft: 4,
    marginBottom: 2,
  },
  securityMessage: {
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  securityText: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
  },
  securitySubtext: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  finnyCard: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: "rgba(74, 144, 226, 0.3)",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  finnyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 12,
  },
  finnyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(74, 144, 226, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.4)",
  },
  finnyLabel: {
    fontSize: 12,
    fontFamily: "ManropeSemiBold",
    color: "#fff",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  finnyMessage: {
    fontSize: 15,
    fontFamily: "Manrope",
    color: "rgba(255, 255, 255, 0.95)",
    lineHeight: 23,
  },
  finnyCardError: {
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
});

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
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
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
  const CONNECTION_DOT_COUNT = 8;
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
  const [monthlyIncomeInput, setMonthlyIncomeInput] = useState("");
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [isAiDisclosureOpen, setIsAiDisclosureOpen] = useState(false);
  const [hasAcceptedAiDisclosure, setHasAcceptedAiDisclosure] = useState(false);
  const [connectionStage, setConnectionStage] = useState<
    "exchange" | "accounts" | "transactions" | "finalizing" | "closing" | null
  >(null);
  const finnyCardOpacity = React.useRef(new Animated.Value(0)).current;
  const aiDisclosureAnimation = React.useRef(new Animated.Value(0)).current;
  const [aiDisclosureContentHeight, setAiDisclosureContentHeight] = useState(0);
  const connectionWaveProgress = React.useRef(new Animated.Value(0)).current;
  const connectionCardTranslate = React.useRef(new Animated.Value(20)).current;
  const connectionCardOpacity = React.useRef(new Animated.Value(0)).current;

  const showConnectionAnimation = isConnecting || isClosingPlaid;
  const hasConsentGranted = hasAcceptedAiDisclosure || hasConnectedBank;

  useEffect(() => {
    if (!showConnectionAnimation) {
      connectionWaveProgress.stopAnimation();
      connectionCardOpacity.setValue(0);
      connectionCardTranslate.setValue(20);
      return;
    }

    Animated.parallel([
      Animated.spring(connectionCardTranslate, {
        toValue: 0,
        damping: 20,
        stiffness: 220,
        useNativeDriver: true,
      }),
      Animated.timing(connectionCardOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    connectionWaveProgress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(connectionWaveProgress, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(connectionWaveProgress, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [showConnectionAnimation]);

  const connectionSubtitle =
    connectionStage === "exchange"
      ? "Securing your connection..."
      : connectionStage === "accounts"
        ? "Loading your accounts..."
        : connectionStage === "transactions"
          ? "Syncing your recent activity..."
          : connectionStage === "finalizing"
            ? "Preparing your Finny experience..."
            : connectionStage === "closing"
              ? "Wrapping things up..."
              : "Working with Plaid...";

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
          setHasAcceptedAiDisclosure(true);
          setConnectedAccounts(accounts);
          // If accounts already exist, this is not the first connection
          setIsFirstConnection(false);

          // Load existing base_analysis if it exists
          const { data: profile } = await supabase
            .from("profiles")
            .select("base_analysis, monthly_income")
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

          if (typeof profile?.monthly_income === "number") {
            setMonthlyIncomeInput(String(Math.round(profile.monthly_income)));
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
    if (!hasConsentGranted) {
      Alert.alert(
        "Permission Required",
        "Please review and accept how Finny tailors your guidance before connecting your accounts.",
      );
      return;
    }

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
            setHasAcceptedAiDisclosure(true);

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

          logger.info(
            "✅ AccountConnectionScreen: Successfully connected account",
          );
          logOnboardingEvent({ stage: "plaid", action: "success" });

          setConnectionStage("finalizing");

          // Refresh link token for next connections
          const newToken = await fetchLinkToken();
          setLinkToken(newToken ?? null);

          setTimeout(() => {
            setIsConnecting(false);
            setIsClosingPlaid(false);
            setConnectionStage(null);
          }, 350);
        },
        // onExit:
        (error?: any) => {
          setIsLoading(false);
          setConnectionStage("closing");
          setIsClosingPlaid(true);

          // Reset after a short delay to allow the closing animation
          setTimeout(() => {
            setIsClosingPlaid(false);
            setIsConnecting(false);
            setConnectionStage(null);
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
        {
          onProgress: (stage) => {
            setIsLoading(false);
            setIsClosingPlaid(false);
            setIsConnecting(true);
            setConnectionStage(stage);
          },
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

  const toggleAiDisclosure = () => {
    const nextValue = !isAiDisclosureOpen;
    setIsAiDisclosureOpen(nextValue);
    Animated.timing(aiDisclosureAnimation, {
      toValue: nextValue ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const handleContinue = async () => {
    try {
      const trimmedIncome = monthlyIncomeInput.replace(/[^0-9.]/g, "").trim();
      if (trimmedIncome.length > 0) {
        const parsedIncome = Number(trimmedIncome);
        if (!Number.isFinite(parsedIncome) || parsedIncome <= 0) {
          Alert.alert(
            "Invalid income",
            "Please enter a valid monthly income amount.",
          );
          return;
        }

        setIsSavingIncome(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          const { error: incomeError } = await supabase
            .from("profiles")
            .update({
              monthly_income: Math.round(parsedIncome),
              monthly_income_updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);
          if (incomeError) throw incomeError;
        }
      }

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
    } finally {
      setIsSavingIncome(false);
    }
  };

  const handleSafetyCommitment = async () => {
    try {
      await WebBrowser.openBrowserAsync("https://www.usefinny.com/safety", {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: "#4A90E2",
        showTitle: true,
      });
    } catch (error) {
      Alert.alert("Error", "Cannot open safety page");
      logger.error("Failed to open safety page:", error);
    }
  };

  const handlePrivacyPolicy = async () => {
    try {
      await WebBrowser.openBrowserAsync("https://www.usefinny.com/privacy", {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: "#4A90E2",
        showTitle: true,
      });
    } catch (error) {
      Alert.alert("Error", "Cannot open privacy policy");
      logger.error("Failed to open privacy policy:", error);
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
      colors={[
        "rgba(11, 15, 22, 0.99)",
        "rgba(23, 33, 62, 0.95)",
        "rgba(11, 15, 22, 0.99)",
      ]}
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
                <Text style={styles.skipButtonText}>
                  Skip:{" "}
                  <Text style={{ textDecorationLine: "underline" }}>
                    Connect later
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={[styles.preConnectScrollView, { paddingBottom: 10 }]}
              contentContainerStyle={styles.preConnectScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header - Clear and direct */}
              <View style={styles.header}>
                <Text
                  style={[styles.description, styles.preConnectDescription]}
                >
                  Add your accounts to get started
                </Text>
                <Text style={styles.preConnectSupportText}>
                  See spending patterns, subscriptions, and cash flow in under a
                  minute.
                </Text>
              </View>

              <View style={styles.transparencySection}>
                <Text style={styles.sectionLabel}>TRUST AND SAFETY</Text>
                <LinearGradient
                  colors={[
                    "rgba(24, 31, 42, 0.96)",
                    "rgba(19, 26, 38, 0.98)",
                    "rgba(14, 20, 32, 0.98)",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.transparencyCard}
                >
                  <View style={styles.trustPlaidRow}>
                    <View style={styles.trustPlaidBadge}>
                      <Text style={styles.trustPlaidBadgeText}>Plaid</Text>
                    </View>
                    <Text style={styles.trustPlaidText}>
                      Used by 12,000+ apps, including Venmo and Robinhood
                    </Text>
                  </View>
                  <View style={styles.permissionsList}>
                    <View style={styles.permissionRow}>
                      <Ionicons
                        name="shield-checkmark"
                        size={16}
                        color="#00D4AA"
                      />
                      <Text style={styles.permissionText}>
                        Read-only access
                      </Text>
                    </View>
                    <View style={styles.permissionRow}>
                      <Ionicons name="close-circle" size={16} color="#00D4AA" />
                      <Text style={styles.permissionText}>
                        Finny can't move money
                      </Text>
                    </View>
                    <View style={styles.permissionRow}>
                      <Ionicons name="lock-closed" size={16} color="#00D4AA" />
                      <Text style={styles.permissionText}>
                        Your bank credentials are never stored
                      </Text>
                    </View>
                    <View style={styles.permissionRow}>
                      <Ionicons name="link" size={16} color="#00D4AA" />
                      <Text style={styles.permissionText}>
                        You can disconnect anytime
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* AI disclosure for account connection */}
              <View style={styles.aiDisclosureSection}>
                <LinearGradient
                  colors={[
                    "rgba(27, 35, 48, 0.96)",
                    "rgba(21, 28, 41, 0.98)",
                    "rgba(16, 22, 34, 0.98)",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.aiDisclosureCard}
                >
                  <View style={styles.aiDisclosureHeaderRow}>
                    <TouchableOpacity
                      style={styles.aiDisclosureCheckbox}
                      onPress={() =>
                        setHasAcceptedAiDisclosure((current) => !current)
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={
                          hasAcceptedAiDisclosure
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={22}
                        color={hasAcceptedAiDisclosure ? "#00D4AA" : "#9BB6DB"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.aiDisclosureToggle}
                      onPress={toggleAiDisclosure}
                      activeOpacity={0.8}
                    >
                      <View style={styles.aiDisclosureTitleBlock}>
                        <Text style={styles.aiDisclosureTitle}>
                          Permission to tailor your guidance
                        </Text>
                        <Text style={styles.aiDisclosureSummary}>
                          Data used only to personalize your insights. Never
                          sold or used for ads.
                        </Text>
                      </View>
                      <Animated.View
                        style={[
                          styles.aiDisclosureChevron,
                          {
                            transform: [
                              {
                                rotate: aiDisclosureAnimation.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ["0deg", "180deg"],
                                }),
                              },
                            ],
                          },
                        ]}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color="rgba(255,255,255,0.85)"
                        />
                      </Animated.View>
                    </TouchableOpacity>
                  </View>

                  <Animated.View
                    style={[
                      styles.aiDisclosureAnimatedContainer,
                      {
                        height: aiDisclosureAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, aiDisclosureContentHeight || 1],
                        }),
                        opacity: aiDisclosureAnimation,
                      },
                    ]}
                  >
                    <View
                      style={styles.aiDisclosureContent}
                      onLayout={(event) => {
                        const nextHeight = event.nativeEvent.layout.height;
                        if (
                          nextHeight > 0 &&
                          nextHeight !== aiDisclosureContentHeight
                        ) {
                          setAiDisclosureContentHeight(nextHeight);
                        }
                      }}
                    >
                      <Text style={styles.aiDisclosureText}>
                        To personalize your financial guidance, Finny shares
                        transaction details such as account balances,
                        transaction amounts, merchant names, spending
                        categories, and transaction dates with OpenRouter and
                        the AI model provider used to generate your insights.
                        If you later chat with Finny or create goals, those
                        messages and goal details may also be shared for the
                        same purpose. This data is used only to generate your
                        insights and is never sold or used for advertising or
                        training.
                      </Text>
                      <Text style={styles.aiDisclosureText}>
                        <Text
                          style={styles.aiDisclosureTextLink}
                          onPress={handlePrivacyPolicy}
                        >
                          View Privacy Policy
                        </Text>
                      </Text>
                    </View>
                  </Animated.View>
                </LinearGradient>
              </View>
            </ScrollView>
            <View style={styles.preConnectFooter}>
              <View
                style={[styles.buttonContainer, styles.footerButtonContainer]}
              >
                <TouchableOpacity
                  style={[
                    styles.connectButton,
                    (isLoading || !hasConsentGranted) &&
                      styles.connectButtonDisabled,
                  ]}
                  onPress={handleConnect}
                  disabled={isLoading || !hasConsentGranted}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.connectButtonText}>
                      Connect my accounts
                    </Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.timeEstimate}>Takes about 60 seconds</Text>
                <View style={styles.linkRow}>
                  <TouchableOpacity
                    style={styles.safetyLinkButton}
                    onPress={handleSafetyCommitment}
                  >
                    <Text style={styles.safetyLinkText}>Safety commitment</Text>
                  </TouchableOpacity>
                  <Text style={styles.linkDivider}>•</Text>
                  <TouchableOpacity
                    style={styles.safetyLinkButton}
                    onPress={handlePrivacyPolicy}
                  >
                    <Text style={styles.safetyLinkText}>Privacy</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
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
                      <Image
                        source={require("../assets/images/finnylap1.png")}
                        style={styles.finnyAvatar}
                      />
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
                    <Image
                      source={require("../assets/images/finnylap1.png")}
                      style={styles.finnyAvatar}
                    />
                    <View style={styles.finnyLoadingBadge}>
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

              <View style={styles.incomeAskCard}>
                <Text style={styles.incomeAskTitle}>
                  Quick one: what is your monthly income?
                </Text>
                <Text style={styles.incomeAskSubtitle}>
                  Optional, but it helps Finny learn faster.
                </Text>
                <View style={styles.incomeInputRow}>
                  <Text style={styles.incomeDollar}>$</Text>
                  <TextInput
                    style={styles.incomeInput}
                    value={monthlyIncomeInput}
                    onChangeText={setMonthlyIncomeInput}
                    placeholder="e.g. 5000"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                </View>
              </View>

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

            <View style={[styles.buttonContainer, styles.postConnectFooter]}>
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
                disabled={isSavingIncome}
              >
                {isSavingIncome ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.continueButtonText}>Continue</Text>
                )}
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
            {isConnecting || isClosingPlaid ? (
              <Animated.View
                style={[
                  styles.connectionStatusCard,
                  {
                    opacity: connectionCardOpacity,
                    transform: [{ translateY: connectionCardTranslate }],
                  },
                ]}
              >
                <LinearGradient
                  colors={["#0d0f14", "#171b23", "#11151d"]}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.connectionStatusTitle}>
                  Connecting your account
                </Text>
                <View style={styles.connectionStatusRow}>
                  <Image
                    source={require("../assets/images/finnylap1.png")}
                    style={styles.connectionStatusFinny}
                  />
                  <View style={styles.connectionDotsWrap}>
                    <View style={styles.connectionDotsRow}>
                      {Array.from(
                        { length: CONNECTION_DOT_COUNT },
                        (_, index) => {
                          const center = (index + 0.5) / CONNECTION_DOT_COUNT;
                          const spread = 0.12;
                          const low = Math.max(0, center - spread);
                          const high = Math.min(1, center + spread);
                          const dotOpacity = connectionWaveProgress.interpolate(
                            {
                              inputRange: [low, center, high],
                              outputRange: [0.28, 1, 0.28],
                              extrapolate: "clamp",
                            },
                          );
                          const dotScale = connectionWaveProgress.interpolate({
                            inputRange: [low, center, high],
                            outputRange: [0.82, 1.35, 0.82],
                            extrapolate: "clamp",
                          });

                          return (
                            <Animated.View
                              key={index}
                              style={[
                                styles.connectionDot,
                                {
                                  opacity: dotOpacity,
                                  transform: [{ scale: dotScale }],
                                },
                              ]}
                            />
                          );
                        },
                      )}
                    </View>
                  </View>
                  <View style={styles.connectionStatusBank}>
                    <FontAwesome name="bank" size={26} color="#7FB6FF" />
                    <Text style={styles.connectionStatusBankText}>
                      Your bank
                    </Text>
                  </View>
                </View>
                <Text style={styles.connectionStatusSubtitle}>
                  {connectionSubtitle}
                </Text>
              </Animated.View>
            ) : (
              <View style={styles.loadingContent}>
                <ActivityIndicator size="large" color="#4A90E2" />
                <Text style={styles.loadingText}>Working with Plaid...</Text>
              </View>
            )}
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
    paddingBottom: 2,
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
    paddingTop: 0,
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
    paddingTop: 8,
    paddingBottom: 16,
  },
  header: {
    marginBottom: 24,
    marginTop: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 10,
    textAlign: "left",
    lineHeight: 32,
    fontFamily: "Manrope",
  },
  subtitle: {
    fontSize: 18,
    color: "#4A90E2",
    lineHeight: 24,
    textAlign: "left",
    fontWeight: "600",
  },
  description: {
    fontSize: 24,
    color: "#fff",
    // lineHeight: 24,
    textAlign: "left",
    fontFamily: "Manrope",
    fontWeight: "900",
  },
  preConnectDescription: {
    marginTop: 12,
    fontWeight: "600",
  },
  preConnectSupportText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255, 255, 255, 0.78)",
  },
  // Section label style
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.58)",
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
    marginTop: 6,
    marginBottom: 12,
  },
  transparencyCard: {
    borderRadius: 13,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  trustPlaidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  trustPlaidBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  trustPlaidBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#101318",
    letterSpacing: 0.2,
  },
  trustPlaidText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 0.68)",
  },
  permissionsList: {
    gap: 9,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  permissionText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.88)",
  },
  aiDisclosureSection: {
    marginBottom: 22,
    marginTop: 14,
  },
  aiDisclosureCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    gap: 8,
  },
  aiDisclosureHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  aiDisclosureCheckbox: {
    paddingTop: 2,
  },
  aiDisclosureToggle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  aiDisclosureTitleBlock: {
    flex: 1,
    flexShrink: 1,
    gap: 4,
  },
  aiDisclosureTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  aiDisclosureSummary: {
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 0.72)",
  },
  aiDisclosureChevron: {
    width: 18,
    alignItems: "center",
    marginTop: 2,
  },
  aiDisclosureAnimatedContainer: {
    overflow: "hidden",
  },
  aiDisclosureContent: {
    paddingTop: 8,
    paddingLeft: 32,
    gap: 6,
  },
  aiDisclosureText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.86)",
    lineHeight: 15,
  },
  aiDisclosureTextLink: {
    color: "#4A90E2",
    textDecorationLine: "underline",
  },
  // Time estimate
  timeEstimate: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    // marginTop: 12,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 1,
  },
  linkDivider: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 12,
  },
  safetyLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  safetyLinkText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.72)",
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
    gap: 12,
    paddingBottom: 12,
  },
  accountCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 84,
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
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 1,
  },
  accountName: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.9)",
  },
  accountType: {
    fontSize: 11,
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
    fontSize: 16,
    fontWeight: "700",
    color: "#00D4AA",
  },
  availableBalance: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
  },
  addMoreText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "left",
    marginTop: 3,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 20,
  },
  postConnectFooter: {
    marginTop: 1,
    gap: 10,
    paddingTop: 2,
  },
  preConnectFooter: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 0,
    backgroundColor: "transparent",
  },
  footerButtonContainer: {
    marginTop: 0,
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
    backgroundColor: "rgba(74, 144, 226, 0.22)",
    borderRadius: 26,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    alignSelf: "center",
    minWidth: 190,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(135, 187, 255, 0.4)",
  },
  addAccountButtonText: {
    color: "#9BC4FF",
    fontSize: 14,
    fontWeight: "600",
  },
  continueButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 26,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
  connectionStatusCard: {
    width: "86%",
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 8,
  },
  connectionStatusTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    marginBottom: 20,
    fontFamily: "Manrope",
  },
  connectionStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 18,
  },
  connectionStatusFinny: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  connectionDotsWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  connectionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#4A90E2",
  },
  connectionStatusBank: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  connectionStatusBankText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.72)",
    fontWeight: "500",
  },
  connectionStatusSubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 20,
    minHeight: 20,
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  finnyCard: {
    backgroundColor: "rgba(14, 22, 36, 0.94)",
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(96, 137, 186, 0.26)",
    shadowColor: "#08111E",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 3,
  },
  finnyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  finnyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  finnyLoadingBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: -10,
    marginTop: 14,
    backgroundColor: "rgba(10, 18, 29, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(125, 177, 244, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  finnyAvatar1: {
    width: 18,
    height: 18,
    borderRadius: 18,
    // backgroundColor: "rgba(74, 144, 226, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    // borderWidth: 1,
    // borderColor: "rgba(74, 144, 226, 0.4)",
  },
  finnyLabel: {
    fontSize: 12,
    fontFamily: "ManropeSemiBold",
    color: "#fff",
    letterSpacing: 1,
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
  incomeAskCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  incomeAskTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  incomeAskSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    marginBottom: 10,
  },
  incomeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.16)",
    paddingHorizontal: 12,
  },
  incomeDollar: {
    color: "#9BC4FF",
    fontSize: 18,
    marginRight: 8,
    fontWeight: "600",
  },
  incomeInput: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    paddingVertical: 10,
  },
});

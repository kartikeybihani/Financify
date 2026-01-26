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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchLinkToken, handlePlaidConnect } from "@/src/utils/plaid/plaid";
import { BlurView } from "expo-blur";
import logger from "@/src/utils/core/logger";
import { logOnboardingEvent } from "@/src/utils/auth/onboarding";
import AppStorage from "@/src/utils/storage/storage";

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

export default function AccountConnectionScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isClosingPlaid, setIsClosingPlaid] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [hasConnectedBank, setHasConnectedBank] = useState(false);
  const [hasUpdatedStage, setHasUpdatedStage] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<
    ConnectedAccount[]
  >([]);

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

      return `${tx.date} | ${effectiveName.slice(0, 34)} | ${amountStr} | ${effectiveCategory.slice(0, 22)}`;
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
        setLinkToken(token);
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
            setConnectedAccounts(accounts);
            setHasConnectedBank(true);

            // Log a clean preview of what transactions look like (last 30 days), once.
            // This is for onboarding/debugging visibility only.
            try {
              await logLast30DaysTransactionsPreview(user.id, itemId);
            } catch (e) {
              logger.warn("⚠️ Failed to log tx preview", e);
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
          setLinkToken(newToken);
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
                  onPress: async () => setLinkToken(await fetchLinkToken()),
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
          <View
            style={[
              styles.content,
              { paddingBottom: Platform.OS === "ios" ? 24 : 24 },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Connect at least 1 account</Text>
              {/* <Text style={styles.subtitle}>Real growth needs real data</Text> */}
              <Text style={styles.description}>
                This helps finny understand your spending better and provide you
                with personalized insights.
              </Text>
            </View>

            <View style={styles.trustSection}>
              <View style={styles.trustCard}>
                <View style={styles.trustIconContainer}>
                  <Ionicons name="shield-checkmark" size={24} color="#00D4AA" />
                </View>
                <View style={styles.trustContent}>
                  <Text style={styles.trustTitle}>Bank-level security</Text>
                  <Text style={styles.trustSubtitle}>
                    Used by Chase, Venmo, Robinhood • Read-only • Encrypted
                  </Text>
                </View>
              </View>

              <View style={styles.trustCard}>
                <View style={styles.trustIconContainer}>
                  <Ionicons name="time-outline" size={24} color="#4A90E2" />
                </View>
                <View style={styles.trustContent}>
                  <Text style={styles.trustTitle}>Takes ~60 seconds</Text>
                  <Text style={styles.trustSubtitle}>
                    See insights right after connecting
                  </Text>
                </View>
              </View>

              <View style={styles.trustCard}>
                <View style={styles.trustIconContainer}>
                  <Ionicons name="lock-closed" size={24} color="#00D4AA" />
                </View>
                <View style={styles.trustContent}>
                  <Text style={styles.trustTitle}>Your data is never sold</Text>
                  <Text style={styles.trustSubtitle}>
                    Never shared with advertisers • You can delete anytime
                  </Text>
                </View>
              </View>
            </View>

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
                      Connect My Bank
                    </Text>
                    <MaterialCommunityIcons
                      name="bank"
                      size={20}
                      color="#fff"
                      style={styles.buttonIcon}
                    />
                  </>
                )}
              </TouchableOpacity>
              <View style={styles.securityMessage}>
                <View style={styles.securityRow}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color="#A0A0A0"
                  />
                  <Text style={styles.securityText}>
                    We securely connect via Plaid
                  </Text>
                </View>
                <Text style={styles.securitySubtext}>
                  Used by 8000+ Institutions
                </Text>
              </View>
            </View>
          </View>
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
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
    textAlign: "left",
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 18,
    color: "#4A90E2",
    lineHeight: 24,
    textAlign: "left",
    fontWeight: "600",
  },
  description: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: 24,
    textAlign: "left",
    marginTop: 4,
  },
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
});

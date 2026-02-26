import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { getTransactionsForRecurringStream } from "@/src/utils/plaid/plaid";
import { RecurringStream, RecurringTransaction } from "@/src/types/plaid";
import IconButton from "@/src/components/shared/IconButton";
import FinnyLoadingIndicator from "@/src/components/shared/FinnyLoadingIndicator";
import { supabase } from "@/src/lib/supabase/supabase";
import { useDemoMode } from "@/src/contexts/DemoContext";
import {
  demoRecurringData,
  demoRecurringTransactionsByStream,
} from "@/src/data/demo/demoData";
import {
  bulkUpdateRecurringStatus,
  dismissRecurringStream,
  unDismissRecurringStream,
  reactivateRecurringStream,
} from "@/src/utils/recurring/recurringBulkUpdate";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import { API_BASE_URL } from "@/src/utils/core/apiUrl";

interface Props {
  recurringData: {
    subscriptions: RecurringStream[];
    income: RecurringStream[];
    bills: RecurringStream[];
    other: RecurringStream[];
    inactive?: RecurringStream[];
  } | null;
  isLoading: boolean;
  titleStyle: any;
  onRunAnalysis?: () => Promise<void>;
}

type SpacerItem = { spacer: true; id: string };
type ListItem = RecurringStream | SpacerItem;

const ANALYSIS_MESSAGES = [
  "Checking your subscriptions…",
  "Taking a quick look at your spendings…",
  "Scanning for recurring bills…",
  "Finding patterns in your transactions…",
  "Almost done analyzing…",
];

const LOADING_MESSAGES = [
  "Loading your recurring transactions…",
  "Fetching subscriptions and bills…",
  "Checking for recurring patterns…",
  "Almost ready…",
];

export default function RecurringSection({
  recurringData,
  isLoading,
  titleStyle,
  onRunAnalysis,
}: Props) {
  const { isDemoMode } = useDemoMode();

  // In demo mode, use demo data and skip loading
  const effectiveRecurringData = isDemoMode ? demoRecurringData : recurringData;
  const effectiveIsLoading = isDemoMode ? false : isLoading;

  const [selectedStream, setSelectedStream] = useState<RecurringStream | null>(
    null,
  );
  const [streamTransactions, setStreamTransactions] = useState<
    RecurringTransaction[]
  >([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);

  // Cache for recurring transactions
  const transactionsCache = useRef<Map<string, RecurringTransaction[]>>(
    new Map(),
  );
  const [preloadingStreams, setPreloadingStreams] = useState<Set<string>>(
    new Set(),
  );
  const [removingRecurring, setRemovingRecurring] = useState(false);
  const [addingBackRecurring, setAddingBackRecurring] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [analysisMessageIndex, setAnalysisMessageIndex] = useState(0);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    if (!analyzing) {
      setAnalysisMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setAnalysisMessageIndex((prev) =>
        prev >= ANALYSIS_MESSAGES.length - 1 ? 0 : prev + 1,
      );
    }, 2200);
    return () => clearInterval(interval);
  }, [analyzing]);

  useEffect(() => {
    if (!effectiveIsLoading) {
      setLoadingMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) =>
        prev >= LOADING_MESSAGES.length - 1 ? 0 : prev + 1,
      );
    }, 2200);
    return () => clearInterval(interval);
  }, [effectiveIsLoading]);

  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS
    ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
    : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;

  const { width } = useWindowDimensions();
  const horizontalPadding = 20;
  const interCardGap = 14;
  const cardColumns = width >= 760 ? 2 : 1;
  const cardWidth = Math.floor(
    cardColumns === 2
      ? (width - horizontalPadding * 2 - interCardGap) / 2
      : width - horizontalPadding * 2,
  );

  // Fetch user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
        }
      } catch (error) {
        console.error("Error fetching user ID:", error);
      }
    };
    fetchUserId();
  }, []);

  // Pre-load transactions for all recurring streams when data is available (skip in demo - we use inline data)
  useEffect(() => {
    if (effectiveRecurringData && !effectiveIsLoading && !isDemoMode) {
      const allStreams = [
        ...(effectiveRecurringData.subscriptions || []),
        ...(effectiveRecurringData.bills || []),
        ...(effectiveRecurringData.income || []),
        ...(effectiveRecurringData.other || []),
      ].filter((stream) => stream.is_active);

      // Pre-load transactions for each stream in the background
      allStreams.forEach((stream) => {
        if (
          !transactionsCache.current.has(stream.stream_id) &&
          !preloadingStreams.has(stream.stream_id)
        ) {
          setPreloadingStreams((prev) => new Set(prev).add(stream.stream_id));

          getTransactionsForRecurringStream(stream.stream_id)
            .then((transactions) => {
              transactionsCache.current.set(stream.stream_id, transactions);
            })
            .catch((error) => {
              console.error(
                `Error pre-loading transactions for stream ${stream.stream_id}:`,
                error,
              );
              transactionsCache.current.set(stream.stream_id, []);
            })
            .finally(() => {
              setPreloadingStreams((prev) => {
                const newSet = new Set(prev);
                newSet.delete(stream.stream_id);
                return newSet;
              });
            });
        }
      });
    }
  }, [effectiveRecurringData, effectiveIsLoading, isDemoMode]);

  const activeStreams = useMemo(() => {
    return effectiveRecurringData
      ? [
          ...(effectiveRecurringData.subscriptions || []),
          ...(effectiveRecurringData.bills || []),
          ...(effectiveRecurringData.income || []),
          ...(effectiveRecurringData.other || []),
        ].filter((item) => item.is_active)
      : [];
  }, [effectiveRecurringData]);

  // Build and pad list so we always fill the last row when using 2 columns
  const data: ListItem[] = useMemo(() => {
    if (cardColumns !== 2) return activeStreams;

    if (activeStreams.length % 2 !== 0) {
      return [...activeStreams, { spacer: true, id: "spacer" }];
    }
    return activeStreams;
  }, [activeStreams, cardColumns]);

  const inactiveStreams = useMemo(
    () => (effectiveRecurringData?.inactive || []) as RecurringStream[],
    [effectiveRecurringData],
  );

  const monthlyOutflow = useMemo(
    () =>
      activeStreams.reduce(
        (sum, stream) =>
          sum + (stream.average_amount > 0 ? stream.average_amount : 0),
        0,
      ),
    [activeStreams],
  );

  const monthlyInflow = useMemo(
    () =>
      activeStreams.reduce(
        (sum, stream) =>
          sum +
          (stream.average_amount < 0 ? Math.abs(stream.average_amount) : 0),
        0,
      ),
    [activeStreams],
  );

  const getStreamDisplayName = (stream: RecurringStream) =>
    stream.merchant_name || stream.description || "Unknown";

  const getStreamStatusLabel = (stream: RecurringStream) => {
    if (stream.is_active) return "Active";
    return stream.user_dismissed ? "Dismissed" : "Stopped";
  };

  const getStreamTypeIcon = (stream: RecurringStream) => {
    const merchant = (
      stream.merchant_name ||
      stream.description ||
      ""
    ).toLowerCase();

    if (
      merchant.includes("netflix") ||
      merchant.includes("spotify") ||
      merchant.includes("apple") ||
      merchant.includes("google")
    ) {
      return "play-outline";
    }
    if (
      merchant.includes("electric") ||
      merchant.includes("gas") ||
      merchant.includes("water") ||
      merchant.includes("rent")
    ) {
      return "home-outline";
    }
    if (stream.average_amount < 0) {
      return "arrow-down-outline"; // inflow
    }
    return "repeat-outline";
  };

  const getStreamTypeColor = (stream: RecurringStream) => {
    return stream.average_amount < 0 ? "#4CAF50" : "#FF6B6B";
  };

  const safeDate = (iso: string | undefined) => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  };

  const getNextTransactionDate = (stream: RecurringStream) => {
    const last = safeDate(stream.last_date);
    if (!last) return null;

    const frequency = (stream.frequency || "").toLowerCase();

    // Skip if frequency is "user-marked" (will be null and won't show next date)
    if (frequency === "user-marked") {
      return null;
    }

    const next = new Date(last);
    switch (frequency) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "bi-weekly":
        next.setDate(next.getDate() + 14);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      case "quarterly":
        next.setMonth(next.getMonth() + 3);
        break;
      case "annually":
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        return null; // Return null for unknown frequencies instead of defaulting
    }
    return next;
  };

  const formatShort = (d: Date | null) => {
    if (!d) return "TBD";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    // If you want the year too, add year: "numeric"
  };

  const formatFrequencyLabel = (frequency?: string | null) => {
    if (!frequency || frequency === "user-marked") return null;
    const normalized = frequency.toLowerCase().replace("-", " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const formatSignedAmount = (amount: number) => {
    const sign = amount < 0 ? "+" : "-";
    return `${sign}$${Math.abs(amount).toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    return new Date(dateStr).toLocaleDateString("en-US", options);
  };

  const handleCardPress = async (stream: RecurringStream) => {
    setSelectedStream(stream);
    setShowTransactionHistory(true);

    if (isDemoMode) {
      const demoTransactions =
        demoRecurringTransactionsByStream[stream.stream_id] || [];
      setStreamTransactions(demoTransactions as RecurringTransaction[]);
      setLoadingTransactions(false);
      return;
    }

    const cachedTransactions = transactionsCache.current.get(stream.stream_id);

    if (cachedTransactions) {
      setStreamTransactions(cachedTransactions);
      setLoadingTransactions(false);
    } else {
      setLoadingTransactions(true);
      setStreamTransactions([]);

      getTransactionsForRecurringStream(stream.stream_id)
        .then((transactions) => {
          transactionsCache.current.set(stream.stream_id, transactions);
          setStreamTransactions(transactions);
        })
        .catch((error) => {
          console.error("Error loading stream transactions:", error);
          transactionsCache.current.set(stream.stream_id, []);
          setStreamTransactions([]);
        })
        .finally(() => {
          setLoadingTransactions(false);
        });
    }
  };

  const handleBackToGrid = () => {
    setShowTransactionHistory(false);
    setSelectedStream(null);
  };

  const handleRunAnalysis = async () => {
    if (!userId || !onRunAnalysis || analyzing) return;
    try {
      setAnalyzing(true);
      const res = await authenticatedFetch(
        `${API_BASE_URL}/api/exchange_public_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "analyze_recurring",
            user_id: userId,
            trigger_source: "manual",
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Analysis failed", data.error || "Please try again.");
        return;
      }
      await onRunAnalysis();
    } catch (err: any) {
      Alert.alert("Analysis failed", err?.message || "Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRemoveRecurring = async () => {
    if (!selectedStream || !userId) {
      Alert.alert(
        "Error",
        "Unable to remove recurring status. Please try again.",
      );
      return;
    }

    Alert.alert(
      "Remove Recurring Status",
      `Remove recurring status from all transactions with "${selectedStream.merchant_name || selectedStream.description}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setRemovingRecurring(true);

              // Priority: Use stream_id if this is a Plaid stream (not user-marked)
              // User-marked streams have stream_id starting with "user-marked-"
              const isPlaidStream =
                !selectedStream.stream_id.startsWith("user-marked-");

              // For Plaid streams: mark stream as user_dismissed so it stays hidden and future syncs won't re-apply
              if (isPlaidStream) {
                await dismissRecurringStream(userId, selectedStream.stream_id);
              }

              const result = await bulkUpdateRecurringStatus(
                userId,
                {
                  recurring_stream_id: isPlaidStream
                    ? selectedStream.stream_id
                    : undefined,
                  merchant_name: selectedStream.merchant_name || undefined,
                  name: selectedStream.description || undefined,
                },
                "no",
                true, // Clear recurring_stream_id
              );

              const showSuccess = result.updated > 0 || isPlaidStream;
              if (showSuccess) {
                const message =
                  result.updated > 0
                    ? `Removed recurring status from ${result.updated} transaction${result.updated > 1 ? "s" : ""}.`
                    : "Removed from recurring. Future transactions will not be marked as recurring.";
                Alert.alert("Success", message, [
                  {
                    text: "OK",
                    onPress: () => {
                      // Go back to grid after successful removal
                      handleBackToGrid();
                    },
                  },
                ]);
              } else {
                Alert.alert(
                  "Error",
                  "No transactions were updated. Please try again.",
                );
              }
            } catch (error) {
              console.error("Error removing recurring status:", error);
              Alert.alert(
                "Error",
                "Failed to remove recurring status. Please try again.",
              );
            } finally {
              setRemovingRecurring(false);
            }
          },
        },
      ],
    );
  };

  const handleAddBackToRecurring = async () => {
    if (!selectedStream || !userId) {
      Alert.alert("Error", "Unable to add back. Please try again.");
      return;
    }

    const isPlaidStream = !selectedStream.stream_id.startsWith("user-marked-");
    if (!isPlaidStream) return;

    const merchantName =
      selectedStream.merchant_name || selectedStream.description;
    const isDismissed = !!selectedStream.user_dismissed;

    try {
      setAddingBackRecurring(true);

      const fn = isDismissed
        ? unDismissRecurringStream
        : reactivateRecurringStream;
      const result = await fn(
        userId,
        selectedStream.stream_id,
        merchantName || undefined,
        selectedStream.description || undefined,
      );

      if (!result.success) {
        Alert.alert("Error", result.error || "Please try again.");
        return;
      }

      Alert.alert("Success", "Added back to recurring.", [
        { text: "OK", onPress: () => handleBackToGrid() },
      ]);
      await onRunAnalysis?.();
    } catch (error) {
      console.error("Error adding back to recurring:", error);
      Alert.alert("Error", "Failed to add back. Please try again.");
    } finally {
      setAddingBackRecurring(false);
    }
  };

  const renderCard = ({ item }: { item: ListItem }) => {
    if ((item as SpacerItem).spacer) {
      return (
        <View
          style={[styles.cardSpacer, { width: cardWidth }]}
          pointerEvents="none"
        />
      );
    }

    const stream = item as RecurringStream;
    const color = getStreamTypeColor(stream);
    const iconName = getStreamTypeIcon(
      stream,
    ) as keyof typeof Ionicons.glyphMap;
    const nextDate = getNextTransactionDate(stream);
    const frequencyLabel = formatFrequencyLabel(stream.frequency);
    const showNextDate = !!(frequencyLabel && nextDate);

    const CardShell = shouldUseLiquidGlass ? GlassView : View;

    return (
      <TouchableOpacity
        key={stream.stream_id}
        activeOpacity={0.8}
        onPress={() => handleCardPress(stream)}
        style={styles.cardTouchable}
      >
        <CardShell
          {...(shouldUseLiquidGlass
            ? {
                glassEffectStyle: "regular",
                tintColor: "rgba(20, 20, 25, 0.9)",
              }
            : {})}
          style={[
            styles.transactionBox,
            {
              width: cardWidth,
              height: 94,
            },
          ]}
        >
          {!shouldUseLiquidGlass && (
            <LinearGradient
              colors={[
                "rgba(255, 255, 255, 0.06)",
                "rgba(255, 255, 255, 0.02)",
                "rgba(0, 0, 0, 0.05)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientOverlay}
            />
          )}

          <View style={styles.cardTopRow}>
            <View
              style={[styles.iconContainer, { backgroundColor: color + "15" }]}
            >
              <Ionicons name={iconName} size={18} color={color} />
            </View>
            <Text style={styles.merchantName} numberOfLines={1}>
              {getStreamDisplayName(stream)}
            </Text>
            {preloadingStreams.has(stream.stream_id) ? (
              <ActivityIndicator
                size="small"
                color="#4A90E2"
                style={styles.preloadIndicator}
              />
            ) : (
              <Ionicons
                name="chevron-forward"
                size={16}
                color="#888"
                style={styles.chevronIcon}
              />
            )}
          </View>

          <Text style={[styles.amount, { color }]}>
            {formatSignedAmount(stream.average_amount)}
          </Text>

          <View style={styles.cardMetaRow}>
            <Text style={styles.frequency}>
              {frequencyLabel || "User-marked"}
            </Text>

            <Text style={showNextDate ? styles.nextDate : styles.nextDateMuted}>
              {showNextDate ? `Next ${formatShort(nextDate)}` : "No next date"}
            </Text>
          </View>
        </CardShell>
      </TouchableOpacity>
    );
  };

  const renderInactiveRow = (stream: RecurringStream, index: number) => {
    const color = getStreamTypeColor(stream);
    const iconName = getStreamTypeIcon(
      stream,
    ) as keyof typeof Ionicons.glyphMap;
    const statusLabel = getStreamStatusLabel(stream);
    const frequencyLabel = formatFrequencyLabel(stream.frequency);

    return (
      <View key={stream.stream_id}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleCardPress(stream)}
          style={styles.inactiveRow}
        >
          <View style={styles.inactiveRowLeft}>
            <View
              style={[
                styles.inactiveIconContainer,
                { backgroundColor: color + "15" },
              ]}
            >
              <Ionicons name={iconName} size={16} color={color} />
            </View>
            <View style={styles.inactiveRowTextBlock}>
              <Text style={styles.inactiveMerchantName} numberOfLines={1}>
                {getStreamDisplayName(stream)}
              </Text>
              <View style={styles.inactiveSubRow}>
                <View
                  style={[
                    styles.statusPill,
                    statusLabel === "Dismissed"
                      ? styles.dismissedPill
                      : styles.stoppedPill,
                  ]}
                >
                  <Text style={styles.statusPillText}>{statusLabel}</Text>
                </View>
                {frequencyLabel && (
                  <Text style={styles.inactiveFrequency}>{frequencyLabel}</Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.inactiveRowRight}>
            <Text style={[styles.inactiveAmount, { color }]}>
              {formatSignedAmount(stream.average_amount)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#6F7788" />
          </View>
        </TouchableOpacity>
        {index < inactiveStreams.length - 1 && (
          <View style={styles.inactiveDivider} />
        )}
      </View>
    );
  };

  const renderTransactionHistoryView = () => {
    if (!selectedStream) return null;
    const selectedFrequency = formatFrequencyLabel(selectedStream.frequency);
    const selectedStatus = selectedStream.is_active
      ? null
      : getStreamStatusLabel(selectedStream);

    return (
      <View style={styles.fullWidthContainer}>
        {/* Header with remove recurring button and close button */}
        <View style={styles.historyHeader}>
          <View style={styles.headerInfo}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>
                {getStreamDisplayName(selectedStream)}
              </Text>
              <Text style={styles.headerSubtitle}>
                {selectedFrequency ? `${selectedFrequency} • ` : ""}
                {selectedStream.transaction_ids?.length || 0} transactions
              </Text>
              {selectedStatus && (
                <Text style={styles.headerStatusSubtext}>
                  Status: {selectedStatus}
                </Text>
              )}
            </View>
          </View>
          <IconButton
            icon="close"
            size={18}
            onPress={handleBackToGrid}
            style={styles.closeButton}
          />
        </View>

        {/* Loading Overlay */}
        {loadingTransactions && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingOverlayContent}>
              <ActivityIndicator size="large" color="#4A90E2" />
              <Text style={styles.loadingOverlayText}>
                Loading transaction history...
              </Text>
            </View>
          </View>
        )}

        {/* Remove or Add back button (hidden in demo mode) */}
        {!loadingTransactions &&
          streamTransactions.length > 0 &&
          !isDemoMode && (
            <>
              {selectedStream.is_active && !selectedStream.user_dismissed ? (
                <TouchableOpacity
                  style={styles.removeRecurringButton}
                  onPress={handleRemoveRecurring}
                  disabled={removingRecurring}
                  activeOpacity={0.7}
                >
                  <Text style={styles.removeRecurringButtonText}>
                    {removingRecurring
                      ? "Removing..."
                      : "Remove this from recurring"}
                  </Text>
                </TouchableOpacity>
              ) : !selectedStream.stream_id.startsWith("user-marked-") ? (
                <TouchableOpacity
                  style={styles.addBackRecurringButton}
                  onPress={handleAddBackToRecurring}
                  disabled={addingBackRecurring}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addBackRecurringButtonText}>
                    {addingBackRecurring
                      ? "Adding back..."
                      : "Add this into Recurring again"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

        {/* Transaction History */}
        <View style={styles.historyContent}>
          {loadingTransactions ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4A90E2" />
              <Text style={styles.loadingText}>
                Loading transaction history...
              </Text>
            </View>
          ) : streamTransactions.length > 0 ? (
            <View style={styles.transactionsContainer}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {streamTransactions.map((transaction, index) => (
                  <View key={transaction.id}>
                    <View style={styles.historyTransactionItem}>
                      <View style={styles.transactionLeft}>
                        <View style={styles.transactionIcon}>
                          <Ionicons
                            name={
                              transaction.amount < 0 ? "arrow-down" : "arrow-up"
                            }
                            size={14}
                            color={
                              transaction.amount < 0 ? "#4CAF50" : "#FF6B6B"
                            }
                          />
                        </View>
                        <View style={styles.transactionDetails}>
                          <Text
                            style={styles.historyTransactionName}
                            numberOfLines={1}
                          >
                            {transaction.name}
                          </Text>
                          <Text style={styles.historyTransactionDate}>
                            {formatDate(
                              transaction.authorized_date || transaction.date,
                            )}
                          </Text>
                          {transaction.accounts?.user_items
                            ?.institution_name && (
                            <Text style={styles.historyTransactionAccount}>
                              {transaction.accounts.user_items.institution_name}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.transactionRight}>
                        <Text
                          style={[
                            styles.historyTransactionAmount,
                            {
                              color:
                                transaction.amount < 0 ? "#4CAF50" : "#FF6B6B",
                            },
                          ]}
                        >
                          {transaction.amount < 0 ? "+" : "-"}$
                          {Math.abs(transaction.amount).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                    {index < streamTransactions.length - 1 && (
                      <View style={styles.transactionDivider} />
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.noTransactionsContainer}>
              <Ionicons name="receipt-outline" size={48} color="#666" />
              <Text style={styles.noTransactionsText}>
                No transactions found
              </Text>
              <Text style={styles.noTransactionsSubtext}>
                This recurring stream doesn't have any transaction history yet.
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (showTransactionHistory) {
    return renderTransactionHistoryView();
  }

  const renderLoadingView = (messages: string[], messageIndex: number) => (
    <View
      style={[
        styles.analyzingContainer,
        { paddingHorizontal: 20, marginTop: 16, marginBottom: 50 },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text style={titleStyle}>Recurring Transactions</Text>
      </View>
      <FinnyLoadingIndicator message={messages[messageIndex]} duration={2200} />
    </View>
  );

  if (analyzing) {
    return renderLoadingView(ANALYSIS_MESSAGES, analysisMessageIndex);
  }

  if (effectiveIsLoading) {
    return renderLoadingView(LOADING_MESSAGES, loadingMessageIndex);
  }

  const renderEmptyState = () => {
    return (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateContent}>
          <View style={styles.emptyStateIconContainer}>
            <Feather name="check" size={60} color="#4CAF50" />
          </View>
          <Text style={styles.emptyStateTitle}>All Clear!</Text>
          <Text style={styles.emptyStateMessage}>
            Great news! We didn't detect any recurring subscriptions or bills.
            You're in control of your finances!
          </Text>
        </View>
      </View>
    );
  };

  const hasRecurringStreams = data.length > 0 || inactiveStreams.length > 0;

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 16, marginBottom: 50 }}>
      <View style={styles.sectionHeader}>
        <Text style={titleStyle}>Recurring Transactions</Text>
        {onRunAnalysis && userId && !isDemoMode && (
          <TouchableOpacity
            onPress={handleRunAnalysis}
            disabled={analyzing}
            style={styles.analyzeButton}
          >
            {analyzing ? (
              <ActivityIndicator size="small" color="#4A90E2" />
            ) : (
              <>
                <Ionicons name="sparkles" size={14} color="#4A90E2" />
                <Text style={styles.analyzeButtonText}>Re-scan</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Active</Text>
          <Text style={styles.summaryValue}>{activeStreams.length}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Monthly out</Text>
          <Text style={[styles.summaryValue, styles.summaryOutflow]}>
            -${monthlyOutflow.toFixed(0)}
          </Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Monthly in</Text>
          <Text style={[styles.summaryValue, styles.summaryInflow]}>
            +${monthlyInflow.toFixed(0)}
          </Text>
        </View>
      </View>
      <View
        style={{
          paddingTop: 12,
          paddingBottom: 4,
        }}
      >
        {!hasRecurringStreams ? (
          renderEmptyState()
        ) : (
          <>
            {data.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent:
                    cardColumns === 2 ? "space-between" : "flex-start",
                }}
              >
                {data.map((it) => (
                  <View
                    key={
                      "spacer" in it
                        ? (it as SpacerItem).id
                        : (it as RecurringStream).stream_id
                    }
                    style={{ width: cardWidth, marginBottom: 14 }}
                  >
                    {renderCard({ item: it })}
                  </View>
                ))}
              </View>
            )}
            {inactiveStreams.length > 0 && (
              <View style={styles.inactiveSection}>
                <TouchableOpacity
                  style={styles.inactiveSectionHeader}
                  onPress={() => setInactiveExpanded((prev) => !prev)}
                  activeOpacity={0.7}
                >
                  <View>
                    <Text style={styles.inactiveSectionTitle}>
                      Inactive recurring ({inactiveStreams.length})
                    </Text>
                    <Text style={styles.inactiveSectionSubtitle}>
                      Dismissed and stopped streams
                    </Text>
                  </View>
                  <Ionicons
                    name={inactiveExpanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#9AA1AF"
                  />
                </TouchableOpacity>
                {inactiveExpanded && (
                  <View style={styles.inactiveList}>
                    {inactiveStreams.map((stream, index) =>
                      renderInactiveRow(stream, index),
                    )}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTouchable: {
    transform: [{ scale: 1 }],
  },
  cardSpacer: {
    opacity: 0,
  },
  transactionBox: {
    backgroundColor: "rgba(18, 20, 25, 0.96)",
    borderRadius: 16,
    padding: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 5,
    overflow: "hidden",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
    zIndex: 1,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  merchantName: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.1,
    opacity: 0.95,
  },
  amount: {
    fontSize: 19,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    zIndex: 1,
  },
  frequency: {
    fontSize: 11.5,
    color: "#AEB6C6",
    letterSpacing: 0.2,
    fontWeight: "500",
  },
  nextDate: {
    fontSize: 11.5,
    color: "#E4E8F0",
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  nextDateMuted: {
    fontSize: 11,
    color: "#6F7788",
    fontWeight: "500",
  },
  chevronIcon: {
    marginLeft: 8,
  },
  preloadIndicator: {
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 12,
    color: "#888",
    marginLeft: 8,
  },
  noTransactionsText: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    paddingVertical: 16,
    fontStyle: "italic",
  },
  // Full-width transaction history styles
  fullWidthContainer: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 20,
    marginBottom: 50,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  closeButton: {
    marginLeft: 8,
  },
  removeRecurringButton: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    opacity: 1,
  },
  removeRecurringButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A90E2",
    letterSpacing: 0.2,
  },
  addBackRecurringButton: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(76, 175, 80, 0.3)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addBackRecurringButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4CAF50",
    letterSpacing: 0.2,
  },
  headerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#888",
    opacity: 0.8,
  },
  headerStatusSubtext: {
    marginTop: 5,
    fontSize: 12,
    color: "#B9C0CF",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  historyContent: {
    flex: 1,
  },
  transactionsContainer: {
    backgroundColor: "rgba(40, 40, 45, 0.95)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    maxHeight: 500,
    overflow: "hidden",
  },
  scrollContent: {
    paddingBottom: 8,
  },
  historyTransactionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  transactionDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginHorizontal: 20,
  },
  transactionLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  transactionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  transactionDetails: {
    flex: 1,
  },
  historyTransactionName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 3,
  },
  historyTransactionDate: {
    fontSize: 11,
    color: "#888",
    marginBottom: 1,
  },
  historyTransactionAccount: {
    fontSize: 11,
    color: "#666",
    opacity: 0.8,
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  historyTransactionAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  noTransactionsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  noTransactionsSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    opacity: 0.8,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    zIndex: 1000,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlayContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlayText: {
    fontSize: 16,
    color: "#fff",
    marginTop: 16,
    fontWeight: "500",
  },
  // Empty State Styles
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyStateContent: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 320,
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(76, 175, 80, 0.3)",
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateMessage: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#8E96A6",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F4F7FC",
    letterSpacing: 0.1,
  },
  summaryOutflow: {
    color: "#FF9F9F",
  },
  summaryInflow: {
    color: "#7DDEB1",
  },
  analyzingContainer: {
    minHeight: 320,
    justifyContent: "flex-start",
  },
  analyzeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
  },
  analyzeButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4A90E2",
  },
  inactiveSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  inactiveSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  inactiveSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A3A9B5",
    letterSpacing: 0.2,
  },
  inactiveSectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#6F7788",
  },
  inactiveList: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    overflow: "hidden",
  },
  inactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  inactiveRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  inactiveIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  inactiveRowTextBlock: {
    flex: 1,
  },
  inactiveMerchantName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D7DCEA",
    marginBottom: 4,
  },
  inactiveSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#DDE3F0",
    letterSpacing: 0.2,
  },
  dismissedPill: {
    borderColor: "rgba(255, 159, 159, 0.5)",
    backgroundColor: "rgba(255, 159, 159, 0.16)",
  },
  stoppedPill: {
    borderColor: "rgba(161, 174, 194, 0.4)",
    backgroundColor: "rgba(161, 174, 194, 0.14)",
  },
  inactiveFrequency: {
    fontSize: 11,
    color: "#7D8697",
    fontWeight: "500",
  },
  inactiveRowRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  inactiveAmount: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  inactiveDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginHorizontal: 12,
  },
});

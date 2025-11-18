import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons, AntDesign, Feather } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { getTransactionsForRecurringStream } from "@/src/utils/plaid/plaid";
import {
  Transaction,
  RecurringStream,
  RecurringTransaction,
} from "@/src/types/plaid";

interface Props {
  recurringData: {
    subscriptions: RecurringStream[];
    income: RecurringStream[];
    bills: RecurringStream[];
    other: RecurringStream[];
  } | null;
  isLoading: boolean;
  titleStyle: any;
}

type SpacerItem = { spacer: true; id: string };
type ListItem = RecurringStream | SpacerItem;

export default function RecurringSection({
  recurringData,
  isLoading,
  titleStyle,
}: Props) {
  const [selectedStream, setSelectedStream] = useState<RecurringStream | null>(
    null
  );
  const [streamTransactions, setStreamTransactions] = useState<
    RecurringTransaction[]
  >([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);

  // Cache for recurring transactions
  const transactionsCache = useRef<Map<string, RecurringTransaction[]>>(
    new Map()
  );
  const [preloadingStreams, setPreloadingStreams] = useState<Set<string>>(
    new Set()
  );

  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS
    ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
    : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;

  const { width } = Dimensions.get("window");
  const horizontalPadding = 0; // No extra padding since parent container already has padding
  const interCardGap = 20;
  const cardWidth = Math.floor(
    (width - 40 - horizontalPadding * 2 - interCardGap) / 2
  ); // 40px is the parent container padding (20px left + 20px right)

  // Pre-load transactions for all recurring streams when data is available
  useEffect(() => {
    if (recurringData && !isLoading) {
      const allStreams = [
        ...(recurringData.subscriptions || []),
        ...(recurringData.bills || []),
        ...(recurringData.income || []),
        ...(recurringData.other || []),
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
                error
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
  }, [recurringData, isLoading]);

  // Function to clear cache (useful for refresh scenarios)
  const clearTransactionsCache = () => {
    transactionsCache.current.clear();
  };

  // Build and pad list so there are always two items per row
  const data: ListItem[] = useMemo(() => {
    const active = recurringData
      ? [
          ...(recurringData.subscriptions || []),
          ...(recurringData.bills || []),
          ...(recurringData.income || []),
          ...(recurringData.other || []),
        ].filter((item) => item.is_active)
      : [];

    // Ensure even count so the last row never has a single item
    if (active.length % 2 !== 0) {
      return [...active, { spacer: true, id: "spacer" }];
    }
    return active;
  }, [recurringData]);

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

    const next = new Date(last);
    switch ((stream.frequency || "").toLowerCase()) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
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
        next.setDate(next.getDate() + 1);
    }
    return next;
  };

  const formatShort = (d: Date | null) => {
    if (!d) return "TBD";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    // If you want the year too, add year: "numeric"
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
    // Instant switch - no animations
    setSelectedStream(stream);
    setShowTransactionHistory(true);

    // Check if we have cached transactions
    const cachedTransactions = transactionsCache.current.get(stream.stream_id);

    if (cachedTransactions) {
      // Use cached data immediately
      setStreamTransactions(cachedTransactions);
      setLoadingTransactions(false);
    } else {
      // Load from API if not cached
      setLoadingTransactions(true);
      setStreamTransactions([]); // Clear previous transactions

      // Load in background
      getTransactionsForRecurringStream(stream.stream_id)
        .then((transactions) => {
          // Cache the result for future use
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
    // Instant switch - no animations
    setShowTransactionHistory(false);
    setSelectedStream(null);
  };

  const renderCard = ({ item }: { item: ListItem }) => {
    if ((item as SpacerItem).spacer) {
      return (
        <View
          style={[
            styles.transactionBox,
            {
              width: cardWidth,
              opacity: 0,
            },
          ]}
          pointerEvents="none"
        />
      );
    }

    const stream = item as RecurringStream;
    const color = getStreamTypeColor(stream);
    const iconName = getStreamTypeIcon(
      stream
    ) as keyof typeof Ionicons.glyphMap;
    const nextDate = getNextTransactionDate(stream);

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
              height: 120,
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

          <View style={styles.boxHeader}>
            <View
              style={[styles.iconContainer, { backgroundColor: color + "15" }]}
            >
              <Ionicons name={iconName} size={18} color={color} />
            </View>
            <Text style={styles.merchantName} numberOfLines={1}>
              {stream.merchant_name || stream.description}
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

          <View style={styles.boxContent}>
            <Text style={[styles.amount, { color }]}>
              {stream.average_amount < 0 ? "+" : "-"}$
              {Math.abs(stream.average_amount).toFixed(2)}
            </Text>
            <Text style={styles.frequency}>
              {(stream.frequency || "").toLowerCase()}
            </Text>
          </View>

          <View style={styles.boxFooter}>
            <Text style={styles.nextDate}>Next: {formatShort(nextDate)}</Text>
          </View>
        </CardShell>
      </TouchableOpacity>
    );
  };

  const renderTransactionHistoryView = () => {
    if (!selectedStream) return null;

    const color = getStreamTypeColor(selectedStream);
    const iconName = getStreamTypeIcon(
      selectedStream
    ) as keyof typeof Ionicons.glyphMap;

    return (
      <View style={styles.fullWidthContainer}>
        {/* Header with cross button */}
        <View style={styles.historyHeader}>
          <View style={styles.headerInfo}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>
                {selectedStream.merchant_name || selectedStream.description}
              </Text>
              <Text style={styles.headerSubtitle}>
                {(selectedStream.frequency || "").charAt(0).toUpperCase() +
                  (selectedStream.frequency || "").slice(1).toLowerCase()}{" "}
                • {selectedStream.transaction_ids?.length || 0} transactions
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleBackToGrid}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
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
                            {formatDate(transaction.date)}
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

  if (isLoading) {
    // Skeleton that matches the real grid
    const placeholders = Array.from({ length: 6 }).map((_, i) => ({
      spacer: false,
      stream_id: `ph-${i}`,
      description: "",
      category: "",
      frequency: "",
      average_amount: 0,
      last_amount: 0,
      last_date: "",
      first_date: "",
      is_active: true,
      account_id: "",
      transaction_ids: [],
      iso_currency_code: "USD",
      merchant_name: "",
    })) as RecurringStream[];

    return (
      <View>
        <Text style={titleStyle}>Recurring Transactions</Text>
        <View
          style={{
            paddingTop: 12,
            paddingBottom: 4,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {placeholders.map((ph) => (
              <View
                key={ph.stream_id}
                style={{ width: cardWidth, marginBottom: 20 }}
              >
                <View
                  style={[styles.loadingBox, { width: cardWidth, height: 120 }]}
                />
              </View>
            ))}
          </View>
        </View>
      </View>
    );
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

  return (
    <View>
      <Text style={titleStyle}>Recurring Transactions</Text>
      <View
        style={{
          paddingTop: 12,
          paddingBottom: 4,
        }}
      >
        {data.length === 0 ? (
          renderEmptyState()
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {data.map((it) => (
              <View
                key={
                  "spacer" in it
                    ? (it as SpacerItem).id
                    : (it as RecurringStream).stream_id
                }
                style={{ width: cardWidth, marginBottom: 18 }}
              >
                {renderCard({ item: it })}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTouchable: {
    transform: [{ scale: 1 }],
  },
  transactionBox: {
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 0,
    borderColor: "rgba(248, 17, 17, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
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
  boxHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    zIndex: 1,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  merchantName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    letterSpacing: 0.2,
    opacity: 0.9,
  },
  boxContent: {
    marginBottom: 8,
    zIndex: 1,
  },
  amount: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  frequency: {
    fontSize: 12,
    color: "#888",
    textTransform: "capitalize",
    letterSpacing: 0.5,
    fontWeight: "400",
    opacity: 0.8,
  },
  boxFooter: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: 6,
    marginTop: 2,
    zIndex: 1,
  },
  nextDate: {
    fontSize: 11,
    color: "#999",
    fontWeight: "400",
    letterSpacing: 0.2,
    opacity: 0.7,
  },
  loadingBox: {
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    borderRadius: 20,
    borderWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
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
});

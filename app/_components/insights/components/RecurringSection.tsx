import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";

interface RecurringStream {
  stream_id: string;
  description: string;
  merchant_name?: string;
  category: string;
  frequency: string;
  average_amount: number; // negative for inflow per Plaid
  last_amount: number;
  last_date: string;
  first_date: string;
  is_active: boolean;
  account_id: string;
  transaction_ids: string[];
  iso_currency_code: string;
}

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
  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS
    ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
    : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;

  const { width } = useWindowDimensions();
  const horizontalPadding = 0; // No extra padding since parent container already has padding
  const interCardGap = 20;
  const cardWidth = Math.floor(
    (width - 40 - horizontalPadding * 2 - interCardGap) / 2
  ); // 40px is the parent container padding (20px left + 20px right)

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
      <TouchableOpacity key={stream.stream_id} activeOpacity={0.85}>
        <CardShell
          {...(shouldUseLiquidGlass
            ? {
                glassEffectStyle: "regular",
                tintColor: "rgba(20, 20, 25, 0.9)",
              }
            : {})}
          style={[styles.transactionBox, { width: cardWidth, height: 120 }]}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  transactionBox: {
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.08)",
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
});

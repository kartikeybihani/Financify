import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  DeviceEventEmitter,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import logger from "@/src/utils/core/logger";

type MaybeNumber = number | null | undefined;

interface InvestmentHoldingRow {
  id?: string;
  symbol?: string | null;
  description?: string | null;
  day_change?: MaybeNumber;
  day_change_percent?: MaybeNumber;
  market_value?: MaybeNumber;
  previous_market_value?: MaybeNumber;
  security_type?: string | null;
  last_updated?: string | null;
  total_percent_change?: MaybeNumber;
  unrealized_pl?: MaybeNumber;
}

interface Mover {
  symbol: string;
  pct: number;
  absPct: number;
  dayImpact: number;
  isTotalReturn?: boolean;
}

interface HoldingsMoversCardProps {
  onPress: () => void;
  holdings?: any[]; // Receive holdings as props (like GoalsSection receives goals)
}

const COLORS = {
  card: "#1f1f1f",
  border: "rgba(255, 255, 255, 0.06)",
  text: "#fff",
  subtext: "rgba(255, 255, 255, 0.65)",
  muted: "rgba(255, 255, 255, 0.45)",
  track: "rgba(255, 255, 255, 0.08)",
  surface: "rgba(255, 255, 255, 0.03)",
  positive: "#4ECDC4",
  negative: "#FF6B6B",
};

const formatSignedPercent = (pct: number): string => {
  const value = Number.isFinite(pct) ? pct : 0;
  const prefix = value > 0 ? "+" : value < 0 ? "" : "";
  return `${prefix}${value.toFixed(2)}%`;
};

const formatSignedMoney = (amount: number): string => {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (safe === 0) return formatter.format(0);
  const prefix = safe > 0 ? "+" : "-";
  return `${prefix}${formatter.format(Math.abs(safe))}`;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const getCompanyLogoUrl = (symbol: string): string =>
  `https://img.logo.dev/ticker/${symbol.toUpperCase()}?token=pk_VDL82EqXQlGEUFN2v4q7Vg&retina=true`;

const computeDayImpact = (h: InvestmentHoldingRow): number => {
  const direct = typeof h.day_change === "number" ? h.day_change : null;
  if (direct !== null && Number.isFinite(direct)) return direct;

  const mv = typeof h.market_value === "number" ? h.market_value : null;
  const pmv =
    typeof h.previous_market_value === "number"
      ? h.previous_market_value
      : null;
  if (
    mv !== null &&
    pmv !== null &&
    Number.isFinite(mv) &&
    Number.isFinite(pmv)
  ) {
    return mv - pmv;
  }
  return 0;
};

const computeTodayTotalPerformance = (
  holdings: InvestmentHoldingRow[]
): { amount: number; percentage: number; hasData: boolean } => {
  let total = 0;
  let totalMv = 0;
  let hasData = false;
  for (const h of holdings) {
    const direct =
      typeof h.day_change === "number" && Number.isFinite(h.day_change)
        ? h.day_change
        : null;
    if (direct !== null) {
      total += direct;
      hasData = true;
    } else if (
      typeof h.day_change_percent === "number" &&
      Number.isFinite(h.day_change_percent) &&
      typeof h.market_value === "number" &&
      Number.isFinite(h.market_value)
    ) {
      total += (h.market_value * h.day_change_percent) / 100;
      hasData = true;
    }
    const mv = typeof h.market_value === "number" ? h.market_value : 0;
    if (Number.isFinite(mv)) totalMv += mv;
  }
  const percentage = totalMv > 0 && hasData ? (total / totalMv) * 100 : 0;
  return { amount: total, percentage, hasData };
};

const pickTopMovers = (holdings: InvestmentHoldingRow[]): Mover[] => {
  const movers: Mover[] = [];
  for (const holding of holdings) {
    const symbol = (holding.symbol || "").trim();
    if (!symbol) continue;

    const pct =
      typeof holding.day_change_percent === "number"
        ? holding.day_change_percent
        : null;
    if (pct === null || !Number.isFinite(pct)) continue;

    const absPct = Math.abs(pct);
    if (absPct <= 0) continue;

    movers.push({
      symbol,
      pct,
      absPct,
      dayImpact: computeDayImpact(holding),
    });
  }

  movers.sort((a, b) => b.absPct - a.absPct);
  return movers.slice(0, 3);
};

/** Fallback: top 3 by absolute total_percent_change when day data is missing. */
const pickTopMoversByTotalReturn = (
  holdings: InvestmentHoldingRow[]
): Mover[] => {
  const movers: Mover[] = [];
  for (const holding of holdings) {
    const symbol = (holding.symbol || "").trim();
    if (!symbol) continue;

    const pct =
      typeof holding.total_percent_change === "number"
        ? holding.total_percent_change
        : null;
    if (pct === null || !Number.isFinite(pct)) continue;

    const absPct = Math.abs(pct);
    if (absPct <= 0) continue;

    const impact =
      typeof holding.unrealized_pl === "number" &&
      Number.isFinite(holding.unrealized_pl)
        ? holding.unrealized_pl
        : 0;

    movers.push({
      symbol,
      pct,
      absPct,
      dayImpact: impact,
      isTotalReturn: true,
    });
  }

  movers.sort((a, b) => b.absPct - a.absPct);
  return movers.slice(0, 3);
};

const TickerAvatar = React.memo(function TickerAvatar({
  symbol,
  size,
  accent,
}: {
  symbol: string;
  size: number;
  accent: string;
}) {
  const [imageError, setImageError] = useState(false);
  const initials = symbol.slice(0, 1).toUpperCase();
  const logoUri = getCompanyLogoUrl(symbol);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: imageError ? `${accent}18` : "rgba(255, 255, 255, 0.1)",
    borderColor: imageError ? `${accent}33` : "rgba(255, 255, 255, 0.1)",
  };

  if (imageError) {
    return (
      <View style={[styles.avatar, containerStyle]}>
        <Text
          style={[styles.avatarText, { color: accent, fontSize: size * 0.4 }]}
        >
          {initials}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.avatar, containerStyle]}>
      <Image
        source={{ uri: logoUri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImageError(true)}
      />
    </View>
  );
});

export const HoldingsMoversCard: React.FC<HoldingsMoversCardProps> = React.memo(
  ({ onPress, holdings: propHoldings = [] }) => {
    // Use holdings from props (loaded synchronously by useUnifiedFinancialData)
    // This matches the pattern used by GoalsSection
    const holdings = (propHoldings as InvestmentHoldingRow[]) || [];

    const dayMovers = useMemo(() => pickTopMovers(holdings), [holdings]);
    const fallbackMovers = useMemo(
      () => pickTopMoversByTotalReturn(holdings),
      [holdings]
    );
    const useDayData = dayMovers.length > 0;
    const displayMovers = useDayData ? dayMovers : fallbackMovers;
    const isFallback = !useDayData && fallbackMovers.length > 0;

    const todayPerf = useMemo(
      () => computeTodayTotalPerformance(holdings),
      [holdings]
    );
    const hero = displayMovers[0];
    const runners = displayMovers.slice(1);

    // Show card when there are any holdings (like GoalsSection - no gate needed)
    // Holdings are loaded synchronously, so if we have holdings, show immediately
    const hasHoldings = holdings.length > 0;
    if (!hasHoldings) return null;

    const maxAbsPct = hero?.absPct || 1;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={styles.pressable}
      >
        <View style={styles.card}>
          <LinearGradient
            colors={[
              "rgba(78, 205, 196, 0.35)",
              "rgba(74, 144, 226, 0.10)",
              "rgba(255, 255, 255, 0.00)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topAccent}
          />

          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>
                  {isFallback ? "Investments" : "Todays Movers"}
                </Text>
                {!isFallback && todayPerf.hasData && (
                  <View
                    style={[
                      styles.todayChip,
                      {
                        backgroundColor:
                          todayPerf.amount >= 0
                            ? `${COLORS.positive}1A`
                            : `${COLORS.negative}1A`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={todayPerf.amount >= 0 ? "arrow-up" : "arrow-down"}
                      size={10}
                      color={
                        todayPerf.amount >= 0
                          ? COLORS.positive
                          : COLORS.negative
                      }
                      style={{ marginRight: 3 }}
                    />
                    <Text
                      style={[
                        styles.todayChipText,
                        {
                          color:
                            todayPerf.amount >= 0
                              ? COLORS.positive
                              : COLORS.negative,
                        },
                      ]}
                    >
                      {formatSignedMoney(todayPerf.amount)}
                    </Text>
                  </View>
                )}
              </View>
              {/* <Text style={styles.subtitle}>Your holdings</Text> */}
            </View>
            <View style={styles.headerRight}>
              <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
            </View>
          </View>

          {!hero ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No mover data yet</Text>
              <Text style={styles.emptySubtitle}>
                We’ll show your biggest movers once today’s pricing is
                available.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.heroSection}>
                <View
                  style={[
                    styles.heroCard,
                    {
                      borderColor: COLORS.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.topMoverChip,
                      {
                        backgroundColor: `${
                          hero.pct >= 0 ? COLORS.positive : COLORS.negative
                        }33`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.topMoverChipText,
                        {
                          color:
                            hero.pct >= 0 ? COLORS.positive : COLORS.negative,
                        },
                      ]}
                    >
                      {isFallback ? "Top gainer" : "Top Mover"}
                    </Text>
                  </View>
                  <View style={styles.heroRow}>
                    <View style={styles.heroLeft}>
                      <TickerAvatar
                        symbol={hero.symbol}
                        size={32}
                        accent={
                          hero.pct >= 0 ? COLORS.positive : COLORS.negative
                        }
                      />
                      <Text style={styles.heroSymbol}>{hero.symbol}</Text>
                    </View>
                    <View style={styles.heroRight}>
                      <View style={styles.pctRow}>
                        <Ionicons
                          name={hero.pct >= 0 ? "arrow-up" : "arrow-down"}
                          size={12}
                          color={
                            hero.pct >= 0 ? COLORS.positive : COLORS.negative
                          }
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[
                            styles.heroPct,
                            {
                              color:
                                hero.pct >= 0
                                  ? COLORS.positive
                                  : COLORS.negative,
                            },
                          ]}
                        >
                          {formatSignedPercent(hero.pct)}
                        </Text>
                      </View>
                      <Text style={styles.heroImpact}>
                        {formatSignedMoney(hero.dayImpact)}
                        <Text style={styles.heroImpactSuffix}>
                          {isFallback ? " total" : " today"}
                        </Text>
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {runners.length > 0 && (
                <View style={styles.runnersSection}>
                  <Text style={styles.otherMoversLabel}>
                    {isFallback ? "Other gainers" : "Other movers"}
                  </Text>
                  <View style={styles.runnersRow}>
                    {runners.slice(0, 2).map((mover, idx) => {
                      const color =
                        mover.pct >= 0 ? COLORS.positive : COLORS.negative;
                      const ratio = clamp01(mover.absPct / maxAbsPct);
                      return (
                        <View
                          key={`${mover.symbol}-${idx}`}
                          style={styles.runnerCard}
                        >
                          <View style={styles.runnerTopRow}>
                            <Text style={styles.runnerSymbol}>
                              {mover.symbol}
                            </Text>
                            <Text style={[styles.runnerPct, { color }]}>
                              {formatSignedPercent(mover.pct)}
                            </Text>
                          </View>
                          <Text style={styles.runnerImpact}>
                            {formatSignedMoney(mover.dayImpact)}
                          </Text>
                          <View style={styles.runnerBarTrack}>
                            <View
                              style={[
                                styles.runnerBarFill,
                                {
                                  width: `${Math.round(ratio * 100)}%`,
                                  backgroundColor: `${color}B3`,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  }
);

HoldingsMoversCard.displayName = "HoldingsMoversCard";

const styles = StyleSheet.create({
  pressable: {
    marginBottom: 25,
    marginTop: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  topAccent: {
    height: 2,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  todayChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  todayChipText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Manrope",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    fontFamily: "Manrope",
    letterSpacing: 0.2,
    marginBottom: 5,
  },
  heroSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  topMoverChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10,
  },
  topMoverChipText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Manrope",
  },
  otherMoversLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
    marginBottom: 6,
    paddingHorizontal: 16,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  runnersSection: {
    paddingBottom: 12,
    paddingTop: 7,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  heroSymbol: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  heroRight: {
    alignItems: "flex-end",
    marginLeft: 12,
  },
  pctRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroPct: {
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
  },
  heroImpact: {
    marginTop: 1,
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  heroImpactSuffix: {
    color: COLORS.subtext,
    fontWeight: "600",
  },
  runnersRow: {
    flexDirection: "row",
    gap: 15,
    paddingHorizontal: 16,
  },
  runnerCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  runnerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  runnerSymbol: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
  },
  runnerPct: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  runnerImpact: {
    fontSize: 11,
    color: COLORS.subtext,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  runnerBarTrack: {
    marginTop: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.track,
    overflow: "hidden",
  },
  runnerBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  avatar: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  skeletonWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 10,
  },
  skeletonBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 14,
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.subtext,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    lineHeight: 16,
  },
});

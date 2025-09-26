import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../_lib/supabase/supabase";
import logger from "../_utils/logger";
import {
  getSnaptradeHoldingsFromDB,
  getSnaptradeOptionsFromDB,
  getSnaptradeBalancesFromDB,
  getSnaptradeConnectionsFromDB,
  getStoredSnaptradeCredentials,
  getSnaptradeCredentialsWithFallback,
  syncSnaptradeInvestments,
  populateInvestmentAccountsInDB,
} from "../_utils/snaptrade";
import { styles } from "../_styles/investmentsStyles";

interface Holding {
  symbol: string;
  description: string;
  units: number;
  price: number;
  market_value: number;
  unrealized_pl: number | null;
  day_change?: number | null;
  day_change_percent?: number | null;
}

interface OptionPosition {
  underlying_symbol: string;
  option_type: string;
  strike_price: number;
  expiration_date: string;
  units: number;
  price: number;
  market_value: number;
}

interface BalanceRow {
  cash: number;
  buying_power: number;
  currency_code: string;
}

interface ConnectionRow {
  account_id: string;
  brokerage_name: string;
  account_name: string;
  last_synced_at: string | null;
}

// Helper function to get company logo URL
const getCompanyLogoUrl = (symbol: string): string => {
  // Using img.logo.dev API for reliable company logos
  return `https://img.logo.dev/ticker/${symbol.toUpperCase()}?token=pk_VDL82EqXQlGEUFN2v4q7Vg&retina=true`;
};

export default function InvestmentsScreen({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [options, setOptions] = useState<OptionPosition[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const loadFromDb = async () => {
    try {
      const [h, o, b, c] = await Promise.all([
        getSnaptradeHoldingsFromDB(),
        getSnaptradeOptionsFromDB(),
        getSnaptradeBalancesFromDB(),
        getSnaptradeConnectionsFromDB(),
      ]);
      setHoldings(h || []);
      setOptions(o || []);
      setBalances(b || []);
      setConnections(c || []);
      setIsInitialLoad(false);
    } catch (err) {
      logger.error("Failed to load investments from DB", err);
      setIsInitialLoad(false);
    }
  };

  useEffect(() => {
    loadFromDb();
    // Populate investment accounts in main accounts table
    populateInvestmentAccountsInDB().catch((err) =>
      logger.error("Failed to populate investment accounts:", err)
    );
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const errorMsg = "User not authenticated";
        logger.error(errorMsg);
        setSyncError(errorMsg);
        return;
      }

      // Get credentials with fallback to database
      const creds = await getSnaptradeCredentialsWithFallback();

      if (!creds) {
        const errorMsg =
          "No valid SnapTrade credentials found. Please reconnect your investment account.";
        logger.warn(errorMsg);
        setSyncError(errorMsg);
        return;
      }

      if (connections.length === 0) {
        const errorMsg =
          "No investment connections found. Please reconnect your investment account.";
        logger.warn(errorMsg);
        setSyncError(errorMsg);
        return;
      }

      const first = connections[0];
      logger.info("🔄 Starting investment sync...");
      await syncSnaptradeInvestments(user.id, first.account_id);

      logger.info("🔄 Reloading data from database...");
      await loadFromDb();

      logger.info("🔄 Updating investment accounts in main table...");
      await populateInvestmentAccountsInDB();

      logger.info("✅ Investment sync completed successfully");
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to sync investments";
      logger.error("Failed to sync investments", err);
      setSyncError(errorMsg);
    } finally {
      setIsSyncing(false);
    }
  };

  const totalHoldingsValue = holdings.reduce(
    (sum, h) => sum + (h.market_value || 0),
    0
  );
  const totalOptionsValue = options.reduce(
    (sum, o) => sum + (o.market_value || 0),
    0
  );
  const totalPortfolioValue = totalHoldingsValue + totalOptionsValue;
  const totalCash = balances.reduce((sum, b) => sum + (b.cash || 0), 0);

  // Calculate total unrealized P&L for gamification
  const totalUnrealizedPL = holdings.reduce(
    (sum, h) => sum + (h.unrealized_pl || 0),
    0
  );

  // Calculate today's portfolio performance using the day_change fields where available
  // If day_change is not provided by SnapTrade API, we'll calculate a simplified daily change
  // by taking the price change since previous day and multiplying by number of units
  const calculateTodayPerformance = () => {
    let totalDailyPerformance = 0;
    let hasValidDayData = false;

    console.log(
      "🔍 Calculating today's performance with holdings:",
      holdings.length
    );

    for (const holding of holdings) {
      console.log(`🔍 Processing ${holding.symbol}:`, {
        day_change: holding.day_change,
        day_change_percent: holding.day_change_percent,
        market_value: holding.market_value,
      });

      // First priority: use day_change field from database if available
      if (
        holding.day_change !== null &&
        holding.day_change !== undefined &&
        !isNaN(holding.day_change)
      ) {
        console.log(
          `✅ Adding day_change for ${holding.symbol}: ${holding.day_change}`
        );
        totalDailyPerformance += holding.day_change;
        hasValidDayData = true;
        continue;
      }

      // Second priority: calculate approximate daily change from day_change_percent
      if (
        holding.day_change_percent !== null &&
        holding.day_change_percent !== undefined &&
        !isNaN(holding.day_change_percent) &&
        holding.market_value
      ) {
        const dailyChange =
          (holding.market_value * holding.day_change_percent) / 100;
        console.log(
          `✅ Adding day_change_percent for ${holding.symbol}: ${dailyChange} (${holding.day_change_percent}% of ${holding.market_value})`
        );
        totalDailyPerformance += dailyChange;
        hasValidDayData = true;
        continue;
      }
    }

    console.log(
      `📊 Total daily performance calculated: $${totalDailyPerformance}, hasValidDayData: ${hasValidDayData}`
    );

    // If we don't have day change data, we can't accurately show today's performance
    if (!hasValidDayData) {
      console.log("⚠️ No day change data found, setting performance to 0");
      return {
        amount: 0,
        percentage: 0,
      };
    }

    // Calculate today's performance percentage of the portfolio
    const todayPortfolioPercentage =
      totalPortfolioValue > 0
        ? (totalDailyPerformance / totalPortfolioValue) * 100
        : 0;

    console.log(
      `✅ Final performance: $${totalDailyPerformance.toFixed(
        2
      )}, ${todayPortfolioPercentage.toFixed(2)}%`
    );

    return {
      amount: totalDailyPerformance,
      percentage: todayPortfolioPercentage,
    };
  };

  const todayPerformance = calculateTodayPerformance();

  const getBrokerageLogoUrl = (brokerageName: string): string => {
    // Map brokerage names to their domains
    const brokerageDomainMap: { [key: string]: string } = {
      Fidelity: "fidelity.com",
      Vanguard: "vanguard.com",
      "Charles Schwab": "schwab.com",
      "TD Ameritrade": "ameritrade.com",
      "E*TRADE": "etrade.com",
      Robinhood: "robinhood.com",
      Webull: "webull.com",
      Alpaca: "alpaca.markets",
      // Add more as needed
    };

    const domain =
      brokerageDomainMap[brokerageName] ||
      brokerageName.toLowerCase().replace(/\s+/g, "") + ".com";
    return `https://img.logo.dev/${domain}?token=pk_VDL82EqXQlGEUFN2v4q7Vg&retina=true`;
  };

  const renderPortfolioSummary = () => {
    const lastConnection = connections.length > 0 ? connections[0] : null;
    const lastSyncDate = lastConnection?.last_synced_at
      ? new Date(lastConnection.last_synced_at).toLocaleDateString()
      : "Never";
    const brokerageName =
      lastConnection?.brokerage_name || "Investment Account";

    return (
      <View style={styles.portfolioSummaryContainer}>
        <View style={styles.portfolioSummaryContent}>
          <View style={styles.portfolioInfo}>
            <Text style={styles.portfolioLabel}>Total Portfolio Value</Text>
            <Text style={styles.portfolioValue}>
              $
              {totalPortfolioValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>

            {/* Today's Performance - only show actual daily gains/losses */}
            {Math.abs(todayPerformance.amount) > 0 && (
              <View style={styles.todayPerformanceContainer}>
                <View style={styles.profitLossIndicator}>
                  <Ionicons
                    name={
                      todayPerformance.amount >= 0
                        ? "trending-up"
                        : "trending-down"
                    }
                    size={14}
                    color={todayPerformance.amount >= 0 ? "#4ECDC4" : "#FF6B6B"}
                  />
                  <Text
                    style={[
                      styles.todayPerformanceText,
                      {
                        color:
                          todayPerformance.amount >= 0 ? "#4ECDC4" : "#FF6B6B",
                      },
                    ]}
                  >
                    Today: {todayPerformance.amount >= 0 ? "+" : ""}$
                    {Math.abs(todayPerformance.amount).toFixed(2)} (
                    {todayPerformance.amount >= 0 ? "+" : ""}
                    {todayPerformance.percentage.toFixed(2)}%)
                  </Text>
                </View>
              </View>
            )}

            {totalCash > 0 && (
              <Text style={styles.availableCash}>
                Available Cash: $
                {totalCash.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            )}
          </View>
          <View style={styles.accountInfo}>
            <View style={styles.brokerageInfo}>
              <Image
                source={{ uri: getBrokerageLogoUrl(brokerageName) }}
                style={styles.brokerageLogo}
                defaultSource={require("../assets/icon.png")}
              />
              <View style={styles.brokerageDetails}>
                <Text style={styles.accountName}>{brokerageName}</Text>
                <Text style={styles.lastSyncText}>
                  Last synced: {lastSyncDate}
                </Text>
              </View>
            </View>
            {/* Sync Button */}
            <TouchableOpacity
              style={[
                styles.syncButton,
                isSyncing && styles.syncButtonDisabled,
              ]}
              onPress={handleSync}
              disabled={isSyncing}
            >
              <Ionicons
                name={isSyncing ? "hourglass" : "refresh"}
                size={18}
                color="#4A90E2"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderHoldings = () => {
    if (holdings.length === 0) return null;

    return (
      <View style={styles.investmentGroup}>
        <Text style={styles.sectionHeading}>
          Your Holdings ({holdings.length})
        </Text>
        <View style={styles.glassContainer}>
          {holdings.map((h, idx) => (
            <View key={idx}>
              <View style={styles.holdingRow}>
                <View style={styles.holdingLeft}>
                  <Image
                    source={{ uri: getCompanyLogoUrl(h.symbol) }}
                    style={styles.stockLogo}
                    defaultSource={require("../assets/icon.png")}
                  />
                  <View style={styles.stockInfo}>
                    <Text style={styles.stockSymbol}>{h.symbol}</Text>
                    <Text style={styles.stockDescription} numberOfLines={1}>
                      {h.description}
                    </Text>
                    <Text style={styles.stockQuantity}>QTY: {h.units}</Text>
                  </View>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.stockValue}>
                    $
                    {h.market_value?.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }) || "0.00"}
                  </Text>
                  <View style={styles.stockDetails}>
                    <Text style={styles.stockDetail}>
                      ${h.price?.toFixed(2) || "0.00"}
                    </Text>
                    {h.unrealized_pl !== null && (
                      <Text
                        style={[
                          styles.pnlText,
                          (h.unrealized_pl || 0) >= 0
                            ? styles.pnlPositive
                            : styles.pnlNegative,
                        ]}
                      >
                        {(h.unrealized_pl || 0) >= 0 ? "+" : ""}$
                        {Math.abs(h.unrealized_pl).toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              {idx < holdings.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderOptions = () => {
    if (options.length === 0) return null;

    return (
      <View style={styles.investmentGroup}>
        <Text style={styles.sectionHeading}>Options ({options.length})</Text>
        <View style={styles.glassContainer}>
          {options.map((o, idx) => (
            <View key={idx}>
              <View style={styles.holdingRow}>
                <View style={styles.holdingLeft}>
                  <View style={styles.optionIconContainer}>
                    <Ionicons
                      name="bar-chart-outline"
                      size={20}
                      color="#FF9800"
                    />
                  </View>
                  <View style={styles.stockInfo}>
                    <Text style={styles.stockSymbol}>
                      {o.underlying_symbol} {o.option_type}
                    </Text>
                    <Text style={styles.stockDescription}>
                      Strike: ${o.strike_price} • Exp: {o.expiration_date}
                    </Text>
                    <Text style={styles.stockQuantity}>
                      {o.units} contracts
                    </Text>
                  </View>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.stockValue}>
                    $
                    {o.market_value?.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }) || "0.00"}
                  </Text>
                  <View style={styles.stockDetails}>
                    <Text style={styles.stockDetail}>
                      ${o.price?.toFixed(2) || "0.00"} premium per contract
                    </Text>
                  </View>
                </View>
              </View>
              {idx < options.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return embedded ? (
    <View style={styles.container}>
      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#4A90E2" size="large" />
          <Text style={styles.loadingText}>Loading investment data...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.embeddedContent}
          showsVerticalScrollIndicator={false}
        >
          {renderPortfolioSummary()}

          {syncError && (
            <View style={styles.errorContainer}>
              <Ionicons name="warning" size={16} color="#F44336" />
              <Text style={styles.errorText}>{syncError}</Text>
            </View>
          )}

          {renderHoldings()}
          {renderOptions()}
        </ScrollView>
      )}
    </View>
  ) : (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#4A90E2" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.greetingText}>Investment Portfolio</Text>
            <Text style={styles.subGreeting}>Track your wealth</Text>
          </View>
          <TouchableOpacity
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
            onPress={handleSync}
            disabled={isSyncing}
          >
            <Ionicons
              name={isSyncing ? "hourglass" : "refresh"}
              size={18}
              color="#4A90E2"
            />
          </TouchableOpacity>
        </View>

        {isInitialLoad ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#4A90E2" size="large" />
            <Text style={styles.loadingText}>Loading investment data...</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {renderPortfolioSummary()}

            {syncError && (
              <View style={styles.errorContainer}>
                <Ionicons name="warning" size={16} color="#F44336" />
                <Text style={styles.errorText}>{syncError}</Text>
              </View>
            )}

            {renderHoldings()}
            {renderOptions()}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

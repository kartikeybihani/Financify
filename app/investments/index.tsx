import React, { useEffect, useState, useRef } from "react";
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
import InstitutionSelectionModal from "../_components/modals/InstitutionSelectionModal";

interface Holding {
  symbol: string;
  description: string;
  units: number;
  price: number;
  market_value: number;
  unrealized_pl: number | null;
  day_change?: number | null;
  day_change_percent?: number | null;
  security_type?: string;
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
  preloadedData,
}: {
  embedded?: boolean;
  preloadedData?: {
    holdings?: any[];
    options?: any[];
    balances?: any[];
    connections?: any[];
  };
}) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [options, setOptions] = useState<OptionPosition[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [showInstitutionModal, setShowInstitutionModal] = useState(false);
  const hasData = useRef(false);

  const loadFromDb = async () => {
    try {
      logger.info("Investments: Loading data from Supabase...");

      const [h, o, b, c] = await Promise.all([
        getSnaptradeHoldingsFromDB(),
        getSnaptradeOptionsFromDB(),
        getSnaptradeBalancesFromDB(),
        getSnaptradeConnectionsFromDB(),
      ]);

      const hasAnyData =
        (h && h.length > 0) ||
        (o && o.length > 0) ||
        (b && b.length > 0) ||
        (c && c.length > 0);

      if (hasAnyData) {
        logger.info(
          `Investments: Loaded data from Supabase - Holdings: ${
            h?.length || 0
          }, Options: ${o?.length || 0}, Balances: ${
            b?.length || 0
          }, Connections: ${c?.length || 0}`
        );
        setHoldings(h || []);
        setOptions(o || []);
        setBalances(b || []);
        setConnections(c || []);
        hasData.current = true;
        return true;
      }

      logger.info("Investments: No investment data found in database");
      setHoldings([]);
      setOptions([]);
      setBalances([]);
      setConnections([]);
      return false;
    } catch (err) {
      logger.error("Failed to load investments from DB", err);
      return false;
    }
  };

  useEffect(() => {
    const initializeScreen = async () => {
      // If we already have data, don't reload unnecessarily
      if (hasData.current) {
        logger.info("Investments: Data already loaded, skipping reload");
        return;
      }

      // Check if data is preloaded (when embedded in insights screen)
      if (preloadedData) {
        logger.info("Investments: Using preloaded data from insights screen");
        setHoldings(preloadedData.holdings || []);
        setOptions(preloadedData.options || []);
        setBalances(preloadedData.balances || []);
        setConnections(preloadedData.connections || []);

        const hasAnyData =
          (preloadedData.holdings && preloadedData.holdings.length > 0) ||
          (preloadedData.options && preloadedData.options.length > 0) ||
          (preloadedData.balances && preloadedData.balances.length > 0) ||
          (preloadedData.connections && preloadedData.connections.length > 0);

        hasData.current = !!hasAnyData;
        return; // Skip all database loading/logic when using preloaded data
      }

      // Only perform database loading when NOT embedded (standalone mode)
      if (!embedded) {
        try {
          // Load stored data first (like transaction screens)
          const hasStoredData = await loadFromDb();

          // If no stored data, we could potentially trigger a sync here
          // but for now, we'll just show the empty state
          if (!hasStoredData) {
            logger.info(
              "Investments: No stored data found, showing empty state"
            );
          }

          // Populate investment accounts in main accounts table (non-blocking)
          populateInvestmentAccountsInDB().catch((err) =>
            logger.error("Failed to populate investment accounts:", err)
          );
        } catch (error) {
          logger.error("Error during investment initialization:", error);
        }
      }
    };

    initializeScreen();
  }, [preloadedData, embedded]);

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
      const hasStoredData = await loadFromDb();

      if (hasStoredData) {
        hasData.current = true;
      }

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

  const handleAddInvestmentAccount = () => {
    logger.info("Add Investment Account button pressed");
    setShowInstitutionModal(true);
  };

  const handleInstitutionSelect = (institutionId: string) => {
    logger.info("Investment institution selected:", institutionId);
    setShowInstitutionModal(false);
  };

  const handleInstitutionModalClose = () => {
    setShowInstitutionModal(false);
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

  // Calculate today's portfolio performance using the day_change fields from Supabase first
  // Step 1: Check Supabase investment_holdings table for day_change and day_change_percent
  // Step 2: If not available, fall back to calculation logic
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

      // STEP 1: First priority - use day_change field from Supabase database if available
      if (
        holding.day_change !== null &&
        holding.day_change !== undefined &&
        !isNaN(holding.day_change)
      ) {
        console.log(
          `✅ Using day_change from Supabase for ${holding.symbol}: ${holding.day_change}`
        );
        totalDailyPerformance += holding.day_change;
        hasValidDayData = true;
        continue;
      }

      // STEP 2: Second priority - calculate from day_change_percent from Supabase database
      if (
        holding.day_change_percent !== null &&
        holding.day_change_percent !== undefined &&
        !isNaN(holding.day_change_percent) &&
        holding.market_value
      ) {
        const dailyChange =
          (holding.market_value * holding.day_change_percent) / 100;
        console.log(
          `✅ Using day_change_percent from Supabase for ${holding.symbol}: ${dailyChange} (${holding.day_change_percent}% of ${holding.market_value})`
        );
        totalDailyPerformance += dailyChange;
        hasValidDayData = true;
        continue;
      }

      // STEP 3: Fallback calculation (for first-time users when database fields are null)
      // This is a simplified calculation - in production, you'd want more sophisticated logic
      console.log(
        `⚠️ No day change data in Supabase for ${holding.symbol}, skipping fallback calculation for now`
      );
    }

    console.log(
      `📊 Total daily performance calculated: $${totalDailyPerformance}, hasValidDayData: ${hasValidDayData}`
    );

    // If we don't have day change data from Supabase, we can't accurately show today's performance
    if (!hasValidDayData) {
      console.log(
        "⚠️ No day change data found in Supabase database, setting performance to 0"
      );
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

            {/* Total Change (Unrealized P&L) - Lifetime gains/losses */}
            {Math.abs(totalUnrealizedPL) > 0 && (
              <View style={styles.todayPerformanceContainer}>
                <View style={styles.profitLossIndicator}>
                  <Ionicons
                    name={
                      totalUnrealizedPL >= 0 ? "trending-up" : "trending-down"
                    }
                    size={14}
                    color={totalUnrealizedPL >= 0 ? "#4ECDC4" : "#FF6B6B"}
                  />
                  <Text
                    style={[
                      styles.todayPerformanceText,
                      {
                        color: totalUnrealizedPL >= 0 ? "#4ECDC4" : "#FF6B6B",
                      },
                    ]}
                  >
                    Total: {totalUnrealizedPL >= 0 ? "+" : ""}$
                    {Math.abs(totalUnrealizedPL).toFixed(2)}
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
            {/* Button Group with Spacing */}
            <View style={styles.buttonGroup}>
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
              {/* Add Account Button */}
              <TouchableOpacity
                style={styles.syncButton}
                onPress={handleAddInvestmentAccount}
              >
                <Ionicons name="add-outline" size={18} color="#4A90E2" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderHoldings = () => {
    // Filter out cash holdings - we already show available cash separately
    const nonCashHoldings = holdings.filter((holding) => {
      // Filter out holdings that are cash or cash equivalents
      const symbol = holding.symbol?.toLowerCase() || "";
      const description = holding.description?.toLowerCase() || "";
      const securityType = holding.security_type?.toLowerCase() || "";

      // Common cash/cash equivalent indicators
      const isCash =
        symbol === "cash" ||
        symbol === "csh" ||
        symbol === "cash_equivalent" ||
        description.includes("cash") ||
        description.includes("money market") ||
        description.includes("sweep") ||
        securityType.includes("cash") ||
        securityType.includes("money market") ||
        securityType.includes("sweep");

      if (isCash) {
        console.log(
          `🚫 Filtering out cash holding: ${holding.symbol} - ${holding.description}`
        );
      }

      return !isCash;
    });

    console.log(
      `📊 Holdings: ${holdings.length} total, ${nonCashHoldings.length} non-cash`
    );

    if (nonCashHoldings.length === 0) return null;

    return (
      <View style={styles.investmentGroup}>
        <Text style={styles.sectionHeading}>
          Your Holdings ({nonCashHoldings.length})
        </Text>
        <View style={styles.glassContainer}>
          {nonCashHoldings.map((h, idx) => (
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
                    {/* Total Change (Unrealized P&L) - Lifetime gains/losses */}
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
                    {/* Day Change Display from Supabase */}
                    {h.day_change !== null &&
                      h.day_change !== undefined &&
                      !isNaN(h.day_change) && (
                        <Text
                          style={[
                            styles.pnlText,
                            (h.day_change || 0) >= 0
                              ? styles.pnlPositive
                              : styles.pnlNegative,
                          ]}
                        >
                          Today: {(h.day_change || 0) >= 0 ? "+" : ""}$
                          {Math.abs(h.day_change).toFixed(2)}
                        </Text>
                      )}
                    {/* Day Change Percent Display from Supabase */}
                    {h.day_change_percent !== null &&
                      h.day_change_percent !== undefined &&
                      !isNaN(h.day_change_percent) && (
                        <Text
                          style={[
                            styles.pnlText,
                            (h.day_change_percent || 0) >= 0
                              ? styles.pnlPositive
                              : styles.pnlNegative,
                          ]}
                        >
                          Today: {(h.day_change_percent || 0) >= 0 ? "+" : ""}
                          {Math.abs(h.day_change_percent).toFixed(2)}%
                        </Text>
                      )}
                  </View>
                </View>
              </View>
              {idx < nonCashHoldings.length - 1 && (
                <View style={styles.divider} />
              )}
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

  return (
    <>
      {embedded ? (
        <View style={styles.container}>
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
          </View>
        </SafeAreaView>
      )}

      {/* Institution Selection Modal */}
      <InstitutionSelectionModal
        visible={showInstitutionModal}
        onClose={handleInstitutionModalClose}
        onInstitutionSelect={handleInstitutionSelect}
      />
    </>
  );
}

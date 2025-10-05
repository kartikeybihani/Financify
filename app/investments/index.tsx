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
import { supabase } from "@/app/_lib/supabase/supabase";
import logger from "@/app/_utils/logger";
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
import { styles } from "@/app/_styles/investmentsStyles";
import InstitutionSelectionModal from "@/app/_components/modals/InstitutionSelectionModal";

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
  day_change?: number | null;
  day_change_percent?: number | null;
  total_change?: number | null;
  total_change_percent?: number | null;
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
  preloadedData,
}: {
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
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSecurityType, setSelectedSecurityType] = useState<
    string | null
  >(null);
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
        setIsLoading(false);
        return true;
      }

      logger.info("Investments: No investment data found in database");
      setHoldings([]);
      setOptions([]);
      setBalances([]);
      setConnections([]);
      setIsLoading(false);
      return false;
    } catch (err) {
      logger.error("Failed to load investments from DB", err);
      setIsLoading(false);
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
        setIsLoading(false);
        return; // Skip all database loading/logic when using preloaded data
      }

      try {
        // Load stored data first (like transaction screens)
        const hasStoredData = await loadFromDb();

        // If no stored data, we could potentially trigger a sync here
        // but for now, we'll just show the empty state
        if (!hasStoredData) {
          logger.info("Investments: No stored data found, showing empty state");
        }

        // Populate investment accounts in main accounts table (non-blocking)
        populateInvestmentAccountsInDB().catch((err) =>
          logger.error("Failed to populate investment accounts:", err)
        );
      } catch (error) {
        logger.error("Error during investment initialization:", error);
      }
    };

    initializeScreen();
  }, [preloadedData]);

  const handleSync = async () => {
    setIsSyncing(true);
    setIsLoading(true);
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
      setIsLoading(false);
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

  // Calculate total unrealized P&L using new investment_balances columns first, then fallback to holdings
  const calculateTotalUnrealizedPL = () => {
    // First priority: Use pre-calculated values from investment_balances table
    if (balances.length > 0) {
      const balance = balances[0]; // Use the most recent balance record

      // Check if we have valid total_change data in the balances table (not null, not undefined)
      if (
        balance.total_change !== null &&
        balance.total_change !== undefined &&
        !isNaN(balance.total_change)
      ) {
        console.log(
          `✅ Using pre-calculated total_change from investment_balances: $${balance.total_change}`
        );

        const percentage =
          balance.total_change_percent !== null &&
          balance.total_change_percent !== undefined &&
          !isNaN(balance.total_change_percent)
            ? balance.total_change_percent
            : totalPortfolioValue > 0
            ? (balance.total_change / totalPortfolioValue) * 100
            : 0;

        return {
          amount: balance.total_change,
          percentage: percentage,
        };
      }
    }

    // Fallback: Calculate from holdings (legacy method)
    console.log("🔍 Fallback: Calculating total unrealized P&L from holdings");
    const totalUnrealizedPL = holdings.reduce(
      (sum, h) => sum + (h.unrealized_pl || 0),
      0
    );

    // Percentage of total portfolio represented by total unrealized P&L
    const totalUnrealizedPLPercent =
      totalPortfolioValue > 0
        ? (totalUnrealizedPL / totalPortfolioValue) * 100
        : 0;

    return {
      amount: totalUnrealizedPL,
      percentage: totalUnrealizedPLPercent,
    };
  };

  const totalUnrealizedPLData = calculateTotalUnrealizedPL();
  const totalUnrealizedPL = totalUnrealizedPLData.amount;
  const totalUnrealizedPLPercent = totalUnrealizedPLData.percentage;

  // Get unique security types from holdings
  const getUniqueSecurityTypes = () => {
    const securityTypes = new Set<string>();
    holdings.forEach((holding) => {
      if (
        holding.security_type &&
        holding.security_type !== "Open Ended Fund"
      ) {
        securityTypes.add(holding.security_type);
      }
    });
    return Array.from(securityTypes).sort();
  };

  const uniqueSecurityTypes = getUniqueSecurityTypes();

  // Calculate today's portfolio performance using the new investment_balances columns
  const calculateTodayPerformance = () => {
    // First priority: Use pre-calculated values from investment_balances table
    if (balances.length > 0) {
      const balance = balances[0]; // Use the most recent balance record

      // Check if we have valid day_change data in the balances table (not null, not undefined)
      if (
        balance.day_change !== null &&
        balance.day_change !== undefined &&
        !isNaN(balance.day_change)
      ) {
        console.log(
          `✅ Using pre-calculated day_change from investment_balances: $${balance.day_change}`
        );

        const percentage =
          balance.day_change_percent !== null &&
          balance.day_change_percent !== undefined &&
          !isNaN(balance.day_change_percent)
            ? balance.day_change_percent
            : totalPortfolioValue > 0
            ? (balance.day_change / totalPortfolioValue) * 100
            : 0;

        return {
          amount: balance.day_change,
          percentage: percentage,
        };
      }
    }

    // Fallback: Calculate from holdings (legacy method)
    let totalDailyPerformance = 0;
    let hasValidDayData = false;

    console.log(
      "🔍 Fallback: Calculating today's performance from holdings:",
      holdings.length
    );

    for (const holding of holdings) {
      // STEP 1: First priority - use day_change field from Supabase database if available
      if (
        holding.day_change !== null &&
        holding.day_change !== undefined &&
        !isNaN(holding.day_change)
      ) {
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
        totalDailyPerformance += dailyChange;
        hasValidDayData = true;
        continue;
      }
    }

    console.log(
      `📊 Fallback total daily performance calculated: $${totalDailyPerformance}, hasValidDayData: ${hasValidDayData}`
    );

    // If we don't have day change data from Supabase, we can't accurately show today's performance
    if (!hasValidDayData) {
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
      `✅ Fallback final performance: $${totalDailyPerformance.toFixed(
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
        <TouchableOpacity
          accessibilityLabel="Add investment account"
          onPress={handleAddInvestmentAccount}
          style={[styles.syncButton, styles.addAccountTopRight]}
        >
          <Ionicons name="add-outline" size={18} color="#4A90E2" />
        </TouchableOpacity>
        <View style={styles.portfolioSummaryContent}>
          <View style={styles.portfolioInfo}>
            <Text style={styles.portfolioLabel}>Total Portfolio Value</Text>
            {isLoading ? (
              <View style={styles.portfolioLoadingContainer}>
                <ActivityIndicator size="small" color="#4A90E2" />
                <Text style={styles.portfolioLoadingText}>
                  Loading portfolio...
                </Text>
              </View>
            ) : (
              <Text style={styles.portfolioValue}>
                $
                {totalPortfolioValue.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            )}

            {/* Today's Performance - only show actual daily gains/losses */}
            {!isLoading && Math.abs(todayPerformance.amount) > 0 && (
              <View style={styles.todayPerformanceContainer}>
                <View style={styles.profitLossIndicator}>
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
                  <Ionicons
                    name={
                      todayPerformance.amount >= 0
                        ? "trending-up"
                        : "trending-down"
                    }
                    size={14}
                    color={todayPerformance.amount >= 0 ? "#4ECDC4" : "#FF6B6B"}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </View>
            )}

            {/* Total Change (Unrealized P&L) - Lifetime gains/losses */}
            {!isLoading && Math.abs(totalUnrealizedPL) > 0 && (
              <View style={styles.todayPerformanceContainer}>
                <View style={styles.profitLossIndicator}>
                  <Text
                    style={[
                      styles.todayPerformanceText,
                      {
                        color: totalUnrealizedPL >= 0 ? "#4ECDC4" : "#FF6B6B",
                      },
                    ]}
                  >
                    Total: {totalUnrealizedPL >= 0 ? "+" : ""}$
                    {Math.abs(totalUnrealizedPL).toFixed(2)} (
                    {totalUnrealizedPL >= 0 ? "+" : ""}
                    {Math.abs(totalUnrealizedPLPercent).toFixed(2)}%)
                  </Text>
                  <Ionicons
                    name={
                      totalUnrealizedPL >= 0 ? "trending-up" : "trending-down"
                    }
                    size={14}
                    color={totalUnrealizedPL >= 0 ? "#4ECDC4" : "#FF6B6B"}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </View>
            )}

            {!isLoading && totalCash > 0 && (
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
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderSecurityTypeChips = () => {
    if (uniqueSecurityTypes.length <= 1) return null;

    const allChips = [
      { label: "All", value: null },
      ...uniqueSecurityTypes.map((type) => ({ label: type, value: type })),
    ];

    return (
      <View style={styles.securityTypeChipsContainer}>
        <View style={styles.securityTypeChipsGrid}>
          {allChips.map((chip) => (
            <TouchableOpacity
              key={chip.value || "all"}
              style={[
                styles.securityTypeChip,
                selectedSecurityType === chip.value &&
                  styles.securityTypeChipSelected,
              ]}
              onPress={() => setSelectedSecurityType(chip.value)}
            >
              <Text
                style={[
                  styles.securityTypeChipText,
                  selectedSecurityType === chip.value &&
                    styles.securityTypeChipTextSelected,
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderHoldings = () => {
    if (isLoading) return null;

    // Filter out cash holdings - we already show available cash separately
    let filteredHoldings = holdings.filter((holding) => {
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

    // Apply security type filter
    if (selectedSecurityType) {
      filteredHoldings = filteredHoldings.filter(
        (holding) => holding.security_type === selectedSecurityType
      );
    }

    // Also filter out Open Ended Fund from holdings display
    filteredHoldings = filteredHoldings.filter(
      (holding) => holding.security_type !== "Open Ended Fund"
    );

    const nonCashHoldings = filteredHoldings;

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
                    <View style={styles.stockMetaRow}>
                      <Text style={styles.stockQuantity}>QTY: {h.units} |</Text>
                      {(h.day_change_percent !== null &&
                        h.day_change_percent !== undefined &&
                        !isNaN(h.day_change_percent)) ||
                      (h.day_change !== null &&
                        h.day_change !== undefined &&
                        !isNaN(h.day_change)) ? (
                        <Text
                          style={[
                            styles.stockQuantity,
                            (h.day_change_percent ?? h.day_change ?? 0) >= 0
                              ? styles.pnlPositive
                              : styles.pnlNegative,
                          ]}
                        >
                          Today:{" "}
                          {(h.day_change_percent ?? h.day_change ?? 0) >= 0
                            ? "+"
                            : ""}
                          {h.day_change_percent !== null &&
                          h.day_change_percent !== undefined &&
                          !isNaN(h.day_change_percent)
                            ? `${Math.abs(h.day_change_percent).toFixed(2)}%`
                            : `$${Math.abs(h.day_change || 0).toFixed(2)}`}
                        </Text>
                      ) : null}
                    </View>
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
                        Total: {(h.unrealized_pl || 0) >= 0 ? "+" : ""}$
                        {Math.abs(h.unrealized_pl).toFixed(2)}
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
    if (isLoading || options.length === 0) return null;

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
      <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
        <View style={styles.container}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.content,
              { paddingTop: 0, marginTop: 0 },
            ]}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            contentInsetAdjustmentBehavior="never"
            contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
            scrollIndicatorInsets={{ top: 0, left: 0, bottom: 0, right: 0 }}
          >
            {renderPortfolioSummary()}

            {syncError && (
              <View style={styles.errorContainer}>
                <Ionicons name="warning" size={16} color="#F44336" />
                <Text style={styles.errorText}>{syncError}</Text>
              </View>
            )}

            {renderSecurityTypeChips()}
            {renderHoldings()}
            {renderOptions()}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Institution Selection Modal */}
      <InstitutionSelectionModal
        visible={showInstitutionModal}
        onClose={handleInstitutionModalClose}
        onInstitutionSelect={handleInstitutionSelect}
      />
    </>
  );
}

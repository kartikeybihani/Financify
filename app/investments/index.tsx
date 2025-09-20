import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
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

export default function InvestmentsScreen() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [options, setOptions] = useState<OptionPosition[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);

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
    } catch (err) {
      logger.error("Failed to load investments from DB", err);
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

  const renderPortfolioHero = () => {
    const lastConnection = connections.length > 0 ? connections[0] : null;
    const lastSyncDate = lastConnection?.last_synced_at
      ? new Date(lastConnection.last_synced_at).toLocaleDateString()
      : "Never";
    const brokerageName =
      lastConnection?.brokerage_name || "Investment Account";

    return (
      <View style={styles.portfolioHero}>
        <View style={styles.portfolioContent}>
          <View style={styles.portfolioLeft}>
            <Text style={styles.portfolioValueLabel}>Total Portfolio</Text>
            <Text style={styles.portfolioValue}>
              $
              {totalPortfolioValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            {totalUnrealizedPL !== 0 && (
              <View style={styles.portfolioChange}>
                <Ionicons
                  name={
                    totalUnrealizedPL >= 0 ? "trending-up" : "trending-down"
                  }
                  size={14}
                  color="#4ECDC4"
                />
                <Text style={styles.portfolioChangeText}>
                  {totalUnrealizedPL >= 0 ? "+" : ""}$
                  {totalUnrealizedPL.toFixed(2)}
                  {totalUnrealizedPL >= 0 ? " 🚀" : " 📉"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.portfolioRight}>
            <Text style={styles.accountNameSmall}>{brokerageName}</Text>
            <Text style={styles.lastSyncSmall}>
              Last synced: {lastSyncDate}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderHoldings = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          📈 Your Holdings ({holdings.length})
        </Text>
      </View>
      <View style={styles.cashInfo}>
        <Text style={styles.cashLabel}>Available Cash</Text>
        <Text style={styles.cashValue}>
          $
          {totalCash.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </View>
      {holdings.length > 0 ? (
        <View style={styles.holdingsGrid}>
          {holdings.slice(0, 8).map((h, idx) => (
            <View key={idx} style={styles.holdingCard}>
              <View style={styles.holdingHeader}>
                <View style={styles.holdingSymbolContainer}>
                  <Image
                    source={{ uri: getCompanyLogoUrl(h.symbol) }}
                    style={styles.companyLogo}
                    defaultSource={require("../assets/icon.png")}
                  />
                  <View style={styles.holdingSymbolInfo}>
                    <Text style={styles.holdingSymbol}>{h.symbol}</Text>
                    <Text style={styles.holdingDescription}>
                      {h.description}
                    </Text>
                  </View>
                </View>
                <Text style={styles.holdingValue}>
                  $
                  {h.market_value?.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }) || "0.00"}
                </Text>
              </View>
              <View style={styles.holdingDetails}>
                <View style={styles.holdingDetail}>
                  <Text style={styles.holdingDetailLabel}>Shares</Text>
                  <Text style={styles.holdingDetailValue}>{h.units}</Text>
                </View>
                <View style={styles.holdingDetail}>
                  <Text style={styles.holdingDetailLabel}>Price</Text>
                  <Text style={styles.holdingDetailValue}>
                    ${h.price?.toFixed(2) || "0.00"}
                  </Text>
                </View>
                {h.unrealized_pl !== null && (
                  <Text
                    style={[
                      styles.holdingPnL,
                      (h.unrealized_pl || 0) >= 0
                        ? styles.holdingPnLPositive
                        : styles.holdingPnLNegative,
                    ]}
                  >
                    {h.unrealized_pl >= 0 ? "↗" : "↘"} $
                    {Math.abs(h.unrealized_pl).toFixed(2)}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyStateIcon}>
            <Ionicons name="trending-up" size={24} color="#4A90E2" />
          </View>
          <Text style={styles.emptyStateText}>
            No holdings data available. Sync your account to see your
            investments!
          </Text>
        </View>
      )}
    </View>
  );

  const renderOptions = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📊 Options ({options.length})</Text>
      </View>
      {options.length > 0 ? (
        <View style={styles.holdingsGrid}>
          {options.slice(0, 6).map((o, idx) => (
            <View key={idx} style={styles.optionCard}>
              <View style={styles.optionHeader}>
                <Text style={styles.optionSymbol}>
                  {o.underlying_symbol} {o.option_type}
                </Text>
                <Text style={styles.optionValue}>
                  $
                  {o.market_value?.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }) || "0.00"}
                </Text>
              </View>
              <Text style={styles.holdingDescription}>
                Strike: ${o.strike_price} | Exp: {o.expiration_date}
              </Text>
              <View style={styles.optionDetails}>
                <View style={styles.optionDetail}>
                  <Text style={styles.optionDetailLabel}>Contracts</Text>
                  <Text style={styles.optionDetailValue}>{o.units}</Text>
                </View>
                <View style={styles.optionDetail}>
                  <Text style={styles.optionDetailLabel}>Price</Text>
                  <Text style={styles.optionDetailValue}>
                    ${o.price?.toFixed(2) || "0.00"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyStateIcon}>
            <Ionicons name="bar-chart" size={24} color="#FF9800" />
          </View>
          <Text style={styles.emptyStateText}>
            No options data available. Start trading options to see them here!
          </Text>
        </View>
      )}
    </View>
  );

  return (
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

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {renderPortfolioHero()}

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
  );
}

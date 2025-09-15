import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#888" />
        </TouchableOpacity>
        <Text style={styles.title}>Fidelity Investment Portfolio</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          onPress={handleSync}
          disabled={isSyncing}
        >
          <Ionicons
            name={isSyncing ? "hourglass" : "refresh"}
            size={20}
            color="#fff"
          />
          <Text style={styles.syncButtonText}>
            {isSyncing ? "Syncing..." : "Sync Data"}
          </Text>
        </TouchableOpacity>

        {syncError && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={16} color="#F44336" />
            <Text style={styles.errorText}>{syncError}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Account Balances</Text>
          {balances.length > 0 ? (
            balances.map((b, idx) => (
              <View key={idx} style={styles.card}>
                <Text style={styles.label}>Cash</Text>
                <Text style={styles.value}>
                  ${b.cash?.toFixed(2) || "0.00"}
                </Text>
                <Text style={styles.label}>Buying Power</Text>
                <Text style={styles.value}>
                  ${b.buying_power?.toFixed(2) || "0.00"}
                </Text>
                <Text style={styles.subtle}>{b.currency_code || "USD"}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.subtle}>No balance data available</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            📈 Holdings ({holdings.length})
          </Text>
          <Text style={styles.sectionKpi}>
            Total Value: ${totalHoldingsValue.toFixed(2)}
          </Text>
          {holdings.length > 0 ? (
            holdings.slice(0, 12).map((h, idx) => (
              <View key={idx} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.symbol}>{h.symbol}</Text>
                  <Text style={styles.valueGreen}>
                    ${h.market_value?.toFixed(2) || "0.00"}
                  </Text>
                </View>
                <Text style={styles.subtle}>{h.description}</Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.meta}>Units: {h.units}</Text>
                  <Text style={styles.meta}>
                    Price: ${h.price?.toFixed(2) || "0.00"}
                  </Text>
                  {h.unrealized_pl !== null && (
                    <Text
                      style={[
                        styles.meta,
                        {
                          color:
                            (h.unrealized_pl || 0) >= 0 ? "#4CAF50" : "#F44336",
                        },
                      ]}
                    >
                      P&L: ${h.unrealized_pl?.toFixed(2) || "0.00"}
                    </Text>
                  )}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.subtle}>No holdings data available</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Options ({options.length})</Text>
          <Text style={styles.sectionKpi}>
            Total Value: ${totalOptionsValue.toFixed(2)}
          </Text>
          {options.length > 0 ? (
            options.slice(0, 12).map((o, idx) => (
              <View key={idx} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.symbol}>
                    {o.underlying_symbol} {o.option_type}
                  </Text>
                  <Text style={styles.valueOrange}>
                    ${o.market_value?.toFixed(2) || "0.00"}
                  </Text>
                </View>
                <Text style={styles.subtle}>
                  Strike: ${o.strike_price} | Exp: {o.expiration_date}
                </Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.meta}>Contracts: {o.units}</Text>
                  <Text style={styles.meta}>
                    Price: ${o.price?.toFixed(2) || "0.00"}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.subtle}>No options data available</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔗 Connection Info</Text>
          {connections.length > 0 ? (
            connections.map((c, idx) => (
              <View key={idx} style={styles.card}>
                <Text style={styles.meta}>
                  Brokerage: {c.brokerage_name || "Fidelity"}
                </Text>
                <Text style={styles.meta}>
                  Account: {c.account_name || "Investment Account"}
                </Text>
                <Text style={styles.meta}>Account ID: {c.account_id}</Text>
                <Text style={styles.meta}>
                  Last Synced:{" "}
                  {c.last_synced_at
                    ? new Date(c.last_synced_at).toLocaleDateString()
                    : "Never"}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.subtle}>No connection data available</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    paddingTop: 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  content: {
    padding: 16,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  syncButtonDisabled: {
    backgroundColor: "#666",
    opacity: 0.6,
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  sectionKpi: {
    fontSize: 16,
    fontWeight: "500",
    color: "#4CAF50",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: "#888",
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  valueGreen: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4CAF50",
  },
  valueOrange: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF9800",
  },
  subtle: {
    fontSize: 12,
    color: "#888",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  symbol: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  meta: {
    fontSize: 12,
    color: "#ccc",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderColor: "#F44336",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#F44336",
    fontWeight: "500",
  },
});

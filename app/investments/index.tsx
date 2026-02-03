import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
  Dimensions,
  TouchableWithoutFeedback,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, AntDesign, FontAwesome6 } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import { API_BASE_URL } from "@/src/utils/core/apiUrl";
import {
  getSnaptradeHoldingsFromDB,
  getSnaptradeOptionsFromDB,
  getSnaptradeBalancesFromDB,
  getSnaptradeConnectionsFromDB,
  getAllInvestmentConnectionsFromDB,
  getSnaptradeCredentialsWithFallback,
  syncSnaptradeInvestments,
  refreshSnaptradeInvestments,
  populateInvestmentAccountsInDB,
  checkSnaptradeConnectionStatus,
  getSnaptradeConnectionDetails,
  recalculateInvestmentBalances,
} from "@/src/utils/integrations/snaptrade";
import { clearInvestmentCache } from "@/src/shared/utils/investmentCache";
import { styles } from "@/src/styles/investmentsStyles";
import InstitutionSelectionModal from "@/src/components/modals/InstitutionSelectionModal";
import IconButton from "@/src/components/shared/IconButton";
import FinnyLoadingIndicator from "@/src/components/shared/FinnyLoadingIndicator";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Holding {
  symbol: string;
  description: string;
  units: number;
  price: number;
  market_value: number;
  unrealized_pl: number | null;
  day_change?: number | null;
  day_change_percent?: number | null;
  total_percent_change?: number | null;
  security_type?: string;
  account_id?: string;
  snaptrade_user_id?: string | null;
  plaid_account_id?: string | null;
  item_id?: string | null;
  provider?: string | null;
}

interface OptionPosition {
  underlying_symbol: string;
  option_type: string;
  strike_price: number;
  expiration_date: string;
  units: number;
  price: number;
  market_value: number;
  account_id?: string;
  snaptrade_user_id?: string | null;
  plaid_account_id?: string | null;
  item_id?: string | null;
  provider?: string | null;
}

interface BalanceRow {
  cash: number;
  buying_power: number;
  currency_code: string;
  day_change?: number | null;
  day_change_percent?: number | null;
  total_change?: number | null;
  total_change_percent?: number | null;
  total_value?: number | null;
  last_updated?: string | null;
  provider?: string | null;
  snaptrade_user_id?: string | null;
  account_id?: string;
  item_id?: string | null;
  plaid_account_id?: string | null;
}

interface ConnectionRow {
  account_id: string;
  brokerage_name: string;
  account_name: string;
  last_synced_at: string | null;
  connection_status?: string | null;
  connection_id?: string | null;
  is_active?: boolean;
  provider?: string | null;
  snaptrade_user_id?: string | null;
  item_id?: string | null;
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
  const [holdings, setHoldings] = useState<Holding[]>(
    preloadedData?.holdings || []
  );
  const [options, setOptions] = useState<OptionPosition[]>(
    preloadedData?.options || []
  );
  const [balances, setBalances] = useState<BalanceRow[]>(
    preloadedData?.balances || []
  );
  const [connections, setConnections] = useState<ConnectionRow[]>(
    preloadedData?.connections || []
  );
  const [showInstitutionModal, setShowInstitutionModal] = useState(false);
  const [isLoading, setIsLoading] = useState(!preloadedData);
  const [selectedSecurityType, setSelectedSecurityType] = useState<
    string | null
  >(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [holdingsSortBy, setHoldingsSortBy] =
    useState<string>("total_gain_loss");
  const [showSortModal, setShowSortModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    isDisabled: boolean;
    connectionId: string | null;
  }>({ isDisabled: false, connectionId: null });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasCheckedConnections, setHasCheckedConnections] = useState(
    !!preloadedData
  );
  const hasData = useRef(
    preloadedData
      ? (preloadedData.holdings && preloadedData.holdings.length > 0) ||
          (preloadedData.options && preloadedData.options.length > 0) ||
          (preloadedData.balances && preloadedData.balances.length > 0) ||
          (preloadedData.connections && preloadedData.connections.length > 0)
      : false
  );

  // Track last sync time to force reload after sync
  const lastSyncTime = useRef<number | null>(null);

  // Track preloaded data to detect changes
  const lastPreloadedDataRef = useRef<any>(null);

  // CRITICAL: Prevent concurrent syncs and infinite loops
  const isSyncInProgress = useRef<boolean>(false);
  const isAutoSyncInProgress = useRef<boolean>(false);

  // Internal function to load data without triggering auto-sync (prevents infinite loops)
  const loadFromDbWithoutAutoSync = async () => {
    try {
      logger.info("Investments: Loading data from Supabase (no auto-sync)...");

      const [h, o, b, c] = await Promise.all([
        getSnaptradeHoldingsFromDB(),
        getSnaptradeOptionsFromDB(),
        getSnaptradeBalancesFromDB(),
        getAllInvestmentConnectionsFromDB(), // Gets ALL connections (both Plaid and SnapTrade)
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

        // Log balance details for debugging
        if (b && b.length > 0) {
          logger.info(
            `💰 Balance total_value: $${
              b[0]?.total_value || 0
            }, Holdings sum: $${(h || []).reduce(
              (sum, h) => sum + (h.market_value || 0),
              0
            )}, Options sum: $${(o || []).reduce(
              (sum, o) => sum + (o.market_value || 0),
              0
            )}`
          );
        }

        setHoldings(h || []);
        setOptions(o || []);
        setBalances(b || []);
        setConnections(c || []);
        setHasCheckedConnections(true);

        // Check if connection is disabled (but don't trigger auto-sync)
        if (c && c.length > 0) {
          const connection = c[0] as any;
          const isDisabled =
            !connection.is_active ||
            connection.connection_status === "disabled" ||
            connection.connection_status === "error";

          setConnectionStatus({
            isDisabled,
            connectionId: connection.connection_id || null,
          });
        } else {
          setConnectionStatus({
            isDisabled: false,
            connectionId: null,
          });
        }

        // Update hasData flag to ensure UI reflects loaded data
        hasData.current = true;
        setIsLoading(false);
      } else {
        // No data found
        setHoldings([]);
        setOptions([]);
        setBalances([]);
        setConnections([]);
        setHasCheckedConnections(true);
        hasData.current = false;
        setIsLoading(false);
      }

      return hasAnyData;
    } catch (error) {
      logger.error("Error loading from database:", error);
      setHasCheckedConnections(true);
      return false;
    }
  };

  const loadFromDb = async () => {
    try {
      logger.info("Investments: Loading data from Supabase...");

      const [h, o, b, c] = await Promise.all([
        getSnaptradeHoldingsFromDB(), // Gets ALL holdings (both Plaid and SnapTrade)
        getSnaptradeOptionsFromDB(), // Gets ALL options (both Plaid and SnapTrade)
        getSnaptradeBalancesFromDB(), // Gets ALL balances (both Plaid and SnapTrade)
        getAllInvestmentConnectionsFromDB(), // Gets ALL connections (both Plaid and SnapTrade)
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
        setHasCheckedConnections(true);

        // Check if connection is disabled
        if (c && c.length > 0) {
          const connection = c[0] as any;
          const isDisabled =
            !connection.is_active ||
            connection.connection_status === "disabled" ||
            connection.connection_status === "error";

          logger.info("🔍 Connection status check:", {
            account_id: connection.account_id?.substring(0, 8) + "...",
            is_active: connection.is_active,
            connection_status: connection.connection_status,
            connection_id: connection.connection_id ? "exists" : "missing",
            isDisabled,
          });

          // Auto-refresh stale investment data (>24 hours old) - silent background sync
          if (
            !isDisabled &&
            !isSyncInProgress.current &&
            !isAutoSyncInProgress.current
          ) {
            const now = new Date();
            const lastSynced = connection.last_synced_at
              ? new Date(connection.last_synced_at)
              : null;
            if (
              !lastSynced ||
              (now.getTime() - lastSynced.getTime()) / (1000 * 60 * 60) > 24
            ) {
              logger.info(
                "Auto-syncing stale investment data (>24 hours old)..."
              );
              // Sync silently in background - don't show loading UI
              isAutoSyncInProgress.current = true;
              try {
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                if (user) {
                  await syncSnaptradeInvestments(
                    user.id,
                    connection.account_id
                  );
                  // Reload data after sync completes (but don't trigger another sync)
                  logger.info("🔄 Reloading data after auto-sync...");
                  // Use a flag to prevent recursive sync
                  const wasAutoSync = true;
                  await loadFromDbWithoutAutoSync();
                  logger.info("✅ Auto-sync complete, data reloaded");
                }
              } catch (error) {
                // Silently handle errors - don't show to user
                logger.error("Auto-sync failed silently:", error);
              } finally {
                isAutoSyncInProgress.current = false;
              }
            }
          }

          setConnectionStatus({
            isDisabled,
            connectionId: connection.connection_id || null,
          });

          // If DB shows active but we want to verify, check actual status
          // Only check if connection appears active in DB (to catch mismatches)
          if (
            !isDisabled &&
            connection.is_active &&
            connection.connection_status === "active"
          ) {
            logger.info("🔍 Verifying connection status with SnapTrade API...");
            try {
              // CRITICAL: Get actual user_id from auth, not from connection (connection might not have it)
              const {
                data: { user: authUser },
              } = await supabase.auth.getUser();
              if (!authUser) {
                logger.warn(
                  "⚠️ Cannot verify connection status - user not authenticated"
                );
                return;
              }

              const statusCheck = await checkSnaptradeConnectionStatus(
                authUser.id,
                connection.account_id
              );

              if (statusCheck.statusChanged) {
                logger.warn(
                  "⚠️ Connection status mismatch detected and updated:",
                  statusCheck
                );
                // Reload connections to get updated status
                const updatedConnections =
                  await getAllInvestmentConnectionsFromDB();
                if (updatedConnections && updatedConnections.length > 0) {
                  const updated = updatedConnections[0] as any;
                  const updatedIsDisabled =
                    !updated.is_active ||
                    updated.connection_status === "disabled" ||
                    updated.connection_status === "error";

                  setConnectionStatus({
                    isDisabled: updatedIsDisabled,
                    connectionId: updated.connection_id || null,
                  });
                  setConnections(updatedConnections);
                }
              }
            } catch (statusError) {
              logger.warn(
                "⚠️ Could not verify connection status:",
                statusError
              );
              // Continue with DB status if check fails
            }
          }
        } else {
          // Reset if no connections
          logger.info("🔍 No connections found, resetting status");
          setConnectionStatus({
            isDisabled: false,
            connectionId: null,
          });
        }

        hasData.current = true;
        setIsLoading(false);
        return true;
      }

      logger.info("Investments: No investment data found in database");
      setHoldings([]);
      setOptions([]);
      setBalances([]);
      setConnections([]);
      setHasCheckedConnections(true);
      setIsLoading(false);
      return false;
    } catch (err) {
      logger.error("Failed to load investments from DB", err);
      setHasCheckedConnections(true);
      setIsLoading(false);
      return false;
    }
  };

  useEffect(() => {
    const initializeScreen = async () => {
      // Check if we need to reload data (either no data, recent sync, or preloaded data changed)
      // NOTE: This only runs on mount or when preloadedData changes, not on pull-to-refresh
      const shouldReload =
        !hasData.current ||
        (lastSyncTime.current && Date.now() - lastSyncTime.current < 5000) || // 5 second window
        (preloadedData &&
          JSON.stringify(preloadedData) !==
            JSON.stringify(lastPreloadedDataRef.current));

      if (!shouldReload) {
        return;
      }

      // Check if data is preloaded (when embedded in insights screen)
      if (preloadedData) {
        // Check if preloaded data has changed
        const hasPreloadedDataChanged =
          JSON.stringify(preloadedData) !==
          JSON.stringify(lastPreloadedDataRef.current);
        if (hasPreloadedDataChanged) {
          lastPreloadedDataRef.current = preloadedData;

          // Update state with new preloaded data
          setHoldings(preloadedData.holdings || []);
          setOptions(preloadedData.options || []);
          setBalances(preloadedData.balances || []);
          setConnections(preloadedData.connections || []);
          setHasCheckedConnections(true);
        }

        // Data is already set in initial state, just ensure loading state is correct
        const hasAnyData =
          (preloadedData.holdings && preloadedData.holdings.length > 0) ||
          (preloadedData.options && preloadedData.options.length > 0) ||
          (preloadedData.balances && preloadedData.balances.length > 0) ||
          (preloadedData.connections && preloadedData.connections.length > 0);

        hasData.current = !!hasAnyData;
        setIsLoading(false);
        setHasCheckedConnections(true);
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

  // Watch for preloaded data changes and update state immediately
  useEffect(() => {
    if (
      preloadedData &&
      JSON.stringify(preloadedData) !==
        JSON.stringify(lastPreloadedDataRef.current)
    ) {
      lastPreloadedDataRef.current = preloadedData;

      // Update state with new preloaded data
      setHoldings(preloadedData.holdings || []);
      setOptions(preloadedData.options || []);
      setBalances(preloadedData.balances || []);
      setConnections(preloadedData.connections || []);
      setHasCheckedConnections(true);

      // Check connection status from preloaded data
      if (preloadedData.connections && preloadedData.connections.length > 0) {
        const connection = preloadedData.connections[0] as any;
        const isDisabled =
          !connection.is_active ||
          connection.connection_status === "disabled" ||
          connection.connection_status === "error";

        setConnectionStatus({
          isDisabled,
          connectionId: connection.connection_id || null,
        });
      } else {
        // Reset connection status when there are no connections
        setConnectionStatus({
          isDisabled: false,
          connectionId: null,
        });
      }
    }
  }, [preloadedData]);

  // Check connection status when screen comes into focus (catches webhook updates)
  useFocusEffect(
    React.useCallback(() => {
      const checkConnectionStatusAndReloadDataOnFocus = async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;

          // Reload connections from database to check for status updates
          const updatedConnections = await getAllInvestmentConnectionsFromDB();
          if (updatedConnections && updatedConnections.length > 0) {
            const connection = updatedConnections[0] as any;
            const isDisabled =
              !connection.is_active ||
              connection.connection_status === "disabled" ||
              connection.connection_status === "error";

            // Update connection status if it changed
            setConnectionStatus((prev) => {
              const wasDisabled = prev.isDisabled;

              if (
                prev.isDisabled !== isDisabled ||
                prev.connectionId !== connection.connection_id
              ) {
                logger.info("🔄 Connection status updated on focus:", {
                  wasDisabled: prev.isDisabled,
                  nowDisabled: isDisabled,
                  connectionId: connection.connection_id,
                });

                // If connection was disabled but is now active, reload data
                if (wasDisabled && !isDisabled) {
                  logger.info("✅ Connection reactivated! Reloading data...");
                  // Reload data asynchronously (without triggering auto-sync)
                  loadFromDbWithoutAutoSync().catch((err) =>
                    logger.error(
                      "Error reloading data after reactivation:",
                      err
                    )
                  );
                }

                return {
                  isDisabled,
                  connectionId: connection.connection_id || null,
                };
              }
              return prev;
            });

            setConnections(updatedConnections);

            // CRITICAL: Always reload all data when screen comes into focus to show any updates
            // This ensures UI reflects database changes from webhooks or background syncs
            // Even if last_synced_at didn't change, webhooks might have updated holdings/balances
            if (!isDisabled) {
              logger.info(
                "🔄 Screen focused - reloading data to ensure UI reflects database state..."
              );
              await loadFromDbWithoutAutoSync();
              logger.info(
                "✅ Data reloaded on focus - UI now in sync with database"
              );
            }
          } else {
            // No connections - still try to reload in case data exists
            logger.info(
              "🔄 Screen focused - reloading data (no connections found)..."
            );
            await loadFromDbWithoutAutoSync();
          }
        } catch (error) {
          logger.warn(
            "⚠️ Error checking connection status and reloading data on focus:",
            error
          );
        }
      };

      checkConnectionStatusAndReloadDataOnFocus();
    }, []) // Empty deps - we use functional setState to access current state
  );

  const handleSync = async () => {
    // CRITICAL: Prevent concurrent syncs
    if (isSyncInProgress.current) {
      logger.warn("⚠️ Sync already in progress, ignoring duplicate request");
      return;
    }

    // Check if connection is disabled
    if (connectionStatus.isDisabled) {
      setSyncError(
        "Connection is disabled. Please reconnect your account first."
      );
      return;
    }

    isSyncInProgress.current = true;
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

      // Filter to only SnapTrade connections (Plaid syncs via webhooks)
      const snaptradeConnections = connections.filter(
        (conn: ConnectionRow) => !conn.provider || conn.provider === "snaptrade"
      );

      if (snaptradeConnections.length === 0) {
        logger.info(
          "ℹ️ No SnapTrade connections to sync (Plaid accounts sync via webhooks)"
        );
        // Still reload data in case Plaid data was updated
        await loadFromDbWithoutAutoSync();
        return;
      }

      logger.info(
        `🔄 Starting investment refresh for ${snaptradeConnections.length} SnapTrade account(s)...`
      );

      // Check last_synced_at and split connections into recent (< 3 hours) and stale
      const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
      const now = new Date();
      const recentConnections: ConnectionRow[] = [];
      const staleConnections: ConnectionRow[] = [];

      for (const conn of snaptradeConnections) {
        if (!conn.last_synced_at) {
          // Never synced - treat as stale
          staleConnections.push(conn);
          logger.info(
            `📅 Connection ${conn.account_id?.substring(
              0,
              8
            )}... never synced - will sync`
          );
        } else {
          const lastSynced = new Date(conn.last_synced_at);
          const hoursSinceSync =
            (now.getTime() - lastSynced.getTime()) / (1000 * 60 * 60);

          if (hoursSinceSync < 3) {
            recentConnections.push(conn);
            logger.info(
              `⏰ Connection ${conn.account_id?.substring(
                0,
                8
              )}... synced ${hoursSinceSync.toFixed(
                1
              )} hours ago - skipping SnapTrade sync`
            );
          } else {
            staleConnections.push(conn);
            logger.info(
              `📅 Connection ${conn.account_id?.substring(
                0,
                8
              )}... synced ${hoursSinceSync.toFixed(1)} hours ago - will sync`
            );
          }
        }
      }

      // Sync all SnapTrade accounts sequentially (only stale ones)
      const syncErrors: string[] = [];
      for (let i = 0; i < staleConnections.length; i++) {
        const conn = staleConnections[i];
        try {
          logger.info(
            `🔄 Syncing account ${i + 1}/${staleConnections.length}: ${
              conn.brokerage_name || conn.account_name || conn.account_id
            }`
          );

          // Step 1: Call paid refresh endpoint to trigger SnapTrade to update their cache
          await refreshSnaptradeInvestments(user.id, conn.account_id);

          // Step 2: Wait for SnapTrade to process the refresh (they need time to update their cache)
          logger.info(
            "⏳ Waiting for SnapTrade to process refresh (5 seconds)..."
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Step 3: Now sync the fresh data from SnapTrade API to our database
          logger.info("🔄 Syncing fresh data from SnapTrade API...");
          await syncSnaptradeInvestments(user.id, conn.account_id);

          // Step 3.5: Ensure balances are recalculated from active holdings
          logger.info("🔄 Recalculating balances from active holdings...");
          try {
            await recalculateInvestmentBalances(user.id, conn.account_id);
            logger.info("✅ Balances recalculated successfully");
          } catch (recalcError) {
            logger.warn(
              "⚠️ Failed to recalculate balances (continuing anyway):",
              recalcError
            );
          }

          logger.info(
            `✅ Successfully synced account ${i + 1}/${staleConnections.length}`
          );
        } catch (err: any) {
          const errorMsg = `Failed to sync ${
            conn.brokerage_name || conn.account_name || conn.account_id
          }: ${err.message || "Unknown error"}`;
          logger.error(`❌ ${errorMsg}`, err);
          syncErrors.push(errorMsg);

          // Check if this is a disabled connection error - if so, stop syncing others
          if (
            err.statusCode === 402 ||
            err.code === "CONNECTION_DISABLED" ||
            err.requiresReconnect
          ) {
            logger.error(
              "🔴 Connection disabled detected, stopping sync...",
              err
            );
            throw err; // Re-throw to trigger the disabled connection handler below
          }
        }
      }

      // Log summary of sync strategy
      if (recentConnections.length > 0) {
        logger.info(
          `⏭️ Skipped SnapTrade sync for ${recentConnections.length} recent connection(s) - will update prices only`
        );
      }
      if (staleConnections.length > 0) {
        logger.info(
          `✅ Completed SnapTrade sync for ${staleConnections.length} stale connection(s)`
        );
      }

      // Clear cache to ensure fresh data (after all syncs)
      await clearInvestmentCache(user.id);

      if (
        syncErrors.length > 0 &&
        syncErrors.length === staleConnections.length &&
        staleConnections.length > 0
      ) {
        // All stale syncs failed
        throw new Error(syncErrors.join("; "));
      } else if (syncErrors.length > 0) {
        // Some syncs failed but not all
        logger.warn(
          `⚠️ Some accounts failed to sync: ${syncErrors.join("; ")}`
        );
      }

      // Step 4: Reload data from database to show updated values (without triggering auto-sync)
      logger.info("🔄 Reloading data from database...");
      const hasStoredData = await loadFromDbWithoutAutoSync();

      if (hasStoredData) {
        hasData.current = true;
      }

      // Step 5: Update investment accounts in main table (after balances are recalculated)
      logger.info("🔄 Updating investment accounts in main table...");
      // Wait a moment to ensure balances are fully updated
      await new Promise((resolve) => setTimeout(resolve, 500));
      await populateInvestmentAccountsInDB();

      // Step 6: Update stock prices from Finnhub (runs for all connections)
      logger.info("📈 Updating stock prices from Finnhub...");
      let finhubSyncTime: string | null = null;
      try {
        const priceUpdateRes = await authenticatedFetch(
          `${API_BASE_URL}/api/refresh_financial_data`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              refresh_type: "stock_prices",
              user_id: user.id,
            }),
          }
        );

        if (priceUpdateRes.ok) {
          const priceData = await priceUpdateRes.json();

          // Check for errors in response body (207 Multi-Status can have errors)
          if (priceData.success === false || priceData.errors?.length > 0) {
            logger.warn(
              `⚠️ Stock price update completed with errors: ${
                priceData.errors?.join(", ") || "Unknown error"
              }`
            );
            // Still log success if some holdings were updated
            if (priceData.results?.stock_prices?.holdingsUpdated > 0) {
              finhubSyncTime = new Date().toISOString();
              logger.info(
                `✅ Stock prices partially updated: ${
                  priceData.results?.stock_prices?.holdingsUpdated || 0
                } holdings at ${finhubSyncTime}`
              );
            }
          } else {
            finhubSyncTime = new Date().toISOString();
            logger.info(
              `✅ Stock prices updated: ${
                priceData.results?.stock_prices?.holdingsUpdated || 0
              } holdings at ${finhubSyncTime}`
            );
          }
        } else {
          // Try to parse error as JSON first, fallback to text
          let errorMessage = "Unknown error";
          try {
            const errorData = await priceUpdateRes.json();
            errorMessage = errorData.error || JSON.stringify(errorData);
          } catch {
            try {
              errorMessage = await priceUpdateRes.text();
            } catch {
              errorMessage = `HTTP ${priceUpdateRes.status}: ${priceUpdateRes.statusText}`;
            }
          }
          logger.warn(
            `⚠️ Stock price update failed (non-critical): ${errorMessage} (Status: ${priceUpdateRes.status})`
          );

          // Fallback: If FinHub update failed for recent connections, run full sync
          if (recentConnections.length > 0) {
            logger.warn(
              "⚠️ FinHub update failed for recent connections - falling back to full SnapTrade sync"
            );
            // Fallback to full sync for recent connections
            for (const conn of recentConnections) {
              try {
                logger.info(
                  `🔄 Fallback: Full sync for recent connection ${conn.account_id?.substring(
                    0,
                    8
                  )}...`
                );
                await refreshSnaptradeInvestments(user.id, conn.account_id);
                await new Promise((resolve) => setTimeout(resolve, 5000));
                await syncSnaptradeInvestments(user.id, conn.account_id);
                await recalculateInvestmentBalances(user.id, conn.account_id);
                logger.info("✅ Fallback sync completed successfully");
              } catch (fallbackError: any) {
                logger.error(
                  `❌ Fallback sync failed for ${conn.account_id}:`,
                  fallbackError
                );
                syncErrors.push(
                  `Fallback sync failed: ${
                    fallbackError.message || "Unknown error"
                  }`
                );
              }
            }
          }
        }
      } catch (priceError) {
        logger.warn("⚠️ Stock price update error:", priceError);

        // Fallback: If FinHub update failed for recent connections, run full sync
        if (recentConnections.length > 0) {
          logger.warn(
            "⚠️ FinHub update error for recent connections - falling back to full SnapTrade sync"
          );
          // Fallback to full sync for recent connections
          for (const conn of recentConnections) {
            try {
              logger.info(
                `🔄 Fallback: Full sync for recent connection ${conn.account_id?.substring(
                  0,
                  8
                )}...`
              );
              await refreshSnaptradeInvestments(user.id, conn.account_id);
              await new Promise((resolve) => setTimeout(resolve, 5000));
              await syncSnaptradeInvestments(user.id, conn.account_id);
              await recalculateInvestmentBalances(user.id, conn.account_id);
              logger.info("✅ Fallback sync completed successfully");
            } catch (fallbackError: any) {
              logger.error(
                `❌ Fallback sync failed for ${conn.account_id}:`,
                fallbackError
              );
              syncErrors.push(
                `Fallback sync failed: ${
                  fallbackError.message || "Unknown error"
                }`
              );
            }
          }
        }
      }

      logger.info(
        "✅ Investment refresh completed successfully - data synced and reloaded"
      );
    } catch (err: any) {
      // Check if this is a 402 disabled connection error
      if (
        err.statusCode === 402 ||
        err.code === "CONNECTION_DISABLED" ||
        err.requiresReconnect
      ) {
        logger.error("🔴 Connection disabled detected, updating state...", err);

        // Reload connections from DB to get updated status
        const updatedConnections = await getAllInvestmentConnectionsFromDB();
        setConnections(updatedConnections || []);

        // Get connection_id from error, or from connections
        const connectionId =
          err.connectionId ||
          (updatedConnections && updatedConnections.length > 0
            ? updatedConnections[0].connection_id
            : null) ||
          (connections.length > 0 ? connections[0].connection_id : null);

        // Update connection status to show reconnection UI
        setConnectionStatus({
          isDisabled: true,
          connectionId: connectionId,
        });

        const errorMsg =
          err.message ||
          "Your investment account connection has been disabled. Please reconnect your account.";
        setSyncError(errorMsg);

        logger.info(
          "🔴 Reconnection UI should now be visible with connectionId:",
          connectionId
        );
      } else {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to sync investments";
        logger.error("Failed to sync investments", err);
        setSyncError(errorMsg);
      }
    } finally {
      isSyncInProgress.current = false;
      setIsSyncing(false);
      setIsLoading(false);
    }
  };

  const handlePullToRefresh = async () => {
    // CRITICAL: Prevent concurrent refresh operations
    if (isSyncInProgress.current || isRefreshing) {
      logger.warn("⚠️ Refresh already in progress, ignoring pull-to-refresh");
      return;
    }

    setIsRefreshing(true);
    setSyncError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        logger.error("User not authenticated for pull-to-refresh");
        setIsRefreshing(false);
        return;
      }

      // Check if we have connections
      if (connections.length === 0) {
        logger.info("No connections found, just reloading from DB...");
        await loadFromDbWithoutAutoSync();
        setIsRefreshing(false);
        return;
      }

      const connection = connections[0];

      // Check if data is older than 24 hours
      const now = new Date();
      const lastSynced = connection.last_synced_at
        ? new Date(connection.last_synced_at)
        : null;

      const hoursSinceSync = lastSynced
        ? (now.getTime() - lastSynced.getTime()) / (1000 * 60 * 60)
        : Infinity;

      logger.info("🔄 Pull-to-refresh triggered", {
        lastSynced: lastSynced?.toISOString() || "never",
        hoursSinceSync: hoursSinceSync.toFixed(2),
        needsApiRefresh: hoursSinceSync > 24,
      });

      if (hoursSinceSync > 24) {
        // Data is stale (>24 hours) - sync from SnapTrade API (not paid refresh endpoint)
        logger.info("📡 Data is >24 hours old, syncing from SnapTrade API...");

        isSyncInProgress.current = true;

        try {
          // Call sync endpoint (accounts API) - this fetches fresh data from SnapTrade
          // NOTE: We do NOT call refreshSnaptradeInvestments here - that's only for manual refresh button
          await syncSnaptradeInvestments(user.id, connection.account_id);

          // Sync already recalculates, but ensure it's done
          await recalculateInvestmentBalances(user.id, connection.account_id);

          // Wait a moment for database update to complete
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Force reload from database after sync and recalculation
          hasData.current = false;

          // Reload balances directly to get updated total_value
          const [h, o, b, c] = await Promise.all([
            getSnaptradeHoldingsFromDB(),
            getSnaptradeOptionsFromDB(),
            getSnaptradeBalancesFromDB(),
            getAllInvestmentConnectionsFromDB(),
          ]);

          if (b && b.length > 0) {
            logger.info(
              `💰 Reloaded balance total_value after sync: $${
                b[0]?.total_value || 0
              }`
            );
            setBalances(b || []);
            setHoldings(h || []);
            setOptions(o || []);
            setConnections(c || []);
            hasData.current = true;
          } else {
            await loadFromDbWithoutAutoSync();
          }

          logger.info("✅ Pull-to-refresh completed - data synced from API");
        } catch (err: any) {
          // Check if this is a 402 disabled connection error
          if (
            err.statusCode === 402 ||
            err.code === "CONNECTION_DISABLED" ||
            err.requiresReconnect
          ) {
            logger.error(
              "🔴 Connection disabled detected during pull-to-refresh",
              err
            );

            // Reload connections from DB
            const updatedConnections = await getSnaptradeConnectionsFromDB();
            setConnections(updatedConnections || []);

            const connectionId =
              err.connectionId ||
              (updatedConnections && updatedConnections.length > 0
                ? updatedConnections[0].connection_id
                : null) ||
              (connections.length > 0 ? connections[0].connection_id : null);

            setConnectionStatus({
              isDisabled: true,
              connectionId: connectionId,
            });

            setSyncError(
              err.message ||
                "Your investment account connection has been disabled. Please reconnect your account."
            );
          } else {
            logger.error("❌ Error during pull-to-refresh sync:", err);
            // Still reload from DB even if API call failed
            await loadFromDbWithoutAutoSync();
          }
        } finally {
          isSyncInProgress.current = false;
        }
      } else {
        // Data is fresh (<24 hours) - recalculate balances and reload from database
        logger.info(
          "💾 Data is fresh (<24 hours), recalculating balances and reloading from database..."
        );

        // Always recalculate balances on pull-to-refresh to ensure accuracy
        try {
          await recalculateInvestmentBalances(user.id, connection.account_id);
          logger.info("✅ Balances recalculated from active holdings");

          // Wait longer for database update to fully commit
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (recalcError) {
          logger.warn(
            "⚠️ Failed to recalculate balances (continuing anyway):",
            recalcError
          );
        }

        // Force reload by resetting hasData flag to ensure fresh data is loaded
        hasData.current = false;

        // Reload balances directly to get the updated total_value (bypass any caching)
        // Wait a bit more to ensure DB transaction is committed
        await new Promise((resolve) => setTimeout(resolve, 300));

        const [h, o, b, c] = await Promise.all([
          getSnaptradeHoldingsFromDB(),
          getSnaptradeOptionsFromDB(),
          getSnaptradeBalancesFromDB(),
          getSnaptradeConnectionsFromDB(),
        ]);

        if (b && b.length > 0) {
          const calculatedSum =
            (h || []).reduce((sum, h) => sum + (h.market_value || 0), 0) +
            (o || []).reduce((sum, o) => sum + (o.market_value || 0), 0);
          logger.info(
            `💰 Reloaded balance total_value: $${
              b[0]?.total_value || 0
            }, Calculated sum: $${calculatedSum}`
          );

          // Update state immediately with fresh balances
          setBalances(b || []);
          setHoldings(h || []);
          setOptions(o || []);
          setConnections(c || []);
          hasData.current = true;
        } else {
          // Fallback to full reload
          await loadFromDbWithoutAutoSync();
        }

        logger.info(
          "✅ Pull-to-refresh completed - balances recalculated and data reloaded"
        );
      }
    } catch (error) {
      logger.error("❌ Error during pull-to-refresh:", error);
      // Try to reload from DB anyway
      try {
        hasData.current = false;
        await loadFromDbWithoutAutoSync();
      } catch (dbError) {
        logger.error("❌ Failed to reload from database:", dbError);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReconnect = async () => {
    // CRITICAL: Prevent concurrent reconnect attempts
    if (isSyncInProgress.current) {
      logger.warn(
        "⚠️ Sync/reconnect already in progress, ignoring duplicate request"
      );
      return;
    }

    try {
      isSyncInProgress.current = true;
      setIsSyncing(true);
      setSyncError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSyncError("User not authenticated");
        isSyncInProgress.current = false;
        setIsSyncing(false);
        return;
      }

      const creds = await getSnaptradeCredentialsWithFallback();
      if (!creds) {
        setSyncError("No valid SnapTrade credentials found");
        isSyncInProgress.current = false;
        setIsSyncing(false);
        return;
      }

      if (!connectionStatus.connectionId) {
        setSyncError("Connection ID not found");
        isSyncInProgress.current = false;
        setIsSyncing(false);
        return;
      }

      // Get userSecret from database
      const {
        getSnaptradeUserSecretFromDB,
        reconnectSnaptradeConnection,
        getSnaptradeConnectionDetails,
      } = await import("@/src/utils/integrations/snaptrade");
      const userSecret = await getSnaptradeUserSecretFromDB(
        user.id,
        creds.userId,
        connections[0]?.account_id || ""
      );

      // Call reconnect function
      const response = await reconnectSnaptradeConnection(
        creds.userId,
        userSecret,
        connectionStatus.connectionId
      );

      // Open browser with reconnect URL
      if (response.redirectURI) {
        logger.info(
          "🌐 Opening SnapTrade Connection Portal for reconnection..."
        );
        const browserResult = await WebBrowser.openBrowserAsync(
          response.redirectURI,
          {
            presentationStyle:
              WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
          }
        );

        logger.info(
          "🔙 Browser closed, checking connection status...",
          browserResult
        );

        // CRITICAL: Handle browser cancellation
        if (
          browserResult.type === "cancel" ||
          browserResult.type === "dismiss"
        ) {
          // Wait a moment for webhook to process (if it fires quickly)
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Check connection status from SnapTrade API
          try {
            logger.info("🔍 Verifying connection status after reconnection...");
            const connectionDetails = await getSnaptradeConnectionDetails(
              user.id,
              connections[0]?.account_id || ""
            );

            if (connectionDetails && !connectionDetails.disabled) {
              logger.info("✅ Connection is now active! Updating UI...");

              // Update connection status in UI
              setConnectionStatus({
                isDisabled: false,
                connectionId: connectionStatus.connectionId,
              });

              // Reload connections from database to get updated status
              const updatedConnections =
                await getAllInvestmentConnectionsFromDB();
              setConnections(updatedConnections || []);

              // Reload all investment data (without triggering auto-sync)
              logger.info("🔄 Reloading investment data after reconnection...");
              await loadFromDbWithoutAutoSync();

              // Trigger a sync to get fresh data
              logger.info("🔄 Triggering sync after reconnection...");
              try {
                // CRITICAL: Ensure we have a valid account_id
                const accountId =
                  connections[0]?.account_id ||
                  updatedConnections?.[0]?.account_id;
                if (!accountId) {
                  logger.error("❌ Cannot sync - no account_id found");
                  setSyncError(
                    "Account ID not found. Please refresh manually."
                  );
                  return;
                }

                await syncSnaptradeInvestments(user.id, accountId);

                // Wait for sync to complete
                await new Promise((resolve) => setTimeout(resolve, 3000));

                // Reload data again after sync (without triggering auto-sync)
                await loadFromDbWithoutAutoSync();

                logger.info(
                  "✅ Reconnection complete! Data synced successfully."
                );
                setSyncError(null);
              } catch (syncErr) {
                logger.warn(
                  "⚠️ Sync after reconnection had issues (but connection is active):",
                  syncErr
                );
                // Don't show error - connection is active, sync can happen later
              }
            } else {
              logger.warn(
                "⚠️ Connection still appears disabled. Webhook may not have fired yet."
              );
              logger.info(
                "💡 User may need to wait a moment or refresh manually."
              );

              // Still update UI state optimistically - user completed auth
              setConnectionStatus({
                isDisabled: false,
                connectionId: connectionStatus.connectionId,
              });

              // Reload connections
              const updatedConnections =
                await getAllInvestmentConnectionsFromDB();
              setConnections(updatedConnections || []);

              setSyncError(
                "Reconnection completed. Please wait a moment and refresh to see updated data."
              );
            }
          } catch (statusErr: any) {
            logger.error(
              "❌ Error checking connection status after reconnection:",
              statusErr
            );

            // If it's a 402, connection might still be disabled
            if (
              statusErr.statusCode === 402 ||
              statusErr.code === "CONNECTION_DISABLED"
            ) {
              setSyncError(
                "Connection may still be processing. Please wait a moment and try refreshing."
              );
            } else {
              // Other error - connection might be active but we can't verify
              logger.warn(
                "⚠️ Could not verify connection status, but user completed auth"
              );
              setConnectionStatus({
                isDisabled: false,
                connectionId: connectionStatus.connectionId,
              });

              // Reload connections optimistically
              const updatedConnections =
                await getAllInvestmentConnectionsFromDB();
              setConnections(updatedConnections || []);

              setSyncError(
                "Reconnection completed. Please refresh to verify connection status."
              );
            }
          }
        } else {
          // User cancelled browser before completing reconnection
          logger.info("⚠️ User cancelled browser - reconnection not completed");
          setSyncError("Reconnection cancelled. Please try again.");
        }
      } else {
        setSyncError("No redirect URI received from SnapTrade");
      }
    } catch (err) {
      logger.error("❌ Reconnection error:", err);
      setSyncError(err instanceof Error ? err.message : "Failed to reconnect");
    } finally {
      isSyncInProgress.current = false;
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

  const showHoldingsFilterOptions = () => {
    setShowSortModal(true);
  };

  const handleSortSelection = (sortType: string) => {
    setHoldingsSortBy(sortType);
    setShowSortModal(false);
  };

  // Helper function to check if a holding/balance belongs to the selected account
  const belongsToAccount = (
    item: Holding | OptionPosition | BalanceRow,
    connection: ConnectionRow
  ): boolean => {
    if (connection.provider === "snaptrade") {
      return (
        item.account_id === connection.account_id &&
        (item as any).snaptrade_user_id === connection.snaptrade_user_id
      );
    } else if (connection.provider === "plaid") {
      return (
        (item as any).plaid_account_id === connection.account_id &&
        (item as any).item_id === connection.item_id
      );
    }
    return false;
  };

  // Filter holdings, balances, and options by selected account
  const filteredHoldings = selectedAccountId
    ? holdings.filter((h) => {
        const connection = connections.find(
          (c) => c.account_id === selectedAccountId
        );
        return connection ? belongsToAccount(h, connection) : false;
      })
    : holdings;

  const filteredBalances = selectedAccountId
    ? balances.filter((b) => {
        const connection = connections.find(
          (c) => c.account_id === selectedAccountId
        );
        return connection ? belongsToAccount(b, connection) : false;
      })
    : balances;

  const filteredOptions = selectedAccountId
    ? options.filter((o) => {
        const connection = connections.find(
          (c) => c.account_id === selectedAccountId
        );
        return connection ? belongsToAccount(o, connection) : false;
      })
    : options;

  // Calculate total portfolio value by summing filtered balances
  const totalPortfolioValue = filteredBalances.reduce(
    (sum, b) => sum + (b.total_value || 0),
    0
  );

  // Available cash = cash only (not buying_power), per investment_balances.cash
  const totalCash = filteredBalances.reduce((sum, b) => sum + (b.cash || 0), 0);

  // Calculate total unrealized P&L using new investment_balances columns first, then fallback to holdings
  const calculateTotalUnrealizedPL = () => {
    // First priority: Sum pre-calculated values from filtered investment_balances
    if (filteredBalances.length > 0) {
      // Sum total_change from filtered balances
      const totalChangeSum = filteredBalances.reduce(
        (sum, b) => sum + (b.total_change || 0),
        0
      );

      // Check if we have valid total_change data
      const hasValidTotalChange = filteredBalances.some(
        (b) => b.total_change !== null && b.total_change !== undefined
      );

      if (hasValidTotalChange) {
        // CRITICAL: Use stored total_change_percent from database (weighted by total_value)
        // This ensures consistency with backend calculations
        let weightedPercentSum = 0;
        let totalWeight = 0;

        filteredBalances.forEach((b) => {
          if (
            b.total_change_percent != null &&
            b.total_change_percent !== undefined &&
            !isNaN(b.total_change_percent) &&
            b.total_value != null &&
            b.total_value > 0
          ) {
            weightedPercentSum += b.total_change_percent * (b.total_value || 0);
            totalWeight += b.total_value || 0;
          }
        });

        // Use weighted average percentage if available, otherwise calculate from sum
        const percentage =
          totalWeight > 0
            ? weightedPercentSum / totalWeight
            : totalPortfolioValue > 0
            ? (totalChangeSum / totalPortfolioValue) * 100
            : 0;

        return {
          amount: totalChangeSum,
          percentage: percentage,
        };
      }
    }

    // Fallback: Calculate from filtered holdings (legacy method)
    const totalUnrealizedPL = filteredHoldings.reduce(
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

  // Get unique security types from filtered holdings
  const getUniqueSecurityTypes = () => {
    const securityTypes = new Set<string>();
    filteredHoldings.forEach((holding) => {
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
    // First priority: Use pre-calculated values from filtered investment_balances table
    if (filteredBalances.length > 0) {
      // Sum day_change from filtered balances
      const dayChangeSum = filteredBalances.reduce(
        (sum, b) => sum + (b.day_change || 0),
        0
      );

      // Check if we have valid day_change data from any balance
      const hasValidDayChange = filteredBalances.some(
        (b) =>
          b.day_change !== null &&
          b.day_change !== undefined &&
          !isNaN(b.day_change)
      );

      if (hasValidDayChange) {
        // CRITICAL: Use stored day_change_percent from database (weighted by total_value)
        // This ensures consistency with backend calculations which use account totals
        let weightedPercentSum = 0;
        let totalWeight = 0;

        filteredBalances.forEach((b) => {
          if (
            b.day_change_percent != null &&
            b.day_change_percent !== undefined &&
            !isNaN(b.day_change_percent) &&
            b.total_value != null &&
            b.total_value > 0
          ) {
            weightedPercentSum += b.day_change_percent * (b.total_value || 0);
            totalWeight += b.total_value || 0;
          }
        });

        // Use weighted average percentage if available, otherwise calculate from sum
        const percentage =
          totalWeight > 0
            ? weightedPercentSum / totalWeight
            : totalPortfolioValue > 0
            ? (dayChangeSum / totalPortfolioValue) * 100
            : 0;

        return {
          amount: dayChangeSum,
          percentage: percentage,
        };
      }
    }

    // Fallback: Calculate from filtered holdings (legacy method)
    let totalDailyPerformance = 0;
    let hasValidDayData = false;

    for (const holding of filteredHoldings) {
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

  // Check if user has no investments
  const hasNoInvestments = () => {
    if (isLoading) return false;

    // Check if there are any holdings with market value > 0
    const hasHoldings =
      holdings.length > 0 && holdings.some((h) => (h.market_value || 0) > 0);

    // Check if there are any options with market value > 0
    const hasOptions =
      options.length > 0 && options.some((o) => (o.market_value || 0) > 0);

    // Check if there are any balances with total_value > 0
    const hasBalances =
      balances.length > 0 && balances.some((b) => (b.total_value || 0) > 0);

    // If no holdings, no options, and no balances with value, show empty state
    return !hasHoldings && !hasOptions && !hasBalances;
  };

  const renderLoadingState = () => {
    return (
      <FinnyLoadingIndicator
        message="Pulling up your investments now"
        duration={1400}
      />
    );
  };

  const renderEmptyState = () => {
    return (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateContent}>
          <View style={styles.emptyStateIconContainer}>
            <AntDesign name="bar-chart" size={64} color="#4A90E2" />
          </View>
          <Text style={styles.emptyStateTitle}>No Investments Yet</Text>
          <Text style={styles.emptyStateMessage}>
            Connect your investment account to start tracking your portfolio and
            see your holdings in one place.
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={handleAddInvestmentAccount}
            activeOpacity={0.8}
          >
            <Ionicons
              name="add-circle"
              size={20}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.emptyStateButtonText}>
              Connect Investment Account
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPortfolioSummary = () => {
    // Format date and time in user's local timezone
    const formatLastUpdated = (
      timestamp: string | null | undefined
    ): string => {
      if (!timestamp) return "Never";
      try {
        const date = new Date(timestamp);
        // Format as "MMM DD, YYYY HH:MM AM/PM" in user's local timezone
        return date.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      } catch (error) {
        return "Never";
      }
    };

    // Format last updated time in compact format (e.g., "2h ago", "3d ago")
    const formatLastUpdatedCompact = (
      timestamp: string | null | undefined
    ): string => {
      if (!timestamp) return "Never";
      try {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return formatLastUpdated(timestamp);
      } catch (error) {
        return "Never";
      }
    };

    // Create account info array: match each connection to its balance's last_updated
    const accountInfoList = connections.map((conn) => {
      // Find matching balance for this connection
      const matchingBalance = balances.find(
        (b) =>
          (conn.provider === "snaptrade" &&
            b.snaptrade_user_id === conn.snaptrade_user_id &&
            b.account_id === conn.account_id) ||
          (conn.provider === "plaid" &&
            b.item_id === conn.item_id &&
            b.provider === "plaid")
      );

      const lastUpdatedTimestamp =
        matchingBalance?.last_updated || conn.last_synced_at;
      const lastUpdatedText = formatLastUpdatedCompact(lastUpdatedTimestamp);

      return {
        accountId: conn.account_id,
        brokerageName: conn.brokerage_name || "Investment Account",
        accountName: conn.account_name || conn.brokerage_name || "Account",
        lastUpdated: lastUpdatedText,
        lastUpdatedTimestamp: lastUpdatedTimestamp,
      };
    });

    // Sort by last updated (most recent first)
    accountInfoList.sort((a, b) => {
      const aTime = a.lastUpdatedTimestamp
        ? new Date(a.lastUpdatedTimestamp).getTime()
        : 0;
      const bTime = b.lastUpdatedTimestamp
        ? new Date(b.lastUpdatedTimestamp).getTime()
        : 0;
      return bTime - aTime;
    });

    return (
      <View style={styles.portfolioSummaryContainer}>
        <IconButton
          onPress={handleAddInvestmentAccount}
          icon="add-outline"
          size={19}
          style={styles.addAccountTopRight}
        />
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
            {/* Compact Account Chips */}
            {accountInfoList.length > 0 ? (
              <View style={styles.accountChipsContainer}>
                {accountInfoList.map((account) => {
                  const isSelected = selectedAccountId === account.accountId;
                  return (
                    <TouchableOpacity
                      key={account.accountId}
                      style={[
                        styles.accountChip,
                        isSelected && styles.accountChipSelected,
                      ]}
                      onPress={() => {
                        // Toggle: if already selected, deselect (show all)
                        setSelectedAccountId(
                          isSelected ? null : account.accountId
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <Image
                        source={{
                          uri: getBrokerageLogoUrl(account.brokerageName),
                        }}
                        style={styles.accountChipLogo}
                        defaultSource={require("../../assets/images/icon.png")}
                      />
                      <View style={styles.accountChipContent}>
                        <Text
                          style={[
                            styles.accountChipName,
                            isSelected && styles.accountChipNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {account.accountName}
                        </Text>
                        <Text
                          style={[
                            styles.accountChipTime,
                            isSelected && styles.accountChipTimeSelected,
                          ]}
                        >
                          Last synced: {account.lastUpdated}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {/* Button Group with Spacing */}
            <View style={styles.buttonGroup}>
              {/* Sync Button */}
              <IconButton
                onPress={handleSync}
                icon={isSyncing ? "hourglass" : "refresh"}
                size={19}
                disabled={isSyncing}
              />
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
    let displayHoldings = filteredHoldings.filter((holding) => {
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

      return !isCash;
    });

    // Apply security type filter
    if (selectedSecurityType) {
      displayHoldings = displayHoldings.filter(
        (holding) => holding.security_type === selectedSecurityType
      );
    }

    // Also filter out Open Ended Fund from holdings display
    displayHoldings = displayHoldings.filter(
      (holding) => holding.security_type !== "Open Ended Fund"
    );

    // Keep the same sequence - don't sort, just use filtered holdings
    const nonCashHoldings = displayHoldings;

    if (nonCashHoldings.length === 0) return null;

    return (
      <View style={styles.investmentGroup}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>
            Your Holdings ({nonCashHoldings.length})
          </Text>
          <TouchableOpacity
            style={styles.filterIconContainer}
            onPress={showHoldingsFilterOptions}
          >
            <Ionicons name="filter-outline" size={18} color="#4A90E2" />
          </TouchableOpacity>
        </View>
        <View style={styles.glassContainer}>
          {nonCashHoldings.map((h, idx) => {
            // Calculate values based on sort type
            const getDisplayValue = () => {
              switch (holdingsSortBy) {
                case "total_gain_loss":
                  return h.unrealized_pl || 0;
                case "today_gain_loss":
                  return (
                    h.day_change ||
                    (h.day_change_percent
                      ? (h.market_value * h.day_change_percent) / 100
                      : 0)
                  );
                case "last_price":
                  return h.price || 0;
                case "percent_of_account":
                  return totalPortfolioValue > 0
                    ? (h.market_value / totalPortfolioValue) * 100
                    : 0;
                default:
                  return h.unrealized_pl || 0;
              }
            };

            const getDisplayPercentage = () => {
              switch (holdingsSortBy) {
                case "total_gain_loss":
                  // Use the new total_percent_change column from database
                  return h.total_percent_change || 0;
                case "today_gain_loss":
                  // Use day_change_percent directly from database
                  return h.day_change_percent || 0;
                case "last_price":
                  // For last price, show the daily change percentage in the chip
                  return h.day_change_percent || 0;
                case "percent_of_account":
                  return totalPortfolioValue > 0
                    ? (h.market_value / totalPortfolioValue) * 100
                    : 0;
                default:
                  // Use the new total_percent_change column from database
                  return h.total_percent_change || 0;
              }
            };

            const displayValue = getDisplayValue();
            const displayPercentage = getDisplayPercentage();

            return (
              <View key={idx}>
                <View style={styles.holdingRow}>
                  <View style={styles.holdingLeft}>
                    <Image
                      source={{ uri: getCompanyLogoUrl(h.symbol) }}
                      style={styles.stockLogo}
                      defaultSource={require("../../assets/images/icon.png")}
                    />
                    <View style={styles.stockInfo}>
                      <Text style={styles.stockSymbol}>{h.symbol}</Text>
                      <Text style={styles.stockDescription} numberOfLines={1}>
                        {h.description}
                      </Text>
                      <Text style={styles.stockQuantity}>{h.units} Shares</Text>
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
                        {holdingsSortBy === "percent_of_account"
                          ? `${displayValue.toFixed(1)}%`
                          : `$${displayValue.toFixed(2)}`}
                      </Text>
                      <View
                        style={[
                          styles.percentageChip,
                          {
                            backgroundColor:
                              holdingsSortBy === "percent_of_account"
                                ? "rgba(74, 144, 226, 0.15)"
                                : holdingsSortBy === "last_price"
                                ? "rgba(142, 142, 147, 0.15)"
                                : displayPercentage >= 0
                                ? "rgba(78, 205, 196, 0.15)"
                                : "rgba(255, 107, 107, 0.15)",
                            borderColor:
                              holdingsSortBy === "percent_of_account"
                                ? "rgba(74, 144, 226, 0.3)"
                                : holdingsSortBy === "last_price"
                                ? "rgba(142, 142, 147, 0.3)"
                                : displayPercentage >= 0
                                ? "rgba(78, 205, 196, 0.3)"
                                : "rgba(255, 107, 107, 0.3)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.percentageChipText,
                            {
                              color:
                                holdingsSortBy === "percent_of_account"
                                  ? "#4A90E2"
                                  : holdingsSortBy === "last_price"
                                  ? "#8E8E93"
                                  : displayPercentage >= 0
                                  ? "#4ECDC4"
                                  : "#FF6B6B",
                            },
                          ]}
                        >
                          {holdingsSortBy === "percent_of_account"
                            ? `${displayPercentage.toFixed(1)}%`
                            : holdingsSortBy === "last_price"
                            ? `${
                                displayPercentage >= 0 ? "+" : ""
                              }${displayPercentage.toFixed(1)}%`
                            : `${
                                displayPercentage >= 0 ? "+" : ""
                              }${displayPercentage.toFixed(1)}%`}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                {idx < nonCashHoldings.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderOptions = () => {
    if (isLoading || filteredOptions.length === 0) return null;

    return (
      <View style={styles.investmentGroup}>
        <Text style={styles.sectionHeading}>
          Options ({filteredOptions.length})
        </Text>
        <View style={styles.glassContainer}>
          {filteredOptions.map((o, idx) => (
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
              {idx < filteredOptions.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderSortModal = () => {
    const sortOptions = [
      { key: "total_gain_loss", label: "Total gain/loss" },
      { key: "today_gain_loss", label: "Today gain/loss" },
      { key: "last_price", label: "Last price" },
      { key: "percent_of_account", label: "% of Account" },
    ];

    return (
      <Modal
        visible={showSortModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSortModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <LinearGradient
                colors={["rgba(31, 31, 31, 0.98)", "rgba(18, 18, 18, 0.99)"]}
                style={styles.modalContent}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Sort Holdings By</Text>
                </View>

                <View style={styles.sortOptionsContainer}>
                  <View style={styles.sortOptionsBox}>
                    {sortOptions.map((option, index) => (
                      <React.Fragment key={option.key}>
                        {index > 0 && <View style={styles.sortOptionDivider} />}
                        <TouchableOpacity
                          style={styles.sortOption}
                          onPress={() => handleSortSelection(option.key)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.sortOptionText,
                              holdingsSortBy === option.key &&
                                styles.sortOptionTextSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                          {holdingsSortBy === option.key && (
                            <Ionicons
                              name="checkmark"
                              size={20}
                              color="#4A90E2"
                            />
                          )}
                        </TouchableOpacity>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              </LinearGradient>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
              { paddingTop: 0, marginTop: 16, paddingHorizontal: 20 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handlePullToRefresh}
                tintColor="#4A90E2"
                colors={["#4A90E2"]}
              />
            }
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            contentInsetAdjustmentBehavior="never"
            contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
            scrollIndicatorInsets={{ top: 0, left: 0, bottom: 0, right: 0 }}
          >
            {connectionStatus.isDisabled && (
              <View style={styles.disabledBanner}>
                <Ionicons name="warning" size={20} color="#FF6B6B" />
                <View style={styles.disabledBannerContent}>
                  <Text style={styles.disabledBannerText}>
                    Your investment account connection has been disabled. Please
                    reconnect to continue.
                  </Text>
                  <TouchableOpacity
                    style={styles.reconnectButton}
                    onPress={handleReconnect}
                  >
                    <Text style={styles.reconnectButtonText}>Reconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isLoading && hasCheckedConnections && connections.length > 0 ? (
              // User has investment account and we're loading, show loading screen
              renderLoadingState()
            ) : isLoading && !hasCheckedConnections ? (
              // Initial load, haven't checked connections yet - show loading screen
              renderLoadingState()
            ) : hasNoInvestments() && !isLoading && hasCheckedConnections ? (
              // No investments (either no accounts or accounts with no investments), show empty state
              renderEmptyState()
            ) : (
              // Data loaded, show content
              <>
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
              </>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Institution Selection Modal */}
      <InstitutionSelectionModal
        visible={showInstitutionModal}
        onClose={handleInstitutionModalClose}
        onInstitutionSelect={handleInstitutionSelect}
      />

      {/* Sort Modal */}
      {renderSortModal()}
    </>
  );
}

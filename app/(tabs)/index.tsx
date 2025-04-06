import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { open, create } from "react-native-plaid-link-sdk";
import AsyncStorage from "@react-native-async-storage/async-storage";
// For more security: import * as Keychain from 'react-native-keychain';

function HomeScreen() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(false);

  // Data states
  const [institution, setInstitution] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [transactions, setTransactions] = useState([]);

  // Load connection state when component mounts
  useEffect(() => {
    const loadConnectionState = async () => {
      try {
        // Check if we have stored access token
        const storedAccessToken = await AsyncStorage.getItem("accessToken");
        if (storedAccessToken) {
          setAccessToken(storedAccessToken);
          setIsConnected(true);
          fetchInitialData(storedAccessToken); // Add this line
        }
      } catch (error) {
        console.error("Error loading connection state:", error);
      }
    };

    loadConnectionState();
  }, []);

  const fetchInitialData = async (token) => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchInstitution(token),
        fetchAccounts(token),
        fetchIdentity(token),
      ]);
    } catch (error) {
      console.error("Error fetching initial data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInstitution = async (token) => {
    try {
      const response = await fetch("http://localhost:8080/api/institution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      });
      const data = await response.json();
      setInstitution(data.institution);
    } catch (error) {
      console.error("Error fetching institution:", error);
    }
  };

  const fetchAccounts = async (token) => {
    try {
      const response = await fetch("http://localhost:8080/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      });
      const data = await response.json();
      setAccounts(data.accounts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  const fetchIdentity = async (token) => {
    try {
      const response = await fetch("http://localhost:8080/api/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      });
      const data = await response.json();
      setIdentity(data.identity);
    } catch (error) {
      console.error("Error fetching identity:", error);
    }
  };

  const fetchTransactions = async () => {
    if (!accessToken) return;
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8080/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const data = await response.json();
      setTransactions(data.transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);

    // Fetch data based on the selected tab
    switch (tab) {
      case "transactions":
        fetchTransactions();
        break;
    }
  };

  // Format currency helper
  const formatCurrency = (amount, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  useEffect(() => {
    // Only fetch link token if not already connected
    if (!isConnected) {
      const fetchLinkToken = async () => {
        try {
          const response = await fetch(
            "http://localhost:8080/api/create_link_token",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            }
          );
          const data = await response.json();
          setLinkToken(data.link_token);
        } catch (error) {
          console.error("Error fetching link token:", error);
        }
      };
      fetchLinkToken();
    }
  }, [isConnected]);

  const handleConnectAccount = async () => {
    if (!linkToken) return;

    const tokenConfig = {
      token: linkToken,
      noLoadingState: false,
    };

    create(tokenConfig);
    open({
      onSuccess: async (success) => {
        console.log("Public Token:", success.publicToken);
        // Exchange public token for access token
        try {
          const response = await fetch(
            "http://localhost:8080/api/exchange_public_token",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ public_token: success.publicToken }),
            }
          );
          const data = await response.json();

          // Store access token for persistence
          // Inside your onSuccess callback, after setting the access token:
          if (data.access_token) {
            const token = data.access_token;
            setAccessToken(token);
            setIsConnected(true);

            // Save to persistent storage
            await AsyncStorage.setItem("accessToken", token);
            console.log("Access Token saved:", token);

            // Add this line to fetch initial data
            fetchInitialData(token);
          }
        } catch (error) {
          console.error("Error exchanging public token:", error);
        }
      },
      onExit: (exit) => {
        console.log("Exit:", exit);
      },
    });
  };

  // Add a disconnect function
  const handleDisconnect = async () => {
    try {
      // Clear from state
      setAccessToken(null);
      setIsConnected(false);
      setAccounts([]);
      setIdentity(null);
      setInstitution(null);
      setTransactions([]);
      setInvestments(null);
      setLiabilities(null);

      // Clear from storage
      await AsyncStorage.removeItem("accessToken");

      console.log("Disconnected account");
    } catch (error) {
      console.error("Error disconnecting account:", error);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      {isLoading && !isConnected ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : !isConnected ? (
        <View style={styles.welcomeContainer}>
          <View style={styles.welcomeContent}>
            <Text style={styles.welcomeTitle}>
              Welcome to Your Financial Hub
            </Text>
            <Text style={styles.welcomeSubtitle}>
              Connect your bank account to get started
            </Text>
            <View style={styles.connectButtonContainer}>
              <TouchableOpacity
                style={styles.connectButton}
                onPress={handleConnectAccount}
              >
                <Text style={styles.connectButtonText}>
                  Connect Your Account
                </Text>
              </TouchableOpacity>
              <Text style={styles.securityText}>
                Bank-level security • 256-bit encryption
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.dashboardContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Financial Dashboard</Text>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={handleDisconnect}
            >
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>

          {/* Institution and User Info */}
          {institution && (
            <View style={styles.institutionContainer}>
              <Text style={styles.institutionName}>{institution.name}</Text>
              {identity && identity.length > 0 && identity[0].owners && (
                <Text style={styles.userName}>
                  Welcome back,{" "}
                  {identity[0].owners[0]?.names[0] || "Account Holder"}
                </Text>
              )}
            </View>
          )}

          {/* Tab Navigation */}
          <View style={styles.tabContainerWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabContainer}
              contentContainerStyle={styles.tabContentContainer}
            >
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === "overview" && styles.activeTab,
                ]}
                onPress={() => handleTabChange("overview")}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "overview" && styles.activeTabText,
                  ]}
                >
                  Overview
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === "accounts" && styles.activeTab,
                ]}
                onPress={() => handleTabChange("accounts")}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "accounts" && styles.activeTabText,
                  ]}
                >
                  Accounts
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === "transactions" && styles.activeTab,
                ]}
                onPress={() => handleTabChange("transactions")}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "transactions" && styles.activeTabText,
                  ]}
                >
                  Transactions
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Content Area */}
          <View style={styles.contentWrapper}>
            <ScrollView>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007bff" />
                  <Text style={styles.loadingText}>Loading data...</Text>
                </View>
              ) : (
                <View style={styles.contentContainer}>
                  {activeTab === "overview" && (
                    <View>
                      <Text style={styles.sectionTitle}>Accounts Summary</Text>
                      {accounts.length > 0 ? (
                        <View style={styles.summaryContainer}>
                          <Text style={styles.summaryText}>
                            Total Accounts: {accounts.length}
                          </Text>
                          <Text style={styles.summaryText}>
                            Total Balance:{" "}
                            {formatCurrency(
                              accounts.reduce(
                                (sum, account) =>
                                  sum + (account.balances.current || 0),
                                0
                              ),
                              accounts[0].balances.iso_currency_code
                            )}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.emptyText}>No accounts found.</Text>
                      )}
                    </View>
                  )}

                  {activeTab === "accounts" && (
                    <View>
                      <Text style={styles.sectionTitle}>Your Accounts</Text>
                      <View style={styles.accountsGrid}>
                        {accounts.map((account) => (
                          <View
                            key={account.account_id}
                            style={styles.accountCard}
                          >
                            <View style={styles.accountCardHeader}>
                              <Text style={styles.accountType}>
                                {account.subtype.charAt(0).toUpperCase() +
                                  account.subtype.slice(1)}
                              </Text>
                            </View>
                            <Text style={styles.accountName}>
                              {account.name}
                            </Text>
                            <Text style={styles.balanceLabel}>
                              Available Balance
                            </Text>
                            <Text style={styles.balanceAmount}>
                              {formatCurrency(
                                account.balances.available ||
                                  account.balances.current,
                                account.balances.iso_currency_code
                              )}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {activeTab === "transactions" && (
                    <View>
                      <Text style={styles.sectionTitle}>
                        Recent Transactions
                      </Text>
                      {transactions.length > 0 ? (
                        transactions.map((transaction) => (
                          <View
                            key={transaction.transaction_id}
                            style={styles.transactionItem}
                          >
                            <View style={styles.transactionHeader}>
                              <Text style={styles.transactionName}>
                                {transaction.name}
                              </Text>
                              <Text
                                style={[
                                  styles.transactionAmount,
                                  transaction.amount > 0
                                    ? styles.negativeAmount
                                    : styles.positiveAmount,
                                ]}
                              >
                                {formatCurrency(
                                  Math.abs(transaction.amount),
                                  transaction.iso_currency_code
                                )}
                              </Text>
                            </View>
                            <Text style={styles.transactionDate}>
                              {transaction.date}
                            </Text>
                            {transaction.pending && (
                              <View style={styles.pendingBadge}>
                                <Text style={styles.pendingText}>Pending</Text>
                              </View>
                            )}
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyText}>
                          No transactions found.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  dashboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1a1a1a",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#007bff",
    padding: 10,
    borderRadius: 5,
  },
  disconnectButton: {
    backgroundColor: "rgba(220, 53, 69, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disconnectButtonText: {
    color: "#dc3545",
    fontSize: 14,
    fontWeight: "600",
  },
  connectedText: {
    fontSize: 18,
    color: "green",
    marginTop: 10,
  },
  institutionContainer: {
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  institutionName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: 4,
  },
  userName: {
    fontSize: 15,
    color: "#666",
    letterSpacing: 0.2,
  },
  tabContainerWrapper: {
    height: 48,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tabContainer: {
    height: "100%",
  },
  tabContentContainer: {
    height: "100%",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  tab: {
    paddingHorizontal: 16,
    height: "100%",
    marginHorizontal: 4,
    justifyContent: "center",
    borderRadius: 6,
    position: "relative",
  },
  activeTab: {
    backgroundColor: "rgba(0, 123, 255, 0.1)",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    letterSpacing: 0.2,
  },
  activeTabText: {
    color: "#007bff",
    fontWeight: "600",
  },
  contentWrapper: {
    flex: 1,
  },
  contentContainer: {
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    marginTop: 10,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 15,
    marginBottom: 10,
  },
  summaryContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryText: {
    fontSize: 16,
    marginBottom: 5,
  },
  accountsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    marginTop: 8,
  },
  accountCard: {
    width: "46%", // Slightly smaller width
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.03)",
  },
  accountCardHeader: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  accountType: {
    fontSize: 11,
    color: "#4A90E2", // More refined blue
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    backgroundColor: "rgba(74,144,226,0.1)", // Light blue background
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  accountName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: 12,
    lineHeight: 18,
  },
  balanceLabel: {
    fontSize: 11,
    color: "#8c8c8c",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: 0.3,
  },
  transactionItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  transactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionName: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "bold",
  },
  transactionDate: {
    fontSize: 14,
    color: "#666",
    marginTop: 5,
  },
  positiveAmount: {
    color: "green",
  },
  negativeAmount: {
    color: "red",
  },
  pendingBadge: {
    backgroundColor: "#ffc107",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 5,
  },
  pendingText: {
    fontSize: 12,
    color: "#000",
  },
  holdingItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  holdingName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  liabilityItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  liabilityName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 20,
  },
  welcomeContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  welcomeContent: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  connectButtonContainer: {
    width: "100%",
    alignItems: "center",
  },
  connectButton: {
    backgroundColor: "#4A90E2", // More refined blue
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  connectButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  securityText: {
    marginTop: 16,
    fontSize: 13,
    color: "#888888",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});

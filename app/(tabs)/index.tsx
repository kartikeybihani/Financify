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
  const [investments, setInvestments] = useState(null);
  const [liabilities, setLiabilities] = useState(null);

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

  const fetchInvestments = async () => {
    if (!accessToken) return;
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8080/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const data = await response.json();
      setInvestments(data);
    } catch (error) {
      console.error("Error fetching investments:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLiabilities = async () => {
    if (!accessToken) return;
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8080/api/liabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const data = await response.json();
      setLiabilities(data);
    } catch (error) {
      console.error("Error fetching liabilities:", error);
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
      case "investments":
        fetchInvestments();
        break;
      case "liabilities":
        fetchLiabilities();
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
        <View style={styles.container}>
          <Text style={styles.title}>Connect Your Bank Account</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={handleConnectAccount}
          >
            <Text style={styles.buttonText}>Connect Account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.dashboardContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Financial Dashboard</Text>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={handleDisconnect}
            >
              <Text style={styles.buttonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>

          {/* Institution and User Info */}
          {institution && (
            <View style={styles.institutionContainer}>
              <Text style={styles.institutionName}>{institution.name}</Text>
              {identity && identity.length > 0 && identity[0].owners && (
                <Text style={styles.userName}>
                  {identity[0].owners[0]?.names[0] || "Account Holder"}
                </Text>
              )}
            </View>
          )}

          {/* Tab Navigation */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabContainer}
          >
            <TouchableOpacity
              style={[styles.tab, activeTab === "overview" && styles.activeTab]}
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
              style={[styles.tab, activeTab === "accounts" && styles.activeTab]}
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
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "investments" && styles.activeTab,
              ]}
              onPress={() => handleTabChange("investments")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "investments" && styles.activeTabText,
                ]}
              >
                Investments
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "liabilities" && styles.activeTab,
              ]}
              onPress={() => handleTabChange("liabilities")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "liabilities" && styles.activeTabText,
                ]}
              >
                Liabilities
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Content Area */}
          <ScrollView style={styles.contentScroll}>
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
                    {accounts.map((account) => (
                      <View key={account.account_id} style={styles.accountItem}>
                        <Text style={styles.accountName}>{account.name}</Text>
                        <Text style={styles.accountType}>
                          {account.subtype} ({account.type})
                        </Text>
                        <View style={styles.balanceRow}>
                          <Text>Current Balance:</Text>
                          <Text style={styles.balanceAmount}>
                            {formatCurrency(
                              account.balances.current,
                              account.balances.iso_currency_code
                            )}
                          </Text>
                        </View>
                        {account.balances.available !== null && (
                          <View style={styles.balanceRow}>
                            <Text>Available Balance:</Text>
                            <Text style={styles.balanceAmount}>
                              {formatCurrency(
                                account.balances.available,
                                account.balances.iso_currency_code
                              )}
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {activeTab === "transactions" && (
                  <View>
                    <Text style={styles.sectionTitle}>Recent Transactions</Text>
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

                {activeTab === "investments" && (
                  <View>
                    <Text style={styles.sectionTitle}>Investment Holdings</Text>
                    {investments ? (
                      investments.holdings.length > 0 ? (
                        investments.holdings.map((holding) => {
                          const security = investments.securities.find(
                            (s) => s.security_id === holding.security_id
                          );
                          return (
                            <View
                              key={`${holding.security_id}-${holding.account_id}`}
                              style={styles.holdingItem}
                            >
                              <Text style={styles.holdingName}>
                                {security?.name || "Unknown Security"}
                                {security?.ticker_symbol
                                  ? ` (${security.ticker_symbol})`
                                  : ""}
                              </Text>
                              <Text>Quantity: {holding.quantity}</Text>
                              <Text>
                                Value:{" "}
                                {formatCurrency(
                                  holding.institution_value,
                                  "USD"
                                )}
                              </Text>
                            </View>
                          );
                        })
                      ) : (
                        <Text style={styles.emptyText}>
                          No investment holdings found.
                        </Text>
                      )
                    ) : (
                      <Text style={styles.emptyText}>
                        Investment data not available.
                      </Text>
                    )}
                  </View>
                )}

                {activeTab === "liabilities" && (
                  <View>
                    <Text style={styles.sectionTitle}>Liabilities</Text>
                    {liabilities ? (
                      <>
                        {liabilities.liabilities.credit?.length > 0 && (
                          <View>
                            <Text style={styles.subsectionTitle}>
                              Credit Cards
                            </Text>
                            {liabilities.liabilities.credit.map((card) => {
                              const account = liabilities.accounts.find(
                                (a) => a.account_id === card.account_id
                              );
                              return (
                                <View
                                  key={card.account_id}
                                  style={styles.liabilityItem}
                                >
                                  <Text style={styles.liabilityName}>
                                    {account?.name || "Credit Card"}
                                  </Text>
                                  <Text>
                                    Balance:{" "}
                                    {formatCurrency(
                                      account?.balances.current || 0
                                    )}
                                  </Text>
                                  <Text>
                                    APR:{" "}
                                    {card.aprs[0]?.apr_percentage.toFixed(2)}%
                                  </Text>
                                  {card.last_payment_date && (
                                    <Text>
                                      Last Payment: {card.last_payment_date}
                                    </Text>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {liabilities.liabilities.mortgage?.length > 0 && (
                          <View>
                            <Text style={styles.subsectionTitle}>
                              Mortgages
                            </Text>
                            {liabilities.liabilities.mortgage.map(
                              (mortgage) => {
                                const account = liabilities.accounts.find(
                                  (a) => a.account_id === mortgage.account_id
                                );
                                return (
                                  <View
                                    key={mortgage.account_id}
                                    style={styles.liabilityItem}
                                  >
                                    <Text style={styles.liabilityName}>
                                      {account?.name || "Mortgage"}
                                    </Text>
                                    <Text>
                                      Balance:{" "}
                                      {formatCurrency(
                                        account?.balances.current || 0
                                      )}
                                    </Text>
                                    {mortgage.interest_rate && (
                                      <Text>
                                        Interest Rate:{" "}
                                        {mortgage.interest_rate.percentage.toFixed(
                                          2
                                        )}
                                        %
                                      </Text>
                                    )}
                                  </View>
                                );
                              }
                            )}
                          </View>
                        )}

                        {liabilities.liabilities.student?.length > 0 && (
                          <View>
                            <Text style={styles.subsectionTitle}>
                              Student Loans
                            </Text>
                            {liabilities.liabilities.student.map((loan) => {
                              const account = liabilities.accounts.find(
                                (a) => a.account_id === loan.account_id
                              );
                              return (
                                <View
                                  key={loan.account_id}
                                  style={styles.liabilityItem}
                                >
                                  <Text style={styles.liabilityName}>
                                    {account?.name || "Student Loan"}
                                  </Text>
                                  <Text>
                                    Balance:{" "}
                                    {formatCurrency(
                                      account?.balances.current || 0
                                    )}
                                  </Text>
                                  {loan.interest_rate_percentage && (
                                    <Text>
                                      Interest Rate:{" "}
                                      {loan.interest_rate_percentage.toFixed(2)}
                                      %
                                    </Text>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {!liabilities.liabilities.credit?.length &&
                          !liabilities.liabilities.mortgage?.length &&
                          !liabilities.liabilities.student?.length && (
                            <Text style={styles.emptyText}>
                              No liabilities found.
                            </Text>
                          )}
                      </>
                    ) : (
                      <Text style={styles.emptyText}>
                        Liability data not available.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
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
    justifyContent: "center",
    alignItems: "center",
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
    padding: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eaeaea",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
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
    backgroundColor: "#dc3545",
    padding: 8,
    borderRadius: 5,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
  },
  connectedText: {
    fontSize: 18,
    color: "green",
    marginTop: 10,
  },
  institutionContainer: {
    padding: 15,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#eaeaea",
  },
  institutionName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  userName: {
    fontSize: 16,
    color: "#666",
    marginTop: 5,
  },
  tabContainer: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eaeaea",
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginHorizontal: 5,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: "#007bff",
  },
  tabText: {
    fontSize: 16,
    color: "#555",
  },
  activeTabText: {
    color: "#fff",
    fontWeight: "bold",
  },
  contentScroll: {
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
  accountItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  accountName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  accountType: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  balanceAmount: {
    fontWeight: "bold",
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
});

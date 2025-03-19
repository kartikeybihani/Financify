import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { open, create } from "react-native-plaid-link-sdk";

const HomeScreen = () => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  const handleConnectAccount = async () => {
    if (!linkToken) return;

    const tokenConfig = {
      token: linkToken,
      noLoadingState: false,
    };

    create(tokenConfig);
    open({
      onSuccess: async (success) => {
        setPublicToken(success.publicToken);
        setIsConnected(true);
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
          console.log("Access Token:", data.access_token);
          console.log("Item ID:", data.item_id);
        } catch (error) {
          console.error("Error exchanging public token:", error);
        }
      },
      onExit: (exit) => {
        console.log("Exit:", exit);
      },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect Your Bank Account</Text>
      <TouchableOpacity style={styles.button} onPress={handleConnectAccount}>
        <Text style={styles.buttonText}>Connect Account</Text>
      </TouchableOpacity>
      {isConnected && (
        <Text style={styles.connectedText}>Account Connected!</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  buttonText: {
    color: "white",
    fontSize: 18,
  },
  connectedText: {
    fontSize: 18,
    color: "green",
    marginTop: 10,
  },
});

export default HomeScreen;

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../lib/supabase/supabase";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchLinkToken, handlePlaidConnect } from "../utils/plaid";
import { BlurView } from "expo-blur";

export default function AccountConnectionScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [hasConnectedBank, setHasConnectedBank] = useState(false);

  useEffect(() => {
    const initializePlaid = async () => {
      try {
        const token = await fetchLinkToken();
        setLinkToken(token);
      } catch (error) {
        console.error("Error fetching link token:", error);
        Alert.alert(
          "Connection Error",
          "Unable to initialize bank connection. Please try again."
        );
      }
    };

    initializePlaid();
  }, []);

  const handleConnect = async () => {
    if (!linkToken) {
      Alert.alert(
        "Not Ready",
        "Please wait while we prepare the connection..."
      );
      return;
    }
    setIsLoading(true);

    try {
      await handlePlaidConnect(
        linkToken,
        async (itemId: string) => {
          setHasConnectedBank(true);
          setIsLoading(false);
          setIsConnecting(true);

          // itemId is already stored via addItemId in handlePlaidConnect

          Alert.alert(
            "Success!",
            "Your bank account has been connected successfully.",
            [
              {
                text: "Continue",
                onPress: async () => {
                  setIsConnecting(false);
                  await supabase.auth.updateUser({
                    data: { hasConnectedBank: true },
                  });
                  router.replace("/(onboarding)/final");
                },
              },
            ]
          );
        },
        // onExit:
        (error?: any) => {
          setIsLoading(false);
          setIsConnecting(false);

          console.log("❌ Plaid connection error:", error);

          if (error?.error?.errorCode === "INVALID_LINK_TOKEN") {
            Alert.alert(
              "Connection Expired",
              "The link expired. Trying again...",
              [
                {
                  text: "OK",
                  onPress: async () => setLinkToken(await fetchLinkToken()),
                },
              ]
            );
          } else if (error?.message) {
            // This handles our token exchange errors
            Alert.alert(
              "Connection Failed",
              `Unable to connect your bank account: ${error.message}`,
              [{ text: "Try Again" }]
            );
          } else if (error) {
            Alert.alert("Connection Cancelled", "You can try again anytime.", [
              { text: "OK" },
            ]);
          }
        }
      );
    } catch (error) {
      console.error("Error connecting bank:", error);
      Alert.alert(
        "Connection Failed",
        "Unable to connect your bank account. Please try again."
      );
      setIsLoading(false);
    }
  };

  const benefits = [
    {
      icon: "bulb-outline",
      title: "Smart savings",
      description: "Personalized recommendations",
      color: "#FFD700", // Bright gold
    },
    {
      icon: "analytics-outline",
      title: "Wealth Building",
      description: "Financial Planning & Goal tracking",
      color: "#4CAF50", // Nice green
    },
    {
      icon: "trending-up-outline",
      title: "Net worth & debt tracking",
      description:
        "See your complete financial picture in one place with real-time updates",
      color: "#4A90E2", // Keeping the existing blue
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={["#1A1A2E", "#16213E", "#0D1117"]}
        locations={[0, 0.5, 1]}
        style={styles.container}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/(onboarding)/intent")}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Let's see the full picture</Text>
            <Text style={styles.subtitle}>
              Connect at least one account so we can give you personalized
              insights.
            </Text>
          </View>

          <View style={styles.benefitsContainer}>
            <View style={styles.benefitsRow}>
              {benefits.slice(0, 2).map((benefit, index) => (
                <View key={index} style={styles.benefitCard}>
                  <View style={styles.benefitIconContainer}>
                    <Ionicons
                      name={benefit.icon as any}
                      size={20}
                      color={benefit.color}
                    />
                  </View>
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitDescription}>
                    {benefit.description}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.benefitCardFull}>
              <View style={styles.benefitIconContainerFull}>
                <Ionicons
                  name={benefits[2].icon as any}
                  size={24}
                  color={benefits[2].color}
                />
              </View>
              <Text style={styles.benefitTitleFull}>{benefits[2].title}</Text>
              <Text style={styles.benefitDescriptionFull}>
                {benefits[2].description}
              </Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.connectButton,
                isLoading && styles.connectButtonDisabled,
              ]}
              onPress={handleConnect}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.connectButtonText}>Connect My Bank</Text>
                  <MaterialCommunityIcons
                    name="bank"
                    size={20}
                    color="#fff"
                    style={styles.buttonIcon}
                  />
                </>
              )}
            </TouchableOpacity>
            <View style={styles.securityMessage}>
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color="#A0A0A0"
              />
              <Text style={styles.securityText}>
                We securely connect your bank account with Plaid
              </Text>
            </View>
          </View>
        </View>

        {(isLoading || isConnecting) && (
          <View style={styles.loadingOverlay}>
            <BlurView
              intensity={95}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color="#4A90E2" />
              <Text style={styles.loadingText}>
                {isLoading ? "Opening Plaid..." : "Closing Plaid..."}
              </Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1A1A2E",
  },
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 40 : 20,
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 40 : 20,
    left: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 50,
    justifyContent: "space-between",
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 10,
    textAlign: "left",
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 24,
    textAlign: "left",
  },
  benefitsContainer: {
    gap: 10,
  },
  benefitsRow: {
    flexDirection: "row",
    gap: 20,
  },
  benefitCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    alignItems: "center",
  },
  benefitIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  benefitContent: {
    flex: 1,
    justifyContent: "center",
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 3,
    textAlign: "center",
  },
  benefitDescription: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 16,
    textAlign: "center",
  },
  benefitCardFull: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    alignItems: "center",
    marginTop: 10,
  },
  benefitIconContainerFull: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  benefitTitleFull: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
    textAlign: "center",
  },
  benefitDescriptionFull: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 18,
    textAlign: "center",
  },
  buttonContainer: {
    alignItems: "center",
    gap: 8,
  },
  connectButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonIcon: {
    marginLeft: 4,
    marginBottom: 2,
  },
  securityMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  securityText: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "400",
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
});

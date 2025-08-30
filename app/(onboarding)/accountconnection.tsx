import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../lib/supabase/supabase";
import {
  FontAwesome,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { fetchLinkToken, handlePlaidConnect } from "../utils/plaid";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
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
                      size={28}
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
            <View style={styles.benefitCard}>
              <View style={styles.benefitIconContainer}>
                <Ionicons
                  name={benefits[2].icon as any}
                  size={28}
                  color={benefits[2].color}
                />
              </View>
              <Text style={styles.benefitTitle}>{benefits[2].title}</Text>
              <Text style={styles.benefitDescription}>
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
                    size={23}
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
        </ScrollView>

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
                {isLoading
                  ? "Opening Plaid..."
                  : "Connecting with your bank..."}
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
    height: Dimensions.get("window").height,
  },
  container: {
    flex: 1,
    top: 30,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#A0A0A0",
    lineHeight: 24,
  },
  benefitsContainer: {
    marginBottom: 32,
    gap: 12,
  },
  benefitsRow: {
    flexDirection: "row",
    gap: 12,
  },
  benefitCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    alignItems: "center",
  },
  benefitIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  benefitContent: {
    flex: 1,
    justifyContent: "center",
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
    textAlign: "center",
  },
  benefitDescription: {
    fontSize: 13,
    color: "#A0A0A0",
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
    padding: 18,
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

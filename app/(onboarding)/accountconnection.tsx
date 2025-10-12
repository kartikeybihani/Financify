import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchLinkToken, handlePlaidConnect } from "@/src/utils/plaid";
import { BlurView } from "expo-blur";
import {
  useNavigationContext,
  OnboardingStage,
} from "@/src/contexts/NavigationContext";
import logger from "@/src/utils/logger";
import { logOnboardingEvent } from "@/src/utils/onboarding";

export default function AccountConnectionScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { updateOnboardingStage } = useNavigationContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [hasConnectedBank, setHasConnectedBank] = useState(false);

  useEffect(() => {
    logOnboardingEvent({ stage: "plaid", action: "view" });
    const initializePlaid = async () => {
      try {
        const token = await fetchLinkToken();
        setLinkToken(token);
      } catch (error) {
        logger.error("Error fetching link token:", error);
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
            "Connected!",
            "Connected 1 account. Add more now or later—your call.",
            [
              {
                text: "Continue",
                onPress: async () => {
                  setIsConnecting(false);
                  await supabase.auth.updateUser({
                    data: { hasConnectedBank: true },
                  });
                  await updateOnboardingStage(OnboardingStage.FINAL);
                  logOnboardingEvent({ stage: "plaid", action: "success" });
                },
              },
            ]
          );
        },
        // onExit:
        (error?: any) => {
          setIsLoading(false);
          setIsConnecting(false);

          logger.info("❌ Plaid connection error:", error);
          logOnboardingEvent({
            stage: "plaid",
            action: "error",
            errorCode: error?.message || error?.error?.errorCode,
          });

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
      logger.error("Error connecting bank:", error);
      logOnboardingEvent({
        stage: "plaid",
        action: "error",
        errorCode: (error as any)?.message,
      });
      Alert.alert(
        "Connection Failed",
        "Unable to connect your bank account. Please try again."
      );
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#1A1A2E", "#16213E", "#0D1117"]}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        <View
          style={[
            styles.content,
            { paddingBottom: Platform.OS === "ios" ? 24 : 24 },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Connect at least 1 account</Text>
            <Text style={styles.subtitle}>Real advice needs real data</Text>
            <Text style={styles.description}>
              This helps us analyze your spending patterns, track your goals,
              and give you personalized insights to help you build and manage
              wealth smarter.
            </Text>
          </View>

          <View style={styles.trustSection}>
            <View style={styles.trustCard}>
              <View style={styles.trustIconContainer}>
                <Ionicons name="shield-checkmark" size={24} color="#00D4AA" />
              </View>
              <View style={styles.trustContent}>
                <Text style={styles.trustTitle}>Bank-level security</Text>
                <Text style={styles.trustSubtitle}>
                  Used by Venmo, Robinhood • Read-only • Encrypted
                </Text>
              </View>
            </View>

            <View style={styles.trustCard}>
              <View style={styles.trustIconContainer}>
                <Ionicons name="time-outline" size={24} color="#4A90E2" />
              </View>
              <View style={styles.trustContent}>
                <Text style={styles.trustTitle}>Takes ~90 seconds</Text>
                <Text style={styles.trustSubtitle}>
                  See insights right after connecting
                </Text>
              </View>
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
                We securely connect via Plaid
              </Text>
            </View>
            {hasConnectedBank && (
              <View style={{ marginTop: 10, gap: 8 }}>
                <TouchableOpacity
                  style={[styles.connectButton]}
                  onPress={handleConnect}
                  disabled={isLoading}
                >
                  <Text style={styles.connectButtonText}>
                    Add another account
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await updateOnboardingStage(OnboardingStage.FINAL);
                    } catch {}
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      textAlign: "center",
                      textDecorationLine: "underline",
                    }}
                  >
                    Continue
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 40 : 20,
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 50,
    justifyContent: "space-between",
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
    textAlign: "left",
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 18,
    color: "#4A90E2",
    lineHeight: 24,
    textAlign: "left",
    fontWeight: "600",
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: 24,
    textAlign: "left",
  },
  trustSection: {
    gap: 16,
    marginBottom: 40,
  },
  trustCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  trustIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  trustContent: {
    flex: 1,
  },
  trustTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  trustSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 20,
  },
  buttonContainer: {
    alignItems: "center",
    gap: 8,
  },
  connectButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 26,
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

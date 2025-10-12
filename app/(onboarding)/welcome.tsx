"use client";

import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  Image,
  Platform,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  AntDesign,
  Entypo,
  Feather,
  Ionicons,
  MaterialIcons,
} from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/src/lib/supabase/supabase";
import {
  useNavigationContext,
  OnboardingStage,
} from "@/src/contexts/NavigationContext";
import logger from "@/src/utils/logger";
import { logOnboardingEvent } from "@/src/utils/onboarding";

const { width } = Dimensions.get("window");

export default function WelcomeScreen() {
  const router = useRouter();
  const { updateOnboardingStage } = useNavigationContext();

  const imageSlideAnim = useRef(new Animated.Value(40)).current;
  const titleSlideAnim = useRef(new Animated.Value(30)).current;
  const textRevealAnim = useRef(new Animated.Value(0)).current;
  const sparkGlowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    logOnboardingEvent({ stage: "welcome", action: "view" });
    Animated.parallel([
      Animated.spring(textRevealAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(imageSlideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(titleSlideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(sparkGlowAnim, {
            toValue: 1,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(sparkGlowAnim, {
            toValue: 0,
            duration: 1600,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();
  }, []);

  const handleEmailSignup = () => router.push("/(auth)/signup");
  const handleLogin = () => router.push("/(auth)/login");

  const animatedSparkStyle = {
    opacity: sparkGlowAnim,
    transform: [
      {
        scale: sparkGlowAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.95, 1.05],
        }),
      },
    ],
  };

  const signInWithApple = async () => {
    const start = Date.now();
    logger.info("Signing in with Apple...");

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      logger.info("Apple sign in successful: ", credential);

      if (credential.identityToken) {
        logger.info("Authenticating with Supabase...");

        const {
          data: { user },
          error,
        } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });

        logger.info("User: ", user);

        if (error) {
          logger.error("Supabase auth error:", error);
          throw error;
        }

        if (user) {
          logger.info("Successfully authenticated with Supabase");
          try {
            await updateOnboardingStage(OnboardingStage.INTENT);
          } catch {}
          logOnboardingEvent({
            stage: "welcome",
            action: "auth_success",
            durationMs: Date.now() - start,
          });
        }
      } else {
        throw new Error("No identity token received from Apple");
      }
    } catch (error) {
      logOnboardingEvent({
        stage: "welcome",
        action: "auth_error",
        durationMs: Date.now() - start,
        errorCode: (error as any)?.message,
      });
      if (error instanceof Error) {
        if (error.message === "ERR_REQUEST_CANCELED") {
          logger.info("User canceled Apple sign in");
        } else if (error.message === "ERR_REQUEST_FAILED") {
          logger.error("Apple sign in request failed:", error);
        } else {
          logger.error("Error signing in with Apple:", error);
        }
      } else {
        logger.error("Unknown error during Apple sign in:", error);
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[
          "rgba(10, 14, 20, 0.98)",
          "rgba(22, 33, 62, 0.92)",
          "rgba(10, 14, 20, 0.98)",
        ]}
        locations={[0, 0.5, 1]}
        style={styles.gradientBackground}
      >
        <LinearGradient
          colors={[
            "rgba(255, 255, 255, 0)",
            "rgba(255, 255, 255, 0.04)",
            "rgba(255, 255, 255, 0)",
          ]}
          style={[styles.spotlightContainer]}
          locations={[0, 0.5, 1]}
        />
        <View style={styles.content}>
          {/* Step text removed per request */}
          <View style={styles.heroSection}>
            <Animated.Image
              source={require("../../assets/images/main2.png")}
              style={[styles.heroImage, animatedSparkStyle]}
              resizeMode="contain"
            />
            <Animated.View
              style={[
                styles.textContainer,
                {
                  transform: [
                    { translateY: titleSlideAnim },
                    {
                      scale: textRevealAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1],
                      }),
                    },
                  ],
                  opacity: textRevealAnim,
                },
              ]}
            >
              <View style={styles.brandContainer}>
                <Text style={styles.brandName}>Financify</Text>
                <Text style={styles.aiTagline}>Powered by Next Gen AI</Text>
                <LinearGradient
                  colors={[
                    "rgba(74, 144, 226, 0.3)",
                    "rgba(93, 160, 242, 0.1)",
                  ]}
                  style={styles.brandUnderline}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </View>
              <Text style={styles.titleHighlight}>
                <Text style={styles.titleEmphasis}>Finally, </Text>
                <Text style={styles.titleMain}>
                  feel great about your money.
                </Text>
              </Text>
            </Animated.View>
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.buttonSection}>
              <View style={styles.authButtons}>
                <TouchableOpacity
                  style={styles.googleButton}
                  activeOpacity={0.9}
                  onPress={signInWithApple}
                >
                  <View style={styles.blurContainer}>
                    <Ionicons name="logo-apple" size={22} color="#fff" />
                    <Text style={styles.googleButtonText}>
                      Continue with Apple
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.emailButton}
                  onPress={handleEmailSignup}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={["#4A90E2", "#5DA0F2"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientButton}
                  >
                    <View style={styles.emailButtonContent}>
                      <Entypo name="mail" size={23} color="#fff" />
                      <Text style={styles.emailButtonText}>
                        Continue with Email
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.loginLink}
                  onPress={handleLogin}
                >
                  <Text style={styles.loginText}>
                    Already have an account?{" "}
                    <Text style={styles.loginTextBold}>Login</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  // step text removed
  gradientBackground: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 90 : 80,
    paddingBottom: Platform.OS === "ios" ? 40 : 30,
    position: "relative",
    justifyContent: "space-between",
  },
  spotlightContainer: {
    position: "absolute",
    top: "25%",
    left: "50%",
    width: width * 2,
    height: width * 2,
    transform: [{ translateX: -width }],
    borderRadius: width,
    opacity: 1,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 60,
    marginBottom: Platform.OS === "ios" ? 20 : 15,
  },
  heroImage: {
    width: width * 0.35,
    height: width * 0.35,
    marginBottom: 30,
  },
  textContainer: {
    alignItems: "center",
    width: "100%",
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  brandName: {
    fontSize: 42,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
    letterSpacing: 1.2,
    textShadowColor: "rgba(74, 144, 226, 0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
    includeFontPadding: false,
  },
  aiTagline: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  brandUnderline: {
    height: 3,
    width: 180,
    borderRadius: 1.5,
    marginTop: 4,
  },
  titleHighlight: {
    fontSize: 24,
    textAlign: "center",
    marginBottom: 0,
    lineHeight: 36,
    letterSpacing: 0.5,
    color: "rgba(255, 255, 255, 0.95)",
    textShadowColor: "rgba(255, 255, 255, 0.1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  titleEmphasis: {
    color: "#5DA0F2",
    fontWeight: "700",
    textShadowColor: "rgba(93, 160, 242, 0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  titleMain: {
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
  },
  cardContainer: {
    width: "100%",
    alignItems: "center",
    height: 210,
  },
  subtitleContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
    height: 135,
    marginBottom: 18,
  },
  card: {
    position: "absolute",
    top: -25,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: "hidden",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  cardBack: {
    position: "absolute",
    top: -25,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: "hidden",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    transform: [{ rotateY: "180deg" }],
  },
  comparisonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  beforeContainer: {
    flex: 1,
    alignItems: "center",
  },
  afterContainer: {
    flex: 1,
    alignItems: "center",
  },
  beforeLabel: {
    color: "#ff4444",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 12,
  },
  afterLabel: {
    color: "#4A90E2",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 12,
  },
  subtitleBefore: {
    fontSize: 18,
    color: "#ff4444",
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "600",
    opacity: 0.9,
  },
  subtitleAfter: {
    fontSize: 18,
    color: "#4A90E2",
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "600",
    opacity: 0.9,
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    marginHorizontal: 24,
    height: 80,
  },
  buttonSection: {
    width: "100%",
  },
  gradientButton: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  authButtons: {
    width: "100%",
    gap: 16,
  },
  googleButton: {
    height: 56,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  blurContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: "100%",
    width: "100%",
    gap: 12,
  },
  googleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emailButton: {
    height: 56,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  emailButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
    gap: 12,
  },
  emailButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  loginLink: {
    marginTop: 20,
    alignItems: "center",
  },
  loginText: {
    color: "#B4B4B4",
    fontSize: 14,
  },
  loginTextBold: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  cardCaption: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  transformationContainer: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: "center",
    marginTop: 0,
  },
  transformationText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
    letterSpacing: 0.5,
    marginTop: 12,
  },
  fluffText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
    fontWeight: "400",
    letterSpacing: 0.2,
  },
  transformationMessage: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 18,
  },
  bottomSection: {
    width: "100%",
    justifyContent: "flex-end",
    marginTop: 0,
  },
});

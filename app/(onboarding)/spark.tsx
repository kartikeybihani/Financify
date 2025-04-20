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
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../lib/supabase/supabase";

const { width } = Dimensions.get("window");

export default function SparkOfClarity() {
  const router = useRouter();
  const [started, setStarted] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const imageSlideAnim = useRef(new Animated.Value(40)).current;
  const titleSlideAnim = useRef(new Animated.Value(30)).current;
  const textRevealAnim = useRef(new Animated.Value(0)).current;
  const sparkGlowAnim = useRef(new Animated.Value(0)).current;
  const flipAnim = useRef(new Animated.Value(0)).current;
  const flipAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const googleButtonAnim = useRef(new Animated.Value(0)).current;
  const emailButtonAnim = useRef(new Animated.Value(0)).current;
  const loginTextAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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

    // Start the auto-flip animation only if not started
    if (!started) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(flipAnim, {
            toValue: 180,
            duration: 2000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(flipAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ])
      );
      flipAnimationRef.current = animation;
      animation.start();
    } else {
      // Stop the animation and show "after" state when started
      if (flipAnimationRef.current) {
        flipAnimationRef.current.stop();
      }
      Animated.timing(flipAnim, {
        toValue: 180,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    }

    return () => {
      if (flipAnimationRef.current) {
        flipAnimationRef.current.stop();
      }
    };
  }, [started]);

  const handleBegin = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.95,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setStarted(true);
        Animated.stagger(150, [
          Animated.timing(googleButtonAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(emailButtonAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(loginTextAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();
      });
    });
  };

  const handleEmailSignup = () => router.push("/(auth)/signup");
  const handleLogin = () => router.push("/(auth)/login");

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });

  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });

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
    console.log("Signing in with Apple...");

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      console.log("Apple sign in successful");

      if (credential.identityToken) {
        console.log("Authenticating with Supabase...");

        const {
          data: { user },
          error,
        } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });

        if (error) {
          console.error("Supabase auth error:", error);
          throw error;
        }

        if (user) {
          console.log("Successfully authenticated with Supabase");
          router.replace("/(tabs)");
        }
      } else {
        throw new Error("No identity token received from Apple");
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "ERR_REQUEST_CANCELED") {
          console.log("User canceled Apple sign in");
        } else if (error.message === "ERR_REQUEST_FAILED") {
          console.error("Apple sign in request failed:", error);
        } else {
          console.error("Error signing in with Apple:", error);
        }
      } else {
        console.error("Unknown error during Apple sign in:", error);
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={["#1A1A2E", "#16213E", "#0D1117"]}
        locations={[0, 0.5, 1]}
        style={styles.gradientBackground}
      >
        <View style={styles.content}>
          <Animated.View
            style={[
              styles.heroSection,
              { transform: [{ translateY: imageSlideAnim }] },
            ]}
          >
            <Animated.Image
              source={require("../assets/main2.png")}
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
              <Text style={styles.title}>
                Your Financial{"\n"}
                <Text style={styles.titleHighlight}>Growth</Text> Begins
              </Text>

              <View style={styles.cardContainer}>
                <View style={styles.subtitleContainer}>
                  <Animated.View
                    style={[
                      styles.card,
                      { transform: [{ rotateY: frontInterpolate }] },
                    ]}
                  >
                    <Text style={styles.beforeLabel}>BEFORE</Text>
                    <Text style={styles.subtitleBefore}>
                      Chaos • Overwhelm • Guilt
                    </Text>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.cardBack,
                      { transform: [{ rotateY: backInterpolate }] },
                    ]}
                  >
                    <Text style={styles.afterLabel}>AFTER</Text>
                    <Text style={styles.subtitleAfter}>
                      Calm • Goals • Clarity
                    </Text>
                  </Animated.View>
                </View>
                {!started && (
                  <Text style={styles.cardCaption}>
                    Before vs After Financify
                  </Text>
                )}
              </View>
            </Animated.View>
          </Animated.View>

          <View style={styles.buttonSection}>
            {!started ? (
              <Animated.View
                style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}
              >
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleBegin}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={["#4A90E2", "#5DA0F2"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientButton}
                  >
                    <Text style={styles.primaryButtonText}>Let's Begin</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View style={styles.authButtons}>
                <Animated.View
                  style={{
                    opacity: googleButtonAnim,
                    transform: [
                      {
                        translateY: googleButtonAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  }}
                >
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
                </Animated.View>

                <Animated.View
                  style={{
                    opacity: emailButtonAnim,
                    transform: [
                      {
                        translateY: emailButtonAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  }}
                >
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
                      <Text style={styles.emailButtonText}>
                        Continue with Email
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                <Animated.View
                  style={{
                    opacity: loginTextAnim,
                    transform: [
                      {
                        translateY: loginTextAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [10, 0],
                        }),
                      },
                    ],
                  }}
                >
                  <TouchableOpacity
                    style={styles.loginLink}
                    onPress={handleLogin}
                  >
                    <Text style={styles.loginText}>
                      Already have an account?{" "}
                      <Text style={styles.loginTextBold}>Login</Text>
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}
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
  gradientBackground: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  heroImage: {
    width: width * 0.4,
    height: width * 0.4,
    marginBottom: 40,
  },
  textContainer: {
    alignItems: "center",
    width: "100%",
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 44,
    letterSpacing: 0.5,
  },
  titleHighlight: {
    color: "#4A90E2",
    fontWeight: "900",
  },
  cardContainer: {
    width: "100%",
    alignItems: "center",
  },
  subtitleContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
    height: 120,
    marginBottom: 8,
  },
  card: {
    position: "absolute",
    top: 0,
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
    top: 0,
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
    marginTop: 20,
  },
  primaryButton: {
    width: "100%",
    height: 56,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  gradientButton: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
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
  appleButton: {
    width: "100%",
    height: 56,
  },
});

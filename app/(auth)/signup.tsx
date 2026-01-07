import * as React from "react";
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  AppState,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/src/lib/supabase/supabase";
import { useRouter } from "expo-router";
// NavigationContext will handle routing automatically based on onboarding status
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import IconButton from "@/src/components/shared/IconButton";
const { width } = Dimensions.get("window");

export default function SignupScreen() {
  const router = useRouter();
  // NavigationContext will handle routing automatically
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // Verification overlay state
  const [showVerificationOverlay, setShowVerificationOverlay] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationError, setVerificationError] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<
    string | null
  >(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Refs for timers and animations
  const resendTimerRef = useRef<number | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const overlayTranslateY = useRef(new Animated.Value(-20)).current;

  const handleBack = () => {
    router.back();
  };

  const validateForm = () => {
    if (!email) {
      setFormError("Please enter your email");
      return false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setFormError("Please enter a valid email address");
      return false;
    }

    if (!password) {
      setFormError("Please enter a password");
      return false;
    } else if (password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return false;
    }

    if (!firstName || !firstName.trim()) {
      setFormError("Please enter your first name");
      return false;
    }

    if (!lastName || !lastName.trim()) {
      setFormError("Please enter your last name");
      return false;
    }

    setFormError("");
    return true;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setVerificationError("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: "https://usefinny.com/auth-redirect.html",
      },
    });

    logger.info("Signup data: ", data);
    if (error) {
      logger.error("Signup error: ", error);
    }

    setLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        setFormError("User with this email already exists. Please login.");
        return;
      }
      setFormError(
        error.message || "An error occurred during signup. Please try again."
      );
      return;
    }

    // Check if email confirmation is required
    if (!data.user || !data.session) {
      // Store the email that needs verification
      setPendingVerificationEmail(email);
      // Start resend cooldown timer
      setResendCooldown(90);
      startResendTimer();

      Alert.alert(
        "Check your email",
        "We've sent you a confirmation email. Please check your inbox or spam folder and click the confirmation link to finish your signup.",
        [
          {
            text: "OK",
            onPress: () => {
              // Show overlay after 5 seconds if user stays on screen
              showOverlayWithDelay();
            },
          },
        ]
      );
      return;
    }

    // Create profiles row with name and route to profile screen
    try {
      if (data.user?.id) {
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            onboarding_completed: false,
            onboarding_step: 0, // Profile screen is next (step 1)
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
          { onConflict: "id" }
        );

        if (profileError) {
          logger.error("Error creating profile: ", profileError);
          setFormError(
            "Account created but failed to set up profile. Please try logging in."
          );
          return;
        }

        logger.info("✅ SignupScreen: Profile created successfully", {
          userId: data.user.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });

        // Seed default categories for new user
        try {
          const { seedDefaultCategories } = await import(
            "@/src/utils/categories/seedDefaultCategories"
          );
          await seedDefaultCategories(data.user.id);
        } catch (seedError) {
          logger.error("Error seeding default categories:", seedError);
          // Don't block signup if category seeding fails
        }
      }
    } catch (profileError) {
      logger.error("Error creating profile: ", profileError);
      setFormError(
        "Account created but failed to set up profile. Please try logging in."
      );
      return;
    }

    router.replace("/onboarding-profile" as any);
  };

  // Resend verification email
  const handleResendVerification = async () => {
    if (resendCooldown > 0 || !pendingVerificationEmail) return;

    setVerificationError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingVerificationEmail,
        options: {
          emailRedirectTo: "https://usefinny.com/auth-redirect.html",
        },
      });

      if (error) {
        setVerificationError(
          error.message ||
            "Failed to resend verification email. Please try again."
        );
        logger.error("Resend verification error: ", error);
      } else {
        setVerificationError("");
        setResendCooldown(90);
        startResendTimer();
        Alert.alert(
          "Email Sent",
          "Verification email has been resent. Please check your inbox."
        );
      }
    } catch (err: any) {
      setVerificationError(
        err.message || "An unexpected error occurred. Please try again."
      );
      logger.error("Resend verification exception: ", err);
    } finally {
      setLoading(false);
    }
  };

  // Start resend cooldown timer
  const startResendTimer = () => {
    if (resendTimerRef.current) {
      clearInterval(resendTimerRef.current);
    }

    resendTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) {
            clearInterval(resendTimerRef.current);
            resendTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Check verification status
  const checkVerificationStatus = async () => {
    if (!pendingVerificationEmail) return;

    setIsVerifying(true);
    try {
      // First, refresh the session to get latest user data
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        logger.error("Error getting user: ", userError);
        setIsVerifying(false);
        return;
      }

      // Check if user exists and email is confirmed
      if (currentUser && currentUser.email_confirmed_at) {
        // Email is verified! Get session and proceed
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          logger.error("Error getting session: ", sessionError);
          setIsVerifying(false);
          return;
        }

        // User is verified! Create profile and proceed
        logger.info("✅ Email verified, creating profile...");

        try {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert(
              {
                id: session.user.id,
                onboarding_completed: false,
                onboarding_step: 0,
                first_name: firstName.trim(),
                last_name: lastName.trim(),
              },
              { onConflict: "id" }
            );

          if (profileError) {
            logger.error("Error creating profile: ", profileError);
            setVerificationError(
              "Account verified but failed to set up profile. Please try logging in."
            );
            setIsVerifying(false);
            return;
          }

          logger.info("✅ Profile created successfully");

          // Seed default categories
          try {
            const { seedDefaultCategories } = await import(
              "@/src/utils/categories/seedDefaultCategories"
            );
            await seedDefaultCategories(session.user.id);
          } catch (seedError) {
            logger.error("Error seeding default categories:", seedError);
          }

          // Clear verification state
          setShowVerificationOverlay(false);
          setPendingVerificationEmail(null);
          setIsVerifying(false);

          // Navigate to onboarding
          router.replace("/onboarding-profile" as any);
        } catch (profileError) {
          logger.error("Error creating profile: ", profileError);
          setVerificationError(
            "Account verified but failed to set up profile. Please try logging in."
          );
          setIsVerifying(false);
        }
      } else {
        // User not verified yet, but keep checking
        logger.info("Email not yet verified, will check again...");
        setIsVerifying(false);
      }
    } catch (error) {
      logger.error("Error checking verification: ", error);
      setIsVerifying(false);
    }
  };

  // Show verification overlay after delay
  const showOverlayWithDelay = () => {
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
    }

    overlayTimerRef.current = setTimeout(() => {
      if (pendingVerificationEmail && !showVerificationOverlay) {
        setShowVerificationOverlay(true);
        // Animate overlay in
        Animated.parallel([
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(overlayTranslateY, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }, 5000); // 5 second delay
  };

  // Listen for deep links
  useEffect(() => {
    // Check if app was opened via deep link
    const checkInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && pendingVerificationEmail) {
        logger.info("App opened via deep link:", initialUrl);
        // Small delay to ensure Supabase has processed the verification
        setTimeout(() => {
          checkVerificationStatus();
        }, 1000);
      }
    };

    checkInitialURL();

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      logger.info("Deep link received:", event.url);
      if (pendingVerificationEmail) {
        // Small delay to ensure Supabase has processed the verification
        setTimeout(() => {
          checkVerificationStatus();
        }, 1000);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [pendingVerificationEmail]);

  // Listen for app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active" &&
        pendingVerificationEmail
      ) {
        // App came to foreground, check verification and show overlay
        // Delay to ensure Supabase has synced
        setTimeout(() => {
          checkVerificationStatus();
        }, 500);
        showOverlayWithDelay();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [pendingVerificationEmail]);

  // Listen for auth state changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.info("Auth state changed:", event, session?.user?.email);
      
      if (
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") &&
        session?.user &&
        pendingVerificationEmail
      ) {
        // Check if email is confirmed
        if (session.user.email_confirmed_at) {
          logger.info("✅ Email confirmed via auth state change");
          await checkVerificationStatus();
        } else {
          logger.info("Email not yet confirmed, waiting...");
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pendingVerificationEmail, firstName, lastName]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
      }
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
    };
  }, []);

  // Auto-check verification when overlay is shown
  useEffect(() => {
    if (showVerificationOverlay && pendingVerificationEmail) {
<<<<<<< HEAD
      checkVerificationStatus();
      // Poll every 3 seconds while overlay is visible
      const pollInterval = setInterval(() => {
        checkVerificationStatus();
      }, 3000);
=======
      // Initial check
      checkVerificationStatus();
      // Poll every 2 seconds while overlay is visible (more frequent)
      const pollInterval = setInterval(() => {
        checkVerificationStatus();
      }, 2000);
>>>>>>> 75a8731 (Update signup flow and email verification process)

      return () => clearInterval(pollInterval);
    }
  }, [showVerificationOverlay, pendingVerificationEmail]);

  const handlePrivacyPolicy = async () => {
    const url =
      "https://www.notion.so/Privacy-Policy-for-Financify-20d42b8a2179800682afdf5dc000fcdd?pvs=4";
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: "#4A90E2",
        showTitle: true,
      });
    } catch (error) {
      Alert.alert("Error", "Cannot open privacy policy link");
      logger.error("Failed to open privacy policy:", error);
    }
  };

  const handleTermsConditions = async () => {
    const url =
      "https://www.notion.so/Terms-Conditions-for-Financify-20d42b8a217980cea19ceda310df47c1?pvs=4";
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: "#4A90E2",
        showTitle: true,
      });
    } catch (error) {
      Alert.alert("Error", "Cannot open terms & conditions link");
      logger.error("Failed to open terms & conditions:", error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <LinearGradient
        colors={[
          "rgba(8, 11, 16, 0.99)",
          "rgba(18, 26, 50, 0.95)",
          "rgba(8, 11, 16, 0.99)",
        ]}
        locations={[0, 0.5, 1]}
        style={styles.gradientBackground}
      >
        <LinearGradient
          colors={[
            "rgba(255, 255, 255, 0)",
            "rgba(255, 255, 255, 0.03)",
            "rgba(255, 255, 255, 0)",
          ]}
          style={styles.spotlightContainer}
          locations={[0, 0.5, 1]}
        />
        <IconButton
          icon="chevron-back"
          onPress={handleBack}
          size={22}
          style={styles.backButton}
        />

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.contentContainer}>
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Let's set you up!</Text>
              <Text style={styles.subtitle}>Create your account</Text>
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.nameRow}>
                <View style={styles.nameInputContainer}>
                  <Text style={styles.label}>First</Text>
                  <TextInput
                    style={styles.nameInput}
                    placeholder="John"
                    placeholderTextColor="#666"
                    onChangeText={(text) => {
                      setFirstName(text);
                      setFormError("");
                    }}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    value={firstName}
                  />
                </View>

                <View style={styles.nameInputContainer}>
                  <Text style={styles.label}>Last</Text>
                  <TextInput
                    style={styles.nameInput}
                    placeholder="Doe"
                    placeholderTextColor="#666"
                    onChangeText={(text) => {
                      setLastName(text);
                      setFormError("");
                    }}
                    autoCapitalize="words"
                    autoComplete="family-name"
                    value={lastName}
                  />
                </View>
              </View>

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="john.doe@gmail.com"
                placeholderTextColor="#666"
                onChangeText={(text) => {
                  setEmail(text);
                  setFormError("");
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
              />

              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Create a password"
                  placeholderTextColor="#666"
                  secureTextEntry={!showPassword}
                  onChangeText={(text) => {
                    setPassword(text);
                    setFormError("");
                  }}
                  value={password}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? "eye" : "eye-off"}
                    size={24}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {formError ? (
              <Text style={styles.formErrorText}>{formError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
            >
              <LinearGradient
                colors={["#4A90E2", "#5DA0F2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePrivacyPolicy}>
              <Text style={styles.privacyText}>
                By signing up, you agree to our{" "}
                <Text
                  style={styles.privacyLink}
                  onPress={handleTermsConditions}
                >
                  Terms & Conditions
                </Text>{" "}
                and{" "}
                <Text style={styles.privacyLink} onPress={handlePrivacyPolicy}>
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Verification Overlay */}
        {showVerificationOverlay && (
          <Animated.View
            style={[
              styles.verificationOverlay,
              {
                opacity: overlayOpacity,
                transform: [{ translateY: overlayTranslateY }],
              },
            ]}
          >
            <View style={styles.verificationCard}>
              <View style={styles.verificationHeader}>
                <View style={styles.verificationIconContainer}>
                  <Ionicons name="mail-outline" size={24} color="#4A90E2" />
                </View>
                <Text style={styles.verificationTitle}>Verify Your Email</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => {
                    Animated.parallel([
                      Animated.timing(overlayOpacity, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                      }),
                      Animated.timing(overlayTranslateY, {
                        toValue: -20,
                        duration: 200,
                        useNativeDriver: true,
                      }),
                    ]).start(() => {
                      setShowVerificationOverlay(false);
                    });
                  }}
                >
                  <Ionicons name="close" size={20} color="#999" />
                </TouchableOpacity>
              </View>

              <Text style={styles.verificationMessage}>
                We've sent a verification link to{"\n"}
                <Text style={styles.verificationEmail}>
                  {pendingVerificationEmail}
                </Text>
              </Text>

              {isVerifying && (
                <View style={styles.verifyingContainer}>
                  <ActivityIndicator size="small" color="#4A90E2" />
                  <Text style={styles.verifyingText}>
                    Checking verification...
                  </Text>
                </View>
              )}

              {verificationError ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color="#ff4444" />
                  <Text style={styles.errorText}>{verificationError}</Text>
                </View>
              ) : null}

              <View style={styles.resendContainer}>
                <TouchableOpacity
                  style={[
                    styles.resendButton,
                    (resendCooldown > 0 || loading) &&
                      styles.resendButtonDisabled,
                  ]}
                  onPress={handleResendVerification}
                  disabled={resendCooldown > 0 || loading}
                >
                  <Text style={styles.resendButtonText}>
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend Email"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    flex: 1,
    position: "relative",
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
  scrollContainer: {
    flexGrow: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: "flex-start",
    padding: 24,
    paddingTop: 120,
  },
  headerContainer: {
    marginBottom: 40,
    alignItems: "flex-start",
  },
  title: {
    fontSize: 28,
    color: "#fff",
    textAlign: "left",
    fontWeight: "bold",
    marginBottom: 8,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "left",
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 32,
  },
  nameRow: {
    flexDirection: "row",
    gap: 22,
    marginBottom: 20,
    justifyContent: "space-between",
  },
  nameInputContainer: {
    flex: 1,
    maxWidth: "48%",
  },
  label: {
    color: "#fff",
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  nameInput: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 20,
  },
  passwordInput: {
    flex: 1,
    color: "#fff",
    padding: 16,
    fontSize: 16,
  },
  passwordToggle: {
    padding: 10,
  },
  button: {
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 8,
  },
  gradientButton: {
    padding: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  backButton: {
    position: "absolute",
    top: 52,
    left: 9,
    zIndex: 10,
  },
  formErrorText: {
    color: "#ff4444",
    fontSize: 14,
    textAlign: "left",
    marginBottom: 20,
    marginTop: 5,
  },
  privacyText: {
    textAlign: "left",
    marginTop: 16,
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    lineHeight: 18,
  },
  privacyLink: {
    color: "#007AFF",
    textDecorationLine: "underline",
  },
  verificationOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    zIndex: 1000,
  },
  verificationCard: {
    backgroundColor: "rgba(18, 26, 50, 0.98)",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  verificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  verificationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  verificationTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  verificationMessage: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: 20,
    marginBottom: 16,
    textAlign: "center",
  },
  verificationEmail: {
    color: "#4A90E2",
    fontWeight: "500",
  },
  verifyingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  verifyingText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 68, 68, 0.15)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#ff6b6b",
    lineHeight: 18,
  },
  resendContainer: {
    marginTop: 8,
  },
  resendButton: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    alignItems: "center",
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "600",
  },
});

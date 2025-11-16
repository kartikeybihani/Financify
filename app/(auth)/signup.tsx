import * as React from "react";
import { useState } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/src/lib/supabase/supabase";
import { useRouter } from "expo-router";
// NavigationContext will handle routing automatically based on onboarding status
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/logger";
import * as WebBrowser from "expo-web-browser";
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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {},
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
      Alert.alert(
        "Check your email",
        "We've sent you a confirmation email. Please check your inbox and click the confirmation link to complete your signup.",
        [{ text: "OK" }]
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
});

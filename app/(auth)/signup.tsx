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
import {
  useNavigationContext,
  OnboardingStage,
} from "@/src/contexts/NavigationContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/logger";
import * as WebBrowser from "expo-web-browser";
const { width } = Dimensions.get("window");

export default function SignupScreen() {
  const router = useRouter();
  const { updateOnboardingStage } = useNavigationContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

    setFormError("");
    return true;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { onboarding_complete: false },
      },
    });

    logger.info("Signup data: ", data);

    setLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        setFormError("User with this email already exists. Please login.");
        return;
      }
      return;
    }

    // Set onboarding started flag and update stage
    await AsyncStorage.setItem("onboarding_started", "true");
    await updateOnboardingStage(OnboardingStage.INTENT);
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
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <View style={styles.backButtonContainer}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.contentContainer}>
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Let's set you up!</Text>
              <Text style={styles.subtitle}>Create your account</Text>
            </View>

            <View style={styles.inputContainer}>
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
    top: 60,
    left: 17,
    zIndex: 10,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonContainer: {
    width: 42,
    height: 42,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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

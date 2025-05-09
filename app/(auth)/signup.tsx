import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase/supabase";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
const { width } = Dimensions.get("window");

const MINIMUM_AGE = 18;
const MAXIMUM_AGE = 100;

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formError, setFormError] = useState("");

  // Enhanced animation values
  const fadeAnim = useState(new Animated.Value(1))[0];
  const slideAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(1))[0];

  const animateTransition = (forward = true) => {
    const slideValue = forward ? width : -width;

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: slideValue,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep(forward ? 2 : 1);
      slideAnim.setValue(slideValue * -1);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleContinue = () => {
    if (validateStep1()) {
      animateTransition(true);
    }
  };

  const handleBack = () => {
    animateTransition(false);
  };

  const formatPhoneNumber = (text: string) => {
    const numbers = text.replace(/[^\d]/g, "");
    if (numbers.length <= 3) {
      return numbers;
    } else if (numbers.length <= 6) {
      return `(${numbers.slice(0, 3)})-${numbers.slice(3)}`;
    } else {
      return `(${numbers.slice(0, 3)})-${numbers.slice(3, 6)}-${numbers.slice(
        6,
        10
      )}`;
    }
  };

  const handleAgeChange = (text: string) => {
    const numbersOnly = text.replace(/[^0-9]/g, "");
    setAge(numbersOnly);
  };

  const validateStep1 = () => {
    let isValid = true;
    let errorFields = [];

    if (!name.trim()) {
      errorFields.push("name");
      isValid = false;
    }

    if (!email) {
      errorFields.push("email");
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setFormError("Please enter a valid email address");
      return false;
    }

    if (!password) {
      errorFields.push("password");
      isValid = false;
    } else if (password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return false;
    }

    if (!isValid) {
      setFormError("Please fill out all required fields");
    } else {
      setFormError("");
    }
    return isValid;
  };

  const validateStep2 = () => {
    let isValid = true;
    let errorFields = [];

    if (!age) {
      errorFields.push("age");
      isValid = false;
    } else {
      const ageNum = parseInt(age);
      if (isNaN(ageNum) || ageNum < 18) {
        setFormError("You must be at least 18 years old");
        return false;
      } else if (ageNum > 100) {
        setFormError("Please enter a valid age");
        return false;
      }
    }

    const phoneNumbers = phone.replace(/[^\d]/g, "");
    if (!phone) {
      errorFields.push("phone");
      isValid = false;
    } else if (phoneNumbers.length !== 10) {
      setFormError("Please enter a valid 10-digit phone number");
      return false;
    }

    if (!isValid) {
      setFormError("Please fill out all required fields");
    } else {
      setFormError("");
    }
    return isValid;
  };

  const handleSignUp = async () => {
    if (!validateStep2()) return;

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          age,
          phone_number: phone,
          onboarding_complete: false,
        },
      },
    });

    console.log("Signup data: ", data);

    setLoading(false);

    if (error) {
      Alert.alert("Signup Failed", error.message);
      return;
    }

    // ✅ Save onboarding progress so we can resume if app is closed
    await AsyncStorage.setItem("onboarding_started", "true");

    // ✅ Move to intent screen
    router.replace("/(onboarding)/intent");
  };

  const handlePhoneChange = (text: string) => {
    const formattedNumber = formatPhoneNumber(text);
    if (formattedNumber.replace(/[^\d]/g, "").length <= 10) {
      setPhone(formattedNumber);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <LinearGradient
        colors={["#1A1A2E", "#16213E", "#0D1117"]}
        locations={[0, 0.5, 1]}
        style={styles.gradientBackground}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.contentContainer}>
            <Image
              source={require("../assets/main1.png")}
              style={styles.logo}
              resizeMode="contain"
            />

            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join us today!</Text>

            <Animated.View
              style={[
                styles.inputContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateX: slideAnim }, { scale: scaleAnim }],
                },
              ]}
            >
              {step === 1 ? (
                <>
                  <Text style={styles.label}>Name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      !name.trim() && formError ? styles.inputError : null,
                    ]}
                    placeholder="Kartik Bihani"
                    placeholderTextColor="#666"
                    onChangeText={(text) => {
                      setName(text);
                      setFormError("");
                    }}
                    value={name}
                  />

                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={[
                      styles.input,
                      !email && formError ? styles.inputError : null,
                    ]}
                    placeholder="kb@gmail.com"
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
                  <View
                    style={[
                      styles.passwordContainer,
                      !password && formError ? styles.inputError : null,
                      { marginBottom: 15 },
                    ]}
                  >
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
                </>
              ) : (
                <>
                  <Text style={styles.label}>Age</Text>
                  <TextInput
                    style={[
                      styles.input,
                      !age && formError ? styles.inputError : null,
                    ]}
                    placeholder="24"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    onChangeText={(text) => {
                      handleAgeChange(text);
                      setFormError("");
                    }}
                    value={age}
                    maxLength={3}
                  />

                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={[
                      styles.input,
                      !phone && formError ? styles.inputError : null,
                    ]}
                    placeholder="(123)-456-7890"
                    placeholderTextColor="#666"
                    keyboardType="phone-pad"
                    onChangeText={(text) => {
                      handlePhoneChange(text);
                      setFormError("");
                    }}
                    value={phone}
                  />
                </>
              )}
            </Animated.View>

            {formError ? (
              <Animated.Text
                style={[
                  styles.formErrorText,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateX: slideAnim }],
                  },
                ]}
              >
                {formError}
              </Animated.Text>
            ) : null}

            {step === 2 && (
              <TouchableOpacity
                style={styles.backStepButton}
                onPress={handleBack}
              >
                <Ionicons name="arrow-back" size={18} color="#4A90E2" />
                <Text style={styles.backStepText}>
                  {"Change your details?       "}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={step === 1 ? handleContinue : handleSignUp}
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
                  <Text style={styles.buttonText}>
                    {step === 1 ? "Continue" : "Create Account"}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("../login")}
              style={styles.linkContainer}
            >
              <Text style={styles.linkText}>
                Already have an account?{" "}
                <Text style={styles.linkTextBold}>Login</Text>
              </Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>
              By creating an account, you agree to our{" "}
              <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
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
  },
  scrollContainer: {
    flexGrow: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    paddingTop: 100,
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 10,
  },
  rowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    gap: 5,
  },
  ageColumn: {
    width: "20%",
  },
  phoneColumn: {
    width: "75%",
  },
  label: {
    color: "#fff",
    marginBottom: 6,
    fontSize: 14,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    padding: 16,
    borderRadius: 6,
    marginBottom: 25,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 8,
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
  ageInput: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    padding: 16,
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    height: 50,
    textAlign: "center",
  },
  inputError: {
    borderColor: "#ff4444",
  },
  errorText: {
    color: "#ff4444",
    fontSize: 12,
    marginBottom: 15,
  },
  button: {
    borderRadius: 6,
    overflow: "hidden",
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
  linkContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  linkText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 14,
  },
  linkTextBold: {
    color: "#4A90E2",
    fontWeight: "bold",
  },
  termsText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  termsLink: {
    color: "#4A90E2",
    textDecorationLine: "underline",
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  formErrorText: {
    color: "#ff4444",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 15,
    marginTop: 5,
  },
  backStepButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginBottom: 15,
    gap: 8,
  },
  backStepText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "600",
  },
});

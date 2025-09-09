import React, { useState, useEffect } from "react";
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
  Linking,
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formError, setFormError] = useState("");

  // Finny typing animation states
  const [finnyText, setFinnyText] = useState("");
  const [showFinnyMessage, setShowFinnyMessage] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [showSureButton, setShowSureButton] = useState(false);
  const [autoAdvanceTimer, setAutoAdvanceTimer] =
    useState<NodeJS.Timeout | null>(null);

  // Enhanced animation values
  const fadeAnim = useState(new Animated.Value(1))[0];
  const slideAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(1))[0];
  const finnyFadeAnim = useState(new Animated.Value(1))[0];
  const cursorBlinkAnim = useState(new Animated.Value(1))[0];
  const sureButtonAnim = useState(new Animated.Value(0))[0];
  const sureButtonPulseAnim = useState(new Animated.Value(1))[0];
  const headerSlideAnim = useState(new Animated.Value(0))[0];

  const finnyMessage =
    "Hi! I'm Finny\nI'd love to personalize your experience – mind if I ask a few quick questions?\n";

  // Finny typing animation effect
  useEffect(() => {
    if (step === 1 && showFinnyMessage) {
      setIsTyping(true);
      let currentIndex = 0;

      // Start cursor blinking animation
      const blinkCursor = () => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(cursorBlinkAnim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(cursorBlinkAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      };

      blinkCursor();

      const typeText = () => {
        if (currentIndex < finnyMessage.length) {
          setFinnyText(finnyMessage.substring(0, currentIndex + 1));
          currentIndex++;
          setTimeout(typeText, 30); // Typing speed
        } else {
          setIsTyping(false);
          // Show "Sure thing" button after typing completes
          setTimeout(() => {
            setShowSureButton(true);
            Animated.timing(sureButtonAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }).start(() => {
              // Start subtle pulse animation
              const pulseAnimation = Animated.loop(
                Animated.sequence([
                  Animated.timing(sureButtonPulseAnim, {
                    toValue: 1.05,
                    duration: 1200,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                  }),
                  Animated.timing(sureButtonPulseAnim, {
                    toValue: 1,
                    duration: 1200,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                  }),
                ])
              );
              pulseAnimation.start();
            });

            // Auto-advance after 3 seconds if button not clicked
            const timer = setTimeout(() => {
              handleSureButtonClick();
            }, 2000);
            setAutoAdvanceTimer(timer);
          }, 500);
        }
      };

      typeText();
    }
  }, [step, showFinnyMessage]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
      }
    };
  }, [autoAdvanceTimer]);

  const handleSureButtonClick = () => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      setAutoAdvanceTimer(null);
    }

    // Animate header slide from right to left
    Animated.parallel([
      Animated.timing(finnyFadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(sureButtonAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(headerSlideAnim, {
        toValue: -width,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start(() => {
      setShowFinnyMessage(false);
      setShowSureButton(false);
      // Reset header position and fade in new content
      headerSlideAnim.setValue(width);
      Animated.parallel([
        Animated.timing(headerSlideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const animateTransition = (targetStep: number) => {
    const forward = targetStep > step;
    const slideValue = forward ? -width : width;

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
      setStep(targetStep);
      // Set the starting position for the new content
      slideAnim.setValue(forward ? width : -width);

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
    if (step === 1 && validateStep1()) {
      animateTransition(2);
    } else if (step === 2 && validateStep2()) {
      animateTransition(3);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      router.back(); // Exit signup flow
    } else if (step === 2) {
      animateTransition(1);
    } else if (step === 3) {
      animateTransition(2);
    }
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

    if (!firstName.trim()) {
      errorFields.push("firstName");
      isValid = false;
    }

    if (!lastName.trim()) {
      errorFields.push("lastName");
      isValid = false;
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

  const validateStep3 = () => {
    let isValid = true;
    let errorFields = [];

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

  const handleSignUp = async () => {
    if (!validateStep3()) return;

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: `${firstName} ${lastName}`.trim(),
          age,
          phone_number: phone,
          onboarding_complete: false,
        },
      },
    });

    console.log("Signup data: ", data);

    setLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        setFormError("User with this email already exists. Please login.");
        return;
      }
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

  const handlePrivacyPolicy = async () => {
    const url =
      "https://www.notion.so/Privacy-Policy-for-Financify-20d42b8a2179800682afdf5dc000fcdd?pvs=4";
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Error", "Cannot open privacy policy link");
    }
  };

  const handleTermsConditions = async () => {
    const url =
      "https://www.notion.so/Terms-Conditions-for-Financify-20d42b8a217980cea19ceda310df47c1?pvs=4";
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Error", "Cannot open terms & conditions link");
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
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.contentContainer}>
            <Animated.View
              style={[
                styles.headerContainer,
                {
                  transform: [{ translateX: step === 1 ? headerSlideAnim : 0 }],
                },
              ]}
            >
              {step === 1 && showFinnyMessage ? (
                <Animated.Text
                  style={[styles.finnyMessage, { opacity: finnyFadeAnim }]}
                >
                  {finnyText}
                  {isTyping && (
                    <Animated.Text
                      style={[
                        styles.typingCursor,
                        { opacity: cursorBlinkAnim },
                      ]}
                    >
                      |
                    </Animated.Text>
                  )}
                </Animated.Text>
              ) : (
                <Text style={styles.title}>
                  {step === 1
                    ? "What's your name?"
                    : step === 2
                    ? "Let's learn more about you"
                    : "Let's set you up!"}
                </Text>
              )}
              <Text style={styles.subtitle}>
                {step === 1 && !showFinnyMessage && "Just getting to know you."}
                {step === 2 && "Tell us a bit about yourself"}
                {step === 3 && "Almost there!"}
              </Text>
            </Animated.View>

            {step === 1 && showSureButton && (
              <Animated.View
                style={[
                  styles.sureButtonContainer,
                  {
                    opacity: sureButtonAnim,
                    transform: [
                      { scale: sureButtonAnim },
                      { scale: sureButtonPulseAnim },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.sureButton}
                  onPress={handleSureButtonClick}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={["#4A90E2", "#4A90E2"]}
                    locations={[0, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sureButtonGradient}
                  >
                    <Text style={styles.sureButtonText}>Let's get started</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            <Animated.View
              style={[
                styles.inputContainer,
                {
                  opacity: showFinnyMessage ? 0 : fadeAnim,
                  transform: [{ translateX: slideAnim }, { scale: scaleAnim }],
                },
              ]}
            >
              {step === 1 && (
                <>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    style={[styles.input]}
                    placeholder="Kartik"
                    placeholderTextColor="#666"
                    onChangeText={(text) => {
                      setFirstName(text);
                      setFormError("");
                    }}
                    value={firstName}
                  />

                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    style={[styles.input]}
                    placeholder="Bihani"
                    placeholderTextColor="#666"
                    onChangeText={(text) => {
                      setLastName(text);
                      setFormError("");
                    }}
                    value={lastName}
                  />
                </>
              )}

              {step === 2 && (
                <>
                  <Text style={styles.label}>Age</Text>
                  <TextInput
                    style={[styles.input]}
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
                  <View style={styles.phoneInputContainer}>
                    <View style={styles.countryCode}>
                      <Text style={styles.flag}>🇺🇸</Text>
                      <Text style={styles.countryPrefix}>+1</Text>
                    </View>
                    <TextInput
                      style={[styles.phoneInput]}
                      placeholder="(123) 456-7890"
                      placeholderTextColor="#666"
                      keyboardType="phone-pad"
                      onChangeText={(text) => {
                        handlePhoneChange(text);
                        setFormError("");
                      }}
                      value={phone}
                    />
                  </View>
                </>
              )}

              {step === 3 && (
                <>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={[styles.input]}
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
                    style={[styles.passwordContainer, { marginBottom: 15 }]}
                  >
                    <TextInput
                      style={[styles.passwordInput]}
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
              )}
            </Animated.View>

            {formError ? (
              <Animated.Text
                style={[
                  styles.formErrorText,
                  {
                    opacity: showFinnyMessage ? 0 : fadeAnim,
                    transform: [{ translateX: slideAnim }],
                  },
                ]}
              >
                {formError}
              </Animated.Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.button,
                loading && styles.buttonDisabled,
                { opacity: showFinnyMessage ? 0 : 1 },
              ]}
              onPress={step === 3 ? handleSignUp : handleContinue}
              disabled={loading || showFinnyMessage}
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
                    {step === 1 && "Continue"}
                    {step === 2 && "Continue"}
                    {step === 3 && "Create Account"}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {step === 3 && (
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
                  <Text
                    style={styles.privacyLink}
                    onPress={handlePrivacyPolicy}
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </TouchableOpacity>
            )}
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
  finnyMessage: {
    fontSize: 28,
    color: "#fff",
    textAlign: "left",
    fontWeight: "600",
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
    textAlign: "left",
    marginBottom: 20,
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
  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 20,
  },
  countryCode: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.1)",
  },
  flag: {
    fontSize: 20,
    marginRight: 6,
  },
  countryPrefix: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  phoneInput: {
    flex: 1,
    color: "#fff",
    padding: 16,
    fontSize: 16,
  },
  typingCursor: {
    color: "#4A90E2",
    fontSize: 23,
    fontWeight: "bold",
  },
  sureButtonContainer: {
    alignItems: "center",
    marginVertical: 20,
  },
  sureButton: {
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
    elevation: 2,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: "hidden",
  },
  sureButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  sureButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

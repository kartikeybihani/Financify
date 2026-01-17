import React, { useState } from "react";
import {
  View,
  Alert,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Text,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import AuthTemplate from "@/src/components/auth/AuthTemplate";
import AuthInput from "@/src/components/auth/AuthInput";
import AuthButton from "@/src/components/auth/AuthButton";

const { width } = Dimensions.get("window");

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [step, setStep] = useState(1);
  const [resetEmail, setResetEmail] = useState("");

  // Animation values
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
        toValue: -slideValue,
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
      slideAnim.setValue(slideValue);

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

  const validateForm = () => {
    if (!email && !password) {
      setFormError("Please fill out all required fields");
      return false;
    }

    if (!email) {
      setFormError("Please enter your email");
      return false;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setFormError("Please enter a valid email address");
      return false;
    }

    if (!password) {
      setFormError("Please enter your password");
      return false;
    }

    setFormError("");
    return true;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setFormError("Invalid email or password");
      } else {
        setFormError(error.message);
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        logger.info("User logged in:", user.email);
      }
      // Auth listener will trigger navigation via context
      // The context will redirect to /(tabs) which defaults to home
      // Navigate to root so index.tsx can handle the redirect
      router.replace("/" as any);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      setFormError("Please enter your email address");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(resetEmail)) {
      setFormError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
    setLoading(false);

    if (error) {
      setFormError(error.message);
    } else {
      Alert.alert(
        "Password Reset Email Sent",
        "Check your email for password reset instructions.",
        [{ text: "OK", onPress: () => animateTransition(false) }]
      );
    }
  };

  const handleTransition = (forward: boolean) => {
    setFormError(""); // Clear error when transitioning
    animateTransition(forward);
  };

  return (
    <AuthTemplate
      title={step === 1 ? "Welcome Back" : "Reset Password"}
      subtitle={
        step === 1
          ? "Sign in to continue"
          : "Enter your email to reset password"
      }
      showFooter={false}
      footerLinkText="Don't have an account?"
      footerLinkHighlight="Sign up"
      footerLinkAction={() => router.push("../signup")}
      backgroundColors={[
        "rgba(8, 11, 16, 0.99)",
        "rgba(18, 26, 50, 0.95)",
        "rgba(8, 11, 16, 0.99)",
      ]}
      spotlightColors={[
        "rgba(255, 255, 255, 0)",
        "rgba(255, 255, 255, 0.03)",
        "rgba(255, 255, 255, 0)",
      ]}
    >
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
            <AuthInput
              label="Email"
              placeholder="kb@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setFormError("");
              }}
              error={!email && !!formError}
            />

            <AuthInput.Password
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setFormError("");
              }}
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              error={!password && !!formError}
            />
          </>
        ) : (
          <AuthInput
            label="Email"
            placeholder="kb@gmail.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={resetEmail}
            onChangeText={(text) => {
              setResetEmail(text);
              setFormError("");
            }}
            error={!resetEmail && !!formError}
          />
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

      <AuthButton
        title={step === 1 ? "Login" : "Reset Password"}
        loading={loading}
        onPress={step === 1 ? handleLogin : handleForgotPassword}
      />

      <View style={{ marginTop: 10 }}>
        {step === 1 ? (
          <AuthButton
            title="Forgot Password?"
            variant="text"
            onPress={() => handleTransition(true)}
            style={styles.forgotPasswordButton}
          />
        ) : (
          <View style={{ marginTop: 10 }}>
            <AuthButton
              title="Go Back"
              variant="text"
              onPress={() => handleTransition(false)}
              icon="arrow-back"
            />
          </View>
        )}
      </View>

      {step === 1 && (
        <TouchableOpacity
          onPress={() => router.push("../signup")}
          style={styles.linkContainer}
        >
          <Text style={styles.linkText}>
            Don't have an account?{" "}
            <Text style={styles.linkTextBold}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      )}
    </AuthTemplate>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    marginBottom: 10,
  },
  formErrorText: {
    color: "#ff4444",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 15,
    marginTop: 5,
  },
  forgotPasswordButton: {
    marginTop: 15,
  },
  linkContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  linkText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 14,
  },
  linkTextBold: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  goBackButton: {
    fontSize: 20,
  },
});

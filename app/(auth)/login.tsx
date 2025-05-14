import React, { useState } from "react";
import {
  View,
  Alert,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase/supabase";
import AuthTemplate from "../components/auth/AuthTemplate";
import AuthInput from "../components/auth/AuthInput";
import AuthButton from "../components/auth/AuthButton";

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
      // Fetch user and log email
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        console.log("User logged in:", user.email);
      }
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

  return (
    <AuthTemplate
      title={step === 1 ? "Welcome Back" : "Reset Password"}
      subtitle={
        step === 1
          ? "Sign in to continue"
          : "Enter your email to reset password"
      }
      showFooter={step === 1}
      footerLinkText="Don't have an account?"
      footerLinkHighlight="Sign up"
      footerLinkAction={() => router.replace("../signup")}
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

            <AuthButton
              title="Forgot Password?"
              variant="text"
              onPress={() => animateTransition(true)}
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

      {step === 2 && (
        <View style={{ marginTop: 10 }}>
          <AuthButton
            title="Go Back"
            variant="text"
            onPress={() => animateTransition(false)}
            icon="arrow-back"
          />
        </View>
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
});

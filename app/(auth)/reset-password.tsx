import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Animated, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import AuthTemplate from "@/src/components/auth/AuthTemplate";
import AuthInput from "@/src/components/auth/AuthInput";
import AuthButton from "@/src/components/auth/AuthButton";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { consumeLastDeepLink } from "@/src/utils/linking/linkingStore";
import { setRecoveryInProgress } from "@/src/utils/auth/recoveryState";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";

const MIN_PASSWORD_LENGTH = 8;
const APP_SCHEME = "finny";

const parseTokensFromUrl = (url: string) => {
  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams ?? {};

  const hash = url.split("#")[1];
  if (hash) {
    const hashParams = Object.fromEntries(
      hash.split("&").map((pair) => {
        const [key, value] = pair.split("=");
        return [key, value ? decodeURIComponent(value) : ""];
      })
    );
    return { params: { ...queryParams, ...hashParams }, scheme: parsed.scheme };
  }

  return { params: queryParams, scheme: parsed.scheme };
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { refreshNavigationState } = useAuthNavigation();

  useEffect(() => {
    logger.info("🔐 ResetPasswordScreen mounted");
    return () => {
      setRecoveryInProgress(false);
      logger.info("🔐 ResetPasswordScreen unmounted");
    };
  }, []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const fadeAnim = useMemo(() => new Animated.Value(1), []);

  const validateForm = () => {
    if (!password || !confirmPassword) {
      setFormError("Please enter and confirm your new password");
      return false;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      );
      return false;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return false;
    }

    setFormError("");
    return true;
  };

  const animateFade = useCallback(
    (toValue: number) => {
      Animated.timing(fadeAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }).start();
    },
    [fadeAnim]
  );

  const handleUrl = useCallback(
    async (url: string) => {
      logger.info("🔐 ResetPasswordScreen received link", { url });
      setRecoveryInProgress(true);
      const { params, scheme } = parseTokensFromUrl(url);
      const accessToken = params.access_token as string | undefined;
      const refreshToken = params.refresh_token as string | undefined;

      if (scheme && scheme !== APP_SCHEME) {
        logger.warn("Reset link scheme mismatch", {
          scheme,
          expected: APP_SCHEME,
        });
      }

      const code = params.code as string | undefined;
      if (code) {
        try {
          setIsReady(false);
          animateFade(0.7);
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            logger.error("Failed to exchange code for session", error);
            setFormError(
              error.message || "We couldn't verify your reset link. Try again."
            );
            setSessionReady(false);
          } else {
            logger.info("🔐 ResetPasswordScreen exchange code succeeded");
            await new Promise((resolve) => setTimeout(resolve, 500));
            setFormError("");
            setSessionReady(true);
          }
        } finally {
          setIsReady(true);
          animateFade(1);
        }
        return;
      }

      if (!accessToken || !refreshToken) {
        logger.warn("Reset password link missing both code and tokens", {
          url,
        });
        setFormError(
          "This reset link is missing required tokens. Please request a new password reset email."
        );
        setSessionReady(false);
        setIsReady(true);
        return;
      }

      try {
        setIsReady(false);
        animateFade(0.7);
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          logger.error("Failed to set reset session", error);
          setFormError(
            error.message || "We couldn't open your reset link. Try again."
          );
          setSessionReady(false);
        } else {
          setFormError("");
          setSessionReady(true);
        }
      } finally {
        setIsReady(true);
        animateFade(1);
      }
    },
    [animateFade]
  );

  useEffect(() => {
    let isMounted = true;

    const handleInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const storedUrl = consumeLastDeepLink();
        logger.info("🔐 ResetPasswordScreen initial URL", {
          initialUrl,
          storedUrl,
        });
        const resolvedUrl = initialUrl ?? storedUrl;
        if (resolvedUrl && isMounted) {
          await handleUrl(resolvedUrl);
        } else if (isMounted) {
          setIsReady(true);
        }
      } catch (error) {
        logger.error("Failed to read initial reset link", error);
        if (isMounted) {
          setIsReady(true);
          setFormError("Unable to read reset link. Please try again.");
        }
      }
    };

    const subscription = Linking.addEventListener("url", ({ url }) => {
      logger.info("🔐 ResetPasswordScreen link event", { url });
      handleUrl(url);
    });

    handleInitialUrl();

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [handleUrl]);

  const handleSubmit = async () => {
    if (!sessionReady) {
      setFormError("Reset link not ready yet. Please try again.");
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      setFormError(error.message || "Unable to update password.");
      return;
    }

    Alert.alert("Password Updated", "You're all set!", [
      {
        text: "Continue",
        onPress: async () => {
          logger.info("🔐 ResetPasswordScreen navigating to app after update");
          setRecoveryInProgress(false);
          await refreshNavigationState();
          router.replace("/");
        },
      },
    ]);
  };

  const subtitle = sessionReady
    ? "Create a new password to access your account"
    : "Open the reset link from your email to continue";

  return (
    <AuthTemplate
      title="Set New Password"
      subtitle={subtitle}
      showFooter={false}
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
      <Animated.View style={{ opacity: fadeAnim }}>
        <AuthInput.Password
          label="New Password"
          placeholder="Enter a new password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setFormError("");
          }}
          autoCapitalize="none"
          showPassword={showPassword}
          onTogglePassword={() => setShowPassword((value) => !value)}
        />

        <AuthInput.Password
          label="Confirm Password"
          placeholder="Re-enter your new password"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            setFormError("");
          }}
          autoCapitalize="none"
          showPassword={showConfirmPassword}
          onTogglePassword={() => setShowConfirmPassword((value) => !value)}
        />

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <AuthButton
          title={sessionReady ? "Update Password" : "Waiting for reset link"}
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!isReady || !sessionReady || isSubmitting}
          style={styles.primaryButton}
        />
      </Animated.View>
    </AuthTemplate>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: "#FF6B6B",
    marginBottom: 12,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 8,
  },
});

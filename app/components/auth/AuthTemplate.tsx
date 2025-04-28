import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

interface AuthTemplateProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  showFooter?: boolean;
  footerLinkText?: string;
  footerLinkAction?: () => void;
  footerLinkHighlight?: string;
}

export default function AuthTemplate({
  title,
  subtitle,
  children,
  showFooter = true,
  footerLinkText = "",
  footerLinkAction,
  footerLinkHighlight = "",
}: AuthTemplateProps) {
  const router = useRouter();

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

        <View style={styles.contentContainer}>
          <Image
            source={require("../../assets/main1.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {children}

          {showFooter && (
            <>
              <TouchableOpacity
                onPress={footerLinkAction}
                style={styles.linkContainer}
              >
                <Text style={styles.linkText}>
                  {footerLinkText}{" "}
                  <Text style={styles.linkTextBold}>{footerLinkHighlight}</Text>
                </Text>
              </TouchableOpacity>

              <Text style={styles.termsText}>
                By continuing, you agree to our{" "}
                <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </>
          )}
        </View>
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
});

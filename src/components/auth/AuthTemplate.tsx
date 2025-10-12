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

const { width } = Dimensions.get("window");

interface AuthTemplateProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  showFooter?: boolean;
  footerLinkText?: string;
  footerLinkAction?: () => void;
  footerLinkHighlight?: string;
  backgroundColors?: [string, string, string];
  spotlightColors?: [string, string, string];
}

export default function AuthTemplate({
  title,
  subtitle,
  children,
  showFooter = true,
  footerLinkText = "",
  footerLinkAction,
  footerLinkHighlight = "",
  backgroundColors = ["#1A1A2E", "#16213E", "#0D1117"] as [
    string,
    string,
    string
  ],
  spotlightColors,
}: AuthTemplateProps) {
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <LinearGradient
        colors={backgroundColors as readonly [string, string, string]}
        locations={[0, 0.5, 1]}
        style={styles.gradientBackground}
      >
        {spotlightColors && (
          <LinearGradient
            colors={spotlightColors as readonly [string, string, string]}
            style={styles.spotlightContainer}
            locations={[0, 0.5, 1]}
          />
        )}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <View style={styles.backButtonContainer}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={styles.contentContainer}>
          <Image
            source={require("../../../assets/images/main1.png")}
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
    left: 18,
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
});

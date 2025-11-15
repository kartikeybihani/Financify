import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";

interface LegalSummaryScreenProps {
  onBack: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// Responsive calculations
const isSmallScreen = screenWidth < 375;
const isLargeScreen = screenWidth >= 414;

const responsiveFontSize = (baseSize: number) => {
  if (isSmallScreen) return baseSize * 0.9;
  if (isLargeScreen) return baseSize * 1.1;
  return baseSize;
};

const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.8;
  if (isLargeScreen) return basePadding * 1.2;
  return basePadding;
};

const styles = {
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: responsivePadding(16),
    paddingTop: Platform.OS === "ios" ? 8 : 12,
    paddingBottom: 10,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 30, 30, 0.8)",
  },
  headerTitle: {
    fontSize: responsiveFontSize(18),
    fontWeight: "600" as const,
    color: "#fff",
    letterSpacing: 0.5,
    flex: 1,
    textAlign: "center" as const,
  },
  backButton: {
    padding: 8,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  content: {
    flex: 1,
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(20),
  },
  section: {
    marginBottom: responsivePadding(20),
  },
  paragraph: {
    fontSize: responsiveFontSize(15),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
    marginBottom: responsivePadding(16),
  },
  dataListContainer: {
    marginTop: responsivePadding(8),
  },
  bulletPoint: {
    flexDirection: "row" as const,
    marginBottom: responsivePadding(8),
    paddingLeft: responsivePadding(16),
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4A90E2",
    marginTop: responsivePadding(8),
    marginRight: responsivePadding(12),
  },
  bulletText: {
    fontSize: responsiveFontSize(15),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
    flex: 1,
  },
  linkText: {
    fontSize: responsiveFontSize(15),
    color: "#4A90E2",
    lineHeight: responsiveFontSize(22),
    textDecorationLine: "underline" as const,
  },
  clickableLink: {
    fontSize: responsiveFontSize(15),
    color: "#4A90E2",
    lineHeight: responsiveFontSize(22),
    textDecorationLine: "underline" as const,
    fontWeight: "500" as const,
  },
  regularText: {
    fontSize: responsiveFontSize(15),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
  },
  highlightText: {
    color: "#4A90E2",
    fontWeight: "600" as const,
  },
  dataProtectionBox: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderRadius: 12,
    padding: responsivePadding(16),
    marginTop: responsivePadding(16),
    marginBottom: responsivePadding(20),
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  dataProtectionTitle: {
    fontSize: responsiveFontSize(16),
    color: "#22C55E",
    fontWeight: "600" as const,
    marginBottom: responsivePadding(8),
  },
  dataProtectionText: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.9)",
    lineHeight: responsiveFontSize(20),
  },
  bottomPadding: {
    height: responsivePadding(40),
  },
};

export default function LegalSummaryScreen({
  onBack,
}: LegalSummaryScreenProps) {
  const insets = useSafeAreaInsets();

  const openLink = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error("Error opening link:", error);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={[
                "rgba(255, 255, 255, 0.15)",
                "rgba(255, 255, 255, 0.05)",
              ]}
              style={styles.backButtonCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Legal Summary</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Data Privacy Philosophy */}
          <View style={styles.section}>
            <Text style={styles.paragraph}>
              We understand that few things are more personal than your
              financial data. We strive to offer you the transparency and
              controls to manage your data effectively and securely.
            </Text>
          </View>

          {/* Data Usage Introduction */}
          <View style={styles.section}>
            <Text style={styles.paragraph}>
              Finny uses data from your connected accounts and interactions to
              offer you a personalized financial experience. This data includes:
            </Text>

            <View style={styles.dataListContainer}>
              <View style={styles.bulletPoint}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>
                  Account balances and transaction history
                </Text>
              </View>
              <View style={styles.bulletPoint}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>
                  Spending patterns and financial goals
                </Text>
              </View>
              <View style={styles.bulletPoint}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>
                  Profile information and preferences
                </Text>
              </View>
              <View style={styles.bulletPoint}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>
                  Conversations and interactions with Finny
                </Text>
              </View>
            </View>
          </View>

          {/* Data Protection Guarantee */}
          <View style={styles.dataProtectionBox}>
            <Text style={styles.dataProtectionTitle}>
              🛡️ Your Data is Protected
            </Text>
            <Text style={styles.dataProtectionText}>
              We never sell your personal or financial data to third parties.
              Your information is encrypted, securely stored, and used solely to
              provide you with personalized financial insights and
              recommendations.
            </Text>
          </View>

          {/* User Control */}
          <View style={styles.section}>
            <Text style={styles.paragraph}>
              Information you share with Finny is stored as memories to provide
              better personalized assistance. You can view, edit, and delete
              these memories anytime in your settings, and this will shape your
              future interactions with Finny.
            </Text>
          </View>

          {/* Further Information Links */}
          <View style={{ marginTop: responsivePadding(8) }}>
            <Text style={styles.paragraph}>
              For more detailed information on how we protect your data and our
              complete terms of service, please refer to our{" "}
              <Text
                style={styles.clickableLink}
                onPress={() =>
                  openLink(
                    "https://www.notion.so/Privacy-Policy-for-Financify-20d42b8a2179800682afdf5dc000fcdd?source=copy_link"
                  )
                }
              >
                Privacy Policy
              </Text>{" "}
              and{" "}
              <Text
                style={styles.clickableLink}
                onPress={() =>
                  openLink(
                    "https://www.notion.so/Terms-Conditions-for-Financify-20d42b8a217980cea19ceda310df47c1?pvs=4"
                  )
                }
              >
                Terms of Service
              </Text>
              .
            </Text>

            <Text style={styles.paragraph}>
              If you have questions about how Finny works or need help with your
              account, please visit our{" "}
              <Text
                style={styles.clickableLink}
                onPress={() => openLink("https://financify.ing")}
              >
                Help Center
              </Text>{" "}
              or contact our support team.
            </Text>
          </View>

          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

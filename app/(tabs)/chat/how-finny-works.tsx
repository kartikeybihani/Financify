import React from "react";
import { View, Text, ScrollView, Platform, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ChatScreenHeader from "@/src/components/shared/ChatScreenHeader";

interface HowFinnyWorksScreenProps {
  onBack?: () => void;
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
  content: {
    flex: 1,
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(20),
  },
  section: {
    marginBottom: responsivePadding(24),
  },
  sectionTitle: {
    fontSize: responsiveFontSize(18),
    fontWeight: "700" as const,
    color: "#4A90E2",
    marginBottom: responsivePadding(12),
    letterSpacing: 0.3,
  },
  paragraph: {
    fontSize: responsiveFontSize(16),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
    marginBottom: responsivePadding(16),
  },
  featureListContainer: {
    marginTop: responsivePadding(8),
  },
  featureItem: {
    flexDirection: "row" as const,
    marginBottom: responsivePadding(12),
    paddingLeft: responsivePadding(16),
  },
  featureIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4A90E2",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: responsivePadding(12),
    marginTop: 2,
  },
  featureText: {
    fontSize: responsiveFontSize(15),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
    flex: 1,
  },
  highlightBox: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderRadius: 12,
    padding: responsivePadding(16),
    marginTop: responsivePadding(16),
    marginBottom: responsivePadding(20),
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  highlightTitle: {
    fontSize: responsiveFontSize(16),
    color: "#4A90E2",
    fontWeight: "600" as const,
    marginBottom: responsivePadding(8),
  },
  highlightText: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.9)",
    lineHeight: responsiveFontSize(20),
  },
  dataFlowBox: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderRadius: 12,
    padding: responsivePadding(16),
    marginTop: responsivePadding(5),
    marginBottom: responsivePadding(20),
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  dataFlowTitle: {
    fontSize: responsiveFontSize(16),
    color: "#22C55E",
    fontWeight: "600" as const,
    marginBottom: responsivePadding(8),
  },
  dataFlowText: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.9)",
    lineHeight: responsiveFontSize(20),
  },
  stepContainer: {
    marginBottom: responsivePadding(5),
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#4A90E2",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: responsivePadding(12),
  },
  stepNumberText: {
    fontSize: responsiveFontSize(12),
    color: "#fff",
    fontWeight: "600" as const,
  },
  stepContent: {
    flex: 1,
    flexDirection: "row" as const,
  },
  stepText: {
    fontSize: responsiveFontSize(15),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
    flex: 1,
  },
  bottomPadding: {
    height: responsivePadding(40),
  },
};

export default function HowFinnyWorksScreen({
  onBack,
}: HowFinnyWorksScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <ChatScreenHeader title="How Finny Works" onBack={onBack} />

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Introduction */}
          <View style={styles.section}>
            <Text style={styles.paragraph}>
              Finny is your AI-powered money coach that helps you understand
              your money, make better financial decisions, and achieve your
              goals. Here's how it works:
            </Text>
          </View>

          {/* How It Works Process */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚡ How It Works</Text>

            <View style={styles.stepContainer}>
              <View style={{ flexDirection: "row" as const }}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>
                    <Text style={{ fontWeight: "600" }}>
                      Connect Your Accounts:
                    </Text>{" "}
                    Securely link your bank accounts, credit cards, and
                    investment accounts through Plaid
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.stepContainer}>
              <View style={{ flexDirection: "row" as const }}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>
                    <Text style={{ fontWeight: "600" }}>Data Analysis:</Text>{" "}
                    Finny automatically categorizes your transactions and
                    identifies spending patterns
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.stepContainer}>
              <View style={{ flexDirection: "row" as const }}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>
                    <Text style={{ fontWeight: "600" }}>
                      Personalized Guidance:
                    </Text>{" "}
                    Get tailored recommendations based on your financial
                    behavior and goals
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.stepContainer}>
              <View style={{ flexDirection: "row" as const }}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>4</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>
                    <Text style={{ fontWeight: "600" }}>
                      Continuous Learning:
                    </Text>{" "}
                    Finny remembers your preferences and gets smarter with each
                    interaction
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Data Processing */}
          <View style={styles.dataFlowBox}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="lock-closed"
                size={18}
                color="#22C55E"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.dataFlowTitle}>
                Data Processing & Privacy
              </Text>
            </View>
            <Text style={styles.dataFlowText}>
              Your financial data is encrypted and processed securely. Finny
              uses advanced AI to understand your spending habits, but your
              personal information is never shared with third parties. All data
              processing happens in compliance with financial industry
              standards.
            </Text>
          </View>

          {/* Getting Started */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              🚀 Get the most out of Finny
            </Text>
            <Text style={styles.paragraph}>
              To get the most out of Finny, the more information you provide
              about your financial situation, life, and goals, the better Finny
              can assist you with personalized guidance and recommendations.
            </Text>
            <Text style={styles.paragraph}>
              Don't hesitate to ask questions - Finny is designed to make
              financial management simple and accessible for everyone,
              regardless of your financial knowledge level.
            </Text>
          </View>

          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

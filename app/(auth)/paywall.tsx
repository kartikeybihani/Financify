"use client";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Dimensions,
  Animated,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useState, useRef, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const FEATURE_CARD_WIDTH = SCREEN_WIDTH - 48;
const FEATURE_ROTATION_INTERVAL = 4000; // 4 seconds per feature

interface Feature {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: [string, string];
}

const FEATURES: Feature[] = [
  {
    id: "ai-planning",
    title: "AI-Powered Financial Planning",
    subtitle: "Your personal finance coach",
    description:
      "Finny sets up your budget automatically and answers any question about your finances. Build wealth with AI that teaches you how to build wealth.",
    icon: "sparkles",
    gradient: ["rgba(74, 144, 226, 0.2)", "rgba(93, 160, 242, 0.1)"],
  },
  {
    id: "goals-timeline",
    title: "Goals & Golden Timeline",
    subtitle: "Visualize your financial future",
    description:
      "Set and track your financial goals with a beautiful timeline. See your progress toward emergency funds, vacations, homes, and retirement.",
    icon: "trophy",
    gradient: ["rgba(255, 193, 7, 0.2)", "rgba(255, 152, 0, 0.1)"],
  },
  {
    id: "money-advisor",
    title: "Your Money Advisor",
    subtitle: "Coaching that actually helps",
    description:
      "Get personalized advice on building wealth and managing money. No overwhelming dashboards—just clear guidance when you need it.",
    icon: "person",
    gradient: ["rgba(156, 39, 176, 0.2)", "rgba(123, 31, 162, 0.1)"],
  },
  {
    id: "clean-interface",
    title: "Clean & Simple",
    subtitle: "No more financial overwhelm",
    description:
      "A clean manager that focuses on what matters. Manage your money without drowning in charts and complex dashboards.",
    icon: "layers",
    gradient: ["rgba(76, 175, 80, 0.2)", "rgba(56, 142, 60, 0.1)"],
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<"annual" | "monthly">(
    "annual",
  );
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);
  const [toggleWidth, setToggleWidth] = useState(0);

  // Animation refs
  const scrollX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const featureScaleAnim = useRef(new Animated.Value(0.95)).current;
  const toggleAnim = useRef(new Animated.Value(1)).current;

  // Auto-rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeatureIndex((prev) => (prev + 1) % FEATURES.length);
    }, FEATURE_ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Animate feature change
  useEffect(() => {
    Animated.parallel([
      Animated.timing(featureScaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Reset for next animation
    const timer = setTimeout(() => {
      featureScaleAnim.setValue(0.95);
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }, FEATURE_ROTATION_INTERVAL - 300);

    return () => clearTimeout(timer);
  }, [currentFeatureIndex]);

  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: selectedPlan === "annual" ? 1 : 0,
      tension: 120,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [selectedPlan, toggleAnim]);

  const handleSubscribe = () => {
    // TODO: Implement subscription logic
    console.log(`Subscribing to ${selectedPlan} plan`);
  };

  const currentFeature = FEATURES[currentFeatureIndex];
  const toggleTranslateX = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(toggleWidth - 8, 0) / 2],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[
          "rgba(10, 14, 20, 0.98)",
          "rgba(22, 33, 62, 0.92)",
          "rgba(10, 14, 20, 0.98)",
        ]}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: 30,
              paddingBottom: insets.bottom + 20,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerBrand}>Finny</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name="close"
                size={21}
                color="rgba(255, 255, 255, 0.8)"
              />
            </TouchableOpacity>
          </View>

          {/* Feature Showcase Section */}
          <View style={styles.featureSection}>
            <Animated.View
              style={[
                styles.featureCard,
                {
                  opacity: fadeAnim,
                  transform: [
                    { translateX: slideAnim },
                    { scale: featureScaleAnim },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={currentFeature.gradient}
                style={styles.featureGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <BlurView intensity={20} style={styles.featureBlur}>
                  <View style={styles.featureIconContainer}>
                    <LinearGradient
                      colors={["#4A90E2", "#5DA0F2"]}
                      style={styles.featureIconGradient}
                    >
                      <Ionicons
                        name={currentFeature.icon}
                        size={28}
                        color="#fff"
                      />
                    </LinearGradient>
                  </View>
                  <Text style={styles.featureTitle}>
                    {currentFeature.title}
                  </Text>
                  <Text style={styles.featureSubtitle}>
                    {currentFeature.subtitle}
                  </Text>
                  <Text style={styles.featureDescription}>
                    {currentFeature.description}
                  </Text>
                </BlurView>
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Pricing Section */}
          <View style={styles.pricingSection}>
            <Text style={styles.pricingTitle}>Choose Your Plan</Text>
            <Text style={styles.pricingSubtitle}>
              Start your 30 days free trial
            </Text>

            <View style={styles.planToggle}>
              <BlurView intensity={24} style={styles.planToggleBlur}>
                <View
                  style={styles.planToggleInner}
                  onLayout={(event) =>
                    setToggleWidth(event.nativeEvent.layout.width)
                  }
                >
                  {toggleWidth > 0 && (
                    <Animated.View
                      style={[
                        styles.togglePill,
                        {
                          width: (toggleWidth - 8) / 2,
                          transform: [{ translateX: toggleTranslateX }],
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={["#4A90E2", "#5DA0F2"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.togglePillGradient}
                      />
                    </Animated.View>
                  )}
                  <TouchableOpacity
                    style={styles.toggleOption}
                    onPress={() => setSelectedPlan("monthly")}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        selectedPlan === "monthly" && styles.toggleTextActive,
                      ]}
                    >
                      Monthly
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toggleOption}
                    onPress={() => setSelectedPlan("annual")}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        selectedPlan === "annual" && styles.toggleTextActive,
                      ]}
                    >
                      Yearly
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>

            <View style={styles.pricingCards}>
              {selectedPlan === "annual" ? (
                <TouchableOpacity
                  style={[
                    styles.pricingCard,
                    styles.pricingCardAnnual,
                    styles.pricingCardSelected,
                  ]}
                  onPress={() => setSelectedPlan("annual")}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={[
                      "rgba(74, 144, 226, 0.2)",
                      "rgba(93, 160, 242, 0.15)",
                    ]}
                    style={styles.selectedGradient}
                  />
                  <View style={styles.pricingCardContent}>
                    <View style={styles.planBadgesRow}>
                      <View style={styles.proBadge}>
                        <Text style={styles.proBadgeText}>
                          Best Value. Full Access.
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.pricingCardTitle}>Annual</Text>
                    <View style={styles.pricingAmountRow}>
                      <Text style={styles.pricingAmount}>$99.99</Text>
                      <Text style={styles.pricingPeriod}>/year</Text>
                    </View>
                    <Text style={styles.pricingEquivalent}>
                      ${(99.99 / 12).toFixed(2)}/month
                    </Text>
                  </View>
                  <LinearGradient
                    colors={["#0099FF", "#0066FF"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.savingsChip}
                  >
                    <BlurView intensity={12} style={styles.savingsChipBlur}>
                      <Text style={styles.savingsText}>
                        Save {Math.round(((11.99 - 99.99 / 12) / 11.99) * 100)}%
                      </Text>
                    </BlurView>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.pricingCard,
                    styles.pricingCardMonthly,
                    styles.pricingCardSelected,
                  ]}
                  onPress={() => setSelectedPlan("monthly")}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={[
                      "rgba(74, 144, 226, 0.15)",
                      "rgba(93, 160, 242, 0.1)",
                    ]}
                    style={styles.selectedGradient}
                  />
                  <View style={styles.pricingCardContent}>
                    <View style={styles.planBadgesRow}>
                      <View style={styles.proBadge}>
                        <Text style={styles.proBadgeText}>
                          Try the Essentials
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.pricingCardTitle}>Monthly</Text>
                    <View style={styles.pricingAmountRow}>
                      <Text style={styles.pricingAmount}>$11.99</Text>
                      <Text style={styles.pricingPeriod}>/month</Text>
                    </View>
                    {/* <Text style={styles.pricingEquivalent}>
                      ${(11.99 * 12).toFixed(2)}/year
                    </Text> */}
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* CTA Button */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleSubscribe}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={["#4A90E2", "#5DA0F2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>Start Free Trial</Text>
                <Text style={styles.ctaSubtext}>
                  Cancel anytime • 1 month free
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 24,
    paddingHorizontal: 5,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerBrand: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
    lineHeight: 28,
  },
  proBadge: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  proBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000",
  },
  featureSection: {
    marginBottom: 20,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  featureCard: {
    width: FEATURE_CARD_WIDTH,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
  },
  featureGradient: {
    borderRadius: 20,
  },
  featureBlur: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  featureIconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  featureIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  featureTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  featureSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.65)",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "500",
  },
  featureDescription: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.75)",
    textAlign: "center",
    lineHeight: 20,
  },
  pricingSection: {
    marginTop: "auto",
    paddingBottom: 0,
  },
  pricingTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
    paddingHorizontal: 24,
  },
  pricingSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.65)",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  planToggle: {
    alignItems: "center",
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  planToggleBlur: {
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  planToggleInner: {
    position: "relative",
    flexDirection: "row",
    padding: 4,
    minWidth: 240,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 1,
  },
  togglePill: {
    position: "absolute",
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  togglePillGradient: {
    flex: 1,
  },
  toggleText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  toggleTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  pricingCards: {
    flexDirection: "column",
    gap: 12,
    marginBottom: 24,
    alignItems: "stretch",
  },
  pricingCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
    position: "relative",
  },
  pricingCardAnnual: {
    borderColor: "rgba(74, 144, 226, 0.2)",
    transform: [{ scale: 1.02 }],
  },
  pricingCardMonthly: {
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  pricingCardSelected: {
    borderColor: "#4A90E2",
    borderWidth: 1.2,
  },
  selectedGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  pricingCardContent: {
    padding: 20,
    paddingRight: 48,
    position: "relative",
    zIndex: 1,
  },
  pricingCardHeader: {
    alignItems: "flex-start",
    marginBottom: 12,
  },
  planBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  pricingCardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4A90E2",
    marginBottom: 12,
  },
  pricingAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  pricingAmount: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
  },
  pricingPeriod: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.6)",
    marginLeft: 4,
  },
  pricingEquivalent: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    marginBottom: 12,
  },
  savingsChip: {
    position: "absolute",
    right: 16,
    top: "50%",
    transform: [{ translateY: -12 }],
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: "rgba(0, 217, 255, 0.5)",
    zIndex: 2,
    shadowColor: "#00D9FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  savingsChipBlur: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  savingsText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  ctaButton: {
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 8,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  ctaGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  ctaSubtext: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 11,
    fontWeight: "500",
  },
});

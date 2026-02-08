"use client";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Dimensions,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
  ScrollView,
  TouchableWithoutFeedback,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useState, useRef, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator } from "react-native";
import Purchases from "react-native-purchases";
import type {
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import logger from "@/src/utils/core/logger";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FEATURE_CARD_WIDTH = SCREEN_WIDTH - 56;

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const featureTransitionAnimation = {
  duration: 260,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.scaleXY,
    springDamping: 0.78,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

// Premium Dark Palette
const COLORS = {
  sapphire: "#0F52BA",
  sapphireDeep: "#0B3E8A",
  skyBlue: "#4A90E2",
  cyanBlue: "#2EA8E5",
  powderBlue: "#B0E0E6",
  deepNavy: "#0A1929",
  iceBlue: "#E0F7FA",
  darkBackground: "#0D1117",
};

// Contextual Background Components
const TimelineBackground = () => (
  <View style={styles.contextualBackground}>
    {[0, 1, 2, 3].map((i) => (
      <View key={i} style={styles.timelineItem}>
        <View
          style={[
            styles.timelineDot,
            { opacity: 0.05 + i * 0.015, left: `${20 + i * 20}%` },
          ]}
        />
        <View
          style={[
            styles.timelineLine,
            {
              opacity: 0.03,
              left: `${20 + i * 20}%`,
              width: i < 3 ? "20%" : 0,
            },
          ]}
        />
      </View>
    ))}
  </View>
);

const DashboardBackground = () => (
  <View style={styles.contextualBackground}>
    <View style={styles.dashboardGrid}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.dashboardCard,
            {
              opacity: 0.04,
              left: `${(i % 3) * 33}%`,
              top: `${Math.floor(i / 3) * 50}%`,
            },
          ]}
        />
      ))}
    </View>
  </View>
);

const AIBackground = () => (
  <View style={styles.contextualBackground}>
    {[0, 1, 2, 3, 4].map((i) => (
      <View
        key={i}
        style={[
          styles.aiBubble,
          {
            opacity: 0.05,
            left: `${15 + i * 18}%`,
            top: `${20 + (i % 2) * 40}%`,
            width: 28 + i * 4,
            height: 28 + i * 4,
          },
        ]}
      />
    ))}
  </View>
);

interface Feature {
  id: string;
  title: string;
  headline: string;
  benefits: string[];
  icon: keyof typeof Ionicons.glyphMap;
  iconGradient: [string, string];
  cardGradient: [string, string];
  backgroundType: "timeline" | "dashboard" | "ai";
}

const FEATURES: Feature[] = [
  {
    id: "track-everything",
    title: "Track Everything",
    headline: "All your money in one place",
    benefits: [
      "Track all accounts automatically",
      "See spending across categories",
      "Real-time subscription tracking",
    ],
    icon: "wallet",
    iconGradient: [COLORS.sapphireDeep, COLORS.skyBlue],
    cardGradient: ["rgba(15, 82, 186, 0.15)", "rgba(176, 224, 230, 0.08)"],
    backgroundType: "dashboard",
  },
  {
    id: "ai-budget",
    title: "Unlimited AI",
    headline: "Unlimited Finny Assistant",
    benefits: [
      "Set budget alerts and get notified",
      "Personalized recommendations",
      "Answer any financial question",
      "Write guidance and insights for you",
    ],
    icon: "bulb",
    iconGradient: [COLORS.skyBlue, COLORS.cyanBlue],
    cardGradient: ["rgba(176, 224, 230, 0.15)", "rgba(224, 247, 250, 0.08)"],
    backgroundType: "ai",
  },
  {
    id: "financial-goals",
    title: "Financial Goals",
    headline: "Plan your financial future",
    benefits: [
      "Set goals with visual timeline",
      "Track progress automatically",
      "Get personalized recommendations",
    ],
    icon: "trophy",
    iconGradient: [COLORS.sapphireDeep, COLORS.cyanBlue],
    cardGradient: ["rgba(15, 82, 186, 0.15)", "rgba(224, 247, 250, 0.08)"],
    backgroundType: "timeline",
  },
];

export interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const insets = useSafeAreaInsets();
  const { applyCustomerInfo, refetch } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<"annual" | "monthly">(
    "annual",
  );
  const [expandedFeatureId, setExpandedFeatureId] = useState<string | null>(
    null,
  );
  const [toggleWidth, setToggleWidth] = useState(0);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);

  // Get packages for price display
  const packages = offerings?.availablePackages || [];
  const annualPackage = packages.find(
    (p) => p.identifier === "$rc_annual" || p.packageType === "ANNUAL",
  );
  const monthlyPackage = packages.find(
    (p) => p.identifier === "$rc_monthly" || p.packageType === "MONTHLY",
  );
  const [scrollContentHeight, setScrollContentHeight] = useState(0);

  const SHEET_HANDLE_HEIGHT = 10 + 2 + 3; // sheetHandleContainer padding + handle
  const maxSheetHeight =
    SCREEN_HEIGHT - Math.max(insets.top, 12) - 12 - Math.max(insets.bottom, 0);
  const sheetHeight = Math.min(
    Math.max(scrollContentHeight + SHEET_HANDLE_HEIGHT + 16, 320),
    maxSheetHeight,
  );

  const toggleAnim = useRef(new Animated.Value(1)).current;
  const benefitsAppear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!expandedFeatureId) return;

    benefitsAppear.setValue(0);
    Animated.timing(benefitsAppear, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expandedFeatureId, benefitsAppear]);

  const handleFeaturePress = (featureId: string) => {
    LayoutAnimation.configureNext(featureTransitionAnimation);
    setExpandedFeatureId((current) =>
      current === featureId ? null : featureId,
    );
  };

  const handlePlanSelect = (plan: "annual" | "monthly") => {
    if (plan === selectedPlan) return;
    setSelectedPlan(plan);
  };

  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: selectedPlan === "annual" ? 1 : 0,
      tension: 120,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [selectedPlan, toggleAnim]);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setOfferings(null);
    let cancelled = false;
    Purchases.getOfferings()
      .then((o) => {
        if (cancelled) return;
        const current =
          (o as { current?: PurchasesOffering | null }).current ?? null;
        setOfferings(current);
      })
      .catch((e) => {
        if (!cancelled) {
          logger.warn("Paywall getOfferings failed", e);
          setError("Unable to load plans. Try again later.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleSubscribe = async () => {
    if (Platform.OS !== "ios" || purchasing) return;
    setPurchasing(true);
    setError(null);
    try {
      if (!offerings) {
        throw new Error("Plans not loaded yet. Please try again.");
      }
      const packages = offerings.availablePackages || [];
      const packageIdentifier =
        selectedPlan === "annual" ? "$rc_annual" : "$rc_monthly";

      // Log all available packages for debugging
      logger.info(
        `Available packages:`,
        packages.map((p) => ({
          identifier: p.identifier,
          packageType: p.packageType,
          price: p.product.priceString,
          productId: p.product.identifier,
        })),
      );

      const pkg =
        packages.find((p) => p.identifier === packageIdentifier) ||
        packages.find((p) =>
          selectedPlan === "annual"
            ? p.packageType === "ANNUAL"
            : p.packageType === "MONTHLY",
        );

      if (!pkg) {
        logger.error(
          `Package not found for ${selectedPlan}. Available:`,
          packages.map((p) => p.identifier),
        );
        throw new Error("Selected plan not available. Please try again.");
      }

      logger.info(`Subscribing to ${selectedPlan} plan:`, {
        identifier: pkg.identifier,
        packageType: pkg.packageType,
        price: pkg.product.priceString,
        productId: pkg.product.identifier,
      });

      const result = await Purchases.purchasePackage(pkg);
      applyCustomerInfo(result.customerInfo);
      await refetch();
      onClose();
    } catch (e: any) {
      if (e?.userCancelled) {
        return;
      }
      logger.warn("Purchase failed", e);
      setError(e?.message || "Purchase failed. Try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS !== "ios" || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const info = await Purchases.restorePurchases();
      applyCustomerInfo(info);
      await refetch();
      onClose();
    } catch (e: any) {
      logger.warn("Restore failed", e);
      setError(e?.message || "Restore failed. Try again.");
    } finally {
      setRestoring(false);
    }
  };

  const toggleTranslateX = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(toggleWidth - 8, 0) / 2],
  });

  const featuresToShow = expandedFeatureId
    ? FEATURES.filter((feature) => feature.id === expandedFeatureId)
    : FEATURES;

  const handleClose = onClose;

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <BlurView intensity={60} tint="dark" style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.sheet,
                {
                  height: sheetHeight,
                  maxHeight: maxSheetHeight,
                },
              ]}
            >
              <LinearGradient
                colors={[
                  COLORS.darkBackground,
                  COLORS.deepNavy,
                  COLORS.darkBackground,
                ]}
                locations={[0, 0.5, 1]}
                style={styles.sheetGradient}
              >
                <View style={styles.sheetHandleContainer}>
                  <View style={styles.sheetHandle} />
                </View>
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={[
                    styles.scrollContent,
                    {
                      paddingTop: 16,
                      paddingBottom: insets.bottom + 20,
                    },
                  ]}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  onContentSizeChange={(_, h) =>
                    setScrollContentHeight(Math.ceil(h))
                  }
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
                      onPress={handleClose}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons
                        name="close"
                        size={21}
                        color="rgba(255, 255, 255, 0.8)"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Feature Showcase Section - Accordion Style (hidden for compact modal) */}
                  {/* <View style={styles.featureSection}>
            <Text style={styles.featureSectionSubtitle}>
              {expandedFeatureId
                ? "Tap the chevron to collapse"
                : "Tap a card to see details"}
            </Text>

            {featuresToShow.map((feature, index) => {
              const isExpanded = expandedFeatureId === feature.id;

              return (
                <View
                  key={feature.id}
                  style={[
                    styles.featureCard,
                    isExpanded && styles.featureCardFocused,
                    {
                      marginBottom: index < featuresToShow.length - 1 ? 12 : 0,
                    },
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => handleFeaturePress(feature.id)}
                  >
                    <LinearGradient
                      colors={feature.cardGradient}
                      style={styles.featureGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      {feature.backgroundType === "timeline" && (
                        <TimelineBackground />
                      )}
                      {feature.backgroundType === "dashboard" && (
                        <DashboardBackground />
                      )}
                      {feature.backgroundType === "ai" && <AIBackground />}

                      <BlurView intensity={20} style={styles.featureBlur}>
                        <View style={styles.featureHeader}>
                          <View style={styles.featureHeaderLeft}>
                            <LinearGradient
                              colors={feature.iconGradient}
                              style={styles.featureIconGradient}
                            >
                              <Ionicons
                                name={feature.icon}
                                size={22}
                                color="#fff"
                              />
                            </LinearGradient>
                            <View style={styles.featureHeaderText}>
                              <Text style={styles.featureTitle}>
                                {feature.title}
                              </Text>
                              <Text style={styles.featureHeadlineCollapsed}>
                                {feature.headline}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleFeaturePress(feature.id)}
                            hitSlop={{
                              top: 10,
                              bottom: 10,
                              left: 10,
                              right: 10,
                            }}
                            style={styles.featureChevronButton}
                          >
                            <Ionicons
                              name={
                                isExpanded ? "chevron-up" : "chevron-forward"
                              }
                              size={20}
                              color="rgba(255, 255, 255, 0.5)"
                            />
                          </TouchableOpacity>
                        </View>

                        {isExpanded && (
                          <Animated.View
                            style={[
                              styles.expandedContent,
                              {
                                opacity: benefitsAppear,
                                transform: [
                                  {
                                    translateY: benefitsAppear.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [-6, 0],
                                    }),
                                  },
                                ],
                              },
                            ]}
                          >
                            <View style={styles.expandedContentInner}>
                              <View style={styles.benefitsContainer}>
                                {feature.benefits.map(
                                  (benefit, benefitIndex) => (
                                    <View
                                      key={benefitIndex}
                                      style={styles.benefitRow}
                                    >
                                      <View
                                        style={[
                                          styles.bulletDot,
                                          {
                                            backgroundColor:
                                              feature.iconGradient[0],
                                          },
                                        ]}
                                      />
                                      <Text style={styles.benefitText}>
                                        {benefit}
                                      </Text>
                                    </View>
                                  ),
                                )}
                              </View>
                            </View>
                          </Animated.View>
                        )}
                      </BlurView>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View> */}

                  {/* Pricing Section */}
                  <View style={styles.pricingSection}>
                    <Text style={styles.pricingTitle}>Choose Your Plan</Text>
                    <Text style={styles.pricingSubtitle}>
                      Start your 1 month Free trial
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
                            onPress={() => handlePlanSelect("monthly")}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                selectedPlan === "monthly" &&
                                  styles.toggleTextActive,
                              ]}
                            >
                              Monthly
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.toggleOption}
                            onPress={() => handlePlanSelect("annual")}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                selectedPlan === "annual" &&
                                  styles.toggleTextActive,
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
                          onPress={() => handlePlanSelect("annual")}
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
                              <Text style={styles.pricingAmount}>
                                {annualPackage?.product.priceString || "$99.99"}
                              </Text>
                              <Text style={styles.pricingPeriod}>/year</Text>
                            </View>
                            {annualPackage?.product.price && (
                              <Text style={styles.pricingEquivalent}>
                                ${(annualPackage.product.price / 12).toFixed(2)}
                                /month
                              </Text>
                            )}
                          </View>
                          <LinearGradient
                            colors={["#0099FF", "#0066FF"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.savingsChip}
                          >
                            <BlurView
                              intensity={12}
                              style={styles.savingsChipBlur}
                            >
                              {annualPackage?.product.price &&
                                monthlyPackage?.product.price && (
                                  <Text style={styles.savingsText}>
                                    Save{" "}
                                    {Math.round(
                                      ((monthlyPackage.product.price * 12 -
                                        annualPackage.product.price) /
                                        (monthlyPackage.product.price * 12)) *
                                        100,
                                    )}
                                    %
                                  </Text>
                                )}
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
                          onPress={() => handlePlanSelect("monthly")}
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
                              <Text style={styles.pricingAmount}>
                                {monthlyPackage?.product.priceString ||
                                  "$10.99"}
                              </Text>
                              <Text style={styles.pricingPeriod}>/month</Text>
                            </View>
                            {/* <Text style={styles.pricingEquivalent}>
                      ${(10.99 * 12).toFixed(2)}/year
                    </Text> */}
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>

                    {error && (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.ctaButton,
                        purchasing && styles.ctaButtonDisabled,
                      ]}
                      onPress={handleSubscribe}
                      activeOpacity={0.9}
                      disabled={purchasing || restoring}
                    >
                      <LinearGradient
                        colors={
                          purchasing
                            ? [
                                "rgba(74, 144, 226, 0.5)",
                                "rgba(93, 160, 242, 0.5)",
                              ]
                            : ["#4A90E2", "#5DA0F2"]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.ctaGradient}
                      >
                        {purchasing ? (
                          <View style={styles.loadingContainer}>
                            <ActivityIndicator color="#FFFFFF" size="small" />
                            <Text style={styles.ctaText}>Processing...</Text>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.ctaText}>
                              Start 1-Month Free Trial
                            </Text>
                            <Text style={styles.ctaSubtext}>
                              Cancel anytime • 1 month free
                            </Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.restoreButton}
                      onPress={handleRestore}
                      activeOpacity={0.7}
                      disabled={purchasing || restoring}
                    >
                      {restoring ? (
                        <View style={styles.restoreLoadingContainer}>
                          <ActivityIndicator
                            color="rgba(255, 255, 255, 0.6)"
                            size="small"
                          />
                          <Text style={styles.restoreText}>Restoring...</Text>
                        </View>
                      ) : (
                        <Text style={styles.restoreText}>
                          Restore Purchases
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </LinearGradient>
            </View>
          </TouchableWithoutFeedback>
        </BlurView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    width: SCREEN_WIDTH,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 24,
  },
  sheetGradient: {
    flex: 1,
    minHeight: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheetHandleContainer: {
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandle: {
    width: 44,
    height: 3,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 0,
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
  },
  featureSectionTitle: {
    width: FEATURE_CARD_WIDTH,
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  featureSectionSubtitle: {
    width: FEATURE_CARD_WIDTH,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    letterSpacing: 0.1,
    marginBottom: 12,
  },
  featureCard: {
    width: FEATURE_CARD_WIDTH,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  featureCardFocused: {
    borderWidth: 1,
    borderColor: "rgba(93, 160, 242, 0.34)",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  featureGradient: {
    borderRadius: 14,
    position: "relative",
    overflow: "hidden",
  },
  contextualBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
  },
  timelineItem: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  timelineDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    top: "50%",
    transform: [{ translateY: -3 }],
  },
  timelineLine: {
    position: "absolute",
    height: 1.5,
    backgroundColor: "#fff",
    top: "50%",
    transform: [{ translateY: -0.75 }],
  },
  dashboardGrid: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  dashboardCard: {
    position: "absolute",
    width: "28%",
    height: "40%",
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  aiBubble: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  featureBlur: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.22)",
    backgroundColor: "rgba(10, 25, 41, 0.6)",
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
  },
  featureHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  featureHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  featureIconGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    shadowColor: COLORS.sapphire,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  featureCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  featureChevronButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  featureHeaderText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(176, 224, 230, 0.7)",
    marginBottom: 2,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    // textAlign: "center",
  },
  featureHeadlineCollapsed: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: -0.2,
    lineHeight: 19,
    // textAlign: "center",
  },
  expandedContent: {
    overflow: "hidden",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.07)",
  },
  expandedContentInner: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  benefitsContainer: {
    gap: 10,
    alignItems: "flex-start",
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginRight: 8,
    marginTop: 6,
    opacity: 0.95,
  },
  benefitText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
    flex: 1,
    lineHeight: 19,
    fontWeight: "400",
    letterSpacing: 0.1,
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
    marginBottom: 10,
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
  restoreButton: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  restoreText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
  errorContainer: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.3)",
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  restoreLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});

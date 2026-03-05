"use client";

import {
  View,
  Text,
  Image,
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
import PagerView from "react-native-pager-view";
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
import * as WebBrowser from "expo-web-browser";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FEATURE_CARD_WIDTH = SCREEN_WIDTH - 56;

// Animated carousel dot - expands to pill when active
function AnimatedCarouselDot({ isActive }: { isActive: boolean }) {
  const widthAnim = useRef(new Animated.Value(isActive ? 20 : 6)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: isActive ? 20 : 6,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isActive, widthAnim]);

  return (
    <Animated.View
      style={{
        width: widthAnim,
        height: 6,
        borderRadius: 3,
        backgroundColor: isActive ? "#4A90E2" : "rgba(255, 255, 255, 0.35)",
      }}
    />
  );
}

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

type IntroOffer = {
  price?: number;
  priceString?: string;
  periodNumberOfUnits?: number;
  periodUnit?: string;
};

const normalizePeriodUnit = (
  periodUnit?: string,
): "day" | "week" | "month" | "year" | "period" => {
  const normalized = String(periodUnit || "").toLowerCase();
  if (normalized.includes("day")) return "day";
  if (normalized.includes("week")) return "week";
  if (normalized.includes("month")) return "month";
  if (normalized.includes("year")) return "year";
  return "period";
};

const pluralizePeriod = (
  count: number,
  unit: "day" | "week" | "month" | "year" | "period",
) => {
  const safeCount = count > 0 ? count : 1;
  return `${safeCount} ${unit}${safeCount === 1 ? "" : "s"}`;
};

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

// Carousel features for paywall
type CarouselFeature = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  imageSource?: number;
};
const CAROUSEL_FEATURES: CarouselFeature[] = [
  {
    id: "peace",
    title: "Let Finny do the work and get peace of mind.",
    subtitle: "Automated tracking so you can relax",
    emoji: "😌",
  },
  {
    id: "personalization",
    title: "Advanced personalization for you.",
    subtitle: "Insights tailored to your goals",
    emoji: "✨",
  },
  {
    id: "ai",
    title: "Unlimited Finny AI help.",
    subtitle: "Ask anything, get instant answers",
    emoji: "🤖",
    imageSource: require("../../assets/images/mascotgpt.png"),
  },
  {
    id: "goals",
    title: "Unlimited financial goals.",
    subtitle: "Track and achieve what matters to you",
    emoji: "🎯",
  },
  {
    id: "accounts",
    title: "Track all accounts in one place.",
    subtitle: "One dashboard for your entire financial picture",
    emoji: "📊",
  },
];

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
  /** Called when paywall closes. Pass 'convert' when user subscribed/restored; 'dismiss' when user closed without converting. */
  onClose: (reason?: "convert" | "dismiss") => void;
}

export default function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const insets = useSafeAreaInsets();
  const { applyCustomerInfo, refetch } = useSubscription();
  const [rendered, setRendered] = useState(visible);
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
  const [offeringsLoading, setOfferingsLoading] = useState(false);

  // Get packages for price display
  const packages = offerings?.availablePackages || [];
  const annualPackage = packages.find(
    (p) => p.identifier === "$rc_annual" || p.packageType === "ANNUAL",
  );
  const monthlyPackage = packages.find(
    (p) => p.identifier === "$rc_monthly" || p.packageType === "MONTHLY",
  );
  const isAnnualAvailable = !!annualPackage;
  const isMonthlyAvailable = !!monthlyPackage;
  const selectedPackage: PurchasesPackage | null =
    selectedPlan === "annual"
      ? annualPackage || monthlyPackage || null
      : monthlyPackage || annualPackage || null;
  const selectedBillingUnit =
    selectedPackage?.packageType === "ANNUAL"
      ? "year"
      : selectedPackage?.packageType === "MONTHLY"
        ? "month"
        : "period";
  const selectedPriceString = selectedPackage?.product.priceString || null;

  const introOffer =
    (selectedPackage?.product.introPrice as IntroOffer | null) || null;
  const introPriceString = introOffer?.priceString || null;
  const introPrice =
    typeof introOffer?.price === "number" ? introOffer.price : null;
  const introPeriodUnit = normalizePeriodUnit(introOffer?.periodUnit);
  const introPeriodCount = Number(introOffer?.periodNumberOfUnits || 1);
  const introDurationLabel = introOffer
    ? pluralizePeriod(introPeriodCount, introPeriodUnit)
    : null;
  const hasIntroOffer = !!introOffer;
  const isFreeTrial =
    hasIntroOffer &&
    (introPrice === 0 ||
      String(introPriceString || "")
        .toLowerCase()
        .includes("free") ||
      String(introPriceString || "").includes("$0"));

  const ctaDisabled =
    offeringsLoading ||
    purchasing ||
    restoring ||
    !selectedPackage ||
    Platform.OS !== "ios";
  const ctaTitle = offeringsLoading
    ? "Loading plans..."
    : purchasing
      ? "Processing..."
      : !selectedPackage
        ? "Plan unavailable"
        : isFreeTrial
          ? `Start ${introDurationLabel || "free trial"}`
          : hasIntroOffer
            ? "Start Intro Offer"
            : `Continue with ${selectedPlan === "annual" ? "Yearly" : "Monthly"}`;
  const recurringPriceLabel = selectedPriceString
    ? `${selectedPriceString}/${selectedBillingUnit}`
    : "selected rate";
  const ctaSubtitle = !selectedPackage
    ? offeringsLoading
      ? "Fetching latest pricing..."
      : "Plans are unavailable right now."
    : isFreeTrial
      ? `Then ${recurringPriceLabel} • Cancel anytime`
      : hasIntroOffer && introPriceString
        ? `${introPriceString}${
            introDurationLabel ? ` for ${introDurationLabel}` : ""
          }, then ${recurringPriceLabel}`
        : `Billed ${recurringPriceLabel} • Cancel anytime`;
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const carouselRef = useRef<PagerView>(null);

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
    if (selectedPlan === "annual" && !annualPackage && monthlyPackage) {
      setSelectedPlan("monthly");
      return;
    }
    if (selectedPlan === "monthly" && !monthlyPackage && annualPackage) {
      setSelectedPlan("annual");
    }
  }, [visible, selectedPlan, annualPackage, monthlyPackage]);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setOfferings(null);
    setOfferingsLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) setOfferingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }

    // Keep the modal mounted until the native close animation finishes.
    const timeout = setTimeout(() => setRendered(false), 320);
    return () => clearTimeout(timeout);
  }, [visible]);

  const handleSubscribe = async () => {
    if (Platform.OS !== "ios" || purchasing || offeringsLoading) return;
    setPurchasing(true);
    setError(null);
    try {
      if (!offerings || !selectedPackage) {
        throw new Error("Plans not loaded yet. Please try again.");
      }
      const packages = offerings.availablePackages || [];

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

      const pkg = selectedPackage;

      logger.info(`Subscribing to ${selectedPlan} plan:`, {
        identifier: pkg.identifier,
        packageType: pkg.packageType,
        price: pkg.product.priceString,
        productId: pkg.product.identifier,
      });

      const result = await Purchases.purchasePackage(pkg);
      applyCustomerInfo(result.customerInfo);
      await refetch();
      onClose("convert");
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
      onClose("convert");
    } catch (e: any) {
      logger.warn("Restore failed", e);
      setError(e?.message || "Restore failed. Try again.");
    } finally {
      setRestoring(false);
    }
  };

  const toggleTranslateX = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(toggleWidth - 6, 0) / 2],
  });

  const featuresToShow = expandedFeatureId
    ? FEATURES.filter((feature) => feature.id === expandedFeatureId)
    : FEATURES;

  const handleClose = () => onClose("dismiss");

  const handlePrivacyPolicy = async () => {
    try {
      await WebBrowser.openBrowserAsync("https://www.usefinny.com/privacy", {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: "#4A90E2",
        showTitle: true,
      });
    } catch (e) {
      logger.warn("Failed to open privacy policy", e);
    }
  };

  const handleTermsOfUse = async () => {
    try {
      await WebBrowser.openBrowserAsync("https://www.usefinny.com/terms", {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: "#4A90E2",
        showTitle: true,
      });
    } catch (e) {
      logger.warn("Failed to open terms of use", e);
    }
  };

  if (!rendered) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
      onDismiss={() => {
        if (!visible) setRendered(false);
      }}
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

                  {/* Feature Carousel */}
                  <View style={styles.carouselSection}>
                    <PagerView
                      ref={carouselRef}
                      style={styles.carouselPager}
                      initialPage={0}
                      onPageSelected={(e) =>
                        setActiveCarouselIndex(e.nativeEvent.position)
                      }
                    >
                      {CAROUSEL_FEATURES.map((item) => (
                        <View
                          key={item.id}
                          style={styles.carouselSlide}
                          collapsable={false}
                        >
                          {item.imageSource ? (
                            <Image
                              source={item.imageSource}
                              style={styles.carouselMascot}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text style={styles.carouselEmoji}>
                              {item.emoji}
                            </Text>
                          )}
                          <Text style={styles.carouselTitle}>{item.title}</Text>
                          <Text style={styles.carouselSubtitle}>
                            {item.subtitle}
                          </Text>
                        </View>
                      ))}
                    </PagerView>
                    <View style={styles.carouselDots}>
                      {CAROUSEL_FEATURES.map((_, idx) => (
                        <AnimatedCarouselDot
                          key={idx}
                          isActive={activeCarouselIndex === idx}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Pricing Section */}
                  <View style={styles.pricingSection}>
                    <Text style={styles.pricingSectionTitle}>
                      Choose your plan
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
                                  width: (toggleWidth - 6) / 2,
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
                            style={[
                              styles.toggleOption,
                              !isMonthlyAvailable &&
                                styles.toggleOptionDisabled,
                            ]}
                            onPress={() => handlePlanSelect("monthly")}
                            disabled={!isMonthlyAvailable}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                !isMonthlyAvailable &&
                                  styles.toggleTextDisabled,
                                selectedPlan === "monthly" &&
                                  styles.toggleTextActive,
                              ]}
                            >
                              Monthly
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.toggleOption,
                              !isAnnualAvailable && styles.toggleOptionDisabled,
                            ]}
                            onPress={() => handlePlanSelect("annual")}
                            disabled={!isAnnualAvailable}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                !isAnnualAvailable && styles.toggleTextDisabled,
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
                                  Best Value
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.pricingCardTitle}>Annual</Text>
                            <View style={styles.pricingAmountRow}>
                              <Text style={styles.pricingAmount}>
                                {offeringsLoading
                                  ? "Loading..."
                                  : annualPackage?.product.priceString ||
                                    "Unavailable"}
                              </Text>
                              <Text style={styles.pricingPeriod}>/year</Text>
                            </View>
                            {/* {annualPackage?.product.price && (
                              <Text style={styles.pricingEquivalent}>
                                ${(annualPackage.product.price / 12).toFixed(2)}
                                /month
                              </Text>
                            )} */}
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
                                {offeringsLoading
                                  ? "Loading..."
                                  : monthlyPackage?.product.priceString ||
                                    "Unavailable"}
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
                        ctaDisabled && styles.ctaButtonDisabled,
                      ]}
                      onPress={handleSubscribe}
                      activeOpacity={0.9}
                      disabled={ctaDisabled}
                    >
                      <LinearGradient
                        colors={
                          ctaDisabled
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
                            <Text style={styles.ctaText}>{ctaTitle}</Text>
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
                    <Text style={styles.cancelLine}>
                      This subscription automatically renews at the price
                      selected above.
                    </Text>
                    <View style={styles.legalLinksRow}>
                      <TouchableOpacity onPress={handlePrivacyPolicy}>
                        <Text style={styles.legalLink}>Privacy Policy</Text>
                      </TouchableOpacity>
                      <Text style={styles.legalSeparator}>•</Text>
                      <TouchableOpacity onPress={handleTermsOfUse}>
                        <Text style={styles.legalLink}>Terms of Use</Text>
                      </TouchableOpacity>
                    </View>
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
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
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
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
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
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
    lineHeight: 24,
  },
  proBadge: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 3,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  proBadgeText: {
    fontSize: 10,
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
  carouselSection: {
    marginBottom: 20,
    overflow: "hidden",
  },
  carouselPager: {
    width: SCREEN_WIDTH,
    height: 150,
    marginHorizontal: -24,
  },
  carouselSlide: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  carouselEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  carouselMascot: {
    width: 88,
    height: 88,
    marginBottom: -5,
  },
  ctaSubtext: {
    fontSize: 11,
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 18,
    fontFamily: "Manrope",
  },
  carouselTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
    lineHeight: 22,
  },
  carouselSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.65)",
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  carouselDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  pricingSection: {
    marginTop: "auto",
    paddingBottom: 0,
  },
  pricingSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.2,
    marginBottom: 5,
    fontFamily: "Manrope",
  },
  pricingSectionSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.62)",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 18,
  },
  planToggle: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 18,
    paddingHorizontal: 24,
  },
  planToggleBlur: {
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  planToggleInner: {
    position: "relative",
    flexDirection: "row",
    padding: 3,
    minWidth: 200,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 1,
  },
  toggleOptionDisabled: {
    opacity: 0.5,
  },
  togglePill: {
    position: "absolute",
    top: 3,
    left: 3,
    bottom: 3,
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
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  toggleTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  toggleTextDisabled: {
    color: "rgba(255, 255, 255, 0.45)",
  },
  pricingCards: {
    flexDirection: "column",
    gap: 10,
    marginBottom: 20,
    marginHorizontal: 8,
    alignItems: "stretch",
  },
  pricingCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1.2,
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
    gap: 6,
    marginBottom: 8,
  },
  pricingCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#4A90E2",
    marginBottom: 8,
  },
  pricingAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  pricingAmount: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
  },
  pricingPeriod: {
    fontSize: 14,
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
    right: 12,
    top: "50%",
    transform: [{ translateY: -10 }],
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 4,
    borderWidth: 1.2,
    borderColor: "rgba(0, 217, 255, 0.5)",
    zIndex: 2,
    shadowColor: "#00D9FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  savingsChipBlur: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  savingsText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  ctaButton: {
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    marginTop: 8,
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
  cancelLine: {
    fontSize: 9,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    paddingHorizontal: 24,
    marginTop: 2,
    lineHeight: 14,
  },
  legalLinksRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  legalLink: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.45)",
    textDecorationLine: "underline",
  },
  legalSeparator: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.35)",
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

// FinalScreen.tsx - Personalized Insights for Gen Z

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { logOnboardingEvent } from "@/src/utils/auth/onboarding";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface InsightCard {
  id: string;
  type: "surprise" | "pattern" | "opportunity";
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  data?: any;
}

interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
  icon?: string;
  categoryId?: string;
}

type EarlyInsights = {
  intro_line?: string;
  mirror?: string;
  plan?: string;
  hook?: string;
};

export default function FinalScreen() {
  const router = useRouter();
  const { refreshNavigationState } = useAuthNavigation();
  const [earlyInsights, setEarlyInsights] = useState<EarlyInsights | null>(null);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);
  const [isButtonEnabled, setIsButtonEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [llmFailed, setLlmFailed] = useState(false);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);

  // Typing dots animation for loading
  const typingDotsAnim = useRef([
    new Animated.Value(0.4),
    new Animated.Value(0.4),
    new Animated.Value(0.4),
  ]).current;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const firstReadBodyAnim = useRef(new Animated.Value(0)).current;
  const breakdownAnim = useRef(new Animated.Value(0)).current;
  const footerAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const rocketAnimation = useRef(new Animated.Value(0)).current;
  const cardAnimations = useRef<Animated.Value[]>([]).current;
  const mascotBounce = useRef(new Animated.Value(0)).current;
  const loadingDotsAnim = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const getFirstReadLines = (source: EarlyInsights | null) => {
    const coerce = (value: unknown) => String(value ?? "").trim();
    return {
      introLine: coerce(source?.intro_line),
      mirrorLine: coerce(source?.mirror),
      planLine: coerce(source?.plan),
      hookLine: coerce(source?.hook),
    };
  };

  // Generate fallback message when LLM fails
  const fallbackMessage = userFirstName
    ? `Hey ${userFirstName}, thanks for setting this up! I'm excited to start getting things on and give you the right direction with your money.`
    : "Hey, thanks for setting this up. I'm excited to start getting things on and give you the right direction with your money.";

  const { introLine, mirrorLine, planLine, hookLine } = llmFailed
    ? { introLine: fallbackMessage, mirrorLine: "", planLine: "", hookLine: "" }
    : getFirstReadLines(earlyInsights);
  const firstReadIsLoading =
    !llmFailed &&
    !earlyInsights &&
    (isLoadingInsights || showLoadingAnimation);
  const firstReadOrderedRevealLines = [mirrorLine, planLine, hookLine].filter(
    Boolean
  );

  const [firstReadTypedIntro, setFirstReadTypedIntro] = useState("");
  const [firstReadRevealedCount, setFirstReadRevealedCount] = useState(0);
  const [firstReadShowCaret, setFirstReadShowCaret] = useState(true);

  const firstReadIsTyping =
    !firstReadIsLoading &&
    !!introLine &&
    firstReadTypedIntro.length < introLine.length &&
    introLine.length > 0;
  const firstReadIsComplete =
    !firstReadIsLoading &&
    !firstReadIsTyping &&
    ((llmFailed && firstReadTypedIntro.length === introLine.length) ||
      (firstReadOrderedRevealLines.length > 0 &&
        firstReadRevealedCount >= firstReadOrderedRevealLines.length));

  useEffect(() => {
    if (firstReadIsLoading || !introLine) {
      setFirstReadTypedIntro("");
      setFirstReadRevealedCount(0);
      setShowBreakdown(false);
      firstReadBodyAnim.setValue(0);
      breakdownAnim.setValue(0);
      footerAnim.setValue(0);
      return;
    }

    let cancelled = false;
    setFirstReadTypedIntro("");
    setFirstReadRevealedCount(0);
    setFirstReadShowCaret(true);

    const orderedRevealLines = [mirrorLine, planLine, hookLine].filter(Boolean);

    const run = async () => {
      const speedMs = 22;
      const revealDelayMs = 360;

      for (let i = 1; i <= introLine.length; i++) {
        if (cancelled) return;
        setFirstReadTypedIntro(introLine.slice(0, i));
        await new Promise((r) => setTimeout(r, speedMs));
      }

      // For fallback message, don't show reveal lines
      if (llmFailed) {
        setFirstReadShowCaret(false);
        if (!cancelled) {
          Animated.timing(firstReadBodyAnim, {
            toValue: 1,
            duration: 360,
            useNativeDriver: true,
          }).start();
        }
        return;
      }

      for (let i = 0; i < orderedRevealLines.length; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, revealDelayMs));
        setFirstReadRevealedCount(i + 1);
      }

      if (!cancelled) {
        Animated.timing(firstReadBodyAnim, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }).start();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [firstReadIsLoading, introLine, mirrorLine, planLine, hookLine, llmFailed]);

  useEffect(() => {
    if (!firstReadIsTyping) return;
    const id = setInterval(() => setFirstReadShowCaret((prev) => !prev), 480);
    return () => clearInterval(id);
  }, [firstReadIsTyping]);

  useEffect(() => {
    if (!firstReadIsComplete || isLoadingInsights || showLoadingAnimation) {
      return;
    }

    breakdownAnim.setValue(0);
    footerAnim.setValue(0);
    setShowBreakdown(false);

    const delayId = setTimeout(() => {
      setShowBreakdown(true);
      Animated.timing(breakdownAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }).start();
    }, 500);

    const footerId = setTimeout(() => {
      Animated.timing(footerAnim, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }).start();
    }, 1000);

    const buttonId = setTimeout(() => {
      setIsButtonEnabled(true);
    }, 1000);

    return () => {
      clearTimeout(delayId);
      clearTimeout(footerId);
      clearTimeout(buttonId);
    };
  }, [
    firstReadIsComplete,
    isLoadingInsights,
    showLoadingAnimation,
    breakdownAnim,
    footerAnim,
  ]);

  const FirstReadCard = ({
    introLine,
    typedIntro,
    orderedRevealLines,
    revealedCount,
    isTyping,
    showCaret,
    isLoading,
    isFallback,
  }: {
    introLine: string;
    typedIntro: string;
    orderedRevealLines: string[];
    revealedCount: number;
    isTyping: boolean;
    showCaret: boolean;
    isLoading: boolean;
    isFallback?: boolean;
  }) => {
    if (isLoading || !introLine) {
      return (
        <View style={styles.firstReadCard}>
          <View style={styles.firstReadHeader}>
            <Animated.Image
              source={require("../../assets/images/midleftshot.png")}
              resizeMode="contain"
              style={styles.firstReadMascot}
            />
            <Text style={styles.firstReadKicker}>FIRST READ</Text>
          </View>
          <Text style={styles.firstReadHero}>Preparing your first read…</Text>
          <View style={styles.firstReadRule}>
            <Text style={styles.firstReadBody}>
              Finny is reviewing your recent activity.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.firstReadCard}>
        <View style={styles.firstReadHeader}>
          <Animated.Image
            source={require("../../assets/images/midleftshot.png")}
            resizeMode="contain"
            style={styles.firstReadMascot}
          />
          <Text style={styles.firstReadKicker}>FIRST READ</Text>
        </View>
        <Text style={[styles.firstReadHero, isFallback && styles.firstReadHeroFallback]}>
          {typedIntro}
          {isTyping && showCaret ? (
            <Text style={styles.firstReadCaret}>▍</Text>
          ) : null}
        </Text>
        {!isFallback && revealedCount > 0 && (
          <Text style={styles.firstReadMirror}>{orderedRevealLines[0]}</Text>
        )}
        {!isFallback && revealedCount > 1 && (
          <Animated.View
            style={[
              styles.firstReadRule,
              {
                opacity: firstReadBodyAnim,
                transform: [
                  {
                    translateY: firstReadBodyAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {orderedRevealLines
              .slice(1, revealedCount)
              .map((line, idx) => (
                <Text key={idx} style={styles.firstReadBody}>
                  {line}
                </Text>
              ))}
          </Animated.View>
        )}
      </View>
    );
  };

  const loadInsights = async () => {
    try {
      setIsLoadingInsights(true);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        logger.error("❌ FinalScreen: Auth error", authError);
        setIsLoadingInsights(false);
        setIsButtonEnabled(true);
        return;
      }

      logger.info("🔍 FinalScreen: Loading insights for user", user.id);

      const formatDate = (d: Date) => {
        const y = d.getFullYear();
        const m = `${d.getMonth() + 1}`.padStart(2, "0");
        const day = `${d.getDate()}`.padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      // Get last 30 days of transactions
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const startDateStr = formatDate(start);
      const endDateStr = formatDate(end);

      logger.info("📅 FinalScreen: Fetching transactions", {
        startDate: startDateStr,
        endDate: endDateStr,
      });

      // Fetch transactions directly from database with category data
      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select(
          "date, amount, merchant_name, name, category, top_category, new_category, category_id, categories(id, name, icon)"
        )
        .eq("user_id", user.id)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .gt("amount", 0) // Only expenses
        .order("date", { ascending: false })
        .limit(100);

      if (txError) {
        logger.error("❌ FinalScreen: Error fetching transactions", txError);
        // Still show fallback insight
        setInsights([
          {
            id: "error",
            type: "surprise",
            title: "Your account is connected!",
            subtitle:
              "We're analyzing your transactions. Check back soon for insights.",
            icon: "checkmark-circle",
            color: "#00D4AA",
          },
        ]);
        setIsLoadingInsights(false);
        setIsButtonEnabled(true);
        return;
      }

      // Filter out internal transfers and payment transactions
      const isPaymentTransaction = (tx: any): boolean => {
        // Exclude if marked as internal transfer
        if (tx.new_category === "INTERNAL_TRANSFER") {
          return true;
        }

        const name = (tx.name || "").toUpperCase();
        const merchant = (tx.merchant_name || "").toUpperCase();

        // Check for automatic payments (must be exact match or start with)
        if (
          name.startsWith("AUTOMATIC PAYMENT") ||
          name.includes("AUTOMATIC PAYMENT -") ||
          merchant.startsWith("AUTOMATIC PAYMENT")
        ) {
          return true;
        }

        // Check for credit card payments (both words must be present)
        if (
          (name.includes("CREDIT CARD") && name.includes("PAYMENT")) ||
          (name.includes("PAYMENT") &&
            name.includes("CREDIT CARD") &&
            name.match(/\d{4}/)) // Has card number pattern
        ) {
          return true;
        }

        // Check for bill payments (ACH transfers) - more specific
        if (
          name.includes("PAYMENT") &&
          (name.includes("ACH") ||
            (name.includes("BILL") && name.includes("PAYMENT")))
        ) {
          return true;
        }

        return false;
      };

      const recentTransactions = (transactions || []).filter(
        (tx: any) => !isPaymentTransaction(tx)
      );

      logger.info("📊 FinalScreen: Transaction filtering", {
        total: transactions?.length || 0,
        afterFiltering: recentTransactions.length,
        filteredOut: (transactions?.length || 0) - recentTransactions.length,
        sampleNames: transactions
          ?.slice(0, 3)
          .map((t: any) => t.name || t.merchant_name),
      });

      const newInsights: InsightCard[] = [];

      if (recentTransactions.length === 0) {
        logger.info("ℹ️ FinalScreen: No transactions found, showing welcome");
        // Fallback if no transactions
        newInsights.push({
          id: "welcome",
          type: "surprise",
          title: "Your account is connected!",
          subtitle:
            "We'll analyze your spending patterns as transactions come in.",
          icon: "checkmark-circle",
          color: "#00D4AA",
        });
        setInsights(newInsights);
        setIsLoadingInsights(false);
        setIsButtonEnabled(false);

        // Show loading animation for 2.5 seconds before showing insights
        setTimeout(() => {
          setShowLoadingAnimation(false);
        }, 2500);

        // Initialize animation for welcome card
        if (!cardAnimations[0]) {
          cardAnimations[0] = new Animated.Value(0);
        }
        Animated.spring(cardAnimations[0], {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }).start();
        return;
      }

      // Helper function to get user-friendly category name
      const getUserFriendlyCategory = (tx: any): string => {
        // Priority: new_category (user override) > top_category (mapped) > format category (raw Plaid)
        if (tx.new_category) return tx.new_category;
        if (tx.top_category) return tx.top_category;

        // Fallback: format raw Plaid category to be more readable
        if (tx.category) {
          return formatPlaidCategory(tx.category);
        }
        return "Other";
      };

      // Helper function to format raw Plaid category names
      const formatPlaidCategory = (plaidCategory: string): string => {
        if (!plaidCategory) return "Other";

        // Convert "food_and_drink_fast_food" -> "Fast Food"
        // Convert "general_merchandise_other" -> "Shopping"
        // Convert "travel_flight" -> "Travel"

        const upper = plaidCategory.toUpperCase();

        // Food categories
        if (
          upper.includes("FOOD") ||
          upper.includes("RESTAURANT") ||
          upper.includes("COFFEE")
        ) {
          if (upper.includes("GROCERY") || upper.includes("SUPERMARKET"))
            return "Groceries";
          if (upper.includes("FAST_FOOD")) return "Fast Food";
          return "Food & Dining";
        }

        // Shopping/Merchandise
        if (upper.includes("MERCHANDISE") || upper.includes("SHOPPING")) {
          return "Shopping";
        }

        // Transportation
        if (
          upper.includes("TRANSPORT") ||
          upper.includes("GAS") ||
          upper.includes("UBER") ||
          upper.includes("LYFT")
        ) {
          return "Transportation";
        }

        // Travel
        if (
          upper.includes("TRAVEL") ||
          upper.includes("FLIGHT") ||
          upper.includes("HOTEL")
        ) {
          return "Travel";
        }

        // Entertainment
        if (
          upper.includes("ENTERTAINMENT") ||
          upper.includes("MOVIE") ||
          upper.includes("GAME")
        ) {
          return "Entertainment";
        }

        // Housing
        if (
          upper.includes("RENT") ||
          upper.includes("MORTGAGE") ||
          upper.includes("UTILITIES")
        ) {
          return "Housing";
        }

        // Health
        if (
          upper.includes("HEALTH") ||
          upper.includes("MEDICAL") ||
          upper.includes("PHARMACY")
        ) {
          return "Health & Fitness";
        }

        // Subscriptions
        if (upper.includes("SUBSCRIPTION") || upper.includes("STREAMING")) {
          return "Subscriptions";
        }

        // Income
        if (
          upper.includes("INCOME") ||
          upper.includes("WAGE") ||
          upper.includes("SALARY")
        ) {
          return "Income";
        }

        // Education
        if (upper.includes("EDUCATION") || upper.includes("STUDENT")) {
          return "Education";
        }

        // Default: convert snake_case to Title Case
        return plaidCategory
          .split("_")
          .map(
            (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join(" ");
      };

      // Calculate category breakdown using user-friendly categories with icons from DB
      const categoryMap: { [key: string]: { amount: number; count: number; icon?: string; categoryId?: string } } = {};
      let totalSpent = 0;

      recentTransactions.forEach((tx: any) => {
        const category = getUserFriendlyCategory(tx);
        const amount = Number(tx.amount) || 0;
        totalSpent += amount;

        if (!categoryMap[category]) {
          categoryMap[category] = { 
            amount: 0, 
            count: 0,
            icon: tx.categories?.icon,
            categoryId: tx.categories?.id || tx.category_id
          };
        }
        categoryMap[category].amount += amount;
        categoryMap[category].count += 1;
      });

      const categoryBreakdown: CategoryBreakdown[] = Object.entries(categoryMap)
        .map(([category, data]) => ({
          category,
          amount: data.amount,
          percentage: (data.amount / totalSpent) * 100,
          count: data.count,
          icon: data.icon,
          categoryId: data.categoryId,
        }))
        .sort((a, b) => b.amount - a.amount);

      // PATTERN CARD - Top categories with visual breakdown (only insight shown here)
      const top3 = categoryBreakdown.slice(0, 3);
      newInsights.push({
        id: "pattern",
        type: "pattern",
        title: "Your spending breakdown so far",
        subtitle: "", // Empty subtitle - visual boxes show the info
        icon: "", // No icon - title will be centered
        color: "#00CED1",
        data: { categories: top3, total: totalSpent },
      });

      // Initialize card animations
      for (let i = 0; i < newInsights.length; i++) {
        if (!cardAnimations[i]) {
          cardAnimations[i] = new Animated.Value(0);
        }
      }

      logger.info("✅ FinalScreen: Generated insights", {
        count: newInsights.length,
        types: newInsights.map((i) => i.type),
      });

      setInsights(newInsights);
      setIsLoadingInsights(false);
      setIsButtonEnabled(false);

      // Show loading animation for 2.5 seconds before showing insights
      setTimeout(() => {
        setShowLoadingAnimation(false);
      }, 2500);

      // Animate cards in with stagger
      if (cardAnimations.length > 0) {
        Animated.stagger(
          200,
          cardAnimations.slice(0, newInsights.length).map((anim) =>
            Animated.spring(anim, {
              toValue: 1,
              friction: 6,
              tension: 40,
              useNativeDriver: true,
            })
          )
        ).start();
      }
    } catch (error) {
      logger.error("❌ FinalScreen: Error loading insights", error);
      // Show error fallback
      setInsights([
        {
          id: "error",
          type: "surprise",
          title: "Something went wrong",
          subtitle:
            "We couldn't load your insights right now. Try again later.",
          icon: "alert-circle",
          color: "#FF6B6B",
        },
      ]);
      setIsLoadingInsights(false);
      setIsButtonEnabled(false);

      // Show loading animation for 2.5 seconds before showing error state
      setTimeout(() => {
        setShowLoadingAnimation(false);
      }, 2500);

      // Initialize animation for error card
      if (!cardAnimations[0]) {
        cardAnimations[0] = new Animated.Value(0);
      }
      Animated.spring(cardAnimations[0], {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  };


  useEffect(() => {
    logOnboardingEvent({ stage: "final", action: "view" });

    // Typing dots animation
    const dotAnimations = typingDotsAnim.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 150),
          Animated.timing(dot, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      )
    );
    Animated.parallel(dotAnimations).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(mascotBounce, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(mascotBounce, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();

    let cancelled = false;

    Animated.sequence([
      Animated.delay(350),
      Animated.spring(cardOpacity, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    const pollEarlyInsights = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          return;
        }

        // Fetch user's first name for fallback message
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name")
            .eq("id", user.id)
            .maybeSingle();
          if (profile?.first_name) {
            setUserFirstName(profile.first_name);
          }
        } catch (e) {
          logger.warn("⚠️ FinalScreen: Failed to fetch first name", e);
        }

        const maxPollTime = 30000; // 30 seconds max polling
        const startTime = Date.now();
        const pollInterval = 1500;

        while (!cancelled) {
          const { data, error } = await supabase
            .from("profiles")
            .select("early_insights")
            .eq("id", user.id)
            .single();

          const maybe = data?.early_insights;
          
          // Check for error marker
          if (
            maybe &&
            typeof maybe === "object" &&
            !Array.isArray(maybe) &&
            (maybe as any).error === "LLM_FAILED"
          ) {
            logger.info("⚠️ FinalScreen: LLM failed, showing fallback");
            setLlmFailed(true);
            return;
          }

          const hasCoachCopy =
            !!maybe &&
            typeof maybe === "object" &&
            !Array.isArray(maybe) &&
            typeof (maybe as any).intro_line === "string" &&
            typeof (maybe as any).mirror === "string" &&
            typeof (maybe as any).plan === "string" &&
            typeof (maybe as any).hook === "string" &&
            String((maybe as any).intro_line || "").trim().length > 0;

          if (!error && hasCoachCopy) {
            setEarlyInsights(maybe);
            return;
          }

          // Timeout after 30 seconds
          if (Date.now() - startTime >= maxPollTime) {
            logger.warn("⚠️ FinalScreen: Polling timeout, showing fallback");
            setLlmFailed(true);
            return;
          }

          await new Promise((r) => setTimeout(r, pollInterval));
        }
      } catch (e) {
        logger.warn("⚠️ FinalScreen: early_insights polling failed", e);
        setLlmFailed(true);
      }
    };

    loadInsights();
    pollEarlyInsights();

    return () => {
      cancelled = true;
      floatLoop.stop();
    };
  }, []);

  const handleComplete = async () => {
    if (!isButtonEnabled) return;

    // Rocket lift-off animation
    Animated.timing(rocketAnimation, {
      toValue: -10,
      duration: 200,
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(buttonScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();

    // Show Day 1 loading screen
    setIsLoading(true);

    // Start loading dots animation
    const animateLoadingDots = () => {
      const animations = loadingDotsAnim.map((anim, index) =>
        Animated.sequence([
          Animated.delay(index * 200),
          Animated.timing(anim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );

      Animated.loop(Animated.parallel(animations)).start();
    };

    animateLoadingDots();

    try {
      // Mark profiles completed
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error("No user ID found");
      }

      // Update database and verify it succeeded
      const { error: updateError, data: updateData } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true, onboarding_step: 4 })
        .eq("id", user.id)
        .select()
        .single();

      if (updateError) {
        logger.error("❌ Error updating profile to completed:", updateError);
        throw updateError;
      }

      if (!updateData?.onboarding_completed) {
        logger.error("❌ Profile update did not set onboarding_completed");
        throw new Error("Profile update failed");
      }

      logger.info("✅ Onboarding completed - profile updated:", {
        onboarding_completed: updateData.onboarding_completed,
        onboarding_step: updateData.onboarding_step,
      });
      logOnboardingEvent({ stage: "final", action: "complete" });

      // Clean up AsyncStorage after completion
      try {
        await AsyncStorage.multiRemove([
          "pending_profile_data",
          "pending_intent_answers",
        ]);
        logger.info("✅ Cleaned up onboarding AsyncStorage");
      } catch (storageError) {
        logger.error("Error cleaning up AsyncStorage:", storageError);
        // Don't fail onboarding if cleanup fails
      }

      // CRITICAL: Refresh navigation state in background (for future navigation)
      // But navigate directly to tabs to avoid redirect loop
      refreshNavigationState().catch((err) => {
        logger.error("Error refreshing navigation state:", err);
        // Don't block navigation if refresh fails
      });

      // Small delay to ensure DB consistency, then navigate directly
      // We navigate directly to tabs since we've verified the DB update succeeded
      // This avoids the redirect loop where index.tsx might see stale state
      await new Promise((resolve) => setTimeout(resolve, 300));

      logger.info("🚀 Navigating directly to authenticated app");
      router.replace("/(tabs)" as any);
    } catch (error) {
      logger.error("❌ Error completing onboarding:", error);
      setIsLoading(false);
      Alert.alert("Error", "Failed to complete onboarding. Please try again.");
    }
  };

  const renderInsightCard = (insight: InsightCard, index: number) => {
    const animValue = cardAnimations[index] || new Animated.Value(0);

    const isPattern = insight.type === "pattern";
    const breakdownStyle = isPattern
      ? {
          opacity: breakdownAnim,
          transform: [
            {
              translateY: breakdownAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 0],
              }),
            },
          ],
        }
      : null;

    return (
      <Animated.View
        key={insight.id}
        style={[
          styles.insightCard,
          isPattern && styles.patternInsightCard,
          isPattern && breakdownStyle,
          {
            opacity: animValue,
            transform: [
              {
                translateY: animValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
              {
                scale: animValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.95, 1],
                }),
              },
            ],
          },
        ]}
      >
        {insight.type === "pattern" ? (
          // Pattern card: centered title, no icon
          <View style={styles.patternCardHeader}>
            <Text style={styles.patternCardTitle}>{insight.title}</Text>
          </View>
        ) : (
          // Other cards: icon + title + subtitle
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.cardIconContainer,
                { backgroundColor: `${insight.color}20` },
              ]}
            >
              <Ionicons
                name={insight.icon as any}
                size={24}
                color={insight.color}
              />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>{insight.title}</Text>
              <Text style={styles.cardSubtitleInline}>{insight.subtitle}</Text>
            </View>
          </View>
        )}

        {/* Visual breakdown for pattern card */}
        {insight.type === "pattern" && insight.data?.categories && (
          <>
            <View style={styles.categoryBoxes}>
              {insight.data.categories
                .slice(0, 3)
                .map((cat: CategoryBreakdown, i: number) => {
                  // Use three distinct colors based on index
                  const boxColors = ["#6B8DD6", "#00D4AA", "#FF6B6B"];
                  const boxColor = boxColors[i] || "#607D8B";
                  
                  // Helper to determine if icon is emoji or Ionicons
                  const isEmoji = (icon: string) => {
                    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
                    return emojiRegex.test(icon);
                  };
                  
                  const iconValue = cat.icon || '💳';
                  const isIconEmoji = isEmoji(iconValue);
                  
                  return (
                    <View
                      key={i}
                      style={styles.categoryBox}
                    >
                      <View
                        style={[
                          styles.categoryBoxContent,
                          { backgroundColor: boxColor },
                        ]}
                      >
                        <View style={styles.categoryBoxIconContainer}>
                          {isIconEmoji ? (
                            <Text style={styles.categoryBoxIconEmoji}>
                              {iconValue}
                            </Text>
                          ) : (
                            <Ionicons
                              name={iconValue as any}
                              size={18}
                              color="#fff"
                            />
                          )}
                        </View>
                        <Text style={styles.categoryBoxName}>
                          {cat.category}
                        </Text>
                        <Text style={styles.categoryBoxAmount}>
                          {formatCurrency(cat.amount)}
                        </Text>
                        <View style={styles.categoryBoxPercentage}>
                          <Text style={styles.categoryBoxPercentageText}>
                            {Math.round(cat.percentage)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </View>
            {/* Subtle nudge text */}
            <Text style={styles.insightsNudgeText}>
              More insights unlock once you're inside
            </Text>
          </>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="rgba(10, 14, 20, 0.98)"
      />
      <LinearGradient
        colors={[
          "rgba(10, 14, 20, 0.98)",
          "rgba(22, 33, 62, 0.92)",
          "rgba(22, 33, 62, 0.92)",
          "rgba(10, 14, 20, 0.98)",
        ]}
        locations={[0, 0.3, 0.4, 1]}
        style={styles.gradientContainer}
      >
        {/* Day 1 Loading Screen */}
        {isLoading && (
          <Animated.View style={styles.loadingOverlay}>
            <View style={styles.loadingContent}>
              <Animated.Image
                source={require("../../assets/images/midleftshot.png")}
                resizeMode="contain"
                style={[styles.loadingMascot]}
              />
              <Text style={styles.loadingOverlayText}>
                Setting things up for you…
              </Text>
              <View style={styles.loadingDots}>
                {loadingDotsAnim.map((anim, index) => (
                  <Animated.View
                    key={index}
                    style={[styles.loadingDot, { opacity: anim }]}
                  />
                ))}
              </View>
            </View>
          </Animated.View>
        )}

        <SafeAreaView style={styles.mainContent} edges={["top", "bottom"]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[styles.cardsContainer, { opacity: cardOpacity }]}
            >
              <FirstReadCard
                introLine={introLine}
                typedIntro={firstReadTypedIntro}
                orderedRevealLines={firstReadOrderedRevealLines}
                revealedCount={firstReadRevealedCount}
                isTyping={firstReadIsTyping}
                showCaret={firstReadShowCaret}
                isLoading={firstReadIsLoading}
                isFallback={llmFailed}
              />

              {isLoadingInsights || showLoadingAnimation || !showBreakdown ? (
                <View style={styles.loadingContainer}>
                  <View style={styles.typingIndicatorContainer}>
                    <View style={styles.typingDotsContainer}>
                      {typingDotsAnim.map((dot, index) => (
                        <Animated.View
                          key={index}
                          style={[
                            styles.typingDot,
                            {
                              transform: [
                                {
                                  translateY: dot.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, -8],
                                  }),
                                },
                              ],
                              opacity: dot.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.4, 1],
                              }),
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.loadingText}>Loading your snapshot…</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.insightsContent}>
                  {insights.map((insight, index) =>
                    renderInsightCard(insight, index)
                  )}
                </View>
              )}
            </Animated.View>
          </ScrollView>

          <Animated.View
            style={[
              styles.footer,
              {
                opacity: footerAnim,
                transform: [
                  {
                    translateY: footerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.buttonContainer,
                {
                  transform: [{ scale: buttonScale }],
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.button,
                  !isButtonEnabled && styles.buttonDisabled,
                ]}
                onPress={handleComplete}
                activeOpacity={0.9}
                disabled={!isButtonEnabled}
              >
                <LinearGradient
                  colors={
                    isButtonEnabled ? ["#4A90E2", "#5DA0F2"] : ["#666", "#888"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      !isButtonEnabled && styles.buttonTextDisabled,
                    ]}
                  >
                    Let's Explore and Grow
                  </Text>
                  <Animated.View
                    style={{ transform: [{ translateY: rocketAnimation }] }}
                  >
                    <Ionicons
                      name="rocket-outline"
                      size={18}
                      color={isButtonEnabled ? "#fff" : "rgba(255,255,255,0.5)"}
                      style={styles.buttonIcon}
                    />
                  </Animated.View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(10, 14, 20, 0.98)",
  },
  gradientContainer: {
    flex: 1,
  },
  safeAreaTop: {
    flex: 0,
    backgroundColor: "transparent",
  },
  mainContent: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-start",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 12,
  },
  cardsContainer: {
    marginTop: Platform.OS === "ios" ? 8 : 6,
    paddingBottom: 0,
  },
  firstReadCard: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginHorizontal: Math.max(20, width * 0.05),
    marginTop: 22,
    padding: 16,
    paddingTop: 28,
    marginBottom: 15,
  },
  firstReadHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  firstReadMascot: {
    width: 28,
    height: 28,
    marginRight: 1,
    opacity: 0.95,
  },
  firstReadKicker: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontFamily: "ManropeSemiBold",
    color: "rgba(255,255,255,0.58)",
  },
  firstReadHero: {
    fontSize: 15,
    fontFamily: "ManropeBold",
    color: "#fff",
    lineHeight: 22,
    marginBottom: 10,
  },
  firstReadCaret: {
    color: "rgba(255,255,255,0.9)",
  },
  firstReadMirror: {
    fontSize: 13,
    fontFamily: "ManropeBold",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 20,
    marginBottom: 14,
  },
  firstReadRule: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.15)",
    paddingLeft: 10,
  },
  firstReadBody: {
    fontSize: 13,
    fontFamily: "Manrope",
    color: "rgba(255,255,255,0.85)",
    lineHeight: 19,
    marginBottom: 10,
  },
  firstReadHeroFallback: {
    fontFamily: "Manrope",
  },
  firstReadClose: {
    fontSize: 14,
    fontFamily: "ManropeMedium",
    color: "rgba(255,255,255,0.72)",
    lineHeight: 21,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
    marginLeft: Math.max(20, width * 0.05),
    marginRight: Math.max(20, width * 0.05),
  },
  insightsContent: {
    paddingHorizontal: Math.max(20, width * 0.05),
    paddingBottom: 0,
    marginTop: 32,
  },
  insightCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    marginBottom: 0,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  patternInsightCard: {
    maxHeight: SCREEN_HEIGHT * 0.25,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 2,
  },
  cardSubtitle: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    marginTop: 4,
  },
  cardSubtitleInline: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    marginTop: 2,
  },
  patternCardHeader: {
    alignItems: "center",
    marginBottom: 6,
  },
  patternCardTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
  categoryBoxes: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    marginTop: 12,
    // paddingHorizontal: 4,
    gap: 12,
  },
  categoryBox: {
    alignItems: "center",
    flex: 1,
    maxWidth: width * 0.3,
  },
  categoryBoxContent: {
    borderRadius: 20,
    padding: 12,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  categoryBoxIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  categoryBoxIconEmoji: {
    fontSize: 16,
  },
  categoryBoxName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
    lineHeight: 14,
    flexWrap: "wrap",
  },
  categoryBoxAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  categoryBoxPercentage: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryBoxPercentageText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  insightsNudgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.45)",
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 30,
    marginTop: 16,
  },
  typingIndicatorContainer: {
    alignItems: "center",
    gap: 16,
  },
  typingDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4A90E2",
  },
  loadingText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 15,
    fontFamily: "ManropeMedium",
  },
  footer: {
    paddingHorizontal: Math.max(20, width * 0.05),
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 20 : 16,
    backgroundColor: "transparent",
  },
  buttonContainer: {
    width: "100%",
    backgroundColor: "transparent",
  },
  button: {
    borderRadius: 30,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonIcon: {
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonTextDisabled: {
    color: "rgba(255,255,255,0.5)",
  },
  supportiveText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 14, 20, 0.95)",
    zIndex: 1000,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
    padding: 40,
  },
  loadingMascot: {
    width: 120,
    height: 120,
    borderRadius: 30,
    marginBottom: 20,
  },
  loadingOverlayText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 30,
  },
  loadingDots: {
    flexDirection: "row",
    alignItems: "center",
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4A90E2",
    marginHorizontal: 4,
    opacity: 0.3,
  },
  teaserCard: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  teaserContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  teaserIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  teaserTextContainer: {
    flex: 1,
  },
  teaserTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 6,
  },
  teaserSubtitle: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  featureCard: {
    backgroundColor: "rgba(0, 212, 170, 0.1)",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 170, 0.3)",
  },
  featureContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(0, 212, 170, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 12,
  },
  featurePoints: {
    gap: 10,
  },
  featurePoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featurePointText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    flex: 1,
  },
  featureSubtitle: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  achievementCard: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  achievementHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  achievementIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  achievementTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  achievementList: {
    gap: 8,
  },
  achievementItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  achievementText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13,
    fontWeight: "500",
  },
});

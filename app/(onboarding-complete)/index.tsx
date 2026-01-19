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

const { width } = Dimensions.get("window");

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
}

export default function FinalScreen() {
  const router = useRouter();
  const { refreshNavigationState } = useAuthNavigation();
  const [typedText, setTypedText] = useState("");
  const [typedHeadline, setTypedHeadline] = useState("");
  const [earlyInsights, setEarlyInsights] = useState<any | null>(null);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);
  const [isButtonEnabled, setIsButtonEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(true);
  const carouselRef = useRef<ScrollView>(null);

  // Typing dots animation for loading
  const typingDotsAnim = useRef([
    new Animated.Value(0.4),
    new Animated.Value(0.4),
    new Animated.Value(0.4),
  ]).current;

  const index = useRef(0);
  const messageLines = ["You're in."];
  const headlineLine = "Here's what jumps out already!";
  const cursorVisible = useRef(true);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;
  const rocketAnimation = useRef(new Animated.Value(0)).current;
  const cardAnimations = useRef<Animated.Value[]>([]).current;
  const mascotBounce = useRef(new Animated.Value(0)).current;
  const loadingDotsAnim = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;
  const typingSpeed = 20;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const getCategoryColor = (categoryName: string): string => {
    const colorMap: { [key: string]: string } = {
      Groceries: "#4CAF50",
      Food: "#FF6B6B",
      "Food & Dining": "#FF6B6B",
      "Dining Out": "#FF6B6B",
      Housing: "#8E44AD",
      Transportation: "#45B7D1",
      Shopping: "#4ECDC4",
      Entertainment: "#96CEB4",
      Subscriptions: "#FFA500",
      "Health & Fitness": "#FF6B9D",
      Health: "#FF6B9D",
      "Bills & Utilities": "#FFD700",
      "Personal Care": "#FFB6C1",
      Travel: "#00CED1",
      Education: "#9B59B6",
      "Savings & Investments": "#32D74B",
      Savings: "#32D74B",
      Income: "#4A90E2",
      Other: "#607D8B",
    };
    return colorMap[categoryName] || "#607D8B";
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

      // Fetch transactions directly from database
      // Use top_category (user-friendly) with fallback to category (raw Plaid)
      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select(
          "date, amount, merchant_name, name, category, top_category, new_category"
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

        // Initialize animation for welcome card (and teaser/feature cards)
        for (let i = 0; i < 3; i++) {
          if (!cardAnimations[i]) {
            cardAnimations[i] = new Animated.Value(0);
          }
        }
        Animated.stagger(
          200,
          cardAnimations.slice(0, 3).map((anim) =>
            Animated.spring(anim, {
              toValue: 1,
              friction: 6,
              tension: 40,
              useNativeDriver: true,
            })
          )
        ).start();
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

      // Calculate category breakdown using user-friendly categories
      const categoryMap: { [key: string]: { amount: number; count: number } } =
        {};
      let totalSpent = 0;

      recentTransactions.forEach((tx: any) => {
        const category = getUserFriendlyCategory(tx);
        const amount = Number(tx.amount) || 0;
        totalSpent += amount;

        if (!categoryMap[category]) {
          categoryMap[category] = { amount: 0, count: 0 };
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
        }))
        .sort((a, b) => b.amount - a.amount);

      // 1. SURPRISE CARD - Find something counterintuitive
      const biggestTransaction = recentTransactions.reduce(
        (max: any, tx: any) =>
          Number(tx.amount) > Number(max.amount) ? tx : max,
        recentTransactions[0]
      );

      // Find most frequent merchant
      const merchantMap: { [key: string]: number } = {};
      recentTransactions.forEach((tx: any) => {
        const merchant = tx.merchant_name || tx.name || "Unknown";
        merchantMap[merchant] = (merchantMap[merchant] || 0) + 1;
      });
      const mostFrequentMerchant = Object.entries(merchantMap).sort(
        (a, b) => b[1] - a[1]
      )[0];

      // Create surprise insight
      if (biggestTransaction && biggestTransaction.amount > 50) {
        const merchant =
          biggestTransaction.merchant_name ||
          biggestTransaction.name ||
          "a merchant";
        newInsights.push({
          id: "surprise",
          type: "surprise",
          title: `Your biggest spend: ${formatCurrency(
            biggestTransaction.amount
          )}`,
          subtitle: `at ${merchant} — that's ${Math.round(
            (biggestTransaction.amount / totalSpent) * 100
          )}% of your monthly spending`,
          icon: "flash",
          color: "#FF6B6B",
          data: { amount: biggestTransaction.amount, merchant },
        });
      } else if (mostFrequentMerchant && mostFrequentMerchant[1] >= 3) {
        newInsights.push({
          id: "surprise",
          type: "surprise",
          title: `You visited ${mostFrequentMerchant[0]} ${mostFrequentMerchant[1]} times`,
          subtitle: "this month — your most frequent spot",
          icon: "repeat",
          color: "#FFD700",
          data: {
            merchant: mostFrequentMerchant[0],
            count: mostFrequentMerchant[1],
          },
        });
      } else if (categoryBreakdown.length > 0) {
        const topCategory = categoryBreakdown[0];
        newInsights.push({
          id: "surprise",
          type: "surprise",
          title: `${topCategory.category} is your top category`,
          subtitle: `You spent ${formatCurrency(
            topCategory.amount
          )} (${Math.round(
            topCategory.percentage
          )}%) on ${topCategory.category.toLowerCase()} this month`,
          icon: "trending-up",
          color: "#4A90E2",
          data: topCategory,
        });
      }

      // 2. OPPORTUNITY CARD - Actionable insight (moved before pattern)
      try {
        const { data: rec } = await supabase.rpc(
          "get_recurring_streams_active",
          { p_user_id: user.id }
        );
        if (Array.isArray(rec) && rec.length > 0) {
          const subs = rec.filter((r: any) => r.stream_type === "subscription");
          if (subs.length > 0) {
            const subTotal = subs.reduce(
              (s: number, r: any) => s + Number(r.average_amount || 0),
              0
            );
            newInsights.push({
              id: "opportunity",
              type: "opportunity",
              title: `You're spending ${formatCurrency(
                subTotal
              )}/month on subscriptions`,
              subtitle: `That's ${
                subs.length
              } active subscriptions — ${formatCurrency(
                subTotal * 12
              )} per year`,
              icon: "card",
              color: "#FFA500",
              data: { total: subTotal, count: subs.length },
            });
          }
        }
      } catch (e) {
        logger.info("get_recurring_streams_active failed", e);
      }

      // If no opportunity card, create one based on spending
      if (!newInsights.find((i) => i.type === "opportunity")) {
        if (categoryBreakdown.length > 0) {
          const topCategory = categoryBreakdown[0];
          const potentialSavings = Math.round(topCategory.amount * 0.1); // 10% reduction
          if (potentialSavings > 20) {
            newInsights.push({
              id: "opportunity",
              type: "opportunity",
              title: `Save ${formatCurrency(potentialSavings)}/month`,
              subtitle: `Cut back 10% on ${topCategory.category.toLowerCase()} and you'll save ${formatCurrency(
                potentialSavings * 12
              )} per year`,
              icon: "bulb",
              color: "#00D4AA",
              data: {
                savings: potentialSavings,
                category: topCategory.category,
              },
            });
          }
        }
      }

      // 3. PATTERN CARD - Top 3 categories with visual breakdown (moved to 3rd position)
      if (categoryBreakdown.length >= 2) {
        const top3 = categoryBreakdown.slice(0, 3);
        newInsights.push({
          id: "pattern",
          type: "pattern",
          title: "Your spending breakdown",
          subtitle: "", // Empty subtitle - visual boxes show the info
          icon: "", // No icon - title will be centered
          color: "#00CED1",
          data: { categories: top3, total: totalSpent },
        });
      }

      // Initialize card animations (including teaser and feature cards)
      const totalCards = newInsights.length + 2; // +2 for teaser and feature cards
      for (let i = 0; i < totalCards; i++) {
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
      // Don't enable button initially - wait for user to swipe to slide 2
      setIsButtonEnabled(false);

      // Show loading animation for 2.5 seconds before showing insights
      setTimeout(() => {
        setShowLoadingAnimation(false);
      }, 2500);

      // Animate cards in with stagger (including teaser and social proof)
      if (cardAnimations.length > 0) {
        Animated.stagger(
          200,
          cardAnimations.slice(0, totalCards).map((anim) =>
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

      // Initialize animation for error card (and teaser/feature cards)
      for (let i = 0; i < 3; i++) {
        if (!cardAnimations[i]) {
          cardAnimations[i] = new Animated.Value(0);
        }
      }
      Animated.stagger(
        200,
        cardAnimations.slice(0, 3).map((anim) =>
          Animated.spring(anim, {
            toValue: 1,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          })
        )
      ).start();
    }
  };

  // Enable button after insights load
  useEffect(() => {
    if ((!isLoadingInsights && insights.length > 0) || !!earlyInsights) {
      // Mascot bounce celebration
      Animated.sequence([
        Animated.timing(mascotBounce, {
          toValue: -8,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(mascotBounce, {
          toValue: 0,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();

      // Button pulse effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(buttonPulse, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(buttonPulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isLoadingInsights, insights, earlyInsights]);

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

    let introTimeout: ReturnType<typeof setTimeout> | null = null;
    let headlineTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const typeLine = ({
      line,
      setLine,
      speedMs,
      setTimer,
    }: {
      line: string;
      setLine: React.Dispatch<React.SetStateAction<string>>;
      speedMs: number;
      setTimer: (t: ReturnType<typeof setTimeout>) => void;
    }) => {
      let idx = 0;
      const tick = () => {
        if (cancelled) return;
        idx += 1;
        setLine(line.slice(0, idx));
        if (idx < line.length) {
          const variance = Math.random() * 30 - 15;
          const next = Math.max(10, speedMs + variance);
          setTimer(setTimeout(tick, next));
        }
      };
      tick();
    };

    introTimeout = setTimeout(() => {
      typeLine({
        line: messageLines.join("\n"),
        setLine: setTypedText,
        speedMs: typingSpeed,
        setTimer: (t: ReturnType<typeof setTimeout>) => {
          introTimeout = t;
        },
      });
    }, 250);

    headlineTimeout = setTimeout(() => {
      typeLine({
        line: headlineLine,
        setLine: setTypedHeadline,
        speedMs: 18,
        setTimer: (t: ReturnType<typeof setTimeout>) => {
          headlineTimeout = t;
        },
      });
    }, 650);

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

        while (!cancelled) {
          const { data, error } = await supabase
            .from("profiles")
            .select("early_insights")
            .eq("id", user.id)
            .single();

          const maybe = data?.early_insights;
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

          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        logger.warn("⚠️ FinalScreen: early_insights polling failed", e);
      }
    };

    loadInsights();
    pollEarlyInsights();

    return () => {
      cancelled = true;
      if (introTimeout) clearTimeout(introTimeout);
      if (headlineTimeout) clearTimeout(headlineTimeout);
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

    return (
      <Animated.View
        key={insight.id}
        style={[
          styles.insightCard,
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
          <View style={styles.categoryBoxes}>
            {insight.data.categories
              .slice(0, 3)
              .map((cat: CategoryBreakdown, i: number) => {
                // Use three distinct colors based on index
                const boxColors = ["#6B8DD6", "#00D4AA", "#FF6B6B"];
                const boxColor = boxColors[i] || "#607D8B";
                const isFirst = i === 0;
                const isLast = i === 2;
                return (
                  <View
                    key={i}
                    style={[
                      styles.categoryBox,
                      isFirst && styles.categoryBoxFirst,
                      isLast && styles.categoryBoxLast,
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryBoxContent,
                        { backgroundColor: boxColor },
                      ]}
                    >
                      <Text style={styles.categoryBoxName} numberOfLines={1}>
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
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={styles.header}>
              <Text style={styles.doneText}>
                You've already done the hardest part — showing up! 🎉
              </Text>
              {/* <Text style={styles.subText}>
                Your journey begins today — one step at a time.
              </Text> */}
            </View>

            <Animated.View style={[styles.finnyBox]}>
              <Animated.Image
                source={require("../../assets/images/midleftshot.png")}
                // resizeMode="contain"
                style={[styles.mascot]}
              />
              <Text style={styles.finnyText}>{typedText}</Text>
            </Animated.View>

            <Text style={styles.headlineText}>{typedHeadline}</Text>

            <Animated.View
              style={[styles.cardsContainer, { opacity: cardOpacity }]}
            >
              {earlyInsights ? (
                <View style={styles.earlyInsightsCard}>
                  <Text style={styles.earlyInsightsKicker}>Finny’s first read</Text>
                  <Text style={styles.earlyInsightsIntro}>
                    {String(earlyInsights?.intro_line || "").trim()}
                  </Text>
                  <Text style={styles.earlyInsightsBody}>
                    {String(earlyInsights?.mirror || "").trim()}
                  </Text>
                  <Text style={styles.earlyInsightsBody}>
                    {String(earlyInsights?.plan || "").trim()}
                  </Text>
                  <Text style={styles.earlyInsightsHook}>
                    {String(earlyInsights?.hook || "").trim()}
                  </Text>
                </View>
              ) : (
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
                    <Text style={styles.loadingText}>
                      Finny is reading 6 months…
                    </Text>
                  </View>
                </View>
              )}

              {isLoadingInsights || showLoadingAnimation ? (
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
                <View style={styles.carouselContainer}>
                  <ScrollView
                    ref={carouselRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    onMomentumScrollEnd={(event) => {
                      const slideIndex = Math.round(
                        event.nativeEvent.contentOffset.x / width
                      );
                      setCurrentSlide(slideIndex);
                      // Enable button only when user reaches slide 2, disable on slide 1
                      setIsButtonEnabled(slideIndex === 1);
                    }}
                    scrollEventThrottle={16}
                  >
                  {/* Slide 1: Insight Cards */}
                  <View style={styles.carouselSlide}>
                    <View style={styles.insightsContent}>
                      {insights.map((insight, index) =>
                        renderInsightCard(insight, index)
                      )}
                    </View>
                  </View>

                  {/* Slide 2: Teaser + Feature + Achievement */}
                  <View style={styles.carouselSlide}>
                    <View style={styles.slide2Content}>
                      {/* Teaser Card - More Insights Waiting */}
                      {insights.length > 0 &&
                        cardAnimations[insights.length] && (
                          <Animated.View
                            style={[
                              styles.teaserCard,
                              {
                                opacity: cardAnimations[insights.length],
                                transform: [
                                  {
                                    translateY: cardAnimations[
                                      insights.length
                                    ].interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [20, 0],
                                    }),
                                  },
                                ],
                              },
                            ]}
                          >
                            <View style={styles.teaserContent}>
                              <View style={styles.teaserIconContainer}>
                                <Ionicons
                                  name="sparkles"
                                  size={22}
                                  color="#FFD700"
                                />
                              </View>
                              <View style={styles.teaserTextContainer}>
                                <Text style={styles.teaserTitle}>
                                  {insights.length === 1
                                    ? "3 more insights"
                                    : "7+ more insights"}{" "}
                                  waiting for you
                                </Text>
                                <Text style={styles.teaserSubtitle}>
                                  Discover recurring subscriptions, spending
                                  trends, and personalized recommendations
                                </Text>
                              </View>
                            </View>
                          </Animated.View>
                        )}

                      {/* Feature Preview Card */}
                      {insights.length > 0 &&
                        cardAnimations[insights.length + 1] && (
                          <Animated.View
                            style={[
                              styles.featureCard,
                              {
                                opacity: cardAnimations[insights.length + 1],
                                transform: [
                                  {
                                    translateY: cardAnimations[
                                      insights.length + 1
                                    ].interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [20, 0],
                                    }),
                                  },
                                ],
                              },
                            ]}
                          >
                            <View style={styles.featureContent}>
                              <View style={styles.featureIconContainer}>
                                <Ionicons
                                  name="chatbubbles"
                                  size={22}
                                  color="#00D4AA"
                                />
                              </View>
                              <View style={styles.featureTextContainer}>
                                <Text style={styles.featureTitle}>
                                  Chat with Finny, your AI Money Coach
                                </Text>
                                <View style={styles.featurePoints}>
                                  <View style={styles.featurePoint}>
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={14}
                                      color="#00D4AA"
                                    />
                                    <Text style={styles.featurePointText}>
                                      Get personalized financial advice
                                    </Text>
                                  </View>
                                  <View style={styles.featurePoint}>
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={14}
                                      color="#00D4AA"
                                    />
                                    <Text style={styles.featurePointText}>
                                      Track and achieve your goals
                                    </Text>
                                  </View>
                                  <View style={styles.featurePoint}>
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={14}
                                      color="#00D4AA"
                                    />
                                    <Text style={styles.featurePointText}>
                                      Understand your spending patterns
                                    </Text>
                                  </View>
                                  <View style={styles.featurePoint}>
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={14}
                                      color="#00D4AA"
                                    />
                                    <Text style={styles.featurePointText}>
                                      Get answers to money questions
                                    </Text>
                                  </View>
                                  <View style={styles.featurePoint}>
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={14}
                                      color="#00D4AA"
                                    />
                                    <Text style={styles.featurePointText}>
                                      Ready to grow wealth?
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </View>
                          </Animated.View>
                        )}
                    </View>
                  </View>
                  </ScrollView>

                  {/* Carousel Indicators */}
                  <View style={styles.carouselIndicators}>
                    <View
                      style={[
                        styles.carouselIndicator,
                        currentSlide === 0 && styles.carouselIndicatorActive,
                      ]}
                    />
                    <View
                      style={[
                        styles.carouselIndicator,
                        currentSlide === 1 && styles.carouselIndicatorActive,
                      ]}
                    />
                  </View>
                </View>
              )}
            </Animated.View>
          </ScrollView>

          <View style={styles.footer}>
            <Animated.View
              style={[
                styles.buttonContainer,
                {
                  transform: [{ scale: buttonScale }, { scale: buttonPulse }],
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
          </View>
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
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  header: {
    alignItems: "center",
    marginBottom: 8,
    paddingTop: Platform.OS === "ios" ? 40 : 36,
  },
  doneText: {
    fontSize: width < 375 ? 18 : 20,
    fontFamily: "ManropeExtraBold",
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: Math.max(20, width * 0.05),
  },
  subText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
  },
  finnyBox: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 18,
    marginHorizontal: Math.max(20, width * 0.05),
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    minHeight: 80,
  },
  mascot: {
    width: 64,
    height: 64,
    marginRight: 12,
    borderRadius: 18,
  },
  finnyText: {
    fontSize: 15,
    color: "#fff",
    fontFamily: "ManropeSemiBold",
    lineHeight: 22,
    flex: 1,
  },
  headlineText: {
    fontSize: width < 375 ? 22 : 24,
    fontFamily: "ManropeExtraBold",
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: Math.max(20, width * 0.05),
    marginTop: 4,
    marginBottom: 10,
  },
  cardsContainer: {
    marginTop: 12,
  },
  earlyInsightsCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginHorizontal: Math.max(20, width * 0.05),
    padding: 18,
  },
  earlyInsightsKicker: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "ManropeSemiBold",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 10,
  },
  earlyInsightsIntro: {
    fontSize: 17,
    fontFamily: "ManropeSemiBold",
    color: "#fff",
    lineHeight: 24,
    marginBottom: 10,
  },
  earlyInsightsBody: {
    fontSize: 15,
    fontFamily: "Manrope",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 22,
    marginBottom: 10,
  },
  earlyInsightsHook: {
    fontSize: 14,
    fontFamily: "ManropeMedium",
    color: "rgba(255,255,255,0.72)",
    lineHeight: 21,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
    marginLeft: Math.max(20, width * 0.05),
    marginRight: Math.max(20, width * 0.05),
  },
  insightsScroll: {
    flex: 1,
  },
  insightsContent: {
    paddingHorizontal: Math.max(20, width * 0.05),
    paddingBottom: 20,
    flexGrow: 1,
  },
  carouselContainer: {
    marginTop: 14,
    minHeight: 520,
  },
  carouselSlide: {
    width: width,
    justifyContent: "flex-start",
    minHeight: 520,
  },
  carouselIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  carouselIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  carouselIndicatorActive: {
    backgroundColor: "#4A90E2",
    width: 24,
  },
  insightCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    marginBottom: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
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
    marginBottom: 8,
  },
  patternCardTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    textAlign: "center",
  },
  categoryBoxes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
    paddingHorizontal: 4,
  },
  categoryBox: {
    alignItems: "center",
    flex: 1,
    minWidth: 50,
    maxWidth: 80,
  },
  categoryBoxFirst: {
    marginLeft: 10,
  },
  categoryBoxLast: {
    marginRight: 10,
  },
  categoryBoxContent: {
    borderRadius: 12,
    padding: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    width: "100%",
    minHeight: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryBoxName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    marginBottom: 6,
  },
  categoryBoxAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
  },
  categoryBoxPercentage: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryBoxPercentageText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
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
  slide2Content: {
    paddingHorizontal: Math.max(20, width * 0.05),
    paddingBottom: 20,
    flexGrow: 1,
    gap: 30,
  },
  footer: {
    paddingHorizontal: Math.max(20, width * 0.05),
    paddingBottom: Platform.OS === "ios" ? 16 : 12,
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

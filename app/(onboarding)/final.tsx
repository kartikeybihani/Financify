// FinalScreen.tsx - Full Redesign with Smart Animations, Rich Messaging, and Elegant Transitions

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
  FlatList,
  ViewToken,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/app/_lib/supabase/supabase";
import type { ComponentProps } from "react";
import logger from "@/app/_utils/logger";

const { width, height } = Dimensions.get("window");

type IconName = ComponentProps<typeof Ionicons>["name"];

interface CardItem {
  icon: IconName;
  color: string;
  text: string;
}

const finalCards: CardItem[] = [
  {
    icon: "cash-outline",
    color: "#FFD700",
    text: "Let's set a savings goal you're excited about.",
  },
  {
    icon: "calendar",
    color: "#98FB98",
    text: "Want a plan to clear your debt faster? I've got ideas.",
  },
  {
    icon: "leaf-outline",
    color: "#87CEFA",
    text: "One new habit a week. Simple. Powerful. Doable.",
  },
  {
    icon: "compass",
    color: "#F08080",
    text: "You're steering. I'm just helping you see the path.",
  },
  {
    icon: "shield-checkmark",
    color: "#FF69B4",
    text: "An emergency fund starts with $10/week. Ready?",
  },
  {
    icon: "document-text-outline",
    color: "#00CED1",
    text: "Let's kill those useless subscriptions together.",
  },
  {
    icon: "heart-half-outline",
    color: "#DA70D6",
    text: "You're doing better than you think. I'll nudge when needed.",
  },
  {
    icon: "timer-outline",
    color: "#FFA500",
    text: "We're playing the long game. Every step counts.",
  },
  {
    icon: "trending-up-outline",
    color: "#20B2AA",
    text: "Smart investing starts with small, consistent steps.",
  },
  {
    icon: "people-outline",
    color: "#FFB6C1",
    text: "You're joining thousands already on this journey.",
  },
];

const CARD_HEIGHT = 75;
const CARDS_PER_SLIDE = 3;
const SLIDE_WIDTH = width;
const SPACING = 5;

// Reorganize cards into slides
const carouselSlides = finalCards.reduce((acc, curr, i) => {
  const slideIndex = Math.floor(i / CARDS_PER_SLIDE);
  if (!acc[slideIndex]) {
    acc[slideIndex] = [];
  }
  acc[slideIndex].push(curr);
  return acc;
}, [] as (typeof finalCards)[]);

export default function FinalScreen() {
  const router = useRouter();
  const [typedText, setTypedText] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [isButtonEnabled, setIsButtonEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const index = useRef(0);
  const message =
    "Hey, I'm Finny. Respect money and it'll respect you. Let's build your wealth story — together.";
  const cursorVisible = useRef(true);
  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const textAnim = useRef(new Animated.Value(0)).current;
  const boxHeight = useRef(new Animated.Value(80)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;
  const rocketAnimation = useRef(new Animated.Value(0)).current;
  const cardFloat = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const mascotBounce = useRef(new Animated.Value(0)).current;
  const loadingDotsAnim = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;
  const gradientShift = useRef(new Animated.Value(0)).current;
  const typingSpeed = 30; // Reduced from 50 to 30ms per character

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const newActiveSlide = viewableItems[0].index || 0;
        setActiveSlide(newActiveSlide);
        // Enable button only when user reaches the last slide
        const shouldEnable = newActiveSlide === carouselSlides.length - 1;
        setIsButtonEnabled(shouldEnable);

        // Animate progress line
        Animated.timing(progressAnimation, {
          toValue: (newActiveSlide + 1) / carouselSlides.length,
          duration: 500,
          useNativeDriver: false,
        }).start();

        // Gradient shift for momentum feel
        Animated.timing(gradientShift, {
          toValue: newActiveSlide / carouselSlides.length,
          duration: 500,
          useNativeDriver: false,
        }).start();

        // Pulse button when enabled + micro celebration
        if (shouldEnable) {
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
      }
    }
  ).current;

  useEffect(() => {
    // Cursor blink animation
    const cursorInterval = setInterval(() => {
      cursorVisible.current = !cursorVisible.current;
      setTypedText(
        (prev) => prev.replace(/\|$/, "") + (cursorVisible.current ? "|" : "")
      );
    }, 500);

    // Initial box animation
    Animated.spring(boxHeight, {
      toValue: 120,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();

    // Text typing animation with natural feel
    let typingTimeout: ReturnType<typeof setTimeout>;
    const typeNextChar = () => {
      if (index.current < message.length) {
        setTypedText(
          message.substring(0, index.current + 1) +
            (cursorVisible.current ? "|" : "")
        );
        index.current++;

        // Vary typing speed slightly for natural feel
        const variance = Math.random() * 30 - 15; // ±15ms variance
        typingTimeout = setTimeout(typeNextChar, typingSpeed + variance);
      } else {
        // Show cards after typing
        Animated.sequence([
          Animated.delay(300),
          Animated.spring(cardOpacity, {
            toValue: 1,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          }),
        ]).start();

        // Start subtle card floating animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(cardFloat, {
              toValue: 1,
              duration: 3000,
              useNativeDriver: true,
            }),
            Animated.timing(cardFloat, {
              toValue: 0,
              duration: 3000,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    };

    typingTimeout = setTimeout(typeNextChar, 500); // Initial delay
    return () => {
      clearTimeout(typingTimeout);
      clearInterval(cursorInterval);
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
      // Update Supabase user metadata
      const { error } = await supabase.auth.updateUser({
        data: { onboarding_complete: true },
      });

      if (error) {
        logger.error("Error updating user metadata:", error);
        setIsLoading(false);
        return;
      }

      // Store in AsyncStorage for hot reload persistence during development
      await AsyncStorage.setItem("onboarding_complete", "true");
      await AsyncStorage.setItem("user_authenticated", "true");

      logger.info(
        "✅ Onboarding completed - stored in both Supabase and AsyncStorage"
      );

      // Wait for loading animation
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 2000);
    } catch (error) {
      logger.error("Error completing onboarding:", error);
      setIsLoading(false);
    }
  };

  const renderSlide = ({
    item: slideCards,
    index: slideIndex,
  }: {
    item: typeof finalCards;
    index: number;
  }) => (
    <View style={[styles.slide, { width: SLIDE_WIDTH - SPACING * 2 }]}>
      {slideCards.map((card, cardIndex) => (
        <Animated.View
          key={cardIndex}
          style={[
            styles.card,
            {
              transform: [
                {
                  translateX: cardOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [cardIndex % 2 === 0 ? -50 : 50, 0],
                  }),
                },
                {
                  translateY: cardFloat.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -3 + cardIndex * 2], // Staggered float
                  }),
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: `${card.color}15` },
            ]}
          >
            <Ionicons name={card.icon} size={24} color={card.color} />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardText}>{card.text}</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );

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
        {/* Animated overlay for gradient shift effect */}
        <Animated.View
          style={[
            styles.gradientOverlay,
            {
              opacity: gradientShift.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.3],
              }),
            },
          ]}
        />
        <SafeAreaView style={styles.safeAreaTop} />

        {/* Day 1 Loading Screen */}
        {isLoading && (
          <Animated.View style={styles.loadingOverlay}>
            <View style={styles.loadingContent}>
              <Animated.Image
                source={require("../assets/mascot1.jpg")}
                resizeMode="contain"
                style={[styles.loadingMascot, { transform: [{ scaleX: -1 }] }]}
              />
              <Text style={styles.loadingText}>Setting things up for you…</Text>
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

        <SafeAreaView style={styles.mainContent}>
          <View style={styles.header}>
            <Text style={styles.doneText}>
              You've already done the hardest part — showing up! 🎉
            </Text>
            {/* <Text style={styles.subText}>
              Your journey begins today — one step at a time.
            </Text> */}
          </View>

          <Animated.View style={[styles.finnyBox, { height: boxHeight }]}>
            <Animated.Image
              source={require("../assets/mascot1.jpg")}
              resizeMode="contain"
              style={[
                styles.mascot,
                {
                  transform: [{ scaleX: -1 }, { translateY: mascotBounce }],
                },
              ]}
            />
            <Text style={styles.finnyText}>{typedText}</Text>
          </Animated.View>

          <Animated.View
            style={[styles.cardsContainer, { opacity: cardOpacity }]}
          >
            <Text style={styles.sectionTitle}>
              Small wins add up faster than you think.
            </Text>

            <FlatList
              data={carouselSlides}
              keyExtractor={(_, index) => index.toString()}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={width}
              decelerationRate="fast"
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              contentContainerStyle={styles.carouselContent}
              renderItem={renderSlide}
            />

            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressLine,
                    {
                      width: progressAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                    },
                  ]}
                />
              </View>
              <View style={styles.progressEndpoint}>
                <Text style={styles.day1Text}>Day 1</Text>
              </View>
            </View>
          </Animated.View>

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
                    Start Your Day 1
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
            {/* <Text style={styles.supportiveText}>
              Others started Day 1 this week — now it's your turn.
            </Text> */}
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
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(32, 43, 72, 0.4)",
    pointerEvents: "none",
  },
  safeAreaTop: {
    flex: 0,
    backgroundColor: "transparent",
  },
  mainContent: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  doneText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  subText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
  },
  finnyBox: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 16,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  mascot: {
    width: 80,
    height: 80,
    marginRight: 12,
    borderRadius: 20,
  },
  finnyText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
    lineHeight: 22,
    flex: 1,
  },
  cardsContainer: {
    flex: 1,
    marginTop: 20, // Added margin top
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 16,
    marginLeft: 24,
  },
  carousel: {
    marginLeft: (width - SLIDE_WIDTH) / 2 - SPACING,
  },
  carouselContent: {
    paddingHorizontal: 0,
  },
  slide: {
    width: width,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  card: {
    width: "100%",
    height: CARD_HEIGHT,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 14,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  cardText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 40,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressLine: {
    height: "100%",
    backgroundColor: "#4A90E2",
    borderRadius: 2,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  progressEndpoint: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.4)",
  },
  day1Text: {
    color: "#4A90E2",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 20 : 16,
    backgroundColor: "transparent",
  },
  buttonContainer: {
    width: "100%",
    backgroundColor: "transparent",
  },
  button: {
    borderRadius: 12,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
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
  loadingText: {
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
});

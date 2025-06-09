// FinalScreen.tsx - Full Redesign with Smart Animations, Rich Messaging, and Elegant Transitions

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  SafeAreaView,
  Image,
  Platform,
  FlatList,
  ViewToken,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase/supabase";
import type { ComponentProps } from "react";

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
];

const CARD_WIDTH = width * 0.85;
const CARD_HEIGHT = 90;
const CARDS_PER_SLIDE = 3;

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
  const index = useRef(0);
  const message = "Hey, I'm Finny. Let's build your wealth story — together.";
  const cursorVisible = useRef(true);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const textAnim = useRef(new Animated.Value(0)).current;
  const boxHeight = useRef(new Animated.Value(80)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const typingSpeed = 50; // ms per character

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setActiveSlide(viewableItems[0].index || 0);
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
    let typingTimeout: NodeJS.Timeout;
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
      }
    };

    typingTimeout = setTimeout(typeNextChar, 500); // Initial delay
    return () => {
      clearTimeout(typingTimeout);
      clearInterval(cursorInterval);
    };
  }, []);

  const handleComplete = async () => {
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

    const { error } = await supabase.auth.updateUser({
      data: { onboarding_complete: true },
    });
    if (!error) router.replace("/(tabs)");
  };

  const renderSlide = ({
    item: slideCards,
    index: slideIndex,
  }: {
    item: typeof finalCards;
    index: number;
  }) => (
    <View style={styles.slide}>
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
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#0D1117", "#121212", "#1A1A2E"]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <Text style={styles.doneText}>That's it! You're In</Text>
          <Text style={styles.subText}>
            Your journey to financial freedom starts now
          </Text>
        </View>

        <Animated.View style={[styles.finnyBox, { height: boxHeight }]}>
          <Image
            source={require("../assets/mascot1.jpg")}
            resizeMode="contain"
            style={[styles.mascot, { transform: [{ scaleX: -1 }] }]}
          />
          <Text style={styles.finnyText}>{typedText}</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.cardsContainer,
            {
              opacity: cardOpacity,
              transform: [
                {
                  translateY: cardOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.sectionTitle}>
            Here's what we'll achieve together:
          </Text>

          <FlatList
            data={carouselSlides}
            keyExtractor={(_, index) => index.toString()}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={styles.carouselContent}
            renderItem={renderSlide}
          />

          <View style={styles.paginationDots}>
            {carouselSlides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === activeSlide
                        ? "#4A90E2"
                        : "rgba(255,255,255,0.3)",
                    width: index === activeSlide ? 16 : 6,
                  },
                ]}
              />
            ))}
          </View>
        </Animated.View>

        <View style={styles.footer}>
          <Animated.View
            style={[
              styles.buttonContainer,
              { transform: [{ scale: buttonScale }] },
            ]}
          >
            <TouchableOpacity
              style={styles.button}
              onPress={handleComplete}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={["#4A90E2", "#5DA0F2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Let's Make It Happen!</Text>
                <Ionicons
                  name="rocket-outline"
                  size={18}
                  color="#fff"
                  style={styles.buttonIcon}
                />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1117" },
  gradient: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  doneText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  subText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
  },
  finnyBox: {
    backgroundColor: "rgba(74,144,226,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(74,144,226,0.15)",
    padding: 16,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  mascot: {
    width: 40,
    height: 40,
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
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
    marginLeft: 24,
  },
  carouselContent: {
    paddingBottom: 10,
  },
  slide: {
    width: width,
    paddingHorizontal: 20,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: "rgba(31, 41, 55, 0.8)",
    borderRadius: 14,
    marginBottom: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
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
  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 10,
    height: 16,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 20 : 16,
  },
  buttonContainer: {
    width: "100%",
  },
  button: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  buttonGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonIcon: {
    marginLeft: 8,
  },
});

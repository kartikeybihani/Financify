// app/(onboarding)/final.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  SafeAreaView,
  PanResponder,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { supabase } from "../lib/supabase/supabase";

const { width, height } = Dimensions.get("window");

const finalCards = [
  {
    icon: "lightbulb",
    text: "Let's set a savings goal together — what's something you'd love to achieve this year?",
  },
  {
    icon: "calendar-check",
    text: "Want help planning out your debt payoff timeline? I've got ideas.",
  },
  {
    icon: "smile",
    text: "Small wins lead to big change. Let's build one new habit this week.",
  },
  {
    icon: "user-check",
    text: "You're in control. I'm just here to help you see the path more clearly.",
  },
  {
    icon: "donate",
    text: "Have you thought about building an emergency fund? Even $10/week makes a difference.",
  },
  {
    icon: "coins",
    text: "We can review your subscriptions and cut the waste. Want to try that?",
  },
  {
    icon: "hands-helping",
    text: "I'll keep nudging you, but you're the one steering. And you're doing great.",
  },
  {
    icon: "road",
    text: "We're playing the long game. Every step you take counts.",
  },
];

export default function FinalScreen() {
  const router = useRouter();
  const [typedText, setTypedText] = useState("");
  const index = useRef(0);
  const message =
    "Hi! I'm Finny, your Next Gen Financial Planner. I'm here to help you build wealth and achieve your money goals.";

  const [topCardIndex, setTopCardIndex] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > width * 0.25) {
          Animated.timing(pan, {
            toValue: { x: gesture.dx > 0 ? width : -width, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            setTopCardIndex((prev) =>
              Math.min(prev + 1, finalCards.length - 1)
            );
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 5,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      if (index.current < message.length) {
        setTypedText((prev) => prev + message[index.current]);
        index.current += 1;
      }
    }, 20);
    return () => clearTimeout(timeout);
  }, [typedText]);

  const handleComplete = async () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(buttonScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();

    const { error } = await supabase.auth.updateUser({
      data: { onboarding_complete: true },
    });
    if (!error) router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#1A1A2E", "#16213E", "#0D1117"]}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Text style={styles.doneText}>That's it! You're done.</Text>
          <View style={styles.finnyRow}>
            <Ionicons
              name="sparkles"
              size={28}
              color="#4A90E2"
              style={styles.sparkleIcon}
            />
            <Text style={styles.finnyText}>
              {typedText}
              <Text style={styles.cursor}>|</Text>
            </Text>
          </View>

          <View style={styles.cardStack}>
            {finalCards.slice(topCardIndex).map((card, i) => {
              const isTop = i === 0;
              const zIndex = finalCards.length - i;
              const offset = i * 10;
              const cardBg = isTop ? "#1F2937" : "#222C3D";
              return (
                <Animated.View
                  key={topCardIndex + i}
                  {...(isTop ? panResponder.panHandlers : {})}
                  style={[
                    styles.card,
                    isTop && { transform: pan.getTranslateTransform() },
                    {
                      top: offset,
                      zIndex,
                      backgroundColor: cardBg,
                      opacity: isTop ? 1 : 0.5,
                    },
                  ]}
                >
                  <FontAwesome5
                    name={card.icon}
                    size={26}
                    color="#4A90E2"
                    style={styles.cardIcon}
                  />
                  <Text style={styles.cardText}>{card.text}</Text>
                </Animated.View>
              );
            })}
          </View>

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
                <Text style={styles.buttonText}>Let's Build My Plan</Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#fff"
                  style={styles.buttonIcon}
                />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1117" },
  gradient: { flex: 1 },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "flex-start",
  },
  doneText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#fff",
    marginTop: 16,
    marginBottom: 24,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  finnyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 42,
    flexWrap: "wrap",
    backgroundColor: "rgba(74,144,226,0.1)",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(74,144,226,0.2)",
  },
  sparkleIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  finnyText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "700",
    lineHeight: 26,
    flex: 1,
  },
  cursor: {
    opacity: 0.5,
  },
  cardStack: {
    height: height * 0.38,
    position: "relative",
    marginBottom: 64,
    justifyContent: "center",
  },
  card: {
    position: "absolute",
    width: "100%",
    height: height * 0.25,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(74,144,226,0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    justifyContent: "center",
  },
  cardIcon: {
    marginBottom: 16,
  },
  cardText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
  },
  buttonContainer: {
    marginTop: "auto",
    marginBottom: Platform.OS === "ios" ? 8 : 24,
  },
  button: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonGradient: {
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  buttonIcon: {
    marginLeft: 8,
  },
});

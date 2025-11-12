import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const FINANCE_FACTS = [
  "💡 73% of Gen Z wish they started investing earlier",
  "💡 The average person spends $1,497/month on subscriptions",
  "💡 Building a $1M net worth starts with tracking your first $100",
  "💡 Most millionaires check their finances weekly, not daily",
  "💡 40% of Americans can't cover a $400 emergency expense",
  "💡 Starting to invest at 25 vs 35 can mean $1M+ difference",
  "💡 The average Gen Z has $29,000 in debt by age 25",
  "💡 Small daily habits compound into massive wealth over time",
  "💡 People who track spending save 23% more than those who don't",
  "💡 Your first $100K is the hardest - after that, compounding accelerates",
  "💡 Most people underestimate their spending by 20-30%",
  "💡 Emergency funds prevent 90% of financial stress",
];

export default function FinanceFact() {
  const [fact, setFact] = useState("");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Pick a random fact
    const randomIndex = Math.floor(Math.random() * FINANCE_FACTS.length);
    setFact(FINANCE_FACTS[randomIndex]);
  }, []);

  if (!isVisible || !fact) return null;

  return (
    <View style={styles.container}>
      <View style={styles.factCard}>
        <Image
          source={require("../../../assets/images/mascot1.jpg")}
          style={[styles.mascot, { transform: [{ scaleX: -1 }] }]}
          resizeMode="cover"
        />
        <View style={styles.factContent}>
          <Text style={styles.factText}>{fact}</Text>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => setIsVisible(false)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingBottom: 16,
    marginTop: 40,
  },
  factCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  mascot: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 12,
  },
  factContent: {
    flex: 1,
  },
  factText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
});

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppStorage from "@/src/utils/storage/storage";

const FINANCE_FACTS = [
  "73% of Gen Z wish they started investing earlier - that's crazy!",
  "The average person spends $1,497/month on subscriptions. Wild! 💣💣",
  "Building a $1M net worth starts with tracking your first $1000 - no cap! 💡",
  "Most millionaires check their finances weekly, not daily. Mind blown! 💡",
  "40% of Americans can't cover a $400 emergency expense - that's wild! 💡",
  "Starting to invest at 25 vs 35 can mean $1M+ difference. Insane! 💡",
  "The average Gen Z has $29,000 in debt by age 25 - yikes! $$$",
  "Small daily habits compound into massive wealth over time. That's powerful! 💡",
  "People who track spending save 23% more than those who don't - facts! 💡",
  "Your first $100K is the hardest - after that, compounding accelerates. Let's go! 💡",
  "Most people underestimate their spending by 20-30% - that's crazy! 💡",
  "Emergency funds prevent 90% of financial stress. Game changer! 💡",
];

// Cooldown period: 2-3 days (randomized between 2 and 3 days)
const MIN_COOLDOWN_DAYS = 2;
const MAX_COOLDOWN_DAYS = 3;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

interface FinanceFactProps {
  screenKey?: string; // Unique key for each screen (e.g., "onboarding", "goals")
}

export default function FinanceFact({
  screenKey = "default",
}: FinanceFactProps) {
  const [fact, setFact] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storageKey = `finance_fact_dismissed_${screenKey}`;

    const showRandomFact = () => {
      // Pick a random fact
      const randomIndex = Math.floor(Math.random() * FINANCE_FACTS.length);
      setFact(FINANCE_FACTS[randomIndex]);
      setIsVisible(true);
    };

    const checkVisibility = async () => {
      try {
        setIsLoading(true);
        const dismissedData = AppStorage.getItemSync(storageKey);

        if (!dismissedData) {
          // Never dismissed, show it
          showRandomFact();
          return;
        }

        const { dismissedAt, cooldownDays } = JSON.parse(dismissedData);
        const dismissedDate = new Date(dismissedAt);
        const now = new Date();
        const daysSinceDismissal =
          (now.getTime() - dismissedDate.getTime()) / MILLISECONDS_PER_DAY;

        // Check if cooldown period has passed
        if (daysSinceDismissal >= cooldownDays) {
          // Cooldown passed, show it again
          showRandomFact();
        } else {
          // Still in cooldown, don't show
          setIsVisible(false);
        }
      } catch (error) {
        console.error("Error checking finance fact visibility:", error);
        // On error, show the fact
        showRandomFact();
      } finally {
        setIsLoading(false);
      }
    };

    checkVisibility();
  }, [screenKey]);

  const handleDismiss = async () => {
    try {
      const storageKey = `finance_fact_dismissed_${screenKey}`;
      // Generate random cooldown between 2-3 days
      const cooldownDays =
        MIN_COOLDOWN_DAYS +
        Math.random() * (MAX_COOLDOWN_DAYS - MIN_COOLDOWN_DAYS);

      const dismissedData = {
        dismissedAt: new Date().toISOString(),
        cooldownDays: cooldownDays,
      };

      AppStorage.setItemSync(storageKey, JSON.stringify(dismissedData));
      setIsVisible(false);
    } catch (error) {
      console.error("Error saving finance fact dismissal:", error);
      setIsVisible(false);
    }
  };

  if (isLoading || !isVisible || !fact) return null;

  return (
    <View style={styles.container}>
      <View style={styles.factCard}>
        <Image
          source={require("../../../assets/images/midleftshot.png")}
          style={styles.mascot}
          resizeMode="cover"
        />
        <View style={styles.factContent}>
          <Text style={styles.factText}>{fact}</Text>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
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
    marginTop: 32, // Spacing from options above
  },
  factCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 20,
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

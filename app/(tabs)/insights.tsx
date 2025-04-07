import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const screenWidth = Dimensions.get("window").width;

const insights = [
  {
    icon: "trending-up",
    title: "Spending Up 12% This Month",
    description:
      "Your spending has increased compared to last month, especially in dining and transport.",
    details:
      "Try reviewing your discretionary expenses and set category-based limits using our Advisor tool.",
  },
  {
    icon: "wallet",
    title: "Top Spending Category: Dining",
    description:
      "You spent $420 on dining. Consider setting a weekly food budget.",
    details:
      "A recurring dining budget can help you cut down by 18% in 3 months based on your history.",
  },
  {
    icon: "cash",
    title: "Saved $800 this Month",
    description:
      "Great job! You saved 25% of your income. Let’s keep that momentum going.",
    details:
      "Consider automating part of your income into high-yield savings or a retirement fund.",
  },
  {
    icon: "bar-chart",
    title: "Investment Growth +4.8%",
    description:
      "Your portfolio value has increased. Continue diversifying for optimal returns.",
    details:
      "Diversification across ETFs and REITs has helped. Let’s explore global markets next.",
  },
];

const goalTracker = [
  { label: "Q1", progress: 0.85, status: "on track" },
  { label: "Q2", progress: 0.42, status: "watch" },
  { label: "Q3", progress: 0.1, status: "behind" },
  { label: "Q4", progress: 0, status: "behind" },
];

export default function InsightsScreen() {
  const [selectedCard, setSelectedCard] = useState(null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerCentered}>
        <Ionicons
          name="stats-chart"
          size={24}
          color="#4A90E2"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.headerTitle}>Insights</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sectionLabel}>
          This Month’s Financial Highlights
        </Text>

        {insights.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => setSelectedCard(selectedCard === idx ? null : idx)}
          >
            <Ionicons
              name={item.icon}
              size={28}
              color="#4A90E2"
              style={{ marginBottom: 8 }}
            />
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDescription}>{item.description}</Text>
            {selectedCard === idx && (
              <Text style={styles.cardDetails}>{item.details}</Text>
            )}
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionLabel, { marginTop: 30 }]}>
          Quarterly Goal Progress
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {goalTracker.map((goal, idx) => (
            <View key={idx} style={styles.goalCard}>
              <Text style={styles.goalLabel}>{goal.label}</Text>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${goal.progress * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.goalStatus}>{goal.status.toUpperCase()}</Text>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  container: {
    padding: 20,
    paddingBottom: 60,
  },
  headerCentered: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#121212",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ccc",
    marginBottom: 14,
  },
  card: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    color: "#aaa",
  },
  cardDetails: {
    marginTop: 12,
    fontSize: 13,
    color: "#ccc",
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
    paddingTop: 10,
  },
  goalCard: {
    backgroundColor: "#1e1e1e",
    borderRadius: 14,
    padding: 16,
    marginRight: 16,
    width: screenWidth * 0.6,
    alignItems: "center",
  },
  goalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A90E2",
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 8,
    width: "100%",
    backgroundColor: "#333",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4A90E2",
  },
  goalStatus: {
    fontSize: 12,
    color: "#aaa",
    marginTop: 4,
  },
});

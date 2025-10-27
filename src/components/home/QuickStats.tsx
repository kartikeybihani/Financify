// components/home/QuickStats.tsx

import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "@/src/styles/homeStyles";

interface QuickStatsProps {
  totalBalance: number;
  spendingData: {
    threeMonths: number;
    lastMonth: number;
  };
  formatCurrency: (amount: number, currency?: string, options?: any) => string;
}

export const QuickStats: React.FC<QuickStatsProps> = React.memo(
  ({ totalBalance, spendingData, formatCurrency }) => {
    const [activeSlide, setActiveSlide] = useState(0);
    const screenWidth = Dimensions.get("window").width;

    const handleScroll = (event: any) => {
      const slideIndex = Math.round(
        event.nativeEvent.contentOffset.x / screenWidth
      );
      setActiveSlide(slideIndex);
    };

    return (
      <View style={[styles.netWorthCard, { padding: 0 }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={{ width: screenWidth - 40 }}
        >
          {/* Spending Slide */}
          <View style={[styles.carouselSlide, { width: screenWidth - 40 }]}>
            <Text style={styles.netWorthLabel}>SPENDING</Text>
            <View style={styles.spendingContainer}>
              <View style={styles.spendingColumn}>
                <Text style={styles.spendingLabel}>LAST 3 MONTHS AVG</Text>
                <Text style={styles.spendingAmount}>
                  {formatCurrency(spendingData.threeMonths, "USD", {
                    decimals: 0,
                    useKM: true,
                  })}
                </Text>
                <View style={styles.spendingTrend}>
                  <Ionicons name="trending-down" size={16} color="#FF6B6B" />
                  <Text
                    style={[styles.netWorthTrendText, { color: "#FF6B6B" }]}
                  >
                    +12.4% vs prev
                  </Text>
                </View>
              </View>
              <View style={styles.spendingDivider} />
              <View style={styles.spendingColumn}>
                <Text style={styles.spendingLabel}>LAST MONTH</Text>
                <Text style={styles.spendingAmount}>
                  {formatCurrency(spendingData.lastMonth, "USD", {
                    decimals: 0,
                    useKM: true,
                  })}
                </Text>
                <View style={styles.spendingTrend}>
                  <Ionicons name="trending-up" size={16} color="#4ECDC4" />
                  <Text
                    style={[styles.netWorthTrendText, { color: "#4ECDC4" }]}
                  >
                    -8.2% vs prev
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Net Worth Slide */}
          <View
            style={[
              styles.carouselSlide,
              { width: screenWidth - 40, paddingTop: 15 },
            ]}
          >
            <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
            <Text style={styles.netWorthText}>
              {formatCurrency(totalBalance, "USD", {
                decimals: 2,
                useKM: false,
              })}
            </Text>
            <View style={styles.netWorthTrend}>
              <Ionicons name="trending-up" size={16} color="#4ECDC4" />
              <Text style={styles.netWorthTrendText}>+2.4% this month</Text>
            </View>
          </View>
        </ScrollView>

        {/* Carousel Dots */}
        <View style={styles.carouselDots}>
          {[0, 1].map((index) => (
            <View
              key={index}
              style={[
                styles.carouselDot,
                activeSlide === index && styles.carouselDotActive,
              ]}
            />
          ))}
        </View>
      </View>
    );
  }
);

QuickStats.displayName = "QuickStats";

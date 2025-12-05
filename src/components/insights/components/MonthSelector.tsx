import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from "react-native";

export interface MonthOption {
  month: number; // 0-11 (JavaScript month)
  year: number;
  totalSpent: number | null; // null if month has no transactions
}

interface MonthSelectorProps {
  availableMonths: MonthOption[];
  selectedMonth: number;
  selectedYear: number;
  onMonthSelect: (month: number, year: number) => void;
}

const MonthSelector: React.FC<MonthSelectorProps> = ({
  availableMonths,
  selectedMonth,
  selectedYear,
  onMonthSelect,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);

  // Month name abbreviations
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Format month for display
  const formatMonthLabel = (month: number, year: number) => {
    return `${monthNames[month]} ${year}`;
  };

  // Format total spent for display
  const formatTotal = (total: number | null) => {
    if (total === null) return "";
    if (total < 1000) return `$${Math.round(total)}`;
    if (total < 10000) return `$${(total / 1000).toFixed(1)}k`;
    return `$${Math.round(total / 1000)}k`;
  };

  // Find index of selected month in availableMonths array
  const selectedIndex = availableMonths.findIndex(
    (m) => m.month === selectedMonth && m.year === selectedYear
  );

  // Auto-scroll to selected month on mount or when selection changes
  useEffect(() => {
    if (selectedIndex >= 0 && scrollViewRef.current) {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: selectedIndex * 100, // Approximate chip width + margin
          animated: true,
        });
      }, 100);
    }
  }, [selectedIndex]);

  const isSelected = (month: number, year: number) => {
    return month === selectedMonth && year === selectedYear;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {availableMonths.map((monthOption, index) => {
          const isActive = isSelected(monthOption.month, monthOption.year);
          const monthKey = `${monthOption.year}-${monthOption.month}`;

          return (
            <TouchableOpacity
              key={monthKey}
              style={[
                styles.chip,
                isActive && styles.chipActive,
                monthOption.totalSpent === null && styles.chipEmpty,
              ]}
              onPress={() => onMonthSelect(monthOption.month, monthOption.year)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipMonthText,
                  isActive && styles.chipMonthTextActive,
                ]}
              >
                {formatMonthLabel(monthOption.month, monthOption.year)}
              </Text>
              {monthOption.totalSpent !== null && (
                <Text
                  style={[
                    styles.chipAmountText,
                    isActive && styles.chipAmountTextActive,
                  ]}
                >
                  {formatTotal(monthOption.totalSpent)}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    marginHorizontal: -4, // Compensate for ScrollView padding
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "rgba(74, 144, 226, 0.3)",
    borderColor: "rgba(74, 144, 226, 0.6)",
    borderWidth: 2,
  },
  chipEmpty: {
    opacity: 0.5,
  },
  chipMonthText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 2,
  },
  chipMonthTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  chipAmountText: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 1,
  },
  chipAmountTextActive: {
    color: "rgba(255, 255, 255, 0.85)",
  },
});

export default MonthSelector;

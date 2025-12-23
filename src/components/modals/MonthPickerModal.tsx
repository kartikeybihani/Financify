import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import IconButton from "@/src/components/shared/IconButton";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MonthPickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMonth: number;
  selectedYear: number;
  onMonthSelect: (month: number, year: number) => void;
}

const FAB_GRADIENT_COLORS = [
  "rgba(31, 31, 31, 0.98)",
  "rgba(18, 18, 18, 0.99)",
] as const;

const MONTH_NAMES = [
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

const MonthPickerModal: React.FC<MonthPickerModalProps> = ({
  visible,
  onClose,
  selectedMonth,
  selectedYear,
  onMonthSelect,
}) => {
  const insets = useSafeAreaInsets();

  // Generate 24 months (current month back 24 months) - memoized
  const { monthsByYear, years } = useMemo(() => {
    const monthsList: Array<{ month: number; year: number }> = [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Generate 24 months going back from current month
    for (let i = 0; i < 24; i++) {
      const date = new Date(currentYear, currentMonth - i, 1);
      monthsList.push({
        month: date.getMonth(),
        year: date.getFullYear(),
      });
    }

    // Reverse to show oldest first
    const reversedMonths = monthsList.reverse();

    // Group months by year
    const grouped: {
      [year: number]: Array<{ month: number; year: number }>;
    } = {};
    reversedMonths.forEach((m) => {
      if (!grouped[m.year]) {
        grouped[m.year] = [];
      }
      grouped[m.year].push(m);
    });

    const yearKeys = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => b - a); // Most recent year first

    return {
      monthsByYear: grouped,
      years: yearKeys,
    };
  }, []);

  const isSelected = (month: number, year: number) => {
    return month === selectedMonth && year === selectedYear;
  };

  const isCurrentMonth = (month: number, year: number) => {
    const now = new Date();
    return month === now.getMonth() && year === now.getFullYear();
  };

  const handleMonthSelect = (month: number, year: number) => {
    onMonthSelect(month, year);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <LinearGradient colors={FAB_GRADIENT_COLORS} style={styles.content}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Select Month</Text>
                <IconButton onPress={onClose} icon="close" size={18} />
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.scrollContent,
                  {
                    paddingBottom:
                      Math.max(20, SCREEN_HEIGHT * 0.025) +
                      Math.max(insets.bottom, 20),
                  },
                ]}
                bounces={true}
                keyboardShouldPersistTaps="handled"
              >
                {years.map((year, yearIndex) => (
                  <View key={year}>
                    {yearIndex === 1 && <View style={styles.yearDivider} />}
                    <View style={styles.yearSection}>
                      {/* Year Header */}
                      <View style={styles.yearHeader}>
                        <Text style={styles.yearText}>{year}</Text>
                      </View>

                      {/* Month Grid */}
                      <View style={styles.monthGrid}>
                        {monthsByYear[year].map(
                          ({ month, year: monthYear }) => {
                            const selected = isSelected(month, monthYear);
                            const current = isCurrentMonth(month, monthYear);

                            return (
                              <TouchableOpacity
                                key={`${monthYear}-${month}`}
                                style={[
                                  styles.monthChip,
                                  selected && styles.monthChipSelected,
                                  current &&
                                    !selected &&
                                    styles.monthChipCurrent,
                                ]}
                                onPress={() =>
                                  handleMonthSelect(month, monthYear)
                                }
                                activeOpacity={0.7}
                              >
                                <View style={styles.monthChipContent}>
                                  <Text
                                    style={[
                                      styles.monthChipText,
                                      selected && styles.monthChipTextSelected,
                                      current &&
                                        !selected &&
                                        styles.monthChipTextCurrent,
                                    ]}
                                  >
                                    {MONTH_NAMES[month]}
                                  </Text>
                                  {selected && (
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={14}
                                      color="#4A90E2"
                                      style={styles.checkmarkIcon}
                                    />
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          }
                        )}
                      </View>
                    </View>
                  </View>
                ))}
                {/* Disclaimer */}
                <Text style={styles.disclaimerText}>
                  We only have data of upto last 2 years
                </Text>
              </ScrollView>
            </LinearGradient>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: SCREEN_WIDTH,
    minHeight: SCREEN_HEIGHT * 0.5,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: Math.max(16, SCREEN_WIDTH * 0.04),
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    fontSize: Math.max(20, SCREEN_WIDTH * 0.05),
    fontWeight: "700",
    color: "#fff",
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },
  scrollContent: {
    padding: Math.max(16, SCREEN_WIDTH * 0.04),
  },
  yearSection: {
    marginBottom: 24,
  },
  yearDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 20,
    marginHorizontal: Math.max(16, SCREEN_WIDTH * 0.04),
  },
  yearHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  yearText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A90E2",
    letterSpacing: 0.5,
  },
  disclaimerText: {
    fontSize: 11,
    fontWeight: "400",
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 16,
    fontStyle: "italic",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
  },
  monthChip: {
    width: (SCREEN_WIDTH - Math.max(32, SCREEN_WIDTH * 0.08) - 20) / 3, // 3 columns with gaps
    height: 48,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
    position: "relative",
  },
  monthChipSelected: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderColor: "#4A90E2",
    borderWidth: 1.5,
  },
  monthChipCurrent: {
    borderColor: "rgba(74, 144, 226, 0.3)",
    backgroundColor: "rgba(74, 144, 226, 0.12)",
  },
  monthChipContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  checkmarkIcon: {
    marginRight: 0,
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  monthChipTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  monthChipTextCurrent: {
    color: "#4A90E2",
    fontSize: 13,
  },
});

export default MonthPickerModal;

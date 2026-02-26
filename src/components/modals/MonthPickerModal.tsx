import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import IconButton from "@/src/components/shared/IconButton";
import type { MonthOption } from "@/src/components/insights/components/MonthSelector";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MonthPickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMonth: number;
  selectedYear: number;
  onMonthSelect: (month: number, year: number) => void;
  availableMonths?: MonthOption[];
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
  availableMonths,
}) => {
  const insets = useSafeAreaInsets();

  // Group month options by year for display in the picker.
  // Prefer availableMonths from spending data to avoid selecting months without data.
  const { monthsByYear, years } = useMemo(() => {
    const monthsList: Array<{ month: number; year: number }> =
      availableMonths && availableMonths.length > 0
        ? availableMonths.map(({ month, year }) => ({ month, year }))
        : (() => {
            const fallbackMonths: Array<{ month: number; year: number }> = [];
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            // Fallback: generate 24 months (current month back 24 months)
            for (let i = 0; i < 24; i++) {
              const date = new Date(currentYear, currentMonth - i, 1);
              fallbackMonths.push({
                month: date.getMonth(),
                year: date.getFullYear(),
              });
            }
            return fallbackMonths;
          })();

    // Group months by year
    const grouped: {
      [year: number]: Array<{ month: number; year: number }>;
    } = {};
    monthsList.forEach((m) => {
      if (!grouped[m.year]) {
        grouped[m.year] = [];
      }
      grouped[m.year].push(m);
    });

    // Show months chronologically within each year
    Object.values(grouped).forEach((months) => {
      months.sort((a, b) => a.month - b.month);
    });

    const yearKeys = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => b - a); // Most recent year first

    return {
      monthsByYear: grouped,
      years: yearKeys,
    };
  }, [availableMonths]);

  // Find initial year index based on selectedYear, default to most recent (index 0)
  const initialYearIndex = useMemo(() => {
    const index = years.findIndex((y) => y === selectedYear);
    return index >= 0 ? index : 0;
  }, [years, selectedYear]);

  const [currentYearIndex, setCurrentYearIndex] = useState(initialYearIndex);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideDirection = useRef<"left" | "right">("right");

  // Update current year index when modal opens or selectedYear changes
  useEffect(() => {
    if (visible) {
      setCurrentYearIndex(initialYearIndex);
      // Reset animations when modal opens
      slideAnim.setValue(0);
      fadeAnim.setValue(1);
    }
  }, [visible, initialYearIndex, slideAnim, fadeAnim]);

  // Animate when year changes
  useEffect(() => {
    const direction = slideDirection.current === "left" ? -1 : 1;
    
    // Fade out and slide out
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: direction * SCREEN_WIDTH * 0.3,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Reset position and fade in from opposite direction
      slideAnim.setValue(-direction * SCREEN_WIDTH * 0.3);
      fadeAnim.setValue(0);
      
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [currentYearIndex, slideAnim, fadeAnim]);

  const currentYear = years[currentYearIndex];
  const canGoPrevious = currentYearIndex < years.length - 1;
  const canGoNext = currentYearIndex > 0;

  const handlePreviousYear = () => {
    if (canGoPrevious) {
      slideDirection.current = "right";
      setCurrentYearIndex((prev) => prev + 1);
    }
  };

  const handleNextYear = () => {
    if (canGoNext) {
      slideDirection.current = "left";
      setCurrentYearIndex((prev) => prev - 1);
    }
  };

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
                <View style={styles.yearSection}>
                  {/* Year Header with Navigation Arrows */}
                  <View style={styles.yearHeader}>
                    <TouchableOpacity
                      onPress={handlePreviousYear}
                      disabled={!canGoPrevious}
                      style={[
                        styles.yearNavButton,
                        !canGoPrevious && styles.yearNavButtonDisabled,
                      ]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={20}
                        color={
                          canGoPrevious
                            ? "#4A90E2"
                            : "rgba(255,255,255,0.2)"
                        }
                      />
                    </TouchableOpacity>

                    <Text style={styles.yearText}>{currentYear}</Text>

                    <TouchableOpacity
                      onPress={handleNextYear}
                      disabled={!canGoNext}
                      style={[
                        styles.yearNavButton,
                        !canGoNext && styles.yearNavButtonDisabled,
                      ]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={
                          canGoNext ? "#4A90E2" : "rgba(255,255,255,0.2)"
                        }
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Month Grid with Animation */}
                  <Animated.View
                    style={[
                      styles.monthGridContainer,
                      {
                        opacity: fadeAnim,
                        transform: [{ translateX: slideAnim }],
                      },
                    ]}
                  >
                    <View style={styles.monthGrid}>
                      {monthsByYear[currentYear]?.map(
                        ({ month, year: monthYear }) => {
                          const selected = isSelected(month, monthYear);
                          const current = isCurrentMonth(month, monthYear);

                          return (
                            <TouchableOpacity
                              key={`${monthYear}-${month}`}
                              style={[
                                styles.monthChip,
                                selected && styles.monthChipSelected,
                                current && !selected && styles.monthChipCurrent,
                              ]}
                              onPress={() => handleMonthSelect(month, monthYear)}
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
                  </Animated.View>
                </View>

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
  yearHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  yearNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
  },
  yearNavButtonDisabled: {
    backgroundColor: "transparent",
  },
  yearText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4A90E2",
    letterSpacing: 0.5,
    minWidth: 60,
    textAlign: "center",
  },
  monthGridContainer: {
    overflow: "hidden",
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

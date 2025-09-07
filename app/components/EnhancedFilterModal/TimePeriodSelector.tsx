import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { FilterOptions } from "./types";
import { styles } from "./styles";
import {
  QUICK_TIME_PERIODS,
  ALL_TIME_PERIODS,
  MONTHLY_PERIODS,
} from "./constants";

interface TimePeriodSelectorProps {
  localFilters: FilterOptions;
  setLocalFilters: React.Dispatch<React.SetStateAction<FilterOptions>>;
}

// Helper functions for consistent styling
const getQuickPeriodBackgroundColor = (periodId: string) => {
  const colorMap: { [key: string]: string } = {
    "7days": "#e8f4fd", // Light blue
    "30days": "#e8f5e8", // Light green
    "3months": "#fff3e0", // Light orange
    "12months": "#f3e5f5", // Light purple
  };
  return colorMap[periodId] || "#f8f9fa";
};

const getQuickPeriodBorderColor = (periodId: string) => {
  const colorMap: { [key: string]: string } = {
    "7days": "#4A90E2",
    "30days": "#27AE60",
    "3months": "#F39C12",
    "12months": "#8E44AD",
  };
  return colorMap[periodId] || "#4A90E2";
};

const getMonthBackgroundColor = (monthName: string) => {
  const colorMap: { [key: string]: string } = {
    January: "#e1f5fe", // Light cyan
    February: "#fce4ec", // Light pink
    March: "#f3e5f5", // Light purple
    April: "#e8f5e8", // Light green
    May: "#fff3e0", // Light orange
    June: "#fffde7", // Light yellow
    July: "#ffebee", // Light red
    August: "#e0f2f1", // Light teal
    September: "#f9fbe7", // Light lime
    October: "#fff3e0", // Light orange
    November: "#efebe9", // Light brown
    December: "#e8f4fd", // Light blue
  };
  return colorMap[monthName.split(" ")[0]] || "#f8f9fa";
};

const getMonthBorderColor = (monthName: string) => {
  const colorMap: { [key: string]: string } = {
    January: "#4FC3F7",
    February: "#F48FB1",
    March: "#CE93D8",
    April: "#81C784",
    May: "#FFB74D",
    June: "#FFF176",
    July: "#EF5350",
    August: "#4DB6AC",
    September: "#AED581",
    October: "#FF8A65",
    November: "#A1887F",
    December: "#64B5F6",
  };
  return colorMap[monthName.split(" ")[0]] || "#4A90E2";
};

export const TimePeriodSelector: React.FC<TimePeriodSelectorProps> = ({
  localFilters,
  setLocalFilters,
}) => {
  const [showModal, setShowModal] = useState(false);

  const selectedPeriod =
    ALL_TIME_PERIODS.find((p) => p.id === localFilters.timePeriod) ||
    QUICK_TIME_PERIODS[1]; // Default to "Last Month"

  const handlePeriodSelection = (periodId: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      timePeriod: periodId,
    }));
    setShowModal(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.verticalSelector}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.verticalSelectedContent}>
          <Text style={styles.verticalSelectorEmoji}>
            {selectedPeriod.emoji}
          </Text>
          <View style={styles.verticalTextContainer}>
            <Text style={styles.verticalSelectedLabel}>
              {selectedPeriod.label}
            </Text>
            <Text style={styles.verticalSelectedDescription}>
              {selectedPeriod.description}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Time Period Selection Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
        statusBarTranslucent={true}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.modalGradientOverlay}
          />

          <TouchableOpacity
            style={[styles.modalContainer, styles.container]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Close Icon */}
            <TouchableOpacity
              onPress={() => setShowModal(false)}
              style={[
                styles.closeButton,
                {
                  position: "absolute",
                  top: 16,
                  right: 16,
                  zIndex: 10,
                },
              ]}
            >
              <View style={styles.closeButtonContainer}>
                <Ionicons
                  name="close"
                  size={18}
                  color="rgba(255,255,255,0.8)"
                />
              </View>
            </TouchableOpacity>
            {/* Modal Content */}
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: 40, paddingBottom: 24 }}
            >
              {/* Quick Options */}
              <View style={styles.adaptiveCategoryGrid}>
                {QUICK_TIME_PERIODS.map((period) => {
                  const isSelected = period.id === localFilters.timePeriod;
                  const backgroundColor = getQuickPeriodBackgroundColor(
                    period.id
                  );
                  const borderColor = getQuickPeriodBorderColor(period.id);

                  return (
                    <TouchableOpacity
                      key={period.id}
                      style={[
                        styles.adaptiveCategoryBox,
                        {
                          backgroundColor,
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected
                            ? borderColor
                            : borderColor + "40",
                        },
                      ]}
                      onPress={() => handlePeriodSelection(period.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.categoryEmoji}>{period.emoji}</Text>
                      <Text
                        style={[
                          styles.adaptiveCategoryText,
                          {
                            color: isSelected ? borderColor : "#333",
                            fontWeight: isSelected ? "700" : "600",
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {period.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Monthly Selection */}
              <View style={{ marginTop: 32 }}>
                {/* 2025 */}
                <Text style={[styles.yearTitle, { marginBottom: -2 }]}>
                  2025
                </Text>
                <View style={styles.adaptiveCategoryGrid}>
                  {MONTHLY_PERIODS.filter((p) => p.year === 2025).map(
                    (period) => {
                      const isSelected = period.id === localFilters.timePeriod;
                      const backgroundColor = getMonthBackgroundColor(
                        period.label
                      );
                      const borderColor = getMonthBorderColor(period.label);

                      return (
                        <TouchableOpacity
                          key={period.id}
                          style={[
                            styles.adaptiveCategoryBox,
                            {
                              backgroundColor,
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected
                                ? borderColor
                                : borderColor + "40",
                            },
                          ]}
                          onPress={() => handlePeriodSelection(period.id)}
                          activeOpacity={0.7}
                        >
                          {/* <Text style={styles.categoryEmoji}>
                            {period.emoji}
                          </Text> */}
                          <Text
                            style={[
                              styles.adaptiveCategoryText,
                              {
                                color: isSelected ? borderColor : "#333",
                                fontWeight: isSelected ? "700" : "600",
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {period.label.split(" ")[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>

                {/* 2024 */}
                <Text
                  style={[
                    styles.yearTitle,
                    { marginTop: 32, marginBottom: -2 },
                  ]}
                >
                  2024
                </Text>
                <View style={styles.adaptiveCategoryGrid}>
                  {MONTHLY_PERIODS.filter((p) => p.year === 2024).map(
                    (period) => {
                      const isSelected = period.id === localFilters.timePeriod;
                      const backgroundColor = getMonthBackgroundColor(
                        period.label
                      );
                      const borderColor = getMonthBorderColor(period.label);

                      return (
                        <TouchableOpacity
                          key={period.id}
                          style={[
                            styles.adaptiveCategoryBox,
                            {
                              backgroundColor,
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected
                                ? borderColor
                                : borderColor + "40",
                            },
                          ]}
                          onPress={() => handlePeriodSelection(period.id)}
                          activeOpacity={0.7}
                        >
                          {/* <Text style={styles.categoryEmoji}>
                            {period.emoji}
                          </Text> */}
                          <Text
                            style={[
                              styles.adaptiveCategoryText,
                              {
                                color: isSelected ? borderColor : "#333",
                                fontWeight: isSelected ? "700" : "600",
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {period.label.split(" ")[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>

                {/* 2023 */}
                <Text
                  style={[
                    styles.yearTitle,
                    { marginTop: 32, marginBottom: -2 },
                  ]}
                >
                  2023
                </Text>
                <View style={styles.adaptiveCategoryGrid}>
                  {MONTHLY_PERIODS.filter((p) => p.year === 2023).map(
                    (period) => {
                      const isSelected = period.id === localFilters.timePeriod;
                      const backgroundColor = getMonthBackgroundColor(
                        period.label
                      );
                      const borderColor = getMonthBorderColor(period.label);

                      return (
                        <TouchableOpacity
                          key={period.id}
                          style={[
                            styles.adaptiveCategoryBox,
                            {
                              backgroundColor,
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected
                                ? borderColor
                                : borderColor + "40",
                            },
                          ]}
                          onPress={() => handlePeriodSelection(period.id)}
                          activeOpacity={0.7}
                        >
                          {/* <Text style={styles.categoryEmoji}>
                            {period.emoji}
                          </Text> */}
                          <Text
                            style={[
                              styles.adaptiveCategoryText,
                              {
                                color: isSelected ? borderColor : "#333",
                                fontWeight: isSelected ? "700" : "600",
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {period.label.split(" ")[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

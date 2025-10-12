import React, { useState, useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import {
  EnhancedFilterModalProps,
  FilterOptions,
} from "../../../src/components/EnhancedFilterModal/types";
import { useCategories } from "@/src/hooks/useCategories";
import { styles } from "@/src/components/EnhancedFilterModal/styles";
import {
  getSelectedAccountsDescription,
  getSelectedCategoriesDescription,
  getSelectedTimePeriodDescription,
  getResetFilters,
} from "../../../src/components/EnhancedFilterModal/utils";
import { AccountSelector } from "@/src/components/EnhancedFilterModal/AccountSelector";
import { TimePeriodSelector } from "@/src/components/EnhancedFilterModal/TimePeriodSelector";
import { CategorySelector } from "@/src/components/EnhancedFilterModal/CategorySelector";

const EnhancedFilterModal: React.FC<EnhancedFilterModalProps> = ({
  visible,
  onClose,
  accounts,
  categories: propCategories,
  selectedFilters,
  onFiltersChange,
}) => {
  // Use database categories if no categories provided via props
  const { categories: dbCategories } = useCategories();
  const categories =
    propCategories ||
    dbCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
    }));
  const [localFilters, setLocalFilters] =
    useState<FilterOptions>(selectedFilters);

  useEffect(() => {
    if (visible) {
      setLocalFilters(selectedFilters);
    }
  }, [selectedFilters, visible]);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    onClose();
  };

  const handleResetFilters = () => {
    setLocalFilters(getResetFilters());
  };

  const getFilterStatusText = () => {
    const accountsDesc = getSelectedAccountsDescription(
      localFilters.accountIds || [],
      accounts
    );
    const timePeriodDesc = getSelectedTimePeriodDescription(
      localFilters.timePeriod
    );
    const categoriesDesc = getSelectedCategoriesDescription(
      localFilters.categoryIds || [],
      categories
    );

    let statusText = `${accountsDesc} • ${timePeriodDesc}`;
    if ((localFilters.categoryIds || []).length > 0) {
      statusText += ` • ${categoriesDesc}`;
    }

    return statusText;
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradientOverlay}
        />

        <View style={styles.container}>
          {/* Header */}
          <LinearGradient
            colors={
              [
                "rgba(74,144,226,0.15)",
                "rgba(53,122,255,0.08)",
                "transparent",
              ] as const
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconContainer}>
                  <LinearGradient
                    colors={["#4A90E2", "#357AFF"] as const}
                    style={styles.headerIcon}
                  >
                    <Ionicons name="funnel" size={18} color="#fff" />
                  </LinearGradient>
                </View>
                <View>
                  <Text style={styles.title}>Filter Transactions</Text>
                  <Text style={styles.subtitle}>Customize your view</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <LinearGradient
                  colors={
                    [
                      "rgba(255, 255, 255, 0.15)",
                      "rgba(255, 255, 255, 0.05)",
                    ] as const
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.closeButtonContainer,
                    { borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
                  ]}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Filter Status */}
            <View style={styles.filterStatusSection}>
              <View style={styles.filterStatusBar}>
                <Text style={styles.filterStatusText}>
                  {getFilterStatusText()}
                </Text>
              </View>
            </View>

            {/* Account Filter Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Choose Accounts</Text>
              </View>

              <View style={styles.selectorContainer}>
                <AccountSelector
                  accounts={accounts}
                  localFilters={localFilters}
                  setLocalFilters={setLocalFilters}
                />
              </View>
            </View>

            {/* Time Period and Categories Row */}
            <View style={styles.horizontalSectionsContainer}>
              {/* Time Period Section */}
              <View style={styles.halfSection}>
                <View style={styles.halfSectionHeader}>
                  <Text style={styles.sectionTitle}>Time Period</Text>
                </View>

                <View style={styles.halfSelectorContainer}>
                  <TimePeriodSelector
                    localFilters={localFilters}
                    setLocalFilters={setLocalFilters}
                  />
                </View>
              </View>

              {/* Category Filter Section */}
              <View style={styles.halfSection}>
                <View style={styles.halfSectionHeader}>
                  <Text style={styles.sectionTitle}>Categories</Text>
                </View>

                <View style={styles.halfSelectorContainer}>
                  <CategorySelector
                    categories={categories}
                    localFilters={localFilters}
                    setLocalFilters={setLocalFilters}
                  />
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerButtons}>
              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleResetFilters}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={
                    [
                      "rgba(255,255,255,0.08)",
                      "rgba(255,255,255,0.04)",
                    ] as const
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.resetButtonGradient}
                >
                  <Ionicons name="refresh" size={18} color="#888" />
                  <Text style={styles.resetButtonText}>Reset</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyButton}
                onPress={handleApplyFilters}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={
                    [
                      "rgba(74, 144, 226, 0.15)",
                      "rgba(74, 144, 226, 0.05)",
                    ] as const
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.resetButtonGradient}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.applyButtonText}>Apply Filters</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default EnhancedFilterModal;

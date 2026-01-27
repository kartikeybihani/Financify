import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/src/lib/supabase/supabase";
import IconButton from "@/src/components/shared/IconButton";

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
  const [userId, setUserId] = useState<string | undefined>(undefined);

  // Fetch user ID when modal becomes visible
  useEffect(() => {
    if (visible) {
      const fetchUserId = async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            setUserId(user.id);
          }
        } catch (error) {
          console.error("Error fetching user ID:", error);
        }
      };
      fetchUserId();
    }
  }, [visible]);

  // Use database categories - always fetch with userId to get user-specific categories
  // Prefer database categories (with userId) over propCategories to ensure user-specific categories are shown
  const { categories: dbCategories, loading: categoriesLoading } =
    useCategories(userId);

  // Always use database categories if available (they include user-specific ones when userId is set)
  // Only fall back to propCategories if database categories are not loaded yet
  const categories =
    !categoriesLoading && dbCategories.length > 0
      ? dbCategories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
        }))
      : propCategories || [];
  const [localFilters, setLocalFilters] =
    useState<FilterOptions>(selectedFilters);

  // Track if this is the initial sync to avoid triggering auto-apply on mount
  const isInitialMount = useRef(true);
  const isSyncingFromProps = useRef(false);

  // Sync localFilters with selectedFilters when modal opens or props change
  useEffect(() => {
    if (visible) {
      isSyncingFromProps.current = true;
      setLocalFilters(selectedFilters);
      // Reset initial mount flag when modal opens
      isInitialMount.current = false;
    }
  }, [selectedFilters, visible]);

  // Auto-apply filters when localFilters change (but not on initial mount/sync)
  useEffect(() => {
    // Skip auto-apply if:
    // 1. This is the initial mount
    // 2. We're currently syncing from props
    // 3. Modal is not visible
    if (isInitialMount.current || isSyncingFromProps.current || !visible) {
      isSyncingFromProps.current = false;
      return;
    }

    // Auto-apply the filters
    onFiltersChange(localFilters);
  }, [localFilters, visible, onFiltersChange]);

  const handleResetFilters = () => {
    setLocalFilters(getResetFilters());
    onFiltersChange(getResetFilters());
    onClose();
  };

  const getFilterStatusText = () => {
    const accountsDesc = getSelectedAccountsDescription(
      localFilters.accountIds || [],
      accounts,
    );
    const timePeriodDesc = getSelectedTimePeriodDescription(
      localFilters.timePeriod,
    );
    const categoriesDesc = getSelectedCategoriesDescription(
      localFilters.categoryIds || [],
      categories,
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
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradientOverlay}
          />

          <View style={styles.container} onStartShouldSetResponder={() => true}>
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
                <IconButton onPress={onClose} icon="close" size={22} />
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
                        "rgba(255,255,255,0.12)",
                        "rgba(255,255,255,0.08)",
                      ] as const
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.resetButtonGradient}
                  >
                    <Ionicons name="refresh" size={18} color="#aaa" />
                    <Text style={styles.resetButtonText}>Reset</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default EnhancedFilterModal;

import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

interface Account {
  account_id: string;
  name: string;
  mask?: string;
  institution_name: string;
  type: string;
  subtype: string;
}

interface FilterOptions {
  accountIds: string[]; // empty array means "All Accounts"
  timePeriod: string;
}

interface EnhancedFilterModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  selectedFilters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
}

const TIME_PERIODS = [
  {
    id: "7days",
    label: "Last 7 days",
    emoji: "📆",
    description: "This week",
  },
  {
    id: "30days",
    label: "Last 30 days",
    emoji: "📅",
    description: "Recent activity",
  },
  {
    id: "3months",
    label: "Last 3 months",
    emoji: "🗓️",
    description: "Quarterly view",
  },
  {
    id: "6months",
    label: "Last 6 months",
    emoji: "📊",
    description: "Half-year trends",
  },
  {
    id: "12months",
    label: "Last 12 months",
    emoji: "📈",
    description: "Annual overview",
  },
  {
    id: "december2024",
    label: "December 2024",
    emoji: "🎄",
    description: "Holiday spending",
  },
  {
    id: "november2024",
    label: "November 2024",
    emoji: "🍂",
    description: "Autumn expenses",
  },
  {
    id: "october2024",
    label: "October 2024",
    emoji: "🎃",
    description: "Fall activities",
  },
];

// Get card gradient based on account type
const getAccountGradient = (subtype: string) => {
  const gradients: {
    [key: string]: {
      colors: readonly [string, string];
      start: { x: number; y: number };
      end: { x: number; y: number };
    };
  } = {
    checking: {
      colors: ["#667eea", "#764ba2"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    savings: {
      colors: ["#f093fb", "#f5576c"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    "credit card": {
      colors: ["#4facfe", "#00f2fe"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    default: {
      colors: ["#a8edea", "#fed6e3"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  };

  return gradients[subtype.toLowerCase()] || gradients.default;
};

// Get account type icon
const getAccountIcon = (subtype: string) => {
  const icons: { [key: string]: keyof typeof Ionicons.glyphMap } = {
    checking: "card-outline",
    savings: "wallet-outline",
    "credit card": "card",
    default: "ellipse-outline",
  };
  return icons[subtype.toLowerCase()] || icons.default;
};

const EnhancedFilterModal: React.FC<EnhancedFilterModalProps> = ({
  visible,
  onClose,
  accounts,
  selectedFilters,
  onFiltersChange,
}) => {
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
    const resetFilters: FilterOptions = {
      accountIds: [],
      timePeriod: "30days",
    };
    setLocalFilters(resetFilters);
  };

  const formatAccountName = (account: Account) => {
    const mask = account.mask ? `•••${account.mask}` : "";
    return `${account.name} ${mask}`.trim();
  };

  // Get selected accounts description
  const getSelectedAccountsDescription = () => {
    const accountIds = localFilters.accountIds || [];
    if (accountIds.length === 0) {
      return "All accounts";
    } else if (accountIds.length === 1) {
      const account = accounts.find((acc) => acc.account_id === accountIds[0]);
      return account ? account.institution_name : "Selected account";
    } else {
      return `${accountIds.length} accounts selected`;
    }
  };

  const AccountSelector = () => {
    const [showAccountModal, setShowAccountModal] = useState(false);

    const toggleAccountSelection = (accountId: string) => {
      setLocalFilters((prev) => {
        const currentIds = prev.accountIds || [];
        const isSelected = currentIds.includes(accountId);

        if (isSelected) {
          // Remove from selection
          return {
            ...prev,
            accountIds: currentIds.filter((id) => id !== accountId),
          };
        } else {
          // Add to selection
          return {
            ...prev,
            accountIds: [...currentIds, accountId],
          };
        }
      });
    };

    return (
      <>
        <TouchableOpacity
          style={styles.accountSelector}
          onPress={() => setShowAccountModal(true)}
        >
          <View style={styles.accountSelectedContent}>
            <Text style={styles.accountEmoji}>
              {(localFilters.accountIds || []).length === 0 ? "🏦" : "💳"}
            </Text>
            <View style={styles.accountTextContainer}>
              <Text style={styles.accountSelectedLabel}>
                {getSelectedAccountsDescription()}
              </Text>
              <Text style={styles.accountSelectedDescription}>
                {(localFilters.accountIds || []).length === 0
                  ? "View all connected accounts"
                  : (localFilters.accountIds || []).length === 1
                  ? "Single account selected"
                  : `${
                      (localFilters.accountIds || []).length
                    } accounts selected`}
              </Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color="#4A90E2"
            style={styles.accountArrow}
          />
        </TouchableOpacity>

        {/* Account Selection Modal */}
        <Modal
          visible={showAccountModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowAccountModal(false)}
          statusBarTranslucent={true}
        >
          <View style={styles.overlay}>
            <LinearGradient
              colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.gradientOverlay}
            />

            <View style={styles.accountModalContainer}>
              {/* Handle */}
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>

              {/* Header */}
              <View style={styles.accountModalHeader}>
                <View style={styles.headerLeft}>
                  <Text style={styles.accountModalTitle}>Select Accounts</Text>
                  <Text style={styles.accountModalSubtitle}>
                    Choose which accounts to include
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowAccountModal(false)}
                  style={styles.closeButton}
                >
                  <LinearGradient
                    colors={
                      [
                        "rgba(255,255,255,0.1)",
                        "rgba(255,255,255,0.05)",
                      ] as const
                    }
                    style={styles.closeButtonGradient}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Account Options */}
              <ScrollView
                style={styles.accountModalContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.accountModalScrollContent}
              >
                {/* All Accounts Option */}
                <TouchableOpacity
                  style={[
                    styles.accountModalOption,
                    (localFilters.accountIds || []).length === 0 &&
                      styles.accountModalOptionSelected,
                  ]}
                  onPress={() => {
                    setLocalFilters((prev) => ({ ...prev, accountIds: [] }));
                    setShowAccountModal(false);
                  }}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={
                      (localFilters.accountIds || []).length === 0
                        ? (["#4A90E2", "#357AFF"] as const)
                        : ([
                            "rgba(255,255,255,0.05)",
                            "rgba(255,255,255,0.02)",
                          ] as const)
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.accountModalOptionGradient}
                  >
                    <View style={styles.allAccountsIcon}>
                      <Ionicons
                        name="apps"
                        size={24}
                        color={
                          (localFilters.accountIds || []).length === 0
                            ? "#fff"
                            : "#888"
                        }
                      />
                    </View>
                    <View style={styles.accountModalOptionTextContainer}>
                      <Text
                        style={[
                          styles.accountModalOptionLabel,
                          (localFilters.accountIds || []).length === 0 &&
                            styles.accountModalOptionLabelSelected,
                        ]}
                      >
                        All Accounts
                      </Text>
                      <Text
                        style={[
                          styles.accountModalOptionDescription,
                          (localFilters.accountIds || []).length === 0 &&
                            styles.accountModalOptionDescriptionSelected,
                        ]}
                      >
                        View transactions from all connected accounts
                      </Text>
                    </View>
                    {(localFilters.accountIds || []).length === 0 && (
                      <View style={styles.accountCheckmark}>
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color="#fff"
                        />
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Account Cards Grid */}
                {accounts.length > 0 && (
                  <>
                    <Text style={styles.accountModalSectionLabel}>
                      Your Accounts ({accounts.length})
                    </Text>
                    <View style={styles.accountGrid}>
                      {accounts.map((account) => {
                        const isSelected = (
                          localFilters.accountIds || []
                        ).includes(account.account_id);
                        const gradient = getAccountGradient(account.subtype);
                        const icon = getAccountIcon(account.subtype);

                        return (
                          <TouchableOpacity
                            key={account.account_id}
                            style={[
                              styles.accountGridItem,
                              isSelected && styles.accountGridItemSelected,
                            ]}
                            onPress={() =>
                              toggleAccountSelection(account.account_id)
                            }
                            activeOpacity={0.8}
                          >
                            <LinearGradient
                              colors={gradient.colors}
                              start={gradient.start}
                              end={gradient.end}
                              style={styles.accountGridGradient}
                            >
                              {/* Glassmorphism overlay */}
                              <View style={styles.accountGridOverlay} />

                              {/* Selection indicator */}
                              {isSelected && (
                                <View style={styles.accountGridSelectionBadge}>
                                  <Ionicons
                                    name="checkmark"
                                    size={12}
                                    color="#fff"
                                  />
                                </View>
                              )}

                              {/* Card content */}
                              <View style={styles.accountGridContent}>
                                <Text
                                  style={styles.accountGridBank}
                                  numberOfLines={1}
                                >
                                  {account.institution_name}
                                </Text>
                                <Text style={styles.accountGridType}>
                                  {account.subtype.toUpperCase()}
                                </Text>
                                <Text
                                  style={styles.accountGridName}
                                  numberOfLines={1}
                                >
                                  {formatAccountName(account)}
                                </Text>
                              </View>
                            </LinearGradient>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
  };

  const TimePeriodSelector = () => {
    const [showTimePeriodModal, setShowTimePeriodModal] = useState(false);
    const selectedPeriod =
      TIME_PERIODS.find((p) => p.id === localFilters.timePeriod) ||
      TIME_PERIODS[0];

    return (
      <>
        <TouchableOpacity
          style={styles.timePeriodSelector}
          onPress={() => setShowTimePeriodModal(true)}
        >
          <View style={styles.timePeriodSelectedContent}>
            <Text style={styles.timePeriodEmoji}>{selectedPeriod.emoji}</Text>
            <View style={styles.timePeriodTextContainer}>
              <Text style={styles.timePeriodSelectedLabel}>
                {selectedPeriod.label}
              </Text>
              <Text style={styles.timePeriodSelectedDescription}>
                {selectedPeriod.description}
              </Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color="#4A90E2"
            style={styles.timePeriodArrow}
          />
        </TouchableOpacity>

        {/* Time Period Selection Modal */}
        <Modal
          visible={showTimePeriodModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowTimePeriodModal(false)}
          statusBarTranslucent={true}
        >
          <View style={styles.overlay}>
            <LinearGradient
              colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.gradientOverlay}
            />

            <View style={styles.timePeriodModalContainer}>
              {/* Handle */}
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>

              {/* Header */}
              <View style={styles.timePeriodModalHeader}>
                <View style={styles.headerLeft}>
                  <Text style={styles.timePeriodModalTitle}>
                    Select Time Period
                  </Text>
                  <Text style={styles.timePeriodModalSubtitle}>
                    Choose your date range
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowTimePeriodModal(false)}
                  style={styles.closeButton}
                >
                  <LinearGradient
                    colors={
                      [
                        "rgba(255,255,255,0.1)",
                        "rgba(255,255,255,0.05)",
                      ] as const
                    }
                    style={styles.closeButtonGradient}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Time Period Options Grid */}
              <ScrollView
                style={styles.timePeriodModalContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.timePeriodModalScrollContent}
              >
                <View style={styles.timePeriodGrid}>
                  {TIME_PERIODS.map((period) => (
                    <TouchableOpacity
                      key={period.id}
                      style={[
                        styles.timePeriodGridItem,
                        period.id === localFilters.timePeriod &&
                          styles.timePeriodGridItemSelected,
                      ]}
                      onPress={() => {
                        setLocalFilters((prev) => ({
                          ...prev,
                          timePeriod: period.id,
                        }));
                        setShowTimePeriodModal(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={
                          period.id === localFilters.timePeriod
                            ? (["#4A90E2", "#357AFF"] as const)
                            : ([
                                "rgba(255,255,255,0.05)",
                                "rgba(255,255,255,0.02)",
                              ] as const)
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.timePeriodGridGradient}
                      >
                        {/* Selection indicator */}
                        {period.id === localFilters.timePeriod && (
                          <View style={styles.gridSelectionBadge}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </View>
                        )}

                        {/* Content */}
                        <View style={styles.timePeriodGridContent}>
                          <Text style={styles.timePeriodGridEmoji}>
                            {period.emoji}
                          </Text>
                          <Text
                            style={[
                              styles.timePeriodGridLabel,
                              period.id === localFilters.timePeriod &&
                                styles.timePeriodGridLabelSelected,
                            ]}
                          >
                            {period.label}
                          </Text>
                          <Text
                            style={[
                              styles.timePeriodGridDescription,
                              period.id === localFilters.timePeriod &&
                                styles.timePeriodGridDescriptionSelected,
                            ]}
                          >
                            {period.description}
                          </Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
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
          {/* Elegant handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Beautiful header */}
          <LinearGradient
            colors={["rgba(74,144,226,0.1)", "transparent"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View>
                  <Text style={styles.title}>Filter Transactions</Text>
                  <Text style={styles.subtitle}>Customize your view</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <LinearGradient
                  colors={
                    ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"] as const
                  }
                  style={styles.closeButtonGradient}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Account Filter Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Choose Accounts</Text>
              </View>

              <View style={styles.accountContainer}>
                <AccountSelector />
              </View>
            </View>

            {/* Time Period Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Time Period</Text>
              </View>

              <View style={styles.timePeriodContainer}>
                <TimePeriodSelector />
              </View>
            </View>
          </ScrollView>

          {/* Enhanced Footer */}
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
                <View style={styles.applyButtonContent}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.applyButtonText}>Apply Filters</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 25,
    overflow: "hidden",
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  headerGradient: {
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerLeft: {
    // flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.2,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.1,
  },

  // All Accounts Card
  allAccountsWrapper: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  allAccountsCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  allAccountsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    marginRight: 12,
  },
  allAccountsText: {
    flex: 1,
    marginRight: 12,
  },
  allAccountsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
    marginBottom: 2,
  },
  selectedAllAccountsTitle: {
    color: "#fff",
  },
  allAccountsSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  selectedAllAccountsSubtitle: {
    color: "rgba(255,255,255,0.7)",
  },

  // Account Selector
  accountContainer: {
    paddingHorizontal: 24,
  },
  accountSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  accountSelectedContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  accountEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  accountTextContainer: {
    flex: 1,
  },
  accountSelectedLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  accountSelectedDescription: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  accountArrow: {
    marginLeft: 12,
  },

  // Account Modal
  accountModalContainer: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 25,
    overflow: "hidden",
  },
  accountModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  accountModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  accountModalSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.2,
  },
  accountModalContent: {
    flex: 1,
  },
  accountModalScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  accountModalOption: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  accountModalOptionSelected: {
    borderColor: "rgba(74,144,226,0.5)",
  },
  accountModalOptionGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  accountModalOptionTextContainer: {
    flex: 1,
  },
  accountModalOptionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
    marginBottom: 4,
  },
  accountModalOptionLabelSelected: {
    color: "#fff",
  },
  accountModalOptionDescription: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
  },
  accountModalOptionDescriptionSelected: {
    color: "rgba(255,255,255,0.7)",
  },
  accountCheckmark: {
    marginLeft: 12,
  },
  accountModalSectionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  accountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  accountGridItem: {
    width: "48%",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  accountGridItemSelected: {
    borderColor: "#4A90E2",
    borderWidth: 2,
  },
  accountGridGradient: {
    padding: 12,
    minHeight: 90,
    position: "relative",
  },
  accountGridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
  },
  accountGridSelectionBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#4A90E2",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  accountGridContent: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    justifyContent: "space-between",
  },
  accountGridBank: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  accountGridType: {
    fontSize: 8,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  accountGridName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#fff",
  },

  // Time Period Selector
  timePeriodContainer: {
    paddingHorizontal: 24,
  },
  timePeriodSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  timePeriodSelectedContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  timePeriodEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  timePeriodTextContainer: {
    flex: 1,
  },
  timePeriodSelectedLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  timePeriodSelectedDescription: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  timePeriodArrow: {
    marginLeft: 12,
  },

  // Time Period Modal
  timePeriodModalContainer: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 25,
    overflow: "hidden",
  },
  timePeriodModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  timePeriodModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  timePeriodModalSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.2,
  },
  timePeriodModalContent: {
    flex: 1,
  },
  timePeriodModalScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  timePeriodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  timePeriodGridItem: {
    width: "48%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  timePeriodGridItemSelected: {
    borderColor: "rgba(74,144,226,0.6)",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.3,
  },
  timePeriodGridGradient: {
    padding: 16,
    minHeight: 100,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  gridSelectionBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  timePeriodGridContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  timePeriodGridEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  timePeriodGridLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    marginBottom: 4,
    textAlign: "center",
  },
  timePeriodGridLabelSelected: {
    color: "#fff",
  },
  timePeriodGridDescription: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    lineHeight: 14,
  },
  timePeriodGridDescriptionSelected: {
    color: "rgba(255,255,255,0.7)",
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#121212",
  },
  footerButtons: {
    flexDirection: "row",
    gap: 12,
  },
  resetButton: {
    flex: 1,
  },
  resetButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
  },
  applyButton: {
    flex: 2,
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  applyButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

export { TIME_PERIODS };
export type { FilterOptions, Account };
export default EnhancedFilterModal;

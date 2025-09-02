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
  accountId: string | null; // null means "All Accounts"
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
    setLocalFilters(selectedFilters);
  }, [selectedFilters, visible]);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    onClose();
  };

  const handleResetFilters = () => {
    const resetFilters: FilterOptions = {
      accountId: null,
      timePeriod: "30days",
    };
    setLocalFilters(resetFilters);
  };

  const formatAccountName = (account: Account) => {
    const mask = account.mask ? `•••${account.mask}` : "";
    return `${account.name} ${mask}`.trim();
  };

  const AccountCard = ({
    account,
    isSelected,
    onPress,
  }: {
    account: Account;
    isSelected: boolean;
    onPress: () => void;
  }) => {
    const gradient = getAccountGradient(account.subtype);
    const icon = getAccountIcon(account.subtype);

    return (
      <TouchableOpacity onPress={onPress} style={styles.accountCardWrapper}>
        <LinearGradient
          colors={gradient.colors}
          start={gradient.start}
          end={gradient.end}
          style={[styles.accountCard, isSelected && styles.selectedAccountCard]}
        >
          {/* Glassmorphism overlay */}
          <View style={styles.cardOverlay} />

          {/* Selection indicator */}
          {isSelected && (
            <View style={styles.selectionBadge}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          )}

          {/* Card content */}
          <View style={styles.cardHeader}>
            <Text style={styles.bankName} numberOfLines={1}>
              {account.institution_name}
            </Text>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.accountType}>
              {account.subtype.toUpperCase()}
            </Text>
          </View>

          {/* Shine effect */}
          <View style={styles.shineEffect} />
        </LinearGradient>
      </TouchableOpacity>
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

              {/* Time Period Options */}
              <ScrollView
                style={styles.timePeriodModalContent}
                showsVerticalScrollIndicator={false}
              >
                {TIME_PERIODS.map((period) => (
                  <TouchableOpacity
                    key={period.id}
                    style={[
                      styles.timePeriodOption,
                      period.id === localFilters.timePeriod &&
                        styles.timePeriodOptionSelected,
                    ]}
                    onPress={() => {
                      setLocalFilters((prev) => ({
                        ...prev,
                        timePeriod: period.id,
                      }));
                      setShowTimePeriodModal(false);
                    }}
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
                      style={styles.timePeriodOptionGradient}
                    >
                      <Text style={styles.timePeriodOptionEmoji}>
                        {period.emoji}
                      </Text>
                      <View style={styles.timePeriodOptionTextContainer}>
                        <Text
                          style={[
                            styles.timePeriodOptionLabel,
                            period.id === localFilters.timePeriod &&
                              styles.timePeriodOptionLabelSelected,
                          ]}
                        >
                          {period.label}
                        </Text>
                        <Text
                          style={[
                            styles.timePeriodOptionDescription,
                            period.id === localFilters.timePeriod &&
                              styles.timePeriodOptionDescriptionSelected,
                          ]}
                        >
                          {period.description}
                        </Text>
                      </View>
                      {period.id === localFilters.timePeriod && (
                        <View style={styles.timePeriodCheckmark}>
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color="#fff"
                          />
                        </View>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
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
                <Text style={styles.sectionTitle}>Choose Account</Text>
              </View>

              {/* All Accounts Card */}
              <TouchableOpacity
                onPress={() =>
                  setLocalFilters((prev) => ({ ...prev, accountId: null }))
                }
                style={styles.allAccountsWrapper}
              >
                <LinearGradient
                  colors={
                    localFilters.accountId === null
                      ? (["#667eea", "#764ba2"] as const)
                      : ([
                          "rgba(255,255,255,0.05)",
                          "rgba(255,255,255,0.02)",
                        ] as const)
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.allAccountsCard}
                >
                  <View style={styles.allAccountsIcon}>
                    <Ionicons
                      name="apps"
                      size={18}
                      color={localFilters.accountId === null ? "#fff" : "#888"}
                    />
                  </View>
                  <View style={styles.allAccountsText}>
                    <Text
                      style={[
                        styles.allAccountsTitle,
                        localFilters.accountId === null &&
                          styles.selectedAllAccountsTitle,
                      ]}
                    >
                      All Accounts
                    </Text>
                    <Text
                      style={[
                        styles.allAccountsSubtitle,
                        localFilters.accountId === null &&
                          styles.selectedAllAccountsSubtitle,
                      ]}
                    >
                      View transactions from all connected accounts
                    </Text>
                  </View>
                  {localFilters.accountId === null && (
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Account Cards */}
              {accounts.length > 0 && (
                <>
                  <Text style={styles.accountsLabel}>Your Accounts</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.accountsScroll}
                    style={styles.accountsContainer}
                  >
                    {accounts.map((account) => (
                      <AccountCard
                        key={account.account_id}
                        account={account}
                        isSelected={
                          localFilters.accountId === account.account_id
                        }
                        onPress={() =>
                          setLocalFilters((prev) => ({
                            ...prev,
                            accountId: account.account_id,
                          }))
                        }
                      />
                    ))}
                  </ScrollView>
                </>
              )}
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
          <LinearGradient
            colors={["rgba(18,18,18,0.95)", "rgba(18,18,18,1)"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.footer}
          >
            <View style={styles.footerButtons}>
              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleResetFilters}
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
              >
                <View style={styles.applyButtonContent}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.applyButtonText}>Apply Filters</Text>
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
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

  // Account Cards
  accountsLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    paddingHorizontal: 24,
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  accountsContainer: {
    paddingLeft: 24,
  },
  accountsScroll: {
    paddingRight: 24,
  },
  accountCardWrapper: {
    marginRight: 16,
  },
  accountCard: {
    width: 120,
    height: 80,
    borderRadius: 12,
    padding: 12,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  selectedAccountCard: {
    borderWidth: 2,
    borderColor: "#4A90E2",
  },
  cardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
  },
  selectionBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4A90E2",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  bankName: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  accountIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  cardFooter: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
  },
  accountType: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  accountName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#fff",
  },
  shineEffect: {
    position: "absolute",
    top: -20,
    left: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    transform: [{ rotate: "45deg" }],
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
    paddingHorizontal: 24,
  },
  timePeriodOption: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  timePeriodOptionSelected: {
    borderColor: "rgba(74,144,226,0.5)",
  },
  timePeriodOptionGradient: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  timePeriodOptionEmoji: {
    fontSize: 28,
    marginRight: 16,
    width: 32,
    textAlign: "center",
  },
  timePeriodOptionTextContainer: {
    flex: 1,
  },
  timePeriodOptionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
    marginBottom: 4,
  },
  timePeriodOptionLabelSelected: {
    color: "#fff",
  },
  timePeriodOptionDescription: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
  },
  timePeriodOptionDescriptionSelected: {
    color: "rgba(255,255,255,0.7)",
  },
  timePeriodCheckmark: {
    marginLeft: 12,
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

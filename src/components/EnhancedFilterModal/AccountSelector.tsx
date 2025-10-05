import React, { useState } from "react";
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

import { Account, FilterOptions } from "@/src/components/EnhancedFilterModal/types";
import { styles } from "@/src/components/EnhancedFilterModal/styles";
import {
  getAccountGradient,
  formatAccountName,
  getSelectedAccountsDescription,
  toggleAccountSelection,
} from "./utils";

interface AccountSelectorProps {
  accounts: Account[];
  localFilters: FilterOptions;
  setLocalFilters: React.Dispatch<React.SetStateAction<FilterOptions>>;
}

export const AccountSelector: React.FC<AccountSelectorProps> = ({
  accounts,
  localFilters,
  setLocalFilters,
}) => {
  const [showModal, setShowModal] = useState(false);

  // Filter out investment accounts (same logic as home screen)
  const filteredAccounts = accounts.filter(
    (account) => account.type !== "investment"
  );

  const handleToggleAccountSelection = (accountId: string) => {
    setLocalFilters((prev) => toggleAccountSelection(accountId, prev));
  };

  const selectAllAccounts = () => {
    setLocalFilters((prev) => ({ ...prev, accountIds: [] }));
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.selector]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.selectedContent}>
          <Text style={styles.selectorEmoji}>
            {(localFilters.accountIds || []).length === 0 ? "🏦" : "💳"}
          </Text>
          <View style={styles.textContainer}>
            <Text style={styles.selectedLabel}>
              {getSelectedAccountsDescription(
                localFilters.accountIds || [],
                filteredAccounts
              )}
            </Text>
            <Text style={styles.selectedDescription}>
              View all connected accounts
            </Text>
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color="#4A90E2"
          style={styles.selectorArrow}
        />
      </TouchableOpacity>

      {/* Account Selection Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
        statusBarTranslucent={true}
      >
        <TouchableWithoutFeedback onPress={() => setShowModal(false)}>
          <View style={styles.modalOverlay}>
            <LinearGradient
              colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.modalGradientOverlay}
            />

            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                style={[styles.modalContainer, styles.adaptiveModalContainer]}
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
                  {/* <View style={styles.closeButtonContainer}>
                    <Ionicons
                      name="close"
                      size={18}
                      color="rgba(255,255,255,0.8)"
                    />
                  </View> */}
                </TouchableOpacity>
                <View style={{ height: 20 }} />

                {/* Modal Content */}
                <ScrollView
                  style={styles.modalContent}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.modalScrollContent}
                >
                  {/* All Accounts and Individual Account Cards */}
                  {filteredAccounts.length > 0 && (
                    <View style={styles.accountsGrid}>
                      {filteredAccounts.map((account) => {
                        const isSelected = (
                          localFilters.accountIds || []
                        ).includes(account.account_id);
                        const gradient = getAccountGradient(account.subtype);

                        return (
                          <TouchableOpacity
                            key={account.account_id}
                            style={[
                              styles.accountGridCard,
                              isSelected && styles.accountGridCardSelected,
                            ]}
                            onPress={() =>
                              handleToggleAccountSelection(account.account_id)
                            }
                            activeOpacity={0.8}
                          >
                            <LinearGradient
                              colors={gradient.colors}
                              start={gradient.start}
                              end={gradient.end}
                              style={styles.accountGridCardGradient}
                            >
                              <View style={styles.accountGridCardOverlay} />

                              {isSelected && (
                                <View style={styles.accountGridCardBadge}>
                                  <Ionicons
                                    name="checkmark"
                                    size={14}
                                    color="#333"
                                  />
                                </View>
                              )}

                              <View style={styles.accountGridCardContent}>
                                <Text
                                  style={styles.accountGridCardBank}
                                  numberOfLines={1}
                                >
                                  {account.institution_name}
                                </Text>
                                <Text
                                  style={styles.accountGridCardName}
                                  numberOfLines={2}
                                >
                                  {formatAccountName(account)}
                                </Text>
                              </View>
                            </LinearGradient>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

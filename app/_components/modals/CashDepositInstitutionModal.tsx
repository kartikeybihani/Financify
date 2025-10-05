import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ModalBlurOverlay,
  ModalHandle,
  ModalHeader,
  ModalLogoContainer,
} from "../shared/modal-components";
import { MODAL_SHARED_STYLES as styles } from "@/app/_components/shared/modal-styles";
import {
  CASH_DEPOSIT_INSTITUTIONS,
  type Institution,
} from "../shared/modal-constants";

interface CashDepositInstitutionModalProps {
  visible: boolean;
  onClose: () => void;
  onInstitutionSelect: (institutionId: string) => void;
}

export default function CashDepositInstitutionModal({
  visible,
  onClose,
  onInstitutionSelect,
}: CashDepositInstitutionModalProps) {
  const handleInstitutionPress = (institutionId: string) => {
    onInstitutionSelect(institutionId);
    onClose();
  };

  const handleOtherInstitutions = () => {
    // Handle "Other Institutions" selection
    onInstitutionSelect("other");
    onClose();
  };

  const handleClose = () => {
    onClose();
    // Reopen the financial sheet after a short delay
    setTimeout(() => {
      // No need for reopenFinancialSheet in cash deposits
    }, 300);
  };

  const renderInstitutionCard = (institution: Institution) => {
    return (
      <TouchableOpacity
        key={institution.id}
        style={styles.institutionCard}
        onPress={() => handleInstitutionPress(institution.id)}
        activeOpacity={0.8}
      >
        <View style={styles.institutionContent}>
          <ModalLogoContainer institution={institution} />
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <ModalBlurOverlay onPressOutside={handleClose}>
        <View style={styles.modalContainer}>
          <View style={styles.sheet}>
            <ModalHandle />
            <ModalHeader
              title="Select your institution"
              onClose={handleClose}
            />
            <View style={styles.content}>
              <View style={styles.institutionsGrid}>
                {CASH_DEPOSIT_INSTITUTIONS.map((institution) =>
                  renderInstitutionCard(institution)
                )}

                {/* Other Institutions Card */}
                <TouchableOpacity
                  style={[styles.institutionCard, styles.otherInstitutionsCard]}
                  onPress={handleOtherInstitutions}
                  activeOpacity={0.8}
                >
                  <View style={styles.institutionContent}>
                    <View style={styles.otherInstitutionsIcon}>
                      <Ionicons
                        name="business-outline"
                        size={24}
                        color="#4A90E2"
                      />
                    </View>
                    <Text style={styles.institutionName}>
                      Other Institutions
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </ModalBlurOverlay>
    </Modal>
  );
}

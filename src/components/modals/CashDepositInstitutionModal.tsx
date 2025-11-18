import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ModalBlurOverlay,
  ModalHandle,
  ModalHeader,
  ModalLogoContainer,
} from "../shared/modal-components";
import { MODAL_SHARED_STYLES as styles } from "@/src/components/shared/modal-styles";
import {
  CASH_DEPOSIT_INSTITUTIONS,
  type Institution,
} from "../shared/modal-constants";
import { handleInstitutionConnect } from "@/src/utils/plaid/plaid;
import logger from "@/src/utils/core/logger";

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
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingInstitution, setConnectingInstitution] = useState<
    string | null
  >(null);

  const handleInstitutionPress = async (institutionId: string) => {
    logger.info(`🔄 Starting ${institutionId} connection...`);
    setIsConnecting(true);
    setConnectingInstitution(institutionId);

    try {
      await handleInstitutionConnect(
        institutionId,
        async (itemId: string) => {
          logger.info("✅ Institution connection successful:", {
            institutionId,
            itemId,
          });
          setIsConnecting(false);
          setConnectingInstitution(null);
          onInstitutionSelect(institutionId);
          onClose();
        },
        (error?: any) => {
          logger.error(
            `❌ Institution connection failed for ${institutionId}:`,
            error
          );
          setIsConnecting(false);
          setConnectingInstitution(null);

          if (error?.error?.errorCode === "INVALID_LINK_TOKEN") {
            Alert.alert(
              "Connection Expired",
              "The connection session expired. Please try again.",
              [{ text: "OK" }]
            );
          } else if (error?.message) {
            Alert.alert(
              "Connection Failed",
              `Unable to connect to ${institutionId}: ${error.message}`,
              [{ text: "Try Again" }]
            );
          } else {
            Alert.alert("Connection Cancelled", "You can try again anytime.", [
              { text: "OK" },
            ]);
          }
        }
      );
    } catch (error) {
      logger.error(
        `❌ Failed to initiate connection for ${institutionId}:`,
        error
      );
      setIsConnecting(false);
      setConnectingInstitution(null);
      Alert.alert(
        "Connection Error",
        `Failed to start connection to ${institutionId}. Please try again.`,
        [{ text: "OK" }]
      );
    }
  };

  const handleOtherInstitutions = () => {
    // Handle "Other Institutions" selection - use general Plaid flow
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
    const isLoadingInstitution =
      isConnecting && connectingInstitution === institution.id;

    return (
      <TouchableOpacity
        key={institution.id}
        style={[
          styles.institutionCard,
          isLoadingInstitution && styles.institutionCardLoading,
        ]}
        onPress={() => handleInstitutionPress(institution.id)}
        activeOpacity={0.8}
        disabled={isConnecting}
      >
        <View style={styles.institutionContent}>
          {isLoadingInstitution ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="hourglass" size={32} color="#4A90E2" />
              <Text style={styles.loadingText}>Connecting...</Text>
            </View>
          ) : (
            <ModalLogoContainer institution={institution} />
          )}
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
                  style={[
                    styles.institutionCard,
                    styles.otherInstitutionsCard,
                    isConnecting &&
                      connectingInstitution === "other" &&
                      styles.institutionCardLoading,
                  ]}
                  onPress={handleOtherInstitutions}
                  activeOpacity={0.8}
                  disabled={isConnecting}
                >
                  <View style={styles.institutionContent}>
                    {isConnecting && connectingInstitution === "other" ? (
                      <View style={styles.loadingContainer}>
                        <Ionicons name="hourglass" size={24} color="#4A90E2" />
                        <Text style={styles.loadingText}>Loading...</Text>
                      </View>
                    ) : (
                      <>
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
                      </>
                    )}
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

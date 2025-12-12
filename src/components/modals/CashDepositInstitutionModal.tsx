import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ModalBlurOverlay,
  ModalHandle,
  ModalHeader,
  ModalLogoContainer,
} from "../shared/modal-components";
import { MODAL_SHARED_STYLES as styles } from "@/src/styles/modalStyles";
import {
  CASH_DEPOSIT_INSTITUTIONS,
  type Institution,
} from "../shared/modal-constants";
import { fetchLinkToken, handlePlaidConnect } from "@/src/utils/plaid/plaid";
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

  const handleGeneralPlaidConnect = async () => {
    logger.info("🔄 Starting general Plaid connection...");
    setIsConnecting(true);
    setConnectingInstitution("general");

    try {
      const linkToken = await fetchLinkToken();
      await handlePlaidConnect(
        linkToken,
        async (itemId: string) => {
          logger.info("✅ Plaid connection successful:", { itemId });
          setIsConnecting(false);
          setConnectingInstitution(null);
          onInstitutionSelect("other");
          onClose();
        },
        (error?: any) => {
          logger.error("❌ Plaid connection failed:", error);
          setIsConnecting(false);
          setConnectingInstitution(null);

          if (
            error?.code === "DUPLICATE_ITEM" ||
            error?.message?.includes("already linked")
          ) {
            Alert.alert(
              "Account Already Connected",
              error.message ||
                "This account is already connected to your account.",
              [{ text: "OK" }]
            );
          } else if (error?.error?.errorCode === "INVALID_LINK_TOKEN") {
            Alert.alert(
              "Connection Expired",
              "The connection session expired. Please try again.",
              [{ text: "OK" }]
            );
          } else if (error?.message) {
            Alert.alert(
              "Connection Failed",
              `Unable to connect: ${error.message}`,
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
      logger.error("❌ Failed to initiate Plaid connection:", error);
      setIsConnecting(false);
      setConnectingInstitution(null);
      Alert.alert(
        "Connection Error",
        "Failed to start connection. Please try again.",
        [{ text: "OK" }]
      );
    }
  };

  const handleInstitutionPress = async () => {
    // All institutions use the same general Plaid flow
    await handleGeneralPlaidConnect();
  };

  const handleOtherInstitutions = async () => {
    // Handle "Other Institutions" selection - use general Plaid flow
    await handleGeneralPlaidConnect();
  };

  const handleClose = () => {
    onClose();
    // Reopen the financial sheet after a short delay
    setTimeout(() => {
      // No need for reopenFinancialSheet in cash deposits
    }, 300);
  };

  const renderInstitutionCard = (institution: Institution) => {
    const isLoadingInstitution = isConnecting;

    return (
      <TouchableOpacity
        key={institution.id}
        style={[
          styles.institutionCard,
          isLoadingInstitution && styles.institutionCardLoading,
        ]}
        onPress={handleInstitutionPress}
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
                    isConnecting && styles.institutionCardLoading,
                  ]}
                  onPress={handleOtherInstitutions}
                  activeOpacity={0.8}
                  disabled={isConnecting}
                >
                  <View style={styles.institutionContent}>
                    {isConnecting ? (
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

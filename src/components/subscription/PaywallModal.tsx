import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import Purchases from "react-native-purchases";
import type {
  PurchasesPackage,
  PurchasesOffering,
} from "react-native-purchases";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import logger from "@/src/utils/core/logger";

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  /** Optional title override */
  title?: string;
}

export default function PaywallModal({
  visible,
  onClose,
  title = "Unlock Finny Premium",
}: PaywallModalProps) {
  const insets = useSafeAreaInsets();
  const { refetch, applyCustomerInfo, hidePaywall } = useSubscription();
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setOfferings(null);
    setLoading(true);
    let cancelled = false;
    Purchases.getOfferings()
      .then((o) => {
        if (cancelled) return;
        const current =
          (o as { current?: PurchasesOffering | null }).current ?? null;
        setOfferings(current);
      })
      .catch((e) => {
        if (!cancelled) {
          logger.warn("Paywall getOfferings failed", e);
          setError("Unable to load plans. Try again later.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    if (Platform.OS !== "ios") return;
    setPurchasing(true);
    setError(null);
    try {
      const result = await Purchases.purchasePackage(pkg);
      applyCustomerInfo(result.customerInfo);
      await refetch();
      hidePaywall();
      onClose();
    } catch (e: any) {
      if (e?.userCancelled) return;
      logger.warn("Purchase failed", e);
      setError(e?.message || "Purchase failed. Try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS !== "ios") return;
    setRestoring(true);
    setError(null);
    try {
      const info = await Purchases.restorePurchases();
      applyCustomerInfo(info);
      await refetch();
      hidePaywall();
      onClose();
    } catch (e: any) {
      logger.warn("Restore failed", e);
      setError(e?.message || "Restore failed. Try again.");
    } finally {
      setRestoring(false);
    }
  };

  const handleClose = () => {
    hidePaywall();
    onClose();
  };

  const packages =
    offerings?.availablePackages && offerings.availablePackages.length > 0
      ? offerings.availablePackages
      : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>
            Goals, unlimited Finny messages, and investment tracking.
          </Text>

          {loading ? (
            <ActivityIndicator
              size="large"
              color="#4A90E2"
              style={styles.loader}
            />
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : packages.length === 0 ? (
            <Text style={styles.noPlans}>
              No plans available right now. Please try again later.
            </Text>
          ) : (
            <View style={styles.packages}>
              {packages.map((pkg) => (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={styles.packageButton}
                  onPress={() => handlePurchase(pkg)}
                  disabled={purchasing}
                  activeOpacity={0.8}
                >
                  <BlurView
                    intensity={40}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.packageContent}>
                    <Text style={styles.packageTitle}>
                      {pkg.packageType === "MONTHLY"
                        ? "Monthly"
                        : pkg.packageType === "ANNUAL"
                          ? "Annual"
                          : pkg.product.title}
                    </Text>
                    <Text style={styles.packagePrice}>
                      {pkg.product.priceString}
                      {pkg.packageType === "MONTHLY"
                        ? "/month"
                        : pkg.packageType === "ANNUAL"
                          ? "/year"
                          : ""}
                    </Text>
                    {pkg.product.introPrice?.priceString && (
                      <Text style={styles.introPrice}>
                        {pkg.product.introPrice.priceString} for intro
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#4A90E2" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.restoreButton,
              (purchasing || restoring) && styles.restoreDisabled,
            ]}
            onPress={handleRestore}
            disabled={purchasing || restoring}
          >
            {restoring ? (
              <View style={styles.restoreLoadingContainer}>
                <ActivityIndicator
                  color="rgba(255, 255, 255, 0.6)"
                  size="small"
                />
                <Text style={styles.restoreText}>Restoring…</Text>
              </View>
            ) : (
              <Text style={styles.restoreText}>Restore purchases</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 24,
    textAlign: "center",
  },
  loader: {
    marginVertical: 32,
  },
  errorBox: {
    backgroundColor: "rgba(255,80,80,0.15)",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
  },
  noPlans: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    textAlign: "center",
    marginVertical: 16,
  },
  packages: {
    gap: 12,
    marginBottom: 24,
  },
  packageButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  packageContent: {
    flex: 1,
  },
  packageTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  packagePrice: {
    fontSize: 15,
    color: "#4A90E2",
    marginTop: 2,
  },
  introPrice: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  restoreButton: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  restoreDisabled: {
    opacity: 0.6,
  },
  restoreText: {
    fontSize: 15,
    color: "#4A90E2",
  },
  restoreLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});

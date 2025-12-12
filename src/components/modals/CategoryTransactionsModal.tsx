import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CategoryTransaction, BudgetData } from "@/src/types/budget";
import { useWindowDimensions } from "react-native";
import TransactionDetailModal from "@/src/components/modals/TransactionDetailModal";

export interface CategoryTransactionsModalProps {
  visible: boolean;
  category: BudgetData | null;
  parentLabel?: string | null;
  transactions: CategoryTransaction[];
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onManage?: () => void;
}

const CategoryTransactionsModal: React.FC<CategoryTransactionsModalProps> = ({
  visible,
  category,
  parentLabel,
  transactions,
  loading,
  error,
  onClose,
  onManage,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const containerMaxHeight = screenHeight * 0.7;
  const [currentCategory, setCurrentCategory] = useState(category);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const loadingDotAnimations = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;
  const loadingPulseAnim = useRef(new Animated.Value(1)).current;
  const loadingRingRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && category) {
      setCurrentCategory(category);
    }
  }, [visible, category]);

  // Loading animation effects
  useEffect(() => {
    if (loading) {
      // Gentle pulse animation for the image
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(loadingPulseAnim, {
            toValue: 1.08,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(loadingPulseAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      // Circular ring rotation animation
      const ringRotation = Animated.loop(
        Animated.timing(loadingRingRotate, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      // Dots animation
      const dotsAnimation = Animated.loop(
        Animated.parallel(
          loadingDotAnimations.map((anim, index) =>
            Animated.sequence([
              Animated.delay(index * 150),
              Animated.timing(anim, {
                toValue: 1,
                duration: 500,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(anim, {
                toValue: 0.3,
                duration: 500,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
            ])
          )
        )
      );

      pulseAnimation.start();
      ringRotation.start();
      dotsAnimation.start();

      return () => {
        pulseAnimation.stop();
        ringRotation.stop();
        dotsAnimation.stop();
      };
    } else {
      loadingPulseAnim.setValue(1);
      loadingRingRotate.setValue(0);
      loadingDotAnimations.forEach((anim) => anim.setValue(0.3));
    }
  }, [loading, loadingPulseAnim, loadingRingRotate, loadingDotAnimations]);

  const ringRotationDegrees = loadingRingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (!visible || !currentCategory) return null;

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const categoryColor = currentCategory.color || "#4A90E2";

  const monthKey = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  };

  const monthLabel = (key: string) => {
    const [year, month] = key.split("-").map((v) => parseInt(v, 10));
    const names = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const now = new Date();
    const isThisMonth =
      now.getFullYear() === year && now.getMonth() + 1 === month;
    return `${names[month - 1]} ${year}${isThisMonth ? " (This month)" : ""}`;
  };

  const grouped = transactions.reduce(
    (acc: Map<string, CategoryTransaction[]>, tx: CategoryTransaction) => {
      const effectiveDate = tx.authorized_date || tx.date;
      const key = monthKey(effectiveDate);
      const existing = acc.get(key) || [];
      existing.push(tx);
      acc.set(key, existing);
      return acc;
    },
    new Map()
  );

  const monthKeys = Array.from(grouped.keys()).sort((a, b) =>
    b.localeCompare(a)
  );

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      accessibilityLabel={`${currentCategory.category} transactions`}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.txOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.txContainer,
                {
                  height: containerMaxHeight,
                },
              ]}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.txHeaderRow}>
                <View style={styles.txHeaderText}>
                  <Text
                    style={styles.txTitle}
                    accessibilityRole="header"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {currentCategory.category}
                  </Text>
                  {parentLabel && (
                    <Text style={styles.txSubtitle}>
                      Child of {parentLabel}
                    </Text>
                  )}
                </View>
                {onManage ? (
                  <TouchableOpacity
                    onPress={onManage}
                    activeOpacity={0.7}
                    style={styles.txManageButton}
                  >
                    <Ionicons
                      name="options-outline"
                      size={18}
                      color="#4A90E2"
                    />
                    <Text style={styles.txManageText}>Manage</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.txHeaderSpacer} />

              <View style={styles.txList}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <View style={styles.loadingImageWrapper}>
                      {/* Circular loading ring */}
                      <Animated.View
                        style={[
                          styles.loadingRing,
                          {
                            transform: [{ rotate: ringRotationDegrees }],
                            borderTopColor: categoryColor,
                            borderRightColor: hexToRgba(categoryColor, 0.5),
                          },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.loadingRingInner,
                            {
                              borderBottomColor: hexToRgba(categoryColor, 0.3),
                              borderLeftColor: hexToRgba(categoryColor, 0.6),
                            },
                          ]}
                        />
                      </Animated.View>
                      {/* Rounded image */}
                      <Animated.View
                        style={[
                          styles.loadingImageContainer,
                          {
                            transform: [{ scale: loadingPulseAnim }],
                            borderColor: hexToRgba(categoryColor, 0.25),
                          },
                        ]}
                      >
                        <Image
                          source={require("../../../assets/images/finnylap1.png")}
                          style={styles.loadingImage}
                          resizeMode="cover"
                        />
                      </Animated.View>
                    </View>
                    <Text style={styles.loadingText}>Loading transactions</Text>
                    <View style={styles.loadingDotsContainer}>
                      {loadingDotAnimations.map((anim, index) => (
                        <Animated.View
                          key={index}
                          style={[
                            styles.loadingDot,
                            {
                              opacity: anim,
                              backgroundColor: categoryColor,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ) : error ? (
                  <Text style={styles.txEmpty}>{error}</Text>
                ) : transactions.length === 0 ? (
                  <Text style={styles.txEmpty}>No transactions found</Text>
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 16, gap: 10 }}
                  >
                    {monthKeys.map((key) => {
                      const txs = grouped.get(key) || [];
                      return (
                        <View key={key} style={styles.txMonthBlock}>
                          <Text style={styles.txMonthLabel}>
                            {monthLabel(key)}
                          </Text>
                          {txs.map((tx: CategoryTransaction, idx: number) => {
                            const effectiveDate = tx.authorized_date || tx.date;
                            const displayName =
                              tx.merchant_name || tx.name || "Transaction";
                            const formattedDate = new Date(
                              effectiveDate + "T00:00:00"
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                            return (
                              <TouchableOpacity
                                key={tx.id || `${key}-${idx}`}
                                style={styles.txItem}
                                activeOpacity={0.75}
                                onPress={() => {
                                  if (isTransitioning) return;
                                  const nextId = tx.id || null;
                                  if (!nextId) return;
                                  setIsTransitioning(true);

                                  if (showDetailModal) {
                                    setShowDetailModal(false);
                                    setSelectedTxId(null);
                                    requestAnimationFrame(() => {
                                      setSelectedTxId(nextId);
                                      setShowDetailModal(true);
                                      setIsTransitioning(false);
                                    });
                                  } else {
                                    setSelectedTxId(nextId);
                                    setShowDetailModal(true);
                                    setIsTransitioning(false);
                                  }
                                }}
                              >
                                <View style={styles.txItemLeft}>
                                  <View
                                    style={[
                                      styles.txDot,
                                      {
                                        backgroundColor:
                                          currentCategory.color || "#4A90E2",
                                      },
                                    ]}
                                  />
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={styles.txItemTitle}
                                      numberOfLines={1}
                                    >
                                      {displayName}
                                    </Text>
                                    <Text style={styles.txItemDate}>
                                      {formattedDate}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={styles.txItemAmount}>
                                  ${tx.amount.toLocaleString()}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>

          <TransactionDetailModal
            key={`tx-detail-${selectedTxId || "none"}`}
            visible={showDetailModal}
            transactionId={selectedTxId}
            transaction={null}
            onClose={() => {
              setShowDetailModal(false);
              setSelectedTxId(null);
              setIsTransitioning(false);
            }}
          />
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  txOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  txContainer: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 8,
  },
  txHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
    paddingTop: 0,
    paddingHorizontal: 2,
    gap: 10,
    position: "relative",
  },
  txHeaderSpacer: {
    height: 16,
  },
  txHeaderText: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  txTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  txSubtitle: {
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
    fontSize: 13,
    textAlign: "center",
  },
  txManageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(74,144,226,0.16)",
    borderWidth: 1,
    borderColor: "rgba(74,144,226,0.35)",
    gap: 6,
    position: "absolute",
    right: 0,
  },
  txManageText: {
    color: "#4A90E2",
    fontWeight: "700",
    fontSize: 13,
  },
  txList: {
    flex: 1,
    minHeight: 0,
  },
  txMonthBlock: {
    marginBottom: 16,
  },
  txMonthLabel: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
  },
  txItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  txItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  txItemTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  txItemDate: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  txItemAmount: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 12,
  },
  txEmpty: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 13,
  },
  txDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 20,
  },
  loadingImageWrapper: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  loadingRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
  },
  loadingRingInner: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    top: 8,
    left: 8,
  },
  loadingImageContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 3,
  },
  loadingImage: {
    width: "100%",
    height: "100%",
  },
  loadingText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
  },
  loadingDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4A90E2",
  },
});

export default CategoryTransactionsModal;

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { supabase } from "@/src/lib/supabase/supabase";

interface TransactionActionAlertProps {
  visible: boolean;
  onClose: () => void;
  onInternalTransfer: () => void;
  onSetRecurring: () => void;
  isInternalTransfer?: boolean;
  isRecurring?: boolean;
  onSelectGoal?: (goalId: string, goalLabel: string) => void;
}

export default function TransactionActionAlert({
  visible,
  onClose,
  onInternalTransfer,
  onSetRecurring,
  isInternalTransfer = false,
  isRecurring = false,
  onSelectGoal,
}: TransactionActionAlertProps) {
  const [mode, setMode] = useState<"actions" | "goals">("actions");
  const [goals, setGoals] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMode("actions");
      setGoals([]);
      setLoadingGoals(false);
    }
  }, [visible]);

  const loadGoals = async () => {
    try {
      setLoadingGoals(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setGoals([]);
        return;
      }
      const { data, error } = await supabase
        .from("goals")
        .select("id,label,status,created_at")
        .eq("user_id", user.id)
        .neq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGoals((data || []).map((g: any) => ({ id: g.id, label: g.label })));
    } catch (e) {
      setGoals([]);
    } finally {
      setLoadingGoals(false);
    }
  };

  const handleAddToGoalPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode("goals");
    await loadGoals();
  };

  const handleSelectGoal = (goalId: string, goalLabel: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectGoal && onSelectGoal(goalId, goalLabel);
    onClose();
  };
  const handleInternalTransfer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onInternalTransfer();
    onClose();
  };

  const handleSetRecurring = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSetRecurring();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.container}>
              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.15)",
                    "rgba(255, 255, 255, 0.05)",
                  ]}
                  style={styles.closeButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color="rgba(255, 255, 255, 0.8)"
                  />
                </LinearGradient>
              </TouchableOpacity>

              {mode === "actions" ? (
                <View style={styles.actionsContainer}>
                  {/* Internal Transfer Button */}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleInternalTransfer}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(255, 255, 255, 0.1)",
                        "rgba(255, 255, 255, 0.05)",
                      ]}
                      style={styles.actionButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.actionButtonContent}>
                        <View style={[styles.iconContainer]}>
                          <Ionicons
                            name="swap-horizontal"
                            size={24}
                            color={isInternalTransfer ? "#ffffff" : "#4A90E2"}
                          />
                        </View>
                        <View style={styles.actionTextContainer}>
                          <Text
                            style={[
                              styles.actionTitle,
                              isInternalTransfer && styles.actionTitleActive,
                            ]}
                          >
                            {isInternalTransfer
                              ? "Mark as Regular"
                              : "Mark as Internal Transfer"}
                          </Text>
                          <Text
                            style={[
                              styles.actionSubtitle,
                              isInternalTransfer && styles.actionSubtitleActive,
                            ]}
                          >
                            {isInternalTransfer
                              ? "Remove internal transfer status"
                              : "Exclude from spending analysis"}
                          </Text>
                        </View>
                        {isInternalTransfer && (
                          <View style={styles.checkmarkContainer}>
                            <View style={styles.checkmark}>
                              <Ionicons
                                name="checkmark"
                                size={24}
                                color="#4A90E2"
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Recurring Button */}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleSetRecurring}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(255, 255, 255, 0.1)",
                        "rgba(255, 255, 255, 0.05)",
                      ]}
                      style={styles.actionButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.actionButtonContent}>
                        <View style={[styles.iconContainer]}>
                          <Ionicons name="repeat" size={24} color={"#4A90E2"} />
                        </View>
                        <View style={styles.actionTextContainer}>
                          <Text
                            style={[
                              styles.actionTitle,
                              isRecurring && styles.actionTitleActive,
                            ]}
                          >
                            {isRecurring
                              ? "Remove Recurring"
                              : "Set as Recurring"}
                          </Text>
                          <Text
                            style={[
                              styles.actionSubtitle,
                              isRecurring && styles.actionSubtitleActive,
                            ]}
                          >
                            {isRecurring
                              ? "Remove recurring status"
                              : "Mark as recurring transaction"}
                          </Text>
                        </View>
                        {isRecurring && (
                          <View style={styles.checkmarkContainer}>
                            <View style={styles.checkmark}>
                              <Ionicons
                                name="checkmark"
                                size={24}
                                color="#4A90E2"
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Add to Goal Button */}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleAddToGoalPress}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(255, 255, 255, 0.1)",
                        "rgba(255, 255, 255, 0.05)",
                      ]}
                      style={styles.actionButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.actionButtonContent}>
                        <View style={[styles.iconContainer]}>
                          <Ionicons name="trophy" size={24} color={"#4A90E2"} />
                        </View>
                        <View style={styles.actionTextContainer}>
                          <Text style={styles.actionTitle}>Add to Goal</Text>
                          <Text style={styles.actionSubtitle}>
                            Increase progress using this transaction
                          </Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actionsContainer}>
                  <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                    <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 16 }}>
                      Choose a goal
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 4, fontSize: 12 }}>
                      We'll add this transaction amount to the goal's progress
                    </Text>
                  </View>
                  {loadingGoals ? (
                    <View style={{ paddingVertical: 20, alignItems: "center" }}>
                      <Text style={{ color: "#fff" }}>Loading goals…</Text>
                    </View>
                  ) : goals.length === 0 ? (
                    <View style={{ paddingVertical: 20, alignItems: "center" }}>
                      <Text style={{ color: "#fff" }}>No active goals found</Text>
                    </View>
                  ) : (
                    goals.map((g) => (
                      <TouchableOpacity
                        key={g.id}
                        style={styles.actionButton}
                        onPress={() => handleSelectGoal(g.id, g.label)}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={[
                            "rgba(255, 255, 255, 0.1)",
                            "rgba(255, 255, 255, 0.05)",
                          ]}
                          style={styles.actionButtonGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <View style={styles.actionButtonContent}>
                            <View style={[styles.iconContainer]}>
                              <Ionicons name="flag" size={22} color={"#4A90E2"} />
                            </View>
                            <View style={styles.actionTextContainer}>
                              <Text style={styles.actionTitle}>{g.label}</Text>
                              <Text style={styles.actionSubtitle}>Add this transaction</Text>
                            </View>
                            <View style={styles.checkmarkContainer}>
                              <Ionicons name="chevron-forward" size={20} color="#4A90E2" />
                            </View>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 35,
    height: 35,
    borderRadius: 20,
    zIndex: 1,
  },
  closeButtonGradient: {
    width: 35,
    height: 35,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  actionsContainer: {
    padding: 24,
    paddingTop: 70,
    gap: 16,
  },
  actionButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  actionButtonGradient: {
    borderRadius: 16,
  },
  actionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  actionTitleActive: {
    color: "#4A90E2",
  },
  actionSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
    lineHeight: 18,
  },
  actionSubtitleActive: {
    color: "rgba(74, 144, 226, 0.8)",
  },
  checkmarkContainer: {
    width: 24,
    height: 24,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkmark: {
    width: 25,
    height: 25,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
});

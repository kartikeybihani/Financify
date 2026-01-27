import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CategoryMappingModalProps {
  visible: boolean;
  userId: string;
  onComplete: () => void;
}

export default function CategoryMappingModal({
  visible,
  userId,
  onComplete,
}: CategoryMappingModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Animate modal slide up/down
  useEffect(() => {
    if (visible) {
      // Reset animations and state
      setIsAnimatingOut(false);
      slideAnim.setValue(300);
      pulseAnim.setValue(1);
      checkmarkScale.setValue(0);
      setIsComplete(false);

      // Slide up animation
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 300,
        useNativeDriver: true,
      }).start();

      // Pulse animation for icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else if (isAnimatingOut) {
      // Slide down animation when closing
      Animated.spring(slideAnim, {
        toValue: 300,
        damping: 20,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, isAnimatingOut]);

  // Poll for mapping status
  useEffect(() => {
    if (!visible || !userId) return;

    let pollInterval: ReturnType<typeof setInterval>;
    let timeout: ReturnType<typeof setTimeout>;

    const checkMappingStatus = async () => {
      try {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const periodStart = new Date(year, month, 1);
        const periodEnd = new Date(year, month + 1, 0);

        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        };

        const periodStartStr = formatDate(periodStart);
        const periodEndStr = formatDate(periodEnd);

        const { data, error } = await supabase
          .from("budget_periods")
          .select("category_mapping_status")
          .eq("user_id", userId)
          .eq("period_start", periodStartStr)
          .eq("period_end", periodEndStr)
          .eq("status", "active")
          .maybeSingle();

        if (error) {
          console.error("[MAPPING_MODAL] Error checking status:", error);
          return;
        }

        if (data?.category_mapping_status === "completed") {
          setIsComplete(true);
          // Show checkmark animation
          Animated.spring(checkmarkScale, {
            toValue: 1,
            damping: 10,
            stiffness: 200,
            useNativeDriver: true,
          }).start();

          // Wait a moment then close with animation
          setTimeout(() => {
            if (pollInterval) clearInterval(pollInterval);
            if (timeout) clearTimeout(timeout);
            setIsAnimatingOut(true);
            setTimeout(() => {
              onComplete();
            }, 300);
          }, 1500);
        } else if (data?.category_mapping_status === "failed") {
          // Close on failure (silently) with animation
          if (pollInterval) clearInterval(pollInterval);
          if (timeout) clearTimeout(timeout);
          setIsAnimatingOut(true);
          setTimeout(() => {
            onComplete();
          }, 300);
        }
      } catch (error) {
        console.error("[MAPPING_MODAL] Error in status check:", error);
      }
    };

    // Start polling immediately, then every 2 seconds
    checkMappingStatus();
    pollInterval = setInterval(checkMappingStatus, 2000);

    // Timeout after 30 seconds (fallback)
    timeout = setTimeout(() => {
      if (pollInterval) clearInterval(pollInterval);
      setIsAnimatingOut(true);
      setTimeout(() => {
        onComplete();
      }, 300);
    }, 30000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeout) clearTimeout(timeout);
    };
  }, [visible, userId, onComplete, checkmarkScale]);

  if (!visible && !isAnimatingOut) return null;

  return (
    <Modal
      transparent
      visible={visible || isAnimatingOut}
      animationType="none"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              paddingBottom: insets.bottom + 20,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={["#1a1a2e", "#16213e", "#0f3460"]}
            style={styles.gradient}
          >
            <View style={styles.content}>
              {!isComplete ? (
                <Animated.View
                  style={[
                    styles.iconContainer,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  <Ionicons name="sync" size={32} color="#4A90E2" />
                </Animated.View>
              ) : (
                <Animated.View
                  style={[
                    styles.iconContainer,
                    { transform: [{ scale: checkmarkScale }] },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={32} color="#4CAF50" />
                </Animated.View>
              )}

              <Text style={styles.title}>Mapping your transactions</Text>
              <Text style={styles.subtitle}>
                {!isComplete
                  ? "We're organizing your transactions into your new budget categories..."
                  : "All done! Your transactions have been mapped."}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: SCREEN_WIDTH,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  gradient: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#B0B0B0",
    textAlign: "center",
    lineHeight: 20,
  },
});

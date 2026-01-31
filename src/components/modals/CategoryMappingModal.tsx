import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Easing,
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
  const spinAnim = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Animate modal slide up/down - check isAnimatingOut FIRST to avoid resetting when closing
  useEffect(() => {
    if (isAnimatingOut) {
      // Slide down animation when closing
      Animated.spring(slideAnim, {
        toValue: 300,
        damping: 20,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (visible) {
      // Reset animations and state
      setIsAnimatingOut(false);
      slideAnim.setValue(300);
      spinAnim.setValue(0);
      checkmarkScale.setValue(0);
      setIsComplete(false);

      // Slide up animation
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 300,
        useNativeDriver: true,
      }).start();

      // Smooth continuous spin at normal speed
      const spinLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(spinAnim, {
            toValue: 1,
            duration: 1100,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(spinAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      spinLoop.start();
      return () => spinLoop.stop();
    }
  }, [visible, isAnimatingOut, slideAnim, spinAnim]);

  // Poll for mapping status - use ref for onComplete to avoid effect restarts from inline callbacks
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
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
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
          Animated.spring(checkmarkScale, {
            toValue: 1,
            damping: 10,
            stiffness: 200,
            useNativeDriver: true,
          }).start();

          setTimeout(() => {
            if (pollInterval) clearInterval(pollInterval);
            if (timeout) clearTimeout(timeout);
            setIsAnimatingOut(true);
            setTimeout(() => {
              onCompleteRef.current();
            }, 300);
          }, 1500);
        } else if (data?.category_mapping_status === "failed") {
          if (pollInterval) clearInterval(pollInterval);
          if (timeout) clearTimeout(timeout);
          setIsAnimatingOut(true);
          setTimeout(() => {
            onCompleteRef.current();
          }, 300);
        }
      } catch (error) {
        console.error("[MAPPING_MODAL] Error in status check:", error);
      }
    };

    checkMappingStatus();
    pollInterval = setInterval(checkMappingStatus, 2000);

    timeout = setTimeout(() => {
      if (pollInterval) clearInterval(pollInterval);
      setIsAnimatingOut(true);
      setTimeout(() => {
        onCompleteRef.current();
      }, 300);
    }, 30000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeout) clearTimeout(timeout);
    };
  }, [visible, userId]);

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
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={["#0d0d0d", "#18181a", "#141416"]}
            style={styles.gradient}
          >
            <View
              style={[
                styles.content,
                {
                  paddingBottom: insets.bottom + 20,
                  paddingTop: Math.max(insets.top, 20),
                },
              ]}
            >
              {!isComplete ? (
                <Animated.View
                  style={[
                    styles.iconContainer,
                    {
                      transform: [
                        {
                          rotate: spinAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0deg", "360deg"],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Ionicons name="sync" size={40} color="#4A90E2" />
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
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: SCREEN_WIDTH,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    overflow: "hidden",
    minHeight: 220,
    maxHeight: "80%",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
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
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
});

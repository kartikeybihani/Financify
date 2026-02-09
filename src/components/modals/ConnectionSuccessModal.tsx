import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Image,
  TouchableOpacity,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { INSTITUTION_LOGO_MAP } from "../shared/modal-constants";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DOT_COUNT = 10;
const DOT_SIZE = 5;
const LOGO_SIZE = 72;
const INSTITUTION_LOGO_SIZE = Math.round(LOGO_SIZE * 1.3);
const WAVE_DURATION = 1400;

const LOADING_SUBTITLES = [
  "Gathering your data…",
  "Fetching your data…",
  "Syncing your accounts…",
  "Almost there…",
];

interface ConnectionSuccessModalProps {
  visible: boolean;
  institutionName: string;
  institutionId?: string;
  onComplete: () => void;
  performRefresh: () => Promise<void>;
}

export default function ConnectionSuccessModal({
  visible,
  institutionName,
  institutionId,
  onComplete,
  performRefresh,
}: ConnectionSuccessModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(280)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const checkmarkOpacity = useRef(new Animated.Value(0)).current;
  const waveProgress = useRef(new Animated.Value(0)).current;
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [subtitleIndex, setSubtitleIndex] = useState(0);

  // Cycle subtitle while loading
  useEffect(() => {
    if (!visible || isComplete) return;
    setSubtitleIndex(0);
    const interval = setInterval(() => {
      setSubtitleIndex((prev) => (prev + 1) % LOADING_SUBTITLES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [visible, isComplete]);

  // Left-to-right wave: progress 0→1, each dot peaks in sequence
  useEffect(() => {
    if (!visible || isComplete) return;
    waveProgress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveProgress, {
          toValue: 1,
          duration: WAVE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(waveProgress, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, isComplete, waveProgress]);

  // When visible: slide up, wait 2.5s, then run refresh and complete
  const REFRESH_DELAY_MS = 2500;
  useEffect(() => {
    if (visible) {
      setIsAnimatingOut(false);
      setIsComplete(false);
      slideAnim.setValue(280);
      checkmarkScale.setValue(0);
      checkmarkOpacity.setValue(0);

      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 280,
        useNativeDriver: true,
      }).start();

      let cancelled = false;
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        performRefresh()
          .then(() => {
            if (cancelled) return;
            setIsComplete(true);
            Animated.parallel([
              Animated.spring(checkmarkScale, {
                toValue: 1,
                damping: 10,
                stiffness: 140,
                useNativeDriver: true,
              }),
              Animated.timing(checkmarkOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
            ]).start();
          })
          .catch(() => {
            if (!cancelled) {
              setIsAnimatingOut(true);
              Animated.timing(slideAnim, {
                toValue: 280,
                duration: 220,
                useNativeDriver: true,
              }).start(() => {
                onComplete();
                setIsAnimatingOut(false);
              });
            }
          });
      }, REFRESH_DELAY_MS);

      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    } else if (isAnimatingOut) {
      Animated.timing(slideAnim, {
        toValue: 280,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        onComplete();
        setIsAnimatingOut(false);
      });
    }
  }, [visible]);

  const institutionLogo = institutionId
    ? (INSTITUTION_LOGO_MAP as Record<string, number>)[institutionId]
    : null;

  const handleContinue = () => {
    setIsAnimatingOut(true);
    Animated.timing(slideAnim, {
      toValue: 280,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
      setIsAnimatingOut(false);
    });
  };

  if (!visible && !isAnimatingOut) return null;

  return (
    <Modal
      transparent
      visible={visible || isAnimatingOut}
      animationType="none"
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <BlurView intensity={24} style={StyleSheet.absoluteFill} tint="dark" />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 24,
              paddingTop: 25,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={["#0d0d0d", "#18181a", "#141416"]}
            style={styles.sheetGradient}
          />
          <View style={styles.content}>
            {!isComplete ? (
              <>
                <Text style={styles.title}>Successfully connected</Text>
                <Text style={styles.institutionName}>{institutionName}</Text>

                <View style={styles.logoRow}>
                  <View style={styles.logoWrap}>
                    <Image
                      source={require("../../../assets/images/appicon.png")}
                      style={[styles.logo, styles.logoRounded]}
                      resizeMode="cover"
                    />
                  </View>

                  <View style={styles.dotsCenter}>
                    <View style={styles.dotsRow}>
                      {Array.from({ length: DOT_COUNT }, (_, i) => {
                        // Wave left→right: dot i peaks when progress ≈ (i+0.5)/DOT_COUNT
                        const center = (i + 0.5) / DOT_COUNT;
                        const spread = 0.12;
                        const low = Math.max(0, center - spread);
                        const high = Math.min(1, center + spread);
                        const dotOpacity = waveProgress.interpolate({
                          inputRange: [low, center, high],
                          outputRange: [0.3, 1, 0.3],
                          extrapolate: "clamp",
                        });
                        const dotScale = waveProgress.interpolate({
                          inputRange: [low, center, high],
                          outputRange: [0.8, 1.35, 0.8],
                          extrapolate: "clamp",
                        });
                        return (
                          <Animated.View
                            key={i}
                            style={[
                              styles.dot,
                              {
                                opacity: dotOpacity,
                                transform: [{ scale: dotScale }],
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                  </View>

                  <View style={[styles.logoWrap, styles.institutionLogoWrap]}>
                    {institutionLogo ? (
                      <Image
                        source={institutionLogo}
                        style={[
                          styles.institutionLogo,
                          styles.institutionLogoRounded,
                        ]}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={styles.institutionLogoPlaceholder}>
                        <Text
                          style={styles.logoPlaceholderText}
                          numberOfLines={1}
                        >
                          {institutionName.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text style={styles.subtitle}>
                  {LOADING_SUBTITLES[subtitleIndex]}
                </Text>
              </>
            ) : (
              <>
                <Animated.View
                  style={[
                    styles.checkWrap,
                    {
                      opacity: checkmarkOpacity,
                      transform: [{ scale: checkmarkScale }],
                    },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={72}
                    color="#4CAF50"
                  />
                </Animated.View>
                <Text style={styles.connectedText}>
                  {institutionName} connected
                </Text>
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.continueButton}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.continueButtonText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: SCREEN_WIDTH,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    alignItems: "center",
    overflow: "hidden",
  },
  sheetGradient: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 25,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
    fontFamily: "Manrope",
  },
  institutionName: {
    fontSize: 16,
    color: "#8E8E93",
    marginBottom: 28,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    width: "100%",
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: LOGO_SIZE / 2,
    overflow: "hidden",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  logoRounded: {
    borderRadius: LOGO_SIZE / 2,
  },
  institutionLogoWrap: {
    width: INSTITUTION_LOGO_SIZE,
    height: INSTITUTION_LOGO_SIZE,
    borderRadius: INSTITUTION_LOGO_SIZE / 2,
  },
  institutionLogo: {
    width: INSTITUTION_LOGO_SIZE,
    height: INSTITUTION_LOGO_SIZE,
  },
  institutionLogoRounded: {
    borderRadius: INSTITUTION_LOGO_SIZE / 2,
  },
  institutionLogoPlaceholder: {
    width: INSTITUTION_LOGO_SIZE,
    height: INSTITUTION_LOGO_SIZE,
    borderRadius: INSTITUTION_LOGO_SIZE / 2,
    backgroundColor: "rgba(74, 144, 226, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoPlaceholderText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 1,
    gap: 6,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: "#4A90E2",
  },
  subtitle: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
  },
  checkWrap: {
    marginBottom: 10,
  },
  connectedText: {
    fontSize: 25,
    color: "#4CAF50",
    textAlign: "center",
    marginBottom: 16,
    fontFamily: "Manrope",
  },
  footer: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  continueButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

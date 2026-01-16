import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Platform,
  Dimensions,
  Animated,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

interface GoalAnalysisModalProps {
  visible: boolean;
  analysis: string | null;
  isAnalyzing?: boolean;
  onClose: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// Responsive calculations
const isSmallScreen = screenWidth < 375;
const isLargeScreen = screenWidth >= 414;

const responsiveFontSize = (baseSize: number) => {
  if (isSmallScreen) return baseSize * 0.9;
  if (isLargeScreen) return baseSize * 1.1;
  return baseSize;
};

const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.8;
  if (isLargeScreen) return basePadding * 1.2;
  return basePadding;
};

const styles = {
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  container: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: "#0B0B0C",
  },
  fullAnalysisScrollView: {
    flex: 1,
  },
  fullAnalysisScrollContent: (bottomInset: number) => ({
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(14),
    paddingBottom: Math.max(responsivePadding(28), bottomInset + responsivePadding(20)),
  }),
  cardOuter: {
    borderRadius: 20,
    padding: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 18,
  },
  cardInner: {
    borderRadius: 19,
    paddingHorizontal: responsivePadding(14),
    paddingTop: responsivePadding(14),
    paddingBottom: responsivePadding(18),
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    overflow: "hidden" as const,
  },
  analysisText: {
    fontSize: responsiveFontSize(13),
    color: "rgba(255, 255, 255, 0.85)",
    lineHeight: responsiveFontSize(22),
  },
  analysisTextFirstPart: {
    fontSize: responsiveFontSize(13),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
  },
  analysisBoldText: {
    fontSize: responsiveFontSize(14),
    color: "#fff",
    lineHeight: responsiveFontSize(22),
    fontWeight: "700" as const,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: responsivePadding(40),
  },
  emptyStateText: {
    fontSize: responsiveFontSize(16),
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center" as const,
  },
  header: (topInset: number) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: responsivePadding(14),
    paddingTop: topInset + 8,
    paddingBottom: 10,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 30, 30, 0.8)",
  }),
  headerTitle: {
    fontSize: responsiveFontSize(17),
    fontWeight: "600" as const,
    color: "#fff",
    letterSpacing: 0.5,
    flex: 1,
    textAlign: "center" as const,
  },
  closeButton: {
    padding: 6,
  },
  closeButtonCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  spacer: {
    width: 36,
  },
};

// Parse markdown-style bold text (**text**) and render with bold formatting
const renderAnalysisText = (text: string) => {
  if (!text) return null;

  // Split by first blank line (double newline or newline followed by content)
  const blankLineIndex = text.indexOf("\n\n");
  const firstPart =
    blankLineIndex !== -1 ? text.substring(0, blankLineIndex) : text;
  const restPart =
    blankLineIndex !== -1 ? text.substring(blankLineIndex + 2) : "";

  // Helper function to parse and render text parts
  const renderTextParts = (textToRender: string, useWhiteColor: boolean) => {
    const parts: (string | { bold: string })[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(textToRender)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(textToRender.substring(lastIndex, match.index));
      }
      // Add the bold text
      parts.push({ bold: match[1] });
      lastIndex = regex.lastIndex;
    }

    // Add remaining text after last match
    if (lastIndex < textToRender.length) {
      parts.push(textToRender.substring(lastIndex));
    }

    // If no matches, return original text
    if (parts.length === 0) {
      parts.push(textToRender);
    }

    return parts.map((part, index) => {
      if (typeof part === "object" && "bold" in part) {
        return (
          <Text key={`bold-${index}`} style={styles.analysisBoldText}>
            {part.bold}
          </Text>
        );
      }
      return (
        <Text
          key={`text-${index}`}
          style={
            useWhiteColor ? styles.analysisTextFirstPart : styles.analysisText
          }
        >
          {part as string}
        </Text>
      );
    });
  };

  return (
    <Text>
      {renderTextParts(firstPart, true)}
      {restPart && (
        <>
          {"\n\n"}
          {renderTextParts(restPart, false)}
        </>
      )}
    </Text>
  );
};

export default function GoalAnalysisModal({
  visible,
  analysis,
  isAnalyzing = false,
  onClose,
}: GoalAnalysisModalProps) {
  const [slideAnimation] = useState(new Animated.Value(screenWidth));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      // Reset position to start from right before animating in
      slideAnimation.setValue(screenWidth);
      // Slide in from right
      Animated.timing(slideAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Slide out to right
      Animated.timing(slideAnimation, {
        toValue: screenWidth,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnimation]);

  const translateX = slideAnimation;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            {/* Fixed Header */}
            <View style={styles.header(insets.top)}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.18)",
                    "rgba(255, 255, 255, 0.06)",
                  ]}
                  style={styles.closeButtonCircle}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Finny's thoughts</Text>
              <View style={styles.spacer} />
            </View>

            {/* Scrollable Content */}
            <ScrollView
              style={styles.fullAnalysisScrollView}
              contentContainerStyle={styles.fullAnalysisScrollContent(insets.bottom)}
              showsVerticalScrollIndicator={true}
              bounces={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {isAnalyzing ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    Finny is thinking about this goal...
                  </Text>
                </View>
              ) : analysis ? (
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.12)",
                    "rgba(255, 255, 255, 0.04)",
                    "rgba(255, 255, 255, 0.08)",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardOuter}
                >
                  {Platform.OS === "ios" ? (
                    <BlurView intensity={90} tint="dark" style={styles.cardInner}>
                      {renderAnalysisText(analysis)}
                    </BlurView>
                  ) : (
                    <View style={styles.cardInner}>
                      {renderAnalysisText(analysis)}
                    </View>
                  )}
                </LinearGradient>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No analysis available yet.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

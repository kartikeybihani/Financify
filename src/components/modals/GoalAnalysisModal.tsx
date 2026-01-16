import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Platform,
  Dimensions,
  Animated,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  container: {
    height: screenHeight,
    position: "absolute" as const,
    bottom: -25,
    left: 0,
    right: 0,
    backgroundColor: "#0F0F0F",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden" as const,
  },
  fullAnalysisScrollView: {
    flex: 1,
  },
  fullAnalysisScrollContent: {
    paddingHorizontal: responsivePadding(10),
    paddingTop: responsivePadding(12),
    paddingBottom: responsivePadding(60),
  },
  fullAnalysisBlurContainer: {
    borderRadius: 16,
    paddingHorizontal: responsivePadding(12),
    paddingTop: responsivePadding(12),
    paddingBottom: responsivePadding(16),
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
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
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: responsivePadding(10),
    paddingTop: Platform.OS === "ios" ? 8 : 12,
    paddingBottom: 6,
    backgroundColor: "#0F0F0F",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 30, 30, 0.8)",
  },
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
  const insets = useSafeAreaInsets();
  const [slideAnimation] = useState(new Animated.Value(screenWidth));

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

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          zIndex: 10,
          transform: [{ translateX }],
        },
      ]}
    >
      <View style={{ flex: 1, backgroundColor: "#0F0F0F" }}>
        <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
          {/* Fixed Header */}
          <View style={styles.header}>
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
            contentContainerStyle={styles.fullAnalysisScrollContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={true}
          >
            {isAnalyzing ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Finny is thinking about this goal...
                </Text>
              </View>
            ) : analysis ? (
              Platform.OS === "ios" ? (
                <BlurView
                  intensity={80}
                  tint="dark"
                  style={styles.fullAnalysisBlurContainer}
                >
                  {renderAnalysisText(analysis)}
                </BlurView>
              ) : (
                <View style={styles.fullAnalysisBlurContainer}>
                  {renderAnalysisText(analysis)}
                </View>
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No analysis available yet.
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Animated.View>
  );
}

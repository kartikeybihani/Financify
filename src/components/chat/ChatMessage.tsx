import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Easing,
  TouchableOpacity,
  Dimensions,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { Svg, Path } from "react-native-svg";

// Enable LayoutAnimation for Android
if (Platform.OS === "android") {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// URL detection regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// Function to open URL in WebBrowser
const openURL = async (url: string) => {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      controlsColor: "#4A90E2",
      showTitle: true,
    });
  } catch (error) {
    console.error("Failed to open URL:", error);
    // Fallback to system browser
    await Linking.openURL(url);
  }
};

// Function to generate elegant link text based on context
const generateLinkText = (url: string, context: string = "") => {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];

  // Check for specific patterns in the surrounding context
  const lowerContext = context.toLowerCase();

  if (
    lowerContext.includes("check") ||
    lowerContext.includes("visit") ||
    lowerContext.includes("see")
  ) {
    return "here";
  }
  if (lowerContext.includes("learn") || lowerContext.includes("more")) {
    return "learn more";
  }
  if (lowerContext.includes("source") || lowerContext.includes("reference")) {
    return "source";
  }
  if (lowerContext.includes("apply") || lowerContext.includes("application")) {
    return "apply here";
  }
  if (
    lowerContext.includes("eligibility") ||
    lowerContext.includes("qualify")
  ) {
    return "check eligibility";
  }
  if (
    lowerContext.includes("documentation") ||
    lowerContext.includes("documents")
  ) {
    return "view docs";
  }

  // Domain-based fallbacks
  if (domain.includes("gov")) return "official site";
  if (domain.includes("nyc.gov")) return "NYC portal";
  if (domain.includes("usa.gov")) return "USAGov";
  if (domain.includes("hcr.ny.gov")) return "HCR portal";

  // Generic fallback
  return "view link";
};

// Function to parse text and render links with elegant text
const parseTextWithLinks = (text: string, textStyle: any) => {
  const parts = text.split(URL_REGEX);
  let linkCounter = 0;

  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      linkCounter++;
      const linkText = generateLinkText(part, text);
      const isMultipleLinks = (text.match(URL_REGEX) || []).length > 1;
      const displayText = isMultipleLinks
        ? `${linkText} (${linkCounter})`
        : linkText;

      return (
        <Text
          key={index}
          style={[textStyle, styles.linkText]}
          onPress={() => openURL(part)}
        >
          {displayText}{" "}
          <Ionicons
            name="open-outline"
            size={12}
            color="#87CEEB"
            style={{ marginLeft: 2 }}
          />
        </Text>
      );
    }
    return part;
  });
};

// Helper to pick the corner color that meets the tail
const pickTailColor = (colors: string[], side: "left" | "right") => {
  if (side === "right") {
    // For user messages, use the end color (darker)
    return colors[colors.length - 1];
  } else {
    // For Finny messages, use a darker version of the first color
    const baseColor = colors[1];
    // Darken the color by reducing brightness
    if (baseColor.startsWith("#")) {
      // Convert hex to RGB, darken, and convert back
      const hex = baseColor.slice(1);
      const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - 30);
      const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - 30);
      const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - 30);
      return `#${r.toString(16).padStart(2, "0")}${g
        .toString(16)
        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }
    return baseColor;
  }
};

// SVG tail component with iMessage-style teardrop
const BubbleTail = ({
  side,
  color,
}: {
  side: "left" | "right";
  color: string;
}) => {
  // Different configs for left and right
  const config =
    side === "right"
      ? {
          width: 36,
          height: 20,
          offset: -16,
          viewBox: "0 0 36 20",
          flipX: -1,
          // Much wider and shorter, very thick at top
          path: "M36,0 L36,12 Q34,12 30,14 Q26,16 22,18 Q16,20 8,20 Q12,18 16,16 Q20,14 24,12 Q28,10 32,6 Q34,3 36,0 Z",
          shadowPath: "M36,1 Q34,6 30,10 Q26,14 22,16 Q16,18 8,20",
        }
      : {
          width: 40,
          height: 20,
          offset: -20,
          viewBox: "0 0 40 20",
          flipX: 1,
          // Even wider for left side, very thick
          path: "M40,0 L40,14 Q38,14 34,16 Q30,18 25,19 Q18,20 8,20 Q12,18 18,16 Q24,14 30,12 Q34,8 38,4 Q39,2 40,0 Z",
          shadowPath: "M40,1 Q38,7 34,12 Q30,16 25,18 Q18,19 8,20",
        };

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: side === "left" ? 7 : 0,
        right: side === "right" ? config.offset : undefined,
        left: side === "left" ? config.offset : undefined,
        width: config.width,
        height: config.height,
      }}
    >
      <Svg
        width={config.width}
        height={config.height}
        viewBox={config.viewBox}
        style={{ transform: [{ scaleX: config.flipX }] }}
      >
        {/* Shadow path */}
        <Path
          d={config.shadowPath}
          fill="none"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Main tail - very thick at connection point */}
        <Path d={config.path} fill={color} />
      </Svg>
    </View>
  );
};

// Responsive calculations
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const responsiveWidth = (percentage: number) =>
  screenWidth * (percentage / 100);
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

interface ChatMessageProps {
  message: {
    sender: "user" | "finny";
    text: string;
    id: string;
    type?: "text" | "action";
    actions?: Array<{
      label: string;
      action: string;
      style?: "primary" | "secondary";
    }>;
    goalOffer?: {
      item: string;
      amount: number | null;
      showButton: boolean;
    };
  };
  showSender?: boolean;
  onAction?: (action: string) => void;
  // For grouping logic
  prevSender?: "user" | "finny" | null;
  nextSender?: "user" | "finny" | null;
}

const BASE_RADIUS = 18;
const PILL_RADIUS = 22; // for one-liners
const GROUP_RADIUS = 14; // middle of a group

function getBubbleRadii({
  sender,
  isFirstInGroup,
  isLastInGroup,
  isSingleLine,
}: {
  sender: "user" | "finny";
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isSingleLine: boolean;
}) {
  const r = isSingleLine ? PILL_RADIUS : BASE_RADIUS;
  const mid = GROUP_RADIUS;
  const isUser = sender === "user";

  if (isFirstInGroup && isLastInGroup) {
    // Even radii all around - tail does the pointing
    return {
      borderTopLeftRadius: r,
      borderTopRightRadius: r,
      borderBottomLeftRadius: r,
      borderBottomRightRadius: r,
    };
  }

  if (isFirstInGroup) {
    return isUser
      ? {
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomLeftRadius: r,
          borderBottomRightRadius: mid,
        }
      : {
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomLeftRadius: mid,
          borderBottomRightRadius: r,
        };
  }

  if (isLastInGroup) {
    return isUser
      ? {
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomLeftRadius: r,
          borderBottomRightRadius: r,
        }
      : {
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomLeftRadius: r,
          borderBottomRightRadius: r,
        };
  }

  return {
    borderTopLeftRadius: mid,
    borderTopRightRadius: mid,
    borderBottomLeftRadius: mid,
    borderBottomRightRadius: mid,
  } as const;
}

export const ChatMessageComponent = ({
  message,
  showSender = true,
  onAction,
  prevSender,
  nextSender,
}: ChatMessageProps) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const [lineCount, setLineCount] = useState(1);

  useEffect(() => {
    // Enhanced entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.elastic(0.7),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        300,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );
  }, []);

  const isUser = message.sender === "user";
  const isFirstInGroup = prevSender !== message.sender;
  const isLastInGroup = nextSender !== message.sender;
  const isSingleLine = lineCount <= 1;

  const bubbleRadii = getBubbleRadii({
    sender: message.sender,
    isFirstInGroup,
    isLastInGroup,
    isSingleLine,
  });

  const onTextLayout = (e: any) => {
    // e.nativeEvent.lines is available on RN Text layout events
    const lines = (e?.nativeEvent?.lines as any[]) || [];
    setLineCount(lines.length > 0 ? lines.length : 1);
  };

  if (isUser) {
    const userGradient = ["#2A3A4A", "#1A2A3A"] as const;
    const userTailColor = pickTailColor([...userGradient], "right");

    return (
      <Animated.View
        style={[
          styles.messageContainer,
          styles.userMessageContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={userGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.userMessageBubble,
            bubbleRadii,
            { paddingBottom: responsivePadding(10) },
          ]}
        >
          <Text
            onTextLayout={onTextLayout}
            style={[styles.messageText, styles.userMessageText]}
          >
            {parseTextWithLinks(message.text, [
              styles.messageText,
              styles.userMessageText,
            ])}
          </Text>
        </LinearGradient>
        {/* Tail only if last in group */}
        {isLastInGroup && <BubbleTail side="right" color={userTailColor} />}
      </Animated.View>
    );
  }

  // Check for action type and buttons
  if (
    message.type === "action" &&
    message.actions &&
    message.actions.length > 0
  ) {
    const [clicked, setClicked] = useState(false);
    const finnyGradient = ["#1A3A5A", "#2E5A8A", "#4A90E2"] as const;
    const finnyTailColor = pickTailColor([...finnyGradient], "left");

    return (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
        }}
      >
        {showSender && (
          <Animated.View
            style={[
              styles.senderNameContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.senderName}>Finny</Text>
          </Animated.View>
        )}
        <View style={styles.finnyMessageRow}>
          <View style={styles.finnyMessageContainer}>
            <LinearGradient
              colors={finnyGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.finnyMessageBubble,
                bubbleRadii,
                { paddingBottom: responsivePadding(10) },
                !isFirstInGroup &&
                  !isLastInGroup &&
                  styles.finnyMessageBubbleGrouped,
                isLastInGroup && styles.finnyMessageBubbleLastInGroup,
              ]}
            >
              <Text style={[styles.messageText, styles.finnyMessageText]}>
                {message.text.split("\n").map((line, lineIdx) => (
                  <React.Fragment key={lineIdx}>
                    {lineIdx > 0 && <Text>{"\n"}</Text>}
                    <Text
                      onTextLayout={lineIdx === 0 ? onTextLayout : undefined}
                    >
                      {line.split(/(\*\*[^*]+\*\*)/).map((chunk, idx) => {
                        if (chunk.startsWith("**") && chunk.endsWith("**")) {
                          return (
                            <Text key={idx} style={styles.boldText}>
                              {parseTextWithLinks(
                                chunk.slice(2, -2),
                                styles.boldText
                              )}
                            </Text>
                          );
                        }
                        return parseTextWithLinks(chunk, [
                          styles.messageText,
                          styles.finnyMessageText,
                        ]);
                      })}
                    </Text>
                  </React.Fragment>
                ))}
              </Text>
            </LinearGradient>
            {/* Tail only if last in group */}
            {isLastInGroup && <BubbleTail side="left" color={finnyTailColor} />}
          </View>
        </View>
        {/* Action buttons below the bubble */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginLeft: 12,
            marginTop: 6,
            gap: responsivePadding(6),
            flexWrap: "wrap",
          }}
        >
          {message.actions.map((btn, idx) => {
            const [isPressed, setIsPressed] = useState(false);
            const pressAnim = useRef(new Animated.Value(1)).current;

            const handlePressIn = () => {
              setIsPressed(true);
              Animated.spring(pressAnim, {
                toValue: 0.95,
                useNativeDriver: true,
                tension: 300,
                friction: 10,
              }).start();
            };

            const handlePressOut = () => {
              setIsPressed(false);
              Animated.spring(pressAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 300,
                friction: 10,
              }).start();
            };

            return (
              <Animated.View
                key={btn.action}
                style={{
                  opacity: fadeAnim,
                  transform: [{ scale: pressAnim }],
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    if (!clicked && onAction) {
                      setClicked(true);
                      onAction(btn.action);
                    }
                  }}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  activeOpacity={0.7}
                  style={{
                    marginRight: 6,
                    marginBottom: 4,
                  }}
                >
                  <LinearGradient
                    colors={
                      btn.style === "primary"
                        ? ["#4A90E2", "#5BA3F5", "#6BB6FF"]
                        : [
                            "rgba(255, 255, 255, 0.15)",
                            "rgba(255, 255, 255, 0.08)",
                          ]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      paddingHorizontal: responsivePadding(14),
                      paddingVertical: responsivePadding(10),
                      borderRadius: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: btn.style === "primary" ? "#4A90E2" : "#000",
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: btn.style === "primary" ? 0.4 : 0.1,
                      shadowRadius: 6,
                      elevation: 4,
                      opacity: clicked ? 0.5 : 1,
                      borderWidth: 0,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: responsiveFontSize(12),
                        fontWeight: "600",
                        color: btn.style === "primary" ? "#FFFFFF" : "#E0E0E0",
                        letterSpacing: 0.3,
                        textAlign: "center",
                      }}
                    >
                      {btn.label}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>
    );
  }

  // Display message as single string (no splitting)
  const messageText = message.text;
  const finnyGradient = ["#1A3A5A", "#2E5A8A", "#4A90E2"] as const;
  const finnyTailColor = pickTailColor([...finnyGradient], "left");

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
      }}
    >
      {showSender && messageText && (
        <Animated.View
          style={[
            styles.senderNameContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.senderName}>Finny</Text>
        </Animated.View>
      )}
      {messageText && (
        <Animated.View style={styles.finnyMessageRow}>
          <View style={styles.finnyMessageContainer}>
            <LinearGradient
              colors={finnyGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.finnyMessageBubble,
                bubbleRadii,
                { paddingBottom: responsivePadding(10) },
                !isFirstInGroup &&
                  !isLastInGroup &&
                  styles.finnyMessageBubbleGrouped,
                isLastInGroup && styles.finnyMessageBubbleLastInGroup,
              ]}
            >
              <Text style={[styles.messageText, styles.finnyMessageText]}>
                {messageText.split("\n").map((line, lineIdx) => (
                  <React.Fragment key={lineIdx}>
                    {lineIdx > 0 && <Text>{"\n"}</Text>}
                    <Text
                      onTextLayout={lineIdx === 0 ? onTextLayout : undefined}
                    >
                      {line.split(/(\*\*[^*]+\*\*)/).map((chunk, idx) => {
                        if (chunk.startsWith("**") && chunk.endsWith("**")) {
                          return (
                            <Text key={idx} style={styles.boldText}>
                              {parseTextWithLinks(
                                chunk.slice(2, -2),
                                styles.boldText
                              )}
                            </Text>
                          );
                        }
                        return parseTextWithLinks(chunk, [
                          styles.messageText,
                          styles.finnyMessageText,
                        ]);
                      })}
                    </Text>
                  </React.Fragment>
                ))}
              </Text>
            </LinearGradient>
            {/* Tail only if last in group */}
            {isLastInGroup && <BubbleTail side="left" color={finnyTailColor} />}
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    maxWidth: isSmallScreen ? "95%" : "90%",
    marginVertical: responsivePadding(1),
    overflow: "visible",
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    marginRight: responsivePadding(16),
    marginLeft: responsiveWidth(15),
    marginTop: responsivePadding(8),
    overflow: "visible",
  },
  userMessageBubble: {
    borderRadius: 18,
    paddingHorizontal: responsivePadding(12),
    paddingVertical: responsivePadding(8),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    position: "relative",
    overflow: "visible",
  },
  finnyMessageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: responsivePadding(1),
    overflow: "visible",
  },
  finnyMessageContainer: {
    flex: 1,
    marginLeft: responsivePadding(12),
    marginRight: responsiveWidth(15),
    overflow: "visible",
  },
  finnyMessageBubble: {
    paddingHorizontal: responsivePadding(12),
    paddingVertical: responsivePadding(8),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: responsivePadding(2),
    borderRadius: 18,
    position: "relative",
    overflow: "visible",
  },
  finnyMessageBubbleGrouped: {
    marginBottom: responsivePadding(8),
  },
  finnyMessageBubbleLastInGroup: {
    marginBottom: responsivePadding(13),
  },
  messageText: {
    fontSize: responsiveFontSize(14),
    lineHeight: responsiveFontSize(18),
    letterSpacing: 0,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
  userMessageText: {
    color: "#FFFFFF",
    fontWeight: "400",
  },
  finnyMessageText: {
    color: "#FFFFFF",
    fontWeight: "400",
  },
  boldText: {
    fontWeight: "600",
    color: "#FFFFFF",
  },
  linkText: {
    textDecorationLine: "underline",
    color: "#87CEEB", // Light blue color for links
    fontWeight: "500",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(135, 206, 235, 0.3)",
  },
  senderNameContainer: {
    marginLeft: responsivePadding(16),
    marginBottom: responsivePadding(2),
  },
  senderName: {
    fontSize: responsiveFontSize(13),
    color: "#8E8E93",
    fontWeight: "500",
    letterSpacing: -0.1,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
});

export default ChatMessageComponent;

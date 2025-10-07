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
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

// Enable LayoutAnimation for Android
if (Platform.OS === "android") {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

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
    type?: "text" | "action" | "expandable";
    actions?: Array<{
      label: string;
      action: string;
      style?: "primary" | "secondary";
    }>;
    structuredData?: {
      summary: string;
      data: any;
      dataType: "table" | "list" | "chart";
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
    return isUser
      ? {
          borderTopLeftRadius: r,
          borderTopRightRadius: 3, // Sharp edge for user messages
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
          borderTopRightRadius: 3, // Sharp edge for user messages
          borderBottomLeftRadius: r,
          borderBottomRightRadius: r,
        }
      : {
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomLeftRadius: r,
          borderBottomRightRadius: mid,
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
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

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

  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);

    Animated.timing(expandAnim, {
      toValue: newExpanded ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  const renderTable = (data: any) => {
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    // Normalize into headers + rows (2-column only). We still tolerate >2 cols by falling back to horizontal scroll.
    let headers: string[] = [];
    let rows: any[][] = [];

    const isObjectArray =
      typeof data[0] === "object" &&
      data[0] !== null &&
      !Array.isArray(data[0]);

    if (isObjectArray) {
      headers = Object.keys(data[0]);
      rows = data.map((row: any) => headers.map((h) => row[h]));
    } else {
      // array-of-arrays format assumed: [headerRow, ...rows]
      headers = (data[0] || []).map((h: any) => String(h));
      rows = data.slice(1);
    }

    // If not exactly 2 columns, keep your old behavior (horizontal scroll), but that "won't be our case".
    if (headers.length !== 2) {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tableContainer}
        >
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              {headers.map((header, idx) => (
                <View
                  key={idx}
                  style={[styles.tableHeaderCell, { minWidth: 120 }]}
                >
                  <Text style={styles.tableHeaderText}>
                    {header.replace(/_/g, " ").toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
            {rows.map((row, rIdx) => (
              <View key={rIdx} style={styles.tableRow}>
                {row.map((cell: any, cIdx: number) => (
                  <View
                    key={cIdx}
                    style={[styles.tableCell, { minWidth: 120 }]}
                  >
                    <Text style={styles.tableCellText}>
                      {renderBoldText(
                        typeof cell === "number"
                          ? cell.toLocaleString()
                          : String(cell ?? "")
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }

    // Two-column path (the default case we care about).
    const [h1, h2] = headers;

    // Estimate content lengths to bias the split, then clamp so layout stays balanced.
    const len = (v: any) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === "number") return v.toLocaleString().length;
      return String(v).length;
    };

    const leftMax = Math.max(h1.length, ...rows.map((row) => len(row[0])));
    const rightMax = Math.max(h2.length, ...rows.map((row) => len(row[1])));

    // Convert to ratio, bias toward left when it's longer.
    const rawLeftRatio =
      leftMax + rightMax === 0 ? 0.6 : leftMax / (leftMax + rightMax);
    // Clamp for nice, stable layout.
    const leftRatio = clamp(rawLeftRatio, 0.52, 0.68);
    const rightRatio = 1 - leftRatio;

    return (
      <View style={styles.tableContainer}>
        <View style={[styles.table, { width: "100%" }]}>
          {/* Header */}
          <View style={styles.tableHeaderRow}>
            <View
              style={[
                styles.tableHeaderCell,
                { width: `${leftRatio * 100}%`, alignItems: "flex-start" },
              ]}
            >
              <Text
                style={[styles.tableHeaderText, styles.tableHeaderTextLeft]}
              >
                {h1.replace(/_/g, " ").toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.tableHeaderCell,
                {
                  width: `${rightRatio * 100}%`,
                  alignItems: "flex-end",
                  borderRightWidth: 0,
                },
              ]}
            >
              <Text
                style={[styles.tableHeaderText, styles.tableHeaderTextRight]}
              >
                {h2.replace(/_/g, " ").toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Rows */}
          {rows.map((row, rowIndex) => {
            const c0 =
              typeof row[0] === "number"
                ? row[0].toLocaleString()
                : String(row[0] ?? "");
            const c1 =
              typeof row[1] === "number"
                ? row[1].toLocaleString()
                : String(row[1] ?? "");
            return (
              <View key={rowIndex} style={styles.tableRow}>
                <View
                  style={[
                    styles.tableCell,
                    { width: `${leftRatio * 100}%`, alignItems: "flex-start" },
                  ]}
                >
                  <Text
                    style={[styles.tableCellText, styles.tableCellTextLeft]}
                  >
                    {renderBoldText(c0)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.tableCell,
                    {
                      width: `${rightRatio * 100}%`,
                      alignItems: "flex-end",
                      borderRightWidth: 0,
                    },
                  ]}
                >
                  <Text
                    style={[styles.tableCellText, styles.tableCellTextRight]}
                  >
                    {renderBoldText(c1)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderBoldText = (text: string) => {
    // Split text by **bold** patterns and render accordingly
    const parts = text.split(/(\*\*[^*]+\*\*)/);

    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <Text key={index} style={styles.boldTableText}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      return part;
    });
  };

  const renderStructuredData = () => {
    if (!message.structuredData) return null;

    const { dataType, data } = message.structuredData;

    switch (dataType) {
      case "table":
        return renderTable(data);
      case "list":
        return (
          <View style={styles.listContainer}>
            {Array.isArray(data) &&
              data.map((item: any, index: number) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.listItemText}>
                    {typeof item === "object"
                      ? JSON.stringify(item)
                      : String(item)}
                  </Text>
                </View>
              ))}
          </View>
        );
      default:
        return (
          <View style={styles.dataContainer}>
            <Text style={styles.dataText}>{JSON.stringify(data, null, 2)}</Text>
          </View>
        );
    }
  };

  if (isUser) {
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
          colors={["#2A3A4A", "#1A2A3A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.userMessageBubble, bubbleRadii]}
        >
          <Text
            onTextLayout={onTextLayout}
            style={[styles.messageText, styles.userMessageText]}
          >
            {message.text}
          </Text>
          {isLastInGroup && <View style={styles.userMessageTail} />}
        </LinearGradient>
      </Animated.View>
    );
  }

  if (
    message.type === "action" &&
    message.actions &&
    message.actions.length > 0
  ) {
    const [clicked, setClicked] = useState(false);
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
              colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.finnyMessageBubble, bubbleRadii]}
            >
              <Text
                onTextLayout={onTextLayout}
                style={[styles.messageText, styles.finnyMessageText]}
              >
                {message.text}
              </Text>
            </LinearGradient>
          </View>
        </View>
        {/* Action buttons below the bubble */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginLeft: 12,
            marginTop: 8,
            gap: responsivePadding(8),
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
              <View
                key={btn.action}
                style={{
                  flex: 1,
                  maxWidth: isSmallScreen ? "45%" : "40%",
                }}
              >
                <Animated.View
                  style={{
                    opacity: fadeAnim,
                    width: "100%",
                    transform: [{ scale: pressAnim }],
                  }}
                >
                  <LinearGradient
                    colors={
                      btn.style === "primary"
                        ? [
                            "rgba(74, 144, 226, 0.95)",
                            "rgba(74, 144, 226, 0.8)",
                            "rgba(74, 144, 226, 0.9)",
                          ]
                        : [
                            "rgba(255, 255, 255, 0.25)",
                            "rgba(255, 255, 255, 0.12)",
                            "rgba(255, 255, 255, 0.18)",
                          ]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      paddingHorizontal: responsivePadding(16),
                      paddingVertical: responsivePadding(12),
                      borderRadius: 14,
                      marginRight: responsivePadding(8),
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: btn.style === "primary" ? "#4A90E2" : "#000",
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: btn.style === "primary" ? 0.35 : 0.15,
                      shadowRadius: 12,
                      elevation: 12,
                      opacity: clicked ? 0.6 : 1,
                      borderWidth: 1.5,
                      borderColor:
                        btn.style === "primary"
                          ? "rgba(74, 144, 226, 0.7)"
                          : "rgba(255, 59, 48, 0.5)",
                      width: "100%",
                      alignSelf: "flex-start",
                      minHeight: 44,
                    }}
                  >
                    <Text
                      onPress={() => {
                        if (!clicked && onAction) {
                          setClicked(true);
                          onAction(btn.action);
                        }
                      }}
                      onPressIn={handlePressIn}
                      onPressOut={handlePressOut}
                      style={{
                        fontSize: responsiveFontSize(14),
                        fontWeight: "700",
                        color: btn.style === "primary" ? "#FFFFFF" : "#FF3B30",
                        letterSpacing: 0.5,
                        textAlign: "center",
                        flex: 1,
                        textShadowColor:
                          btn.style === "primary"
                            ? "rgba(0, 0, 0, 0.3)"
                            : "rgba(0, 0, 0, 0.1)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      {btn.label}
                    </Text>
                  </LinearGradient>
                </Animated.View>
              </View>
            );
          })}
        </View>
      </Animated.View>
    );
  }

  // Handle expandable messages
  if (message.type === "expandable" && message.structuredData) {
    const messageText = message.structuredData.summary || message.text;

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
        <Animated.View style={styles.finnyMessageRow}>
          <View style={styles.finnyMessageContainer}>
            <LinearGradient
              colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.finnyMessageBubble, bubbleRadii]}
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
                              {chunk.slice(2, -2)}
                            </Text>
                          );
                        }
                        return chunk;
                      })}
                    </Text>
                  </React.Fragment>
                ))}
              </Text>

              {/* View Details Button */}
              <TouchableOpacity
                style={styles.viewDetailsButton}
                onPress={toggleExpanded}
                activeOpacity={0.7}
              >
                <Text style={styles.viewDetailsText}>View Details</Text>
                <Animated.View
                  style={{
                    transform: [
                      {
                        rotate: expandAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0deg", "180deg"],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
                </Animated.View>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Expanded Content */}
        <Animated.View
          style={[
            styles.expandedContent,
            {
              height: expandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 300], // Adjust based on content
              }),
              opacity: expandAnim,
            },
          ]}
        >
          <View style={styles.expandedContentInner}>
            {renderStructuredData()}
          </View>
        </Animated.View>
      </Animated.View>
    );
  }

  // Display message as single string (no splitting)
  const messageText = message.text;

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
              colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.finnyMessageBubble, bubbleRadii]}
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
                              {chunk.slice(2, -2)}
                            </Text>
                          );
                        }
                        return chunk;
                      })}
                    </Text>
                  </React.Fragment>
                ))}
              </Text>
            </LinearGradient>
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
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    marginRight: responsivePadding(16),
    marginLeft: responsiveWidth(15),
    marginTop: responsivePadding(8),
  },
  userMessageBubble: {
    borderRadius: 12,
    borderTopRightRadius: 3,
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
  },
  userMessageTail: {
    position: "absolute",
    right: -6,
    bottom: 8,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderLeftColor: "#1A2A3A",
    borderTopWidth: 6,
    borderTopColor: "transparent",
    borderBottomWidth: 6,
    borderBottomColor: "transparent",
  },
  finnyMessageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: responsivePadding(1),
  },
  finnyMessageContainer: {
    flex: 1,
    marginLeft: responsivePadding(12),
    marginRight: responsiveWidth(15),
  },
  finnyMessageBubble: {
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
    marginBottom: responsivePadding(2),
    borderRadius: 12,
    borderBottomLeftRadius: 1,
  },
  messageText: {
    fontSize: responsiveFontSize(14),
    lineHeight: responsiveFontSize(18),
    letterSpacing: -0.1,
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
  viewDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: responsivePadding(8),
    paddingTop: responsivePadding(8),
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
  },
  viewDetailsText: {
    fontSize: responsiveFontSize(13),
    color: "#FFFFFF",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  expandedContent: {
    marginLeft: responsivePadding(12),
    marginRight: responsiveWidth(15),
    marginTop: responsivePadding(4),
    overflow: "hidden",
  },
  expandedContentInner: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: responsivePadding(12),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  tableContainer: {
    width: "100%",
  },
  table: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    overflow: "hidden",
    width: "100%",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "rgba(74, 144, 226, 0.28)",
    width: "100%",
  },
  tableHeaderCell: {
    justifyContent: "center",
    paddingVertical: responsivePadding(8),
    paddingHorizontal: responsivePadding(10),
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.08)",
  },
  tableHeaderText: {
    fontSize: responsiveFontSize(12),
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    // wrapping
    flexShrink: 1,
    flexWrap: "wrap",
  },
  tableHeaderTextLeft: {
    textAlign: "left",
  },
  tableHeaderTextRight: {
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    minHeight: 44,
  },
  tableCell: {
    paddingVertical: responsivePadding(6),
    paddingHorizontal: responsivePadding(10),
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
  },
  tableCellText: {
    fontSize: responsiveFontSize(13),
    color: "#FFFFFF",
    lineHeight: responsiveFontSize(18),
    // make wrapping reliable
    flexShrink: 1,
    flexWrap: "wrap",
  },
  tableCellTextLeft: {
    textAlign: "left",
  },
  tableCellTextRight: {
    textAlign: "right",
  },
  boldTableText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  listContainer: {
    maxHeight: 200,
  },
  listItem: {
    padding: responsivePadding(8),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  listItemText: {
    fontSize: responsiveFontSize(12),
    color: "#FFFFFF",
  },
  dataContainer: {
    maxHeight: 200,
  },
  dataText: {
    fontSize: responsiveFontSize(11),
    color: "#FFFFFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

export default ChatMessageComponent;

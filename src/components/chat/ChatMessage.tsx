import React, { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const { width: screenWidth } = Dimensions.get("window");
const isSmallScreen = screenWidth < 375;
const isLargeScreen = screenWidth >= 414;

const responsiveWidth = (percentage: number) =>
  screenWidth * (percentage / 100);
const responsiveFontSize = (baseSize: number) => {
  if (isSmallScreen) return baseSize * 0.92;
  if (isLargeScreen) return baseSize * 1.06;
  return baseSize;
};
const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.85;
  if (isLargeScreen) return basePadding * 1.08;
  return basePadding;
};

const openURL = async (url: string) => {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      controlsColor: "#4A90E2",
      showTitle: true,
    });
  } catch (_error) {
    await Linking.openURL(url);
  }
};

const extractDomainName = (url: string): string => {
  try {
    const domain = url.replace(/^https?:\/\//, "").split("/")[0];
    const cleanDomain = domain.replace(
      /^(www\.|api\.|app\.|blog\.|mail\.|mobile\.)/,
      "",
    );
    const parts = cleanDomain.split(".");
    const mainDomain = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
  } catch (_error) {
    return "Link";
  }
};

const parseTextWithLinks = (text: string, textStyle: any) => {
  URL_REGEX.lastIndex = 0;
  if (!URL_REGEX.test(text)) {
    return text;
  }

  URL_REGEX.lastIndex = 0;
  const parts = text.split(URL_REGEX);
  let linkCounter = 0;
  const linkCount = (text.match(URL_REGEX) || []).length;

  return parts.map((part, index) => {
    URL_REGEX.lastIndex = 0;
    if (URL_REGEX.test(part)) {
      linkCounter += 1;
      const label =
        linkCount > 1
          ? `${extractDomainName(part)} (${linkCounter})`
          : extractDomainName(part);

      return (
        <Text
          key={`${part}-${index}`}
          style={[textStyle, styles.linkText]}
          onPress={() => openURL(part)}
        >
          {label}
          <Text style={styles.linkArrow}> ↗</Text>
        </Text>
      );
    }

    return part;
  });
};

const renderFormattedParagraphs = (
  text: string,
  baseTextStyle: object,
  paragraphStyle?: object,
) =>
  text.split("\n").map((line, lineIndex) => (
    <Text
      key={`line-${lineIndex}`}
      style={[baseTextStyle, lineIndex > 0 && styles.paragraphSpacing, paragraphStyle]}
    >
      {line.split(/(\*\*[^*]+\*\*)/).map((chunk, chunkIndex) => {
        if (chunk.startsWith("**") && chunk.endsWith("**")) {
          return (
            <Text key={`${lineIndex}-${chunkIndex}`} style={styles.boldText}>
              {parseTextWithLinks(chunk.slice(2, -2), [baseTextStyle, styles.boldText])}
            </Text>
          );
        }

        return parseTextWithLinks(chunk, baseTextStyle);
      })}
    </Text>
  ));

type MessageAction = {
  label: string;
  action: string;
  style?: "primary" | "secondary";
};

interface ChatMessageProps {
  message: {
    sender: "user" | "finny";
    text: string;
    id: string;
    type?: "text" | "action";
    actions?: MessageAction[];
    stockCandidate?: {
      ticker: string;
    };
    goalOffer?: {
      item: string;
      amount: number | null;
      showButton: boolean;
    };
    hideFeedback?: boolean;
    hideActions?: boolean;
  };
  showSender?: boolean;
  onAction?: (action: string, message?: ChatMessageProps["message"]) => void;
  onThumbUp?: (messageId: string) => void;
  onThumbDown?: (messageId: string) => void;
  prevSender?: "user" | "finny" | null;
  nextSender?: "user" | "finny" | null;
}

const ActionButton = ({
  button,
  disabled,
  onPress,
}: {
  button: MessageAction;
  disabled: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={disabled ? 1 : 0.75}
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.actionButton,
      button.style === "primary"
        ? styles.actionButtonPrimary
        : styles.actionButtonSecondary,
      disabled && styles.actionButtonDisabled,
    ]}
  >
    <Text
      style={[
        styles.actionButtonText,
        button.style === "primary"
          ? styles.actionButtonTextPrimary
          : styles.actionButtonTextSecondary,
      ]}
    >
      {button.label}
    </Text>
  </TouchableOpacity>
);

export const ChatMessageComponent = memo(
  ({
    message,
    onAction,
    onThumbUp,
    onThumbDown,
    nextSender,
  }: ChatMessageProps) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateAnim = useRef(new Animated.Value(8)).current;
    const [clicked, setClicked] = useState(false);

    useEffect(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }, [fadeAnim, translateAnim]);

    const messageText =
      typeof message.text === "string" ? message.text.trim() : String(message.text || "").trim();

    if (!messageText) {
      return null;
    }

    const isUser = message.sender === "user";
    const isLastInGroup = nextSender !== message.sender;
    const showFeedback =
      !isUser && isLastInGroup && message.id !== "welcome" && !message.hideFeedback;
    const hasActions =
      !isUser && !!message.actions?.length && !message.hideActions;
    const showsDataSurface = hasActions || !!message.stockCandidate?.ticker;

    if (isUser) {
      return (
        <Animated.View
          style={[
            styles.userMessageContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: translateAnim }],
            },
          ]}
        >
          <View style={styles.userMessageBubble}>
            <Text style={styles.userMessageText}>
              {parseTextWithLinks(messageText, styles.userMessageText)}
            </Text>
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View
        style={[
          styles.assistantMessageContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: translateAnim }],
          },
        ]}
      >
        <View style={styles.assistantContentColumn}>
          <View style={styles.assistantLeadRow}>
            <View style={styles.assistantLeadMark} />
          </View>

          <View style={showsDataSurface ? styles.assistantSurface : undefined}>
            {renderFormattedParagraphs(
              messageText,
              styles.assistantMessageText,
            )}

            {message.stockCandidate?.ticker && (
              <View style={styles.tickerBadge}>
                <Text style={styles.tickerBadgeLabel}>Ticker</Text>
                <Text style={styles.tickerBadgeValue}>
                  {message.stockCandidate.ticker}
                </Text>
              </View>
            )}

            {hasActions && (
              <View style={styles.actionsRow}>
                {message.actions?.map((button) => (
                  <ActionButton
                    key={button.action}
                    button={button}
                    disabled={clicked}
                    onPress={() => {
                      if (clicked || !onAction) return;
                      setClicked(true);
                      onAction(button.action, message);
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          {showFeedback && (
            <View style={styles.feedbackRow}>
              <TouchableOpacity
                style={styles.feedbackButton}
                onPress={() => onThumbUp?.(message.id)}
                activeOpacity={0.75}
              >
                <FontAwesome name="thumbs-o-up" size={13} color="#AAB4C3" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.feedbackButton}
                onPress={() => onThumbDown?.(message.id)}
                activeOpacity={0.75}
              >
                <FontAwesome name="thumbs-o-down" size={13} color="#AAB4C3" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  userMessageContainer: {
    alignSelf: "flex-end",
    maxWidth: isSmallScreen ? "88%" : "82%",
    marginTop: responsivePadding(8),
    marginRight: responsivePadding(12),
    marginLeft: responsiveWidth(20),
  },
  userMessageBubble: {
    borderRadius: 18,
    backgroundColor: "#213349",
    paddingHorizontal: responsivePadding(13),
    paddingVertical: responsivePadding(9),
    borderWidth: 1,
    borderColor: "rgba(142, 184, 255, 0.16)",
  },
  userMessageText: {
    color: "#F7FAFF",
    fontSize: responsiveFontSize(14),
    lineHeight: responsiveFontSize(19),
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
  assistantMessageContainer: {
    alignSelf: "stretch",
    paddingTop: responsivePadding(8),
    paddingBottom: responsivePadding(2),
  },
  assistantContentColumn: {
    marginLeft: responsivePadding(14),
    marginRight: responsiveWidth(10),
  },
  assistantLeadRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  assistantLeadMark: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(94, 155, 255, 0.72)",
  },
  assistantSurface: {
    paddingHorizontal: responsivePadding(12),
    paddingVertical: responsivePadding(10),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
  },
  assistantMessageText: {
    color: "#EDF2FA",
    fontSize: responsiveFontSize(15),
    lineHeight: responsiveFontSize(21),
    fontWeight: "400",
    letterSpacing: -0.1,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
  paragraphSpacing: {
    marginTop: 8,
  },
  boldText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  linkText: {
    color: "#9FC1FF",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  linkArrow: {
    color: "#9FC1FF",
    fontWeight: "600",
  },
  tickerBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(94, 155, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(94, 155, 255, 0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tickerBadgeLabel: {
    color: "#A7B6CA",
    fontSize: responsiveFontSize(11),
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tickerBadgeValue: {
    color: "#F7FAFF",
    fontSize: responsiveFontSize(12),
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: responsivePadding(8),
    marginTop: 12,
  },
  actionButton: {
    minHeight: 34,
    paddingHorizontal: responsivePadding(12),
    paddingVertical: responsivePadding(8),
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtonPrimary: {
    backgroundColor: "#4F8EF7",
  },
  actionButtonSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    fontSize: responsiveFontSize(12),
    lineHeight: responsiveFontSize(15),
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  actionButtonTextPrimary: {
    color: "#FFFFFF",
  },
  actionButtonTextSecondary: {
    color: "#E2E8F2",
  },
  feedbackRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  feedbackButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
});

export default ChatMessageComponent;

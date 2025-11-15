import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { AntDesign } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

interface FeedbackNotificationProps {
  onClose: () => void;
}

export const FeedbackNotification: React.FC<FeedbackNotificationProps> = ({
  onClose,
}) => {
  const notificationBottom = 100;
  const translateY = new Animated.Value(notificationBottom);
  const opacity = new Animated.Value(0);

  useEffect(() => {
    // Slide in from bottom
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto close after 2 seconds
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: notificationBottom,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onClose());
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Only show the new style for iOS
  if (Platform.OS !== "ios") return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: notificationBottom,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
        <View style={styles.content}>
          <AntDesign
            name="check-circle"
            size={20}
            color="#32D74B"
            style={styles.icon}
          />
          <Text style={styles.message}>Thanks for your feedback!</Text>
        </View>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: "center",
  },
  blurContainer: {
    borderRadius: 50,
    marginHorizontal: 40,
    minWidth: width * 0.6,
    maxWidth: width * 0.7,
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
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  icon: {
    marginRight: 12,
  },
  message: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default FeedbackNotification;

import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacityProps,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

interface AuthButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "text";
  icon?: keyof typeof Ionicons.glyphMap;
}

const AuthButton: React.FC<AuthButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  loading = false,
  icon,
}) => {
  if (variant === "text") {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={styles.textButton}
        disabled={loading}
      >
        <View style={styles.buttonContent}>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color="#4A90E2"
              style={styles.icon}
            />
          )}
          <Text style={styles.textButtonText}>{title}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, variant === "secondary" && styles.secondaryButton]}
      disabled={loading}
    >
      {variant === "primary" ? (
        <LinearGradient
          colors={["#4A90E2", "#5DA0F2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientContent}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.buttonContent}>
              {icon && (
                <Ionicons
                  name={icon}
                  size={24}
                  color="#fff"
                  style={styles.icon}
                />
              )}
              <Text style={styles.buttonText}>{title}</Text>
            </View>
          )}
        </LinearGradient>
      ) : (
        <>
          {loading ? (
            <ActivityIndicator color="#4A90E2" />
          ) : (
            <View style={styles.buttonContent}>
              {icon && (
                <Ionicons
                  name={icon}
                  size={24}
                  color="#4A90E2"
                  style={styles.icon}
                />
              )}
              <Text style={styles.secondaryButtonText}>{title}</Text>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

export default AuthButton;

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    overflow: "hidden",
  },
  gradientContent: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#4A90E2",
    padding: 16,
  },
  textButton: {
    backgroundColor: "transparent",
    paddingVertical: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: "#4A90E2",
    fontSize: 16,
    fontWeight: "600",
  },
  textButtonText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "500",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    marginRight: 8,
  },
});

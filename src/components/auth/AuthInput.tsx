import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AuthInputProps extends TextInputProps {
  label: string;
  error?: boolean;
  containerStyle?: ViewStyle;
}

interface PasswordInputProps extends AuthInputProps {
  showPassword: boolean;
  onTogglePassword: () => void;
}

function AuthInput({
  label,
  error,
  style,
  containerStyle,
  ...props
}: AuthInputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor="#666"
        {...props}
      />
    </View>
  );
}

function PasswordInput({
  label,
  error,
  showPassword,
  onTogglePassword,
  style,
  containerStyle,
  ...props
}: PasswordInputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordContainer}>
        <TextInput
          style={[styles.passwordInput, style]}
          placeholderTextColor="#666"
          secureTextEntry={!showPassword}
          {...props}
        />
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={onTogglePassword}
        >
          <Ionicons
            name={showPassword ? "eye" : "eye-off"}
            size={24}
            color="#666"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

AuthInput.Password = PasswordInput;

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  label: {
    color: "#fff",
    marginBottom: 6,
    fontSize: 14,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    padding: 16,
    borderRadius: 6,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  passwordInput: {
    flex: 1,
    color: "#fff",
    padding: 16,
    fontSize: 16,
  },
  passwordToggle: {
    padding: 10,
  },
});

export default AuthInput;

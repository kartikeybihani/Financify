import React from "react";
import {
  TextInput,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AuthInputProps extends TextInputProps {
  label: string;
  error?: boolean;
  containerStyle?: any;
}

interface PasswordInputProps extends AuthInputProps {
  showPassword: boolean;
  onTogglePassword: () => void;
}

const AuthInputBase = ({
  label,
  error,
  containerStyle,
  ...props
}: AuthInputProps) => {
  return (
    <View style={containerStyle}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholderTextColor="rgba(255, 255, 255, 0.4)"
        {...props}
      />
    </View>
  );
};

const PasswordInputComponent = ({
  label,
  error,
  showPassword,
  onTogglePassword,
  containerStyle,
  ...props
}: PasswordInputProps) => {
  return (
    <View style={containerStyle}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.passwordContainer, error && styles.inputError]}>
        <TextInput
          style={styles.passwordInput}
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          secureTextEntry={!showPassword}
          {...props}
        />
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={onTogglePassword}
        >
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={24}
            color="rgba(255, 255, 255, 0.4)"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const AuthInput = Object.assign(AuthInputBase, {
  Password: PasswordInputComponent,
});

export default AuthInput;

const styles = StyleSheet.create({
  label: {
    color: "#fff",
    marginBottom: 4,
    fontSize: 14,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    padding: 16,
    borderRadius: 6,
    marginBottom: 25,
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
    marginBottom: 15,
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
  inputError: {
    borderColor: "#ff4444",
  },
});

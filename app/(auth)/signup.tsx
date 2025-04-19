import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase/supabase";
import { useRouter } from "expo-router";

const MINIMUM_AGE = 18;
const MAXIMUM_AGE = 100;

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({
    email: "",
    password: "",
    age: "",
    phone: "",
  });

  const formatPhoneNumber = (text: string) => {
    const numbers = text.replace(/[^\d]/g, "");
    if (numbers.length <= 3) {
      return numbers;
    } else if (numbers.length <= 6) {
      return `(${numbers.slice(0, 3)})-${numbers.slice(3)}`;
    } else {
      return `(${numbers.slice(0, 3)})-${numbers.slice(3, 6)}-${numbers.slice(
        6,
        10
      )}`;
    }
  };

  const handleAgeChange = (text: string) => {
    // Only allow numbers
    const numbersOnly = text.replace(/[^0-9]/g, "");
    setAge(numbersOnly);
  };

  const validateForm = () => {
    let isValid = true;
    const newErrors = {
      email: "",
      password: "",
      age: "",
      phone: "",
    };

    // Email validation
    if (!email) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Please enter a valid email";
      isValid = false;
    }

    // Password validation
    if (!password) {
      newErrors.password = "Password is required";
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
      isValid = false;
    }

    // Age validation
    if (!age) {
      newErrors.age = "Age is required";
      isValid = false;
    } else {
      const ageNum = parseInt(age);
      if (isNaN(ageNum) || ageNum < 18) {
        newErrors.age = "You must be at least 18 years old";
        isValid = false;
      } else if (ageNum > 100) {
        newErrors.age = "Please enter a valid age";
        isValid = false;
      }
    }

    // Phone validation
    const phoneNumbers = phone.replace(/[^\d]/g, "");
    if (!phone) {
      newErrors.phone = "Phone number is required";
      isValid = false;
    } else if (phoneNumbers.length !== 10) {
      newErrors.phone = "Please enter a valid 10-digit phone number";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          age,
          phone_number: phone.replace(/[^\d]/g, ""),
        },
      },
    });

    setLoading(false);

    if (error) {
      Alert.alert("Signup Error", error.message);
    } else {
      Alert.alert("Success", "Account created successfully!", [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)"),
        },
      ]);
    }
  };

  const handlePhoneChange = (text: string) => {
    const formattedNumber = formatPhoneNumber(text);
    if (formattedNumber.replace(/[^\d]/g, "").length <= 10) {
      setPhone(formattedNumber);
    }
  };

  // Generate age options
  const ageOptions = Array.from(
    { length: MAXIMUM_AGE - MINIMUM_AGE + 1 },
    (_, i) => MINIMUM_AGE + i
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.contentContainer}>
          <Image
            source={require("../assets/main1.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join us today!</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="Enter your email"
              placeholderTextColor="#666"
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {errors.email ? (
              <Text style={styles.errorText}>{errors.email}</Text>
            ) : null}

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[
                  styles.passwordInput,
                  errors.password && styles.inputError,
                ]}
                placeholder="Create a password"
                placeholderTextColor="#666"
                secureTextEntry={!showPassword}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
            {errors.password ? (
              <Text style={styles.errorText}>{errors.password}</Text>
            ) : null}

            <View style={styles.rowContainer}>
              <View style={styles.ageColumn}>
                <Text style={styles.label}>Age</Text>
                <TextInput
                  style={[styles.ageInput, errors.age && styles.inputError]}
                  placeholder="24"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  onChangeText={handleAgeChange}
                  value={age}
                  maxLength={3}
                />
                {errors.age ? (
                  <Text style={styles.errorText}>{errors.age}</Text>
                ) : null}
              </View>

              <View style={styles.phoneColumn}>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={[styles.input, errors.phone && styles.inputError]}
                  placeholder="(123)-456-7890"
                  placeholderTextColor="#666"
                  keyboardType="phone-pad"
                  onChangeText={handlePhoneChange}
                  value={phone}
                />
                {errors.phone ? (
                  <Text style={styles.errorText}>{errors.phone}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("../login")}
            style={styles.linkContainer}
          >
            <Text style={styles.linkText}>
              Already have an account?{" "}
              <Text style={styles.linkTextBold}>Login</Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.termsText}>
            By creating an account, you agree to our{" "}
            <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scrollContainer: {
    flexGrow: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 24,
  },
  rowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    gap: 5,
  },
  ageColumn: {
    width: "20%",
  },
  phoneColumn: {
    width: "75%",
  },
  label: {
    color: "#fff",
    marginBottom: 6,
    fontSize: 14,
  },
  input: {
    backgroundColor: "#1f1f1f",
    color: "#fff",
    padding: 16,
    borderRadius: 6,
    marginBottom: 20,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f1f1f",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 8,
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
  ageInput: {
    backgroundColor: "#1f1f1f",
    color: "#fff",
    padding: 16,
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
    height: 50,
    textAlign: "center",
  },
  inputError: {
    borderColor: "#ff4444",
  },
  errorText: {
    color: "#ff4444",
    fontSize: 12,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#4A90E2",
    padding: 16,
    borderRadius: 6,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  linkContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  linkText: {
    color: "#666",
    fontSize: 14,
  },
  linkTextBold: {
    color: "#4A90E2",
    fontWeight: "bold",
  },
  termsText: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  termsLink: {
    color: "#4A90E2",
    textDecorationLine: "underline",
  },
});

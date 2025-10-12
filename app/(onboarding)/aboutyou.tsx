import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  StatusBar,
  ScrollView,
  Modal,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import {
  useNavigationContext,
  OnboardingStage,
} from "@/src/contexts/NavigationContext";
import { logOnboardingEvent } from "@/src/utils/onboarding";

export default function AboutYouScreen() {
  React.useEffect(() => {
    logOnboardingEvent({ stage: "q2", action: "view" });
  }, []);
  const router = useRouter();
  const { updateOnboardingStage } = useNavigationContext();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState<string>("");
  const [occupation, setOccupation] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);

  const canContinue =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    age.trim().length > 0 &&
    occupation.trim().length > 0;

  // Generate age options (18-80)
  const ageOptions = Array.from({ length: 63 }, (_, i) => (i + 18).toString());

  const persist = async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      const parsedAge = age ? Number(age) : undefined;
      await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          age: parsedAge,
          occupation: occupation.trim(),
        },
      });
      await updateOnboardingStage(OnboardingStage.ACCOUNT_CONNECTION);
      logOnboardingEvent({ stage: "q2", action: "complete" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={["#1A1A2E", "#16213E", "#0D1117"]}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Let's get to know you.</Text>

          <Text style={styles.label}>What should we call you?</Text>
          <View style={styles.nameRow}>
            <View style={[styles.inputWrap, styles.nameInput]}>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                style={styles.input}
                returnKeyType="next"
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.inputWrap, styles.nameInput]}>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                style={styles.input}
                returnKeyType="done"
                autoCapitalize="words"
              />
            </View>
          </View>

          <Text style={styles.label}>Age</Text>
          <TouchableOpacity
            style={styles.inputWrap}
            onPress={() => setShowAgeModal(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.input, !age && styles.placeholder]}>
              {age ? `${age} years old` : "Select your age"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={20}
              color="rgba(255,255,255,0.5)"
            />
          </TouchableOpacity>

          <Text style={styles.label}>Occupation</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={occupation}
              onChangeText={(text) =>
                setOccupation(text.charAt(0).toUpperCase() + text.slice(1))
              }
              placeholder="Engineering Student, Designer, Nurse, etc."
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.input}
              returnKeyType="done"
              autoCapitalize="words"
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, !canContinue && styles.buttonDisabled]}
            disabled={!canContinue}
            onPress={persist}
            activeOpacity={0.8}
          >
            <View style={styles.glassButton}>
              <Text style={styles.buttonText}>Continue</Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Age Picker Modal */}
      <Modal
        visible={showAgeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAgeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAgeModal(false)}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setShowAgeModal(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Age</Text>
              <TouchableOpacity
                onPress={() => setShowAgeModal(false)}
                style={styles.doneButton}
              >
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>

            <Picker
              selectedValue={age}
              onValueChange={(itemValue) => setAge(itemValue)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {ageOptions.map((ageOption) => (
                <Picker.Item
                  key={ageOption}
                  label={`${ageOption} years old`}
                  value={ageOption}
                  color="#fff"
                />
              ))}
            </Picker>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "transparent" },
  container: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 70 : 50,
    paddingBottom: 10,
  },
  progress: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 8 },
  title: { fontSize: 28, color: "#fff", fontWeight: "700", marginBottom: 20 },
  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  nameRow: {
    flexDirection: "row",
    gap: 20,
  },
  nameInput: {
    flex: 1,
    maxWidth: "48%",
  },
  inputWrap: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 16 : 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  input: { color: "#fff", fontSize: 16, fontWeight: "500", flex: 1 },
  placeholder: { color: "rgba(255,255,255,0.5)" },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 20 : 25,
    paddingTop: 16,
  },
  button: {
    borderRadius: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  glassButton: {
    backgroundColor: "#3b88e3",
    borderWidth: 1.3,
    borderColor: "rgba(74, 145, 226, 0.3)",
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    borderRadius: 25,
    shadowColor: "#4A90E2",
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 2, height: 2 },
    elevation: 10,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: 300,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  cancelButton: {
    padding: 4,
  },
  cancelText: {
    color: "#4A90E2",
    fontSize: 17,
    fontWeight: "400",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  doneButton: {
    padding: 4,
  },
  doneText: {
    color: "#4A90E2",
    fontSize: 17,
    fontWeight: "600",
  },
  picker: {
    height: 200,
    backgroundColor: "#1A1A2E",
  },
  pickerItem: {
    color: "#fff",
    fontSize: 18,
  },
});

import React, { useState, useEffect } from "react";
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
  Keyboard,
  Image,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import { logOnboardingEvent } from "@/src/utils/auth/onboarding";
import logger from "@/src/utils/core/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REFERRAL_OPTIONS = [
  {
    id: "tiktok",
    label: "TikTok",
    icon: "logo-tiktok",
    color: "#FF0050",
    useIcon: true,
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "logo-instagram",
    color: "#E4405F",
    useIcon: true,
  },
  {
    id: "twitter",
    label: "Twitter/X",
    icon: "logo-twitter",
    color: "#1DA1F2",
    useIcon: true,
  },
  {
    id: "email",
    label: "Email",
    icon: "mail",
    color: "#4A90E2",
    useIcon: true,
  },
  {
    id: "friend",
    label: "Friend",
    icon: "people",
    color: "#00D4AA",
    useIcon: true,
  },
  {
    id: "appstore",
    label: "App Store",
    icon: "A",
    color: "#007AFF",
    useIcon: false,
  },
  {
    id: "reddit",
    label: "Reddit",
    icon: "logo-reddit",
    color: "#FF4500",
    useIcon: true,
  },
  {
    id: "founder",
    label: "Founder",
    icon: "person",
    color: "#FFB020",
    useIcon: true,
  },
];

export default function AboutYouScreen() {
  useEffect(() => {
    logOnboardingEvent({ stage: "q2", action: "view" });
  }, []);
  const router = useRouter();
  const [age, setAge] = useState<string>("");
  const [occupation, setOccupation] = useState<string>("");
  const [referralSource, setReferralSource] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);

  const canContinue =
    age.trim().length > 0 &&
    occupation.trim().length > 0 &&
    referralSource.trim().length > 0;

  // Generate age options (18-80)
  const ageOptions = Array.from({ length: 63 }, (_, i) => (i + 18).toString());

  const persist = async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      const parsedAge = age ? Number(age) : undefined;
      const profileData = {
        age: parsedAge,
        occupation: occupation.trim(),
        referral: referralSource,
      };

      logger.info(
        "🧭 AboutYouScreen: Saving profile data and navigating to intent screen",
        {
          age: parsedAge,
          occupation: profileData.occupation,
          referral: referralSource,
        }
      );

      // Save profile data to AsyncStorage for next screen
      await AsyncStorage.setItem(
        "pending_profile_data",
        JSON.stringify(profileData)
      );

      // Persist profile data and step -> 1 (intent questions)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              onboarding_step: 1,
              age: profileData.age,
              occupation: profileData.occupation,
              referral: profileData.referral,
            })
            .eq("id", user.id);

          if (updateError) {
            logger.error(
              "❌ AboutYouScreen: Error updating profile:",
              updateError
            );
            throw updateError;
          }

          logger.info("✅ AboutYouScreen: Profile updated successfully");
        } else {
          logger.error("❌ AboutYouScreen: No user ID found");
        }
      } catch (profileError) {
        logger.error(
          "❌ AboutYouScreen: Error saving profile data:",
          profileError
        );
        throw profileError;
      }

      // Navigate to intent questions
      router.replace("/onboarding-intent1" as any);
      logOnboardingEvent({ stage: "q2", action: "complete" });
    } catch (error) {
      logger.error("❌ AboutYouScreen: Error saving user data:", error);
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
          <View style={styles.titleContainer}>
            <Image
              source={require("@/assets/images/midleftshot.png")}
              style={styles.mascotImage}
            />
            <Text style={styles.title}>Let's get to know you.</Text>
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

          <Text style={styles.label}>What do you do?</Text>
          <View style={styles.occupationInputWrap}>
            <TextInput
              value={occupation}
              onChangeText={(text) =>
                setOccupation(text.charAt(0).toUpperCase() + text.slice(1))
              }
              placeholder="Tell us about yourself: your profession, whether you're a student, and your location    
Examples:
• Nurse in Seattle
• Software Engineer at Google
• Student at MIT in Boston
• Freelance Designer in NYC"
              placeholderTextColor="rgba(255,255,255,0.2)"
              style={styles.occupationInput}
              autoCapitalize="sentences"
              returnKeyType="default"
              multiline
              textAlignVertical="top"
              blurOnSubmit={true}
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>
          <Text style={styles.helperText}>
            This helps Finny give you more personalized advice
          </Text>

          <Text style={styles.label}>How did you hear about us?</Text>
          <TouchableOpacity
            style={styles.inputWrap}
            onPress={() => setShowReferralModal(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.input, !referralSource && styles.placeholder]}>
              {referralSource
                ? REFERRAL_OPTIONS.find((opt) => opt.id === referralSource)
                    ?.label || referralSource
                : "Select an option"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={20}
              color="rgba(255,255,255,0.5)"
            />
          </TouchableOpacity>
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

      {/* Referral Source Modal */}
      <Modal
        visible={showReferralModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReferralModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowReferralModal(false)}
        >
          <View style={styles.referralModalContent}>
            <View style={styles.referralOptionsContainer}>
              {REFERRAL_OPTIONS.map((option) => {
                const isSelected = referralSource === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.referralOption,
                      isSelected && styles.referralOptionSelected,
                    ]}
                    onPress={() => {
                      setReferralSource(option.id);
                      setShowReferralModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.referralIconContainer,
                        { backgroundColor: `${option.color}20` },
                      ]}
                    >
                      {option.useIcon ? (
                        <Ionicons
                          name={option.icon as any}
                          size={22}
                          color={option.color}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.appStoreLetter,
                            { color: option.color },
                          ]}
                        >
                          {option.icon}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.referralOptionText,
                        isSelected && styles.referralOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.checkmarkContainer}>
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color="#4A90E2"
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
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
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 0,
  },
  mascotImage: {
    width: 80,
    height: 80,
    resizeMode: "contain",
  },
  title: { fontSize: 28, color: "#fff", fontWeight: "700", flex: 1 },
  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.3,
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
  occupationInputWrap: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    minHeight: 180,
  },
  occupationInput: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    minHeight: 160,
    maxHeight: 240,
  },
  helperText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "400",
    marginTop: 8,
    marginLeft: 4,
    fontStyle: "italic",
  },
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
  referralModalContent: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
    paddingTop: 24,
    maxHeight: "80%",
  },
  referralOptionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  referralOption: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    position: "relative",
  },
  referralOptionSelected: {
    borderColor: "#4A90E2",
    backgroundColor: "rgba(74, 144, 226, 0.15)",
  },
  referralIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  appStoreLetter: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  referralOptionText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  referralOptionTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  checkmarkContainer: {
    position: "absolute",
    top: 8,
    right: 8,
  },
});

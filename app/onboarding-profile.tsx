import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  TextInput,
  StatusBar,
  ScrollView,
  Modal,
  Keyboard,
  Image,
  Dimensions,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import { logOnboardingEvent } from "@/src/utils/auth/onboarding";
import logger from "@/src/utils/core/logger";
import AppStorage from "@/src/utils/storage/storage";
import NotificationPermissionModal from "@/src/components/modals/NotificationPermissionModal";
import { notificationService } from "@/src/utils/core/notificationService";

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
];

export default function AboutYouScreen() {
  useEffect(() => {
    logOnboardingEvent({ stage: "q2", action: "view" });
  }, []);
  const router = useRouter();
  const [age, setAge] = useState<string>("");
  const [zipCode, setZipCode] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string>("");
  const [occupation, setOccupation] = useState<string>("");
  const [referralSource, setReferralSource] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  const canContinue =
    age.trim().length > 0 &&
    location.trim().length > 0 &&
    occupation.trim().length > 0 &&
    referralSource.trim().length > 0;

  // Generate age options (18-80)
  const ageOptions = Array.from({ length: 63 }, (_, i) => (i + 18).toString());

  const fetchLocation = async (zip: string) => {
    if (!zip || zip.trim().length === 0) {
      setLocation("");
      setLocationError("");
      return;
    }

    // Only fetch if ZIP is 5 digits
    const cleanZip = zip.trim().replace(/\D/g, "");
    if (cleanZip.length !== 5) {
      setLocation("");
      setLocationError("");
      return;
    }

    setLocationLoading(true);
    setLocationError("");
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
      if (!response.ok) {
        throw new Error("Invalid ZIP code");
      }
      const data = await response.json();
      if (data.places && data.places.length > 0) {
        const place = data.places[0];
        const city = place["place name"];
        const state = place["state abbreviation"];
        const locationString = `${city}, ${state}`;
        setLocation(locationString);
        setLocationError("");
        logger.info("✅ AboutYouScreen: Location fetched successfully", {
          zip: cleanZip,
          city,
          state,
        });
      } else {
        throw new Error("No location found for this ZIP code");
      }
    } catch (error) {
      logger.error("❌ AboutYouScreen: Error fetching location:", error);
      setLocation("");
      setLocationError("Invalid ZIP code. Please try again.");
    } finally {
      setLocationLoading(false);
    }
  };

  // Debounce ZIP code lookup
  useEffect(() => {
    const timer = setTimeout(() => {
      if (zipCode.trim().length > 0) {
        fetchLocation(zipCode);
      } else {
        setLocation("");
        setLocationError("");
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [zipCode]);

  const persist = async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      const parsedAge = age ? Number(age) : undefined;
      const profileData = {
        age: parsedAge,
        location: location.trim(),
        occupation: occupation.trim(),
        referral: referralSource,
      };

      logger.info(
        "🧭 AboutYouScreen: Saving profile data and navigating to intent screen",
        {
          age: parsedAge,
          location: profileData.location,
          occupation: profileData.occupation,
          referral: referralSource,
        },
      );

      // Save profile data to AsyncStorage for next screen
      AppStorage.setItemSync(
        "pending_profile_data",
        JSON.stringify(profileData),
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
              location: profileData.location,
              occupation: profileData.occupation,
              referral: profileData.referral,
            })
            .eq("id", user.id);

          if (updateError) {
            logger.error(
              "❌ AboutYouScreen: Error updating profile:",
              updateError,
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
          profileError,
        );
        throw profileError;
      }

      logOnboardingEvent({ stage: "q2", action: "complete" });
      // Show notification setup (non-blocking); navigate on either choice
      setShowNotificationModal(true);
    } catch (error) {
      logger.error("❌ AboutYouScreen: Error saving user data:", error);
    } finally {
      setSaving(false);
    }
  };

  const goToIntent = () => {
    setShowNotificationModal(false);
    router.replace("/onboarding-intent1" as any);
  };

  const handleNotificationAllow = async () => {
    try {
      const granted = await notificationService.requestPermissions();
      if (granted) logger.info("✅ Notification permissions granted");
    } catch (error) {
      logger.error("Error requesting notification permissions:", error);
    }
    goToIntent();
  };

  const handleNotificationDontAllow = () => {
    goToIntent();
  };

  return (
    <LinearGradient
      colors={[
        "rgba(11, 15, 22, 0.99)",
        "rgba(23, 33, 62, 0.95)",
        "rgba(11, 15, 22, 0.99)",
      ]}
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

          <View style={styles.rowContainer}>
            <View style={styles.ageContainer}>
              <Text style={styles.labelSmall}>Age</Text>
              <TouchableOpacity
                style={styles.inputWrapSmall}
                onPress={() => setShowAgeModal(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.inputSmall, !age && styles.placeholder]}>
                  {age ? age : "Age"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.locationContainer}>
              <Text style={styles.labelSmall}>Location</Text>
              <View style={styles.inputWrapSmall}>
                <TextInput
                  value={zipCode}
                  onChangeText={(text) => {
                    // Only allow digits, max 5
                    const cleanText = text.replace(/\D/g, "").slice(0, 5);
                    setZipCode(cleanText);
                  }}
                  placeholder="ZIP Code"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={styles.inputSmall}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                {locationLoading && (
                  <Ionicons
                    name="hourglass-outline"
                    size={18}
                    color="rgba(255,255,255,0.5)"
                  />
                )}
                {!locationLoading && location && (
                  <Ionicons name="checkmark-circle" size={18} color="#4A90E2" />
                )}
              </View>
              {location && (
                <Text style={styles.locationDisplay}>{location}</Text>
              )}
              {locationError && (
                <Text style={styles.locationError}>{locationError}</Text>
              )}
            </View>
          </View>

          <Text style={[styles.label, styles.occupationLabel]}>
            What do you do?
          </Text>
          <View style={styles.occupationInputWrap}>
            <TextInput
              value={occupation}
              onChangeText={(text) =>
                setOccupation(text.charAt(0).toUpperCase() + text.slice(1))
              }
              placeholder="Examples:
• Nurse
• Software Engineer at Google
• Student at MIT
• Freelance Designer"
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
            This helps Finny give you more personalized help
          </Text>

          <Text style={[styles.label, styles.referralLabel]}>
            How did you hear about us?
          </Text>
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
        <TouchableWithoutFeedback onPress={() => setShowAgeModal(false)}>
          <View style={styles.agePickerOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.agePickerModal}>
                <View style={styles.agePickerHeader}>
                  <TouchableOpacity onPress={() => setShowAgeModal(false)}>
                    <LinearGradient
                      colors={[
                        "rgba(255, 255, 255, 0.12)",
                        "rgba(255, 255, 255, 0.03)",
                      ]}
                      style={styles.agePickerButton}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.agePickerCancel}>Cancel</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <Text style={styles.agePickerTitle}>Select Age</Text>
                  <TouchableOpacity onPress={() => setShowAgeModal(false)}>
                    <LinearGradient
                      colors={[
                        "rgba(74, 144, 226, 0.8)",
                        "rgba(74, 144, 226, 0.6)",
                      ]}
                      style={styles.agePickerButton}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.agePickerDone}>Done</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                <View style={styles.agePickerContent}>
                  <Picker
                    selectedValue={age}
                    onValueChange={(itemValue) => setAge(itemValue)}
                    style={styles.agePickerSpinner}
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
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Referral Source Modal */}
      <Modal
        visible={showReferralModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReferralModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowReferralModal(false)}>
          <View style={styles.referralModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.referralModalWrapper}>
                <LinearGradient
                  colors={[
                    "rgba(20, 28, 48, 0.98)",
                    "rgba(12, 18, 34, 0.99)",
                  ]}
                  style={styles.referralModalContent}
                >
                  <ScrollView
                    style={styles.referralScrollView}
                    contentContainerStyle={styles.referralOptionsContainer}
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                    keyboardShouldPersistTaps="handled"
                  >
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
                  </ScrollView>
                </LinearGradient>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <NotificationPermissionModal
        visible={showNotificationModal}
        onAllow={handleNotificationAllow}
        onDontAllow={handleNotificationDontAllow}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "transparent" },
  container: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 40 : 30,
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
  title: { fontSize: 24, color: "#fff", fontWeight: "700", flex: 1 },
  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  occupationLabel: {
    marginTop: 20,
  },
  referralLabel: {
    marginTop: 28,
  },
  rowContainer: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  halfWidthContainer: {
    flex: 1,
  },
  ageContainer: {
    flex: 0.3,
  },
  locationContainer: {
    flex: 0.7,
  },
  labelSmall: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputWrapSmall: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 11,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputSmall: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  inputWrap: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
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
    color: "rgba(255,255,255,0.62)",
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
    borderColor: "rgba(135, 187, 255, 0.42)",
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    borderRadius: 25,
    shadowColor: "#5A9EF0",
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
    backgroundColor: "rgba(15, 22, 38, 0.98)",
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
    backgroundColor: "rgba(15, 22, 38, 0.98)",
  },
  pickerItem: {
    color: "#fff",
    fontSize: 18,
  },
  // Age picker modal styles (matching date picker from AddGoalModal)
  agePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  agePickerModal: {
    backgroundColor: "rgba(15, 22, 38, 0.98)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    minHeight: 280,
  },
  agePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(15, 22, 38, 0.98)",
  },
  agePickerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  agePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  agePickerButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  agePickerCancel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  agePickerDone: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
  agePickerSpinner: {
    width: "100%",
    height: 180,
    backgroundColor: "transparent",
  },
  referralModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  referralModalWrapper: {
    maxHeight: Dimensions.get("window").height * 0.9,
    minHeight: Dimensions.get("window").height * 0.65,
    width: "100%",
  },
  referralModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    flex: 1,
  },
  referralModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    marginBottom: 16,
  },
  referralModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  referralModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  referralScrollView: {
    flex: 1,
  },
  referralOptionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 50 : 40,
    paddingTop: 20,
    justifyContent: "space-between",
  },
  referralOption: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    position: "relative",
  },
  referralOptionSelected: {
    borderColor: "rgba(137, 188, 255, 0.5)",
    backgroundColor: "rgba(61, 122, 212, 0.2)",
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
  locationDisplay: {
    color: "#8BB9FF",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    marginLeft: 2,
  },
  locationError: {
    color: "#FF6B6B",
    fontSize: 12,
    fontWeight: "400",
    marginTop: 4,
    marginLeft: 2,
  },
});

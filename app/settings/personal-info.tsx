import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Button,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { userName } = useLocalSearchParams();
  const [userData, setUserData] = useState<any>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    const fetchAndSetUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserData(user);
          await AsyncStorage.setItem("userData", JSON.stringify(user));
          console.log("[PersonalInfo] Current user email:", user.email);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };
    fetchAndSetUserData();
  }, []);

  const handleSaveEmail = async () => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        email: newEmail,
      });
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        const updatedUserData = { ...userData, email: newEmail };
        setUserData(updatedUserData);
        await AsyncStorage.setItem("userData", JSON.stringify(updatedUserData));
        setShowEmailModal(false);
      }
    } catch (error: any) {
      console.error("Error updating email:", error);
      Alert.alert("Error updating email", error.message);
    }
  };

  const handleSavePhone = async () => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        phone: newPhone,
      });
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        const updatedUserData = { ...userData, phone: newPhone };
        setUserData(updatedUserData);
        await AsyncStorage.setItem("userData", JSON.stringify(updatedUserData));
        setShowPhoneModal(false);
      }
    } catch (error: any) {
      console.error("Error updating phone:", error);
      Alert.alert("Error updating phone", error.message);
    }
  };

  const renderInfoItem = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    value: string,
    onPress?: () => void
  ) => {
    if (onPress) {
      return (
        <TouchableOpacity style={styles.infoItem} onPress={onPress}>
          <View style={styles.infoItemLeft}>
            <Ionicons
              name={icon}
              size={24}
              color="#4A90E2"
              style={styles.icon}
            />
            <View>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.infoItem}>
        <View style={styles.infoItemLeft}>
          <Ionicons name={icon} size={24} color="#4A90E2" style={styles.icon} />
          <View>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back-sharp" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personal Information</Text>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoContainer}>
            {renderInfoItem(
              "person-outline",
              "Name",
              userData?.user_metadata?.full_name || userName || "Not available"
            )}
            <View style={styles.divider} />
            {renderInfoItem(
              "mail-outline",
              "Email",
              userData?.email || "Not available",
              () => {
                setNewEmail(userData?.email || "");
                setShowEmailModal(true);
              }
            )}
            <View style={styles.divider} />
            {renderInfoItem(
              "call-outline",
              "Phone",
              userData?.phone ||
                userData?.user_metadata?.phone_number ||
                "Not available",
              () => {
                setNewPhone(
                  userData?.phone || userData?.user_metadata?.phone_number || ""
                );
                setShowPhoneModal(true);
              }
            )}
            <View style={styles.divider} />
            <View style={styles.horizontalFields}>
              <View style={styles.horizontalField}>
                {renderInfoItem(
                  "calendar-outline",
                  "Age",
                  userData?.user_metadata?.age || "Not available"
                )}
              </View>
              <View style={styles.fieldDivider} />
              <View style={styles.horizontalField}>
                {renderInfoItem(
                  "time-outline",
                  "Member Since",
                  new Date(userData?.created_at || "").toLocaleDateString()
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Email Edit Modal */}
      <Modal visible={showEmailModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Email</Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              style={styles.input}
              placeholder="Enter new email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => {
                  setShowEmailModal(false);
                  setNewEmail("");
                }}
              />
              <Button title="Save" onPress={handleSaveEmail} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Phone Edit Modal */}
      <Modal visible={showPhoneModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Phone</Text>
            <TextInput
              value={newPhone}
              onChangeText={setNewPhone}
              style={styles.input}
              placeholder="Enter new phone"
              keyboardType="phone-pad"
            />
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => {
                  setShowPhoneModal(false);
                  setNewPhone("");
                }}
              />
              <Button title="Save" onPress={handleSavePhone} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginLeft: 12,
  },
  infoSection: {
    padding: 16,
  },
  infoContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    overflow: "hidden",
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  infoItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  icon: {
    marginRight: 16,
  },
  label: {
    fontSize: 14,
    color: "#888",
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  horizontalFields: {
    flexDirection: "row",
  },
  horizontalField: {
    flex: 1,
  },
  fieldDivider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  footer: {
    padding: 16,
    marginTop: 40,
  },
  deleteButton: {
    backgroundColor: "rgba(255, 68, 68, 0.15)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.3)",
  },
  deleteButtonText: {
    color: "#ff4444",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});

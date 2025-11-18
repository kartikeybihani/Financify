import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import IconButton from "@/src/components/shared/IconButton";
import { supabase } from "@/src/lib/supabase/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import EditEmailModal from "@/src/components/menu/EditEmailModal";
import EditOccupationModal from "@/src/components/menu/EditOccupationModal";
import logger from "@/src/utils/core/logger";
import { TEXT_STYLES } from "@/src/components/shared/modal-constants";

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { userName } = useLocalSearchParams();
  const [userData, setUserData] = useState<any>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showOccupationModal, setShowOccupationModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newOccupation, setNewOccupation] = useState("");
  const [occupation, setOccupation] = useState<string>("");
  const [profileAge, setProfileAge] = useState<number | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");

  useEffect(() => {
    const fetchAndSetUserData = async () => {
      try {
        const storedUserData = await AsyncStorage.getItem("userData");
        if (storedUserData) {
          setUserData(JSON.parse(storedUserData));
        }
        // Always fetch latest user from Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserData(user);
          await AsyncStorage.setItem("userData", JSON.stringify(user));
          logger.info("[PersonalInfo] Current user email:", user.email);

          // Fetch occupation (and age) from profiles
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("occupation, age, first_name, last_name")
              .eq("id", user.id)
              .maybeSingle();
            if (profile) {
              setOccupation(profile.occupation || "");
              setProfileAge(
                typeof profile.age === "number" ? profile.age : null
              );
              setFirstName(profile.first_name || "");
              setLastName(profile.last_name || "");
            }
          } catch (e) {
            logger.error("[PersonalInfo] Failed to fetch profile:", e);
          }
        }
      } catch (error) {
        logger.error("Error fetching user data:", error);
      }
    };
    fetchAndSetUserData();
  }, []);

  const handleSaveEmail = async (email: string) => {
    try {
      const { data, error } = await supabase.auth.updateUser(
        { email },
        {
          emailRedirectTo: "https://financify.ing/auth-redirect.html",
        }
      );
      if (error) throw error;

      // Show success message with instructions
      Alert.alert(
        "Email Change Requested",
        "We've sent confirmation links to your new email address. Please click the confirmation link from Supabase Auth.",
        [
          {
            text: "OK",
            onPress: () => {
              setShowEmailModal(false);
            },
          },
        ]
      );
    } catch (error: any) {
      throw error;
    }
  };

  const handleSaveOccupation = async (occupationValue: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ occupation: occupationValue })
        .eq("id", userData?.id);

      if (error) throw error;

      setOccupation(occupationValue);
      setShowOccupationModal(false);
      setNewOccupation("");

      Alert.alert("Success", "Occupation updated successfully!");
    } catch (error: any) {
      throw error;
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
          <IconButton
            icon="chevron-back-sharp"
            onPress={() => router.back()}
            size={22}
            style={TEXT_STYLES.closeButton}
          />
          <Text style={styles.headerTitle}>Personal Information</Text>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoContainer}>
            {renderInfoItem(
              "person-outline",
              "Name",
              (firstName || lastName
                ? `${firstName}${lastName ? " " + lastName : ""}`
                : userData?.user_metadata?.full_name ||
                  userName ||
                  "Not available") as string
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
              "briefcase-outline",
              "Occupation",
              occupation || "Not available",
              () => {
                setNewOccupation(occupation || "");
                setShowOccupationModal(true);
              }
            )}
            <View style={styles.divider} />
            <View style={styles.horizontalFields}>
              <View style={styles.horizontalField}>
                {renderInfoItem(
                  "calendar-outline",
                  "Age",
                  (profileAge ?? userData?.user_metadata?.age) ||
                    "Not available"
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
      <EditEmailModal
        visible={showEmailModal}
        value={newEmail}
        onChange={setNewEmail}
        onCancel={() => {
          setShowEmailModal(false);
          setNewEmail("");
        }}
        onSave={handleSaveEmail}
      />

      {/* Occupation Edit Modal */}
      <EditOccupationModal
        visible={showOccupationModal}
        value={newOccupation}
        onChange={setNewOccupation}
        onCancel={() => {
          setShowOccupationModal(false);
          setNewOccupation("");
        }}
        onSave={handleSaveOccupation}
      />
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
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
    marginRight: 25,
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

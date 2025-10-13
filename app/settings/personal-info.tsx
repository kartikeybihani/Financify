import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import EditEmailModal from "@/src/components/menu/EditEmailModal";
import EditNameModal from "@/src/components/menu/EditNameModal";
import logger from "@/src/utils/logger";

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { userName } = useLocalSearchParams();
  const [userData, setUserData] = useState<any>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
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
      const { data, error } = await supabase.auth.updateUser({
        email,
      });
      if (error) throw error;
      const updatedUserData = { ...userData, email };
      setUserData(updatedUserData);
      await AsyncStorage.setItem("userData", JSON.stringify(updatedUserData));
      setShowEmailModal(false);
    } catch (error: any) {
      throw error;
    }
  };

  const handleSaveName = async (name: string) => {
    try {
      const fullName = (name || "").trim();
      const parts = fullName.split(/\s+/);
      const first = parts[0] || "";
      const last = parts.slice(1).join(" ") || "";

      // Update profiles split name
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase
          .from("profiles")
          .update({ first_name: first, last_name: last })
          .eq("id", user.id);
      }

      // Mirror to auth metadata full_name for legacy consumers
      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      });
      if (authErr) throw authErr;

      const updatedUserData = {
        ...userData,
        user_metadata: { ...userData.user_metadata, full_name: fullName },
      };
      setUserData(updatedUserData);
      await AsyncStorage.setItem("userData", JSON.stringify(updatedUserData));
      setFirstName(first);
      setLastName(last);
      setShowNameModal(false);
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
              (firstName || lastName
                ? `${firstName}${lastName ? " " + lastName : ""}`
                : userData?.user_metadata?.full_name ||
                  userName ||
                  "Not available") as string,
              () => {
                const current =
                  firstName || lastName
                    ? `${firstName}${lastName ? " " + lastName : ""}`
                    : userData?.user_metadata?.full_name || "";
                setNewName(current);
                setShowNameModal(true);
              }
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
              occupation || "Not available"
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

      {/* Name Edit Modal */}
      <EditNameModal
        visible={showNameModal}
        value={userData?.user_metadata?.full_name || userName || ""}
        onChange={setNewName}
        onCancel={() => {
          setShowNameModal(false);
          setNewName("");
        }}
        onSave={handleSaveName}
      />

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

      {/* Removed phone modal; occupation is read-only from profiles */}
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
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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

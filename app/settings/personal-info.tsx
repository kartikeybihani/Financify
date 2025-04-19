import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase/supabase";

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { userName } = useLocalSearchParams();
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserData(user);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const renderInfoItem = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    value: string,
    onPress?: () => void
  ) => (
    <View style={styles.infoItem}>
      <View style={styles.infoItemLeft}>
        <Ionicons name={icon} size={24} color="#4A90E2" style={styles.icon} />
        <View>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      </View>
      {onPress && (
        <TouchableOpacity onPress={onPress}>
          <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>
      )}
    </View>
  );

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
            <TouchableOpacity onPress={() => {}}>
              {renderInfoItem(
                "mail-outline",
                "Email",
                userData?.email || "Not available",
                () => {
                  /* Handle email edit */
                }
              )}
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity onPress={() => {}}>
              {renderInfoItem(
                "call-outline",
                "Phone",
                userData?.phone ||
                  userData?.user_metadata?.phone_number ||
                  "Not available",
                () => {
                  /* Handle phone edit */
                }
              )}
            </TouchableOpacity>
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
});

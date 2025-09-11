import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Linking,
  Share,
  Switch,
  Alert,
  ScrollView,
  DeviceEventEmitter,
} from "react-native";
import {
  Ionicons,
  MaterialIcons,
  FontAwesome,
  Entypo,
  AntDesign,
} from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../_lib/supabase/supabase";
import FeedbackModal from "../_components/modals/FeedbackModal";
import { handleDisconnect, getPrimaryItemId } from "../_utils/plaid";

export default function SettingsScreen() {
  const router = useRouter();
  const { userName } = useLocalSearchParams();
  const [userData, setUserData] = useState<any>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

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
          console.log(
            "[SettingsIndex] Current user email:",
            user.user_metadata.full_name + " - " + user.email
          );
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };
    fetchAndSetUserData();
  }, []);

  const handleDisconnectBank = async () => {
    Alert.alert(
      "Disconnect Bank Account",
      "This will disconnect your bank accounts and clear all financial data. Your account will remain active.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              console.log("[SettingsIndex] Starting bank disconnection...");

              // Get the primary item_id to disconnect
              const item_id = await getPrimaryItemId();
              console.log("[SettingsIndex] Primary item_id:", item_id);

              if (!item_id) {
                Alert.alert(
                  "Error",
                  "No connected bank accounts found to disconnect."
                );
                return;
              }

              await handleDisconnect(item_id);
              DeviceEventEmitter.emit("financialDataRefreshed", {
                accounts: [],
                identity: null,
                investments: null,
                liabilities: null,
                institution: null,
              });

              console.log("[SettingsIndex] Bank disconnection successful");
              Alert.alert(
                "Success",
                "Bank accounts have been disconnected successfully"
              );
            } catch (error) {
              console.error("Error disconnecting bank:", error);
              Alert.alert(
                "Error",
                "Failed to disconnect bank accounts. Please try again."
              );
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert("Confirm Logout", "Are you sure you want to log out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          if (userData?.email) {
            console.log("[SettingsIndex] Logging out user:", userData.email);
          }

          // Clear AsyncStorage cache on logout
          await AsyncStorage.removeItem("onboarding_complete");
          await AsyncStorage.removeItem("user_authenticated");
          await AsyncStorage.removeItem("userData");

          await supabase.auth.signOut();
          router.replace("/(onboarding)/welcome");
          console.log("User logged out and cache cleared");
        },
      },
    ]);
  };

  const handleCallFounder = () => {
    Linking.openURL("tel:+1234567890");
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: "Check out Financify - Your personal finance companion!",
      });
    } catch (error) {
      console.error(error);
    }
  };

  const renderSettingsItem = (
    icon: JSX.Element,
    title: string,
    onPress: () => void,
    showBorder = true,
    rightElement?: JSX.Element
  ) => (
    <TouchableOpacity
      style={[styles.settingsItem, showBorder && styles.settingsItemBorder]}
      onPress={onPress}
    >
      <View style={styles.settingsItemLeft}>
        {icon}
        <Text style={styles.settingsItemText}>{title}</Text>
      </View>
      {rightElement || (
        <MaterialIcons name="chevron-right" size={24} color="#666" />
      )}
    </TouchableOpacity>
  );

  const renderSwitchItem = (
    icon: JSX.Element,
    title: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    showBorder = true
  ) => (
    <View
      style={[styles.settingsItem, showBorder && styles.settingsItemBorder]}
    >
      <View style={styles.settingsItemLeft}>
        {icon}
        <Text style={styles.settingsItemText}>{title}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#333", true: "#4A90E2" }}
        thumbColor={value ? "#fff" : "#f4f3f4"}
      />
    </View>
  );

  const renderSettingsGroup = (title: string, children: React.ReactNode) => (
    <View style={styles.settingsGroup}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.settingsGroupContent}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back-sharp" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={styles.userName}>
                {userData?.user_metadata?.full_name ||
                  userName ||
                  "Your Profile"}
              </Text>
              <Text style={styles.userEmail}>
                {userData?.email || "Loading..."}
              </Text>
            </View>
          </View>
        </View>

        {renderSettingsGroup(
          "Account",
          <>
            {renderSettingsItem(
              <Ionicons name="person-outline" size={24} color="#4A90E2" />,
              "Personal Information",
              () =>
                router.push({
                  pathname: "/settings/personal-info",
                  params: { userName },
                }),
              true
            )}
            {renderSettingsItem(
              <Ionicons name="card-outline" size={24} color="#4A90E2" />,
              "Connected Accounts",
              () => {},
              true
            )}
            {renderSwitchItem(
              <Ionicons
                name="notifications-outline"
                size={24}
                color="#4A90E2"
              />,
              "Push Notifications",
              notificationsEnabled,
              setNotificationsEnabled
            )}
            {renderSwitchItem(
              <Ionicons name="finger-print" size={24} color="#4A90E2" />,
              "Biometric Login",
              biometricsEnabled,
              setBiometricsEnabled,
              false
            )}
          </>
        )}

        {renderSettingsGroup(
          "Support",
          <>
            {renderSettingsItem(
              <MaterialIcons name="feedback" size={24} color="#4A90E2" />,
              "Give Feedback",
              () => setShowFeedbackModal(true),
              true
            )}
            {renderSettingsItem(
              <Ionicons name="call-outline" size={24} color="#4A90E2" />,
              "Call Founder",
              handleCallFounder,
              true
            )}
            {renderSettingsItem(
              <Ionicons name="share-outline" size={24} color="#4A90E2" />,
              "Share the App",
              handleShareApp,
              false
            )}
          </>
        )}

        {renderSettingsGroup(
          "Data",
          <>
            {renderSettingsItem(
              <Ionicons name="wallet-outline" size={24} color="#ff6b6b" />,
              "Disconnect & Clear Data",
              handleDisconnectBank,
              true
            )}
            {renderSettingsItem(
              <MaterialIcons name="logout" size={24} color="#ff6b6b" />,
              "Log Out",
              handleLogout,
              false
            )}
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.copyright}>© 2025 Financify</Text>
        </View>
      </ScrollView>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        userName={userData?.user_metadata?.full_name || userName || ""}
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
  headerContainer: {
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.5,
  },
  userEmail: {
    fontSize: 13,
    color: "#888",
    letterSpacing: 0.2,
    marginTop: 2,
  },
  settingsGroup: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
    marginBottom: 12,
    marginLeft: 4,
  },
  settingsGroupContent: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    overflow: "hidden",
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  settingsItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsItemText: {
    fontSize: 16,
    color: "#fff",
    marginLeft: 15,
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
    marginTop: 40,
  },
  version: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  copyright: {
    fontSize: 12,
    color: "#666",
  },
});

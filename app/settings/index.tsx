import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Share,
  Dimensions,
  Alert,
  Linking,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";

const { height } = Dimensions.get("window");

export default function SettingsScreen() {
  const router = useRouter();
  const { userName } = useLocalSearchParams();

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem("accessToken");
          await AsyncStorage.removeItem("financialData");
          router.back();
        },
      },
    ]);
  };

  const handleCallFounder = () => {
    // Implementation
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
    onPress: () => void
  ) => (
    <TouchableOpacity style={[styles.settingsItem]} onPress={onPress}>
      <View style={styles.settingsItemLeft}>
        {icon}
        <Text style={styles.settingsItemText}>{title}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#666" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={() => router.back()} />
      <View style={styles.modalContainer}>
        <SafeAreaView style={styles.container}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.profileSection}>
            <View style={styles.profileImageContainer}>
              <Text style={styles.profileInitial}>
                {String(userName)[0]?.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userEmail}>user@example.com</Text>
          </View>

          <View style={styles.settingsSection}>
            <View style={styles.settingsGroup}>
              {renderSettingsItem(
                <Ionicons
                  name="person-outline"
                  size={24}
                  color="#4A90E2"
                  style={styles.icon}
                />,
                "Personal Information",
                () => {}
              )}
              {renderSettingsItem(
                <MaterialIcons
                  name="feedback"
                  size={24}
                  color="#4A90E2"
                  style={styles.icon}
                />,
                "Give Feedback",
                () => {}
              )}
            </View>

            <View style={[styles.settingsGroup, { marginTop: 16 }]}>
              {renderSettingsItem(
                <Ionicons
                  name="call-outline"
                  size={24}
                  color="#4A90E2"
                  style={styles.icon}
                />,
                "Call the Founder",
                handleCallFounder
              )}
              {renderSettingsItem(
                <Ionicons
                  name="share-outline"
                  size={24}
                  color="#4A90E2"
                  style={styles.icon}
                />,
                "Share the App",
                handleShareApp
              )}
            </View>
          </View>

          <View style={styles.logoutSection}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <View style={styles.settingsItemLeft}>
                <MaterialIcons
                  name="logout"
                  size={24}
                  color="#4A90E2"
                  style={styles.icon}
                />
                <Text style={styles.settingsItemText}>Log Out</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.version}>Version 1.0.0</Text>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "black",
  },
  modalContainer: {
    backgroundColor: "#121212",
    height: height * 0.95,
    paddingTop: 20,
  },
  container: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 20,
    zIndex: 1,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2c2c2c",
    justifyContent: "center",
    alignItems: "center",
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 30,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
  },
  profileImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#4A90E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  profileInitial: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
  },
  userName: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 5,
  },
  userEmail: {
    fontSize: 16,
    color: "#888",
  },
  settingsSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  settingsGroup: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    overflow: "hidden",
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
  },
  settingsItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 15,
  },
  settingsItemText: {
    fontSize: 16,
    color: "#fff",
  },
  logoutSection: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E1E1E",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    width: "100%",
    alignItems: "center",
  },
  version: {
    fontSize: 14,
    color: "#666",
  },
});

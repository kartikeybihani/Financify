import React, { useState } from "react";
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
} from "react-native";
import { Ionicons, MaterialIcons, FontAwesome } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

type RootStackParamList = {
  Settings: {
    userName: string;
  };
};

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export default function SettingsScreen({ navigation, route }: Props) {
  const { userName } = route.params;
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  const handleLogout = async () => {
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to log out? This will disconnect your bank account.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem("accessToken");
            await AsyncStorage.removeItem("financialData");
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Add account deletion logic here
            await AsyncStorage.clear();
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      "Clear App Data",
      "This will clear all your saved goals and chat history. Bank connection will remain intact.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem("goals");
            await AsyncStorage.removeItem("chatMessages");
            navigation.goBack();
          },
        },
      ]
    );
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.profileImageContainer}>
          <Text style={styles.profileInitial}>
            {userName[0]?.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.userName}>{userName}</Text>
        <Text style={styles.userEmail}>user@example.com</Text>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Account</Text>
        {renderSettingsItem(
          <Ionicons name="person-outline" size={24} color="#4A90E2" />,
          "Personal Information",
          () => {}
        )}
        {renderSettingsItem(
          <Ionicons name="card-outline" size={24} color="#4A90E2" />,
          "Connected Accounts",
          () => {}
        )}
        {renderSwitchItem(
          <Ionicons name="notifications-outline" size={24} color="#4A90E2" />,
          "Push Notifications",
          notificationsEnabled,
          setNotificationsEnabled
        )}
        {renderSwitchItem(
          <Ionicons name="moon-outline" size={24} color="#4A90E2" />,
          "Dark Mode",
          darkModeEnabled,
          setDarkModeEnabled
        )}
        {renderSwitchItem(
          <Ionicons name="finger-print" size={24} color="#4A90E2" />,
          "Biometric Login",
          biometricsEnabled,
          setBiometricsEnabled
        )}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Support</Text>
        {renderSettingsItem(
          <MaterialIcons name="feedback" size={24} color="#4A90E2" />,
          "Give Feedback",
          () => {}
        )}
        {renderSettingsItem(
          <Ionicons name="help-circle-outline" size={24} color="#4A90E2" />,
          "Help Center",
          () => {}
        )}
        {renderSettingsItem(
          <Ionicons name="call-outline" size={24} color="#4A90E2" />,
          "Contact Support",
          handleCallFounder
        )}
        {renderSettingsItem(
          <Ionicons name="share-outline" size={24} color="#4A90E2" />,
          "Share the App",
          handleShareApp
        )}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Data</Text>
        {renderSettingsItem(
          <Ionicons name="trash-outline" size={24} color="#ff6b6b" />,
          "Clear App Data",
          handleClearData
        )}
        {renderSettingsItem(
          <MaterialIcons name="logout" size={24} color="#ff6b6b" />,
          "Log Out",
          handleLogout
        )}
        {renderSettingsItem(
          <Ionicons name="alert-circle-outline" size={24} color="#ff6b6b" />,
          "Delete Account",
          handleDeleteAccount,
          false
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.version}>Version 1.0.0</Text>
        <Text style={styles.copyright}>© 2024 Financify</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
  },
  closeButton: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
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
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  settingsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
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
    position: "absolute",
    bottom: 20,
    width: "100%",
    alignItems: "center",
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

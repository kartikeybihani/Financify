import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Linking,
  Share,
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

  const handleLogout = async () => {
    await AsyncStorage.removeItem("accessToken");
    await AsyncStorage.removeItem("financialData");
    navigation.goBack();
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
    showBorder = true
  ) => (
    <TouchableOpacity
      style={[styles.settingsItem, showBorder && styles.settingsItemBorder]}
      onPress={onPress}
    >
      <View style={styles.settingsItemLeft}>
        {icon}
        <Text style={styles.settingsItemText}>{title}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#666" />
    </TouchableOpacity>
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
        {renderSettingsItem(
          <Ionicons name="person-outline" size={24} color="#4A90E2" />,
          "Personal Information",
          () => {}
        )}
        {renderSettingsItem(
          <MaterialIcons name="feedback" size={24} color="#4A90E2" />,
          "Give Feedback",
          () => {}
        )}
        {renderSettingsItem(
          <Ionicons name="call-outline" size={24} color="#4A90E2" />,
          "Call the Founder",
          handleCallFounder
        )}
        {renderSettingsItem(
          <Ionicons name="share-outline" size={24} color="#4A90E2" />,
          "Share the App",
          handleShareApp
        )}
        {renderSettingsItem(
          <MaterialIcons name="logout" size={24} color="#ff6b6b" />,
          "Log Out",
          handleLogout,
          false
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.version}>Version 1.0.0</Text>
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
  },
});

// components/home/HomeHeader.tsx

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { styles } from "@/src/styles/homeStyles";

interface HomeHeaderProps {
  userName?: string;
  onAddAccount?: () => void;
}

export const HomeHeader: React.FC<HomeHeaderProps> = React.memo(
  ({ userName, onAddAccount }) => {
    const router = useRouter();

    return (
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/settings")}>
          <View style={styles.headerIconContainer}>
            <Feather name="menu" size={24} color="#4A90E2" />
          </View>
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.greetingText}>
            Hi {userName?.split(" ")[0] || "there"}
          </Text>
          <Text style={styles.subGreeting}>Welcome Back!</Text>
        </View>
        {onAddAccount && (
          <TouchableOpacity onPress={onAddAccount} style={{ marginRight: 13 }}>
            <MaterialCommunityIcons
              name="bank-plus"
              size={28}
              color="#4A90E2"
            />
          </TouchableOpacity>
        )}
      </View>
    );
  }
);

HomeHeader.displayName = "HomeHeader";

// components/home/HomeHeader.tsx

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { styles } from "@/src/styles/homeStyles";

interface HomeHeaderProps {
  userName?: string;
}

export const HomeHeader: React.FC<HomeHeaderProps> = React.memo(
  ({ userName }) => {
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
      </View>
    );
  }
);

HomeHeader.displayName = "HomeHeader";

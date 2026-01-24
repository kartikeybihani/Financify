import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { GlassView } from "expo-glass-effect";
import AppStorage from "@/src/utils/storage/storage";

const NUDGE_MESSAGES = [
  "What would you do if money wasn't a constraint?",
  "What's the one expense you'd cut without thinking twice?",
  "What's your money hiding from you?",
  "What would your future self thank you for changing today?",
  "Is your spending aligned with what you care about?",
  "What's the question about your money you've been avoiding?",
  "Where does your money go when you're not looking?",
  "Are you building wealth or just moving money around?",
  "What could you learn about your money in 2 minutes?",
  "What's the financial habit you know you should break?",
  "If you could ask one thing about your finances, what would it be?",
  "What are you pretending not to know about your money?",
  "What would change if you understood your money better?",
];

function pickMessage(avoid?: string): string {
  const pool =
    avoid && NUDGE_MESSAGES.length > 1
      ? NUDGE_MESSAGES.filter((m) => m !== avoid)
      : NUDGE_MESSAGES;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function FinnyNudge() {
  const router = useRouter();
  const [message, setMessage] = useState(() => pickMessage());

  useFocusEffect(
    useCallback(() => {
      setMessage((prev) => pickMessage(prev));
    }, []),
  );

  const handlePress = useCallback(() => {
    AppStorage.setItemSync("initialChatMessage", message);
    router.push("/chat");
  }, [message, router]);

  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS
    ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
    : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;
  const CardShell = shouldUseLiquidGlass ? GlassView : View;
  const chipStyle = [
    styles.glassChip,
    !shouldUseLiquidGlass && styles.glassChipFallback,
  ];

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.touchable}
      >
        <CardShell
          {...(shouldUseLiquidGlass
            ? {
                glassEffectStyle: "regular",
                tintColor: "rgba(20, 20, 25, 0.9)",
              }
            : {})}
          style={chipStyle}
        >
          <Text style={styles.text} numberOfLines={2}>
            {message}
          </Text>
        </CardShell>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    marginTop: 4,
  },
  touchable: {
    width: "100%",
  },
  glassChip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  glassChipFallback: {
    backgroundColor: "rgba(30, 30, 35, 0.9)",
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    color: "#C7C7CC",
    letterSpacing: 0.2,
    textAlign: "center",
  },
});

import React from "react";
import { Stack } from "expo-router";
import { ChatProvider } from "../../_contexts/ChatContext";

export default function ChatLayout() {
  return (
    <ChatProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="finny-settings"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            gestureEnabled: true,
            gestureDirection: "vertical",
          }}
        />
        <Stack.Screen
          name="memories"
          options={{
            presentation: "card",
            animation: "slide_from_right",
            gestureEnabled: true,
            gestureDirection: "horizontal",
          }}
        />
      </Stack>
    </ChatProvider>
  );
}

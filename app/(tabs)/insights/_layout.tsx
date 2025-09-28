import React from "react";
import { Stack } from "expo-router";

export default function InsightsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Insights",
        }}
      />
      <Stack.Screen
        name="CategorySelector"
        options={{
          title: "Select Category",
          presentation: "transparentModal",
          animation: "ios_from_right",
          gestureEnabled: true,
          gestureDirection: "horizontal",
        }}
      />
    </Stack>
  );
}

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
    </Stack>
  );
}

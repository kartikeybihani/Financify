import { Stack } from "expo-router";

export default function InvestmentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "modal",
        animation: "slide_from_bottom",
        gestureEnabled: true,
        gestureDirection: "vertical",
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}

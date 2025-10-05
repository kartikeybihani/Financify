import { Redirect } from "expo-router";
import { useAuth } from "@/app/_contexts/AuthContext";

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Redirect href={session ? "/(tabs)" : "/(onboarding)/welcome"} />;
}

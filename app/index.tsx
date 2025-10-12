import { Redirect } from "expo-router";
import { useNavigationContext } from "@/src/contexts/NavigationContext";

export default function Index() {
  const { isLoading } = useNavigationContext();

  if (isLoading) {
    return null;
  }

  // Let NavigationContext handle all navigation decisions
  // It will determine the correct screen based on onboarding status
  return <Redirect href="/(onboarding)/welcome" />;
}

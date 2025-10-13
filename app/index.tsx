import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { useNavigationContext } from "@/src/contexts/NavigationContext";
import { NavigationState } from "@/src/contexts/NavigationContext";

export default function Index() {
  const router = useRouter();
  const { isLoading, navigationState, onboardingStep } = useNavigationContext();
  const lastHrefRef = useRef<string | null>(null);

  const targetHref = useMemo(() => {
    if (isLoading) return null;
    switch (navigationState) {
      case NavigationState.PRE_SIGNUP:
        return "/(auth)/welcome";
      case NavigationState.ONBOARDING:
        if (onboardingStep === 2) return "/onboarding-profile";
        if (onboardingStep === 3) return "/onboarding-connect";
        return "/onboarding-intent1"; // step 1
      case NavigationState.ONBOARDING_FINAL:
        return "/(onboarding-complete)";
      case NavigationState.AUTHENTICATED:
        return "/(tabs)/chat";
      default:
        return "/(auth)/welcome";
    }
  }, [isLoading, navigationState, onboardingStep]);

  useEffect(() => {
    if (!targetHref) return;
    if (lastHrefRef.current === targetHref) return;
    lastHrefRef.current = targetHref;
    router.replace(targetHref as any);
  }, [router, targetHref]);

  // Render nothing while deciding; navigation happens imperatively above
  return null;
}

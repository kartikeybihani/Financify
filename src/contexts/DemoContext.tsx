import React, { createContext, useContext, useState, useCallback } from "react";
import { useRouter } from "expo-router";

interface DemoContextValue {
  isDemoMode: boolean;
  setDemoMode: (value: boolean) => void;
  /** Enter demo: set flag and navigate to main app (tabs). */
  enterDemoMode: () => void;
  /** Leave demo: clear flag and navigate to connect screen. */
  leaveDemoMode: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isDemoMode, setDemoModeState] = useState(false);

  const setDemoMode = useCallback((value: boolean) => {
    setDemoModeState(value);
  }, []);

  const enterDemoMode = useCallback(() => {
    setDemoModeState(true);
    router.replace("/(tabs)" as any);
  }, [router]);

  const leaveDemoMode = useCallback(() => {
    setDemoModeState(false);
    router.replace("/onboarding-connect" as any);
  }, [router]);

  const value: DemoContextValue = {
    isDemoMode,
    setDemoMode,
    enterDemoMode,
    leaveDemoMode,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoMode(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    return {
      isDemoMode: false,
      setDemoMode: () => {},
      enterDemoMode: () => {},
      leaveDemoMode: () => {},
    };
  }
  return ctx;
}

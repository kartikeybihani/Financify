import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/src/lib/supabase/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VERIFICATION_STORAGE_KEY = "email_verification_pending";
const MAX_VERIFICATION_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
const INITIAL_POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_INTERVAL = 10000; // 10 seconds

interface VerificationState {
  email: string;
  startTime: number;
}

type VerificationStatus = "idle" | "verifying" | "verified" | "timeout" | "error";

export function useEmailVerification() {
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pollCountRef = useRef<number>(0);

  // Load persisted verification state on mount
  useEffect(() => {
    const loadPersistedState = async () => {
      try {
        const stored = await AsyncStorage.getItem(VERIFICATION_STORAGE_KEY);
        if (stored) {
          const state: VerificationState = JSON.parse(stored);
          const elapsed = Date.now() - state.startTime;
          
          // If less than 5 minutes have passed, resume verification
          if (elapsed < MAX_VERIFICATION_TIME) {
            setPendingEmail(state.email);
            setStatus("verifying");
            startTimeRef.current = state.startTime;
            startPolling(state.email, elapsed);
          } else {
            // Timeout - clear persisted state
            await AsyncStorage.removeItem(VERIFICATION_STORAGE_KEY);
            setStatus("timeout");
          }
        }
      } catch (error) {
        console.error("Error loading persisted verification state:", error);
      }
    };

    loadPersistedState();
  }, []);

  const checkVerification = useCallback(async (email: string): Promise<boolean> => {
    try {
      console.log("[EmailVerification] Starting verification check for:", email);
      
      // First, check current session state with timeout
      const sessionPromise = supabase.auth.getSession();
      const sessionTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Session check timeout")), 10000)
      );
      
      const { data: { session: currentSession }, error: sessionError } = 
        await Promise.race([sessionPromise, sessionTimeout]) as any;
      
      console.log("[EmailVerification] Current session:", {
        hasSession: !!currentSession,
        currentEmail: currentSession?.user?.email,
        targetEmail: email,
      });

      // Try to refresh the session to get latest data (with timeout)
      try {
        const refreshPromise = supabase.auth.refreshSession();
        const refreshTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Refresh timeout")), 5000)
        );
        
        const { data: refreshData, error: refreshError } = 
          await Promise.race([refreshPromise, refreshTimeout]) as any;
        
        if (refreshError) {
          console.warn("[EmailVerification] Session refresh failed (might be expected):", refreshError.message);
        } else {
          console.log("[EmailVerification] Session refreshed successfully");
        }
      } catch (refreshErr: any) {
        console.warn("[EmailVerification] Session refresh error (non-critical):", refreshErr?.message || refreshErr);
        // Continue anyway - refresh failure is not critical
      }
      
      // Wait for Supabase to process the email change (reduced delay)
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      // Get fresh user data with timeout
      const getUserPromise = supabase.auth.getUser();
      const getUserTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Get user timeout")), 10000)
      );
      
      const { data: { user }, error } = await Promise.race([getUserPromise, getUserTimeout]) as any;
      
      if (error) {
        console.error("[EmailVerification] Error getting user:", error);
        throw error;
      }

      if (!user) {
        console.error("[EmailVerification] No user returned from getUser()");
        throw new Error("Unable to retrieve user information");
      }

      console.log("[EmailVerification] User data after refresh:", {
        userId: user?.id,
        userEmail: user?.email,
        targetEmail: email,
        emailConfirmed: user?.email_confirmed_at,
        newEmail: (user as any)?.new_email,
      });

      // Check if the user's email matches the pending email
      const isVerified = user?.email?.toLowerCase() === email.toLowerCase();
      
      console.log("[EmailVerification] Verification result:", {
        isVerified,
        userEmail: user?.email,
        targetEmail: email,
      });
      
      if (isVerified) {
        // Clear AsyncStorage userData cache to force refresh
        try {
          await AsyncStorage.removeItem("userData");
          console.log("[EmailVerification] Cleared userData cache");
        } catch (cacheError) {
          console.warn("[EmailVerification] Failed to clear userData cache:", cacheError);
        }
      }
      
      return isVerified;
    } catch (error: any) {
      console.error("[EmailVerification] Error checking verification:", error);
      const errorMsg = error?.message || "Failed to check verification status";
      setErrorMessage(errorMsg);
      setStatus("error");
      return false;
    }
  }, []);

  const startPolling = useCallback((email: string, elapsed: number = 0) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    pollCountRef.current = 0;
    const startTime = Date.now() - elapsed;

    const poll = async () => {
      pollCountRef.current += 1;
      
      // Calculate elapsed time from actual start
      const currentElapsed = Date.now() - startTime;
      
      // Check for timeout
      if (currentElapsed >= MAX_VERIFICATION_TIME) {
        if (intervalRef.current !== null) {
          clearTimeout(intervalRef.current);
          intervalRef.current = null;
        }
        await AsyncStorage.removeItem(VERIFICATION_STORAGE_KEY);
        setStatus("timeout");
        return;
      }

      // Check verification status
      const isVerified = await checkVerification(email);
      
      if (isVerified) {
        // Verification successful
        if (intervalRef.current !== null) {
          clearTimeout(intervalRef.current);
          intervalRef.current = null;
        }
        await AsyncStorage.removeItem(VERIFICATION_STORAGE_KEY);
        setStatus("verified");
        setPendingEmail(null);
        startTimeRef.current = null;
      } else {
        // Calculate next poll interval with exponential backoff
        const currentInterval = Math.min(
          INITIAL_POLL_INTERVAL * Math.pow(1.2, Math.floor(pollCountRef.current / 5)),
          MAX_POLL_INTERVAL
        );

        // Schedule next poll
        if (intervalRef.current !== null) {
          clearTimeout(intervalRef.current);
        }

        intervalRef.current = setTimeout(() => {
          poll();
        }, currentInterval) as unknown as number;
      }
    };

    // Start polling immediately
    poll();
  }, [checkVerification]);

  const startVerification = useCallback(async (email: string) => {
    try {
      // Save verification state
      const state: VerificationState = {
        email,
        startTime: Date.now(),
      };
      await AsyncStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(state));

      setPendingEmail(email);
      setStatus("verifying");
      setErrorMessage("");
      startTimeRef.current = Date.now();
      startPolling(email);
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to start verification");
      setStatus("error");
    }
  }, [startPolling]);

  const stopVerification = useCallback(async () => {
    if (intervalRef.current !== null) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    
    await AsyncStorage.removeItem(VERIFICATION_STORAGE_KEY);
    setStatus("idle");
    setPendingEmail(null);
    setErrorMessage("");
    startTimeRef.current = null;
    pollCountRef.current = 0;
  }, []);

  const resetVerification = useCallback(() => {
    stopVerification();
  }, [stopVerification]);

  const manualCheck = useCallback(async (): Promise<boolean> => {
    if (!pendingEmail) {
      console.warn("[EmailVerification] No pending email to check");
      return false;
    }

    try {
      setErrorMessage("");
      console.log("[EmailVerification] Starting manual check for:", pendingEmail);
      
      // Add overall timeout for the entire check operation
      const checkPromise = checkVerification(pendingEmail);
      const overallTimeout = new Promise<boolean>((resolve) => 
        setTimeout(() => {
          console.error("[EmailVerification] Manual check timed out after 20 seconds");
          resolve(false);
        }, 20000)
      );
      
      const isVerified = await Promise.race([checkPromise, overallTimeout]);
      
      if (isVerified) {
        console.log("[EmailVerification] ✅ Verification successful!");
        
        // Verification successful
        if (intervalRef.current !== null) {
          clearTimeout(intervalRef.current);
          intervalRef.current = null;
        }
        await AsyncStorage.removeItem(VERIFICATION_STORAGE_KEY);
        setStatus("verified");
        setPendingEmail(null);
        startTimeRef.current = null;
        
        // Invalidate profile cache on server (non-blocking)
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) {
            // Don't await - let it run in background
            fetch("/api/finny", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "invalidate_profile_cache",
              }),
            }).catch((err) => {
              console.warn("[EmailVerification] Failed to invalidate profile cache:", err);
            });
          }
        } catch (cacheError) {
          console.warn("[EmailVerification] Failed to invalidate profile cache:", cacheError);
        }
        
        return true;
      } else {
        console.log("[EmailVerification] ❌ Email not yet verified. Current email doesn't match.");
        // Don't set error status here - just return false so user can try again
        return false;
      }
    } catch (error: any) {
      console.error("[EmailVerification] Error in manual check:", error);
      const errorMsg = error?.message || "Failed to check verification status. Please try again.";
      setErrorMessage(errorMsg);
      setStatus("error");
      return false;
    }
  }, [pendingEmail, checkVerification]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearTimeout(intervalRef.current);
      }
    };
  }, []);

  return {
    status,
    errorMessage,
    pendingEmail,
    startVerification,
    stopVerification,
    resetVerification,
    manualCheck,
  };
}

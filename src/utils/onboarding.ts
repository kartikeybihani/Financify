import { supabase } from "@/src/lib/supabase/supabase";

export async function logOnboardingEvent(params: {
  stage: string;
  action: string;
  durationMs?: number;
  errorCode?: string;
  metadata?: Record<string, any>;
}) {
  try {
    await supabase.rpc("log_onboarding_event", {
      p_stage: params.stage,
      p_action: params.action,
      p_duration_ms: params.durationMs ?? null,
      p_error_code: params.errorCode ?? null,
      p_metadata: params.metadata ?? {},
    });
  } catch (e) {
    // best‑effort logging only
  }
}



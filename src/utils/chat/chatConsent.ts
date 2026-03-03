import { supabase } from "@/src/lib/supabase/supabase";

export const CHAT_MEMORY_CONSENT_KEY = "chat_memory_consent_v2";
export const ONBOARDING_AI_CONSENT_KEY = "onboarding_ai_consent_v1";

export const getAiConsentStorageKey = (consentKey: string, userId: string) =>
  `${consentKey}:${userId}`;

export async function persistAiConsent(
  userId: string,
  consentKey: string,
  source = "chat_privacy_sheet",
) {
  const { error } = await supabase.from("chat_ai_consents").upsert(
    {
      user_id: userId,
      consent_key: consentKey,
      accepted: true,
      accepted_at: new Date().toISOString(),
      source,
    },
    {
      onConflict: "user_id,consent_key",
    },
  );

  if (error) {
    throw error;
  }
}

export async function persistChatAiConsent(
  userId: string,
  consentKey: string,
  source = "chat_privacy_sheet",
) {
  await persistAiConsent(userId, consentKey, source);
}

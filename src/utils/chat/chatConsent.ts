import { supabase } from "@/src/lib/supabase/supabase";

export async function persistChatAiConsent(
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

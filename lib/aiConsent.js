export const ONBOARDING_AI_CONSENT_KEY = "onboarding_ai_consent_v1";

export async function hasAcceptedAiConsent(
  supabaseClient,
  userId,
  consentKey,
) {
  if (!userId || !consentKey) {
    return false;
  }

  const { data, error } = await supabaseClient
    .from("chat_ai_consents")
    .select("accepted")
    .eq("user_id", userId)
    .eq("consent_key", consentKey)
    .maybeSingle();

  if (error) {
    console.error("[AI_CONSENT] Failed to read consent", {
      userId,
      consentKey,
      message: error.message,
    });
    return false;
  }

  return data?.accepted === true;
}

/**
 * RevenueCat entitlement identifier. Must match the entitlement Identifier in RevenueCat dashboard.
 * (RevenueCat ID entl533f4158a4 is for REST API; SDK uses this string key.)
 */
export const ENTITLEMENT_ID = "Finny Pro";

/**
 * Legacy users who should not see the paywall. Add Supabase user IDs here.
 * Commented out – premium status now only from RevenueCat entitlements.
 */
// export const GRANDFATHERED_USER_IDS = new Set<string>([
//   "79952f35-b607-40d6-a32e-d81386882eb7",
//   // "f948c4ab-dc68-41d5-89bf-1935653cca37",
//   "a7a63c97-b74f-4df1-a85d-70716f3cd928",
//   "3b527dd9-00bc-41ab-9d3e-c39cfc491016",
//   "991d7203-04f5-4845-8a3a-471358128511",
//   "8f48f00d-5266-417a-a9d3-b13f38596e40",
//   "894dea1e-d443-4cc0-980a-969e2b68d28c",
//   "68001bcf-37eb-4d33-9f29-936dca7989ec",
//   "6e18728a-eaea-4c7e-99a5-f35f3378b69d",
// ]);

/** Free tier: max Finny messages per calendar day. */
export const FREE_MESSAGES_PER_DAY = 5;

/** MMKV key prefix for daily message count: finny_free_messages_{userId}_{YYYY-MM-DD} */
export const FREE_MESSAGES_COUNT_KEY_PREFIX = "finny_free_messages";

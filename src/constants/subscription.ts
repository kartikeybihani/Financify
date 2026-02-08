/**
 * RevenueCat entitlement identifier. Must match the entitlement Identifier in RevenueCat dashboard.
 * (RevenueCat ID entl533f4158a4 is for REST API; SDK uses this string key.)
 */
export const ENTITLEMENT_ID = "Finny Pro";

/** Free tier: max Finny messages per calendar day. */
export const FREE_MESSAGES_PER_DAY = 5;

/** MMKV key prefix for daily message count: finny_free_messages_{userId}_{YYYY-MM-DD} */
export const FREE_MESSAGES_COUNT_KEY_PREFIX = "finny_free_messages";

// /lib/api/rateLimiter.js
import { supabase } from "./supabase.js";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

function safeNow() {
  return Date.now();
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];
  if (forwarded && typeof forwarded === "string") {
    const parts = forwarded.split(",");
    if (parts.length > 0) return parts[0].trim();
  }
  const realIp = req.headers["x-real-ip"] || req.headers["X-Real-Ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp;
  return req.socket?.remoteAddress || null;
}

export async function enforceRateLimit({
  key,
  userId,
  limit,
  windowMs,
}) {
  if (!key || !limit || !windowMs) {
    return { allowed: true, remaining: limit ?? Infinity, retryAfterMs: 0 };
  }

  const cacheKey = `rate-limit:${key}`;
  const now = safeNow();
  // Store expiration as epoch millis (number) to match `context_cache.expires_at` bigint
  const windowExpiresAt = now + windowMs;

  try {
    const { data: existing, error: selectError } = await supabase
      .from("context_cache")
      .select("id, cache_data, expires_at")
      .eq("cache_key", cacheKey)
      .eq("data_type", "rate_limit")
      .maybeSingle();

    if (selectError && selectError.code !== "PGRST116") {
      console.error("⚠️ Rate limit lookup failed:", selectError);
      return { allowed: true, remaining: limit, retryAfterMs: 0 };
    }

    // Existing records also store `expires_at` as epoch millis (bigint in DB)
    const expiresAtMs = existing?.expires_at ?? 0;

    let count = 1;
    let expiresAtValue = windowExpiresAt;

    // If we have a non-expired record, reuse its expiration and increment the count
    if (existing && expiresAtMs > now) {
      count = (existing.cache_data?.count || 0) + 1;
      expiresAtValue = expiresAtMs;
    }

    const record = {
      cache_key: cacheKey,
      user_id: userId || ZERO_UUID,
      data_type: "rate_limit",
      cache_data: { count, limit },
      expires_at: expiresAtValue,
    };

    if (existing?.id) {
      record.id = existing.id;
    }

    const { error: upsertError } = await supabase
      .from("context_cache")
      .upsert(record);

    if (upsertError) {
      console.error("⚠️ Rate limit upsert failed:", upsertError);
      return { allowed: true, remaining: limit, retryAfterMs: 0 };
    }

    const allowed = count <= limit;
    const retryAfterMs = allowed
      ? 0
      : Math.max(record.expires_at - now, 0);

    return {
      allowed,
      remaining: Math.max(limit - count, 0),
      retryAfterMs,
    };
  } catch (error) {
    console.error("⚠️ Rate limit enforcement error:", error);
    return { allowed: true, remaining: limit, retryAfterMs: 0 };
  }
}

export async function checkRateLimit(req, {
  scope,
  userId,
  limit,
  windowMs,
}) {
  const ip = getClientIp(req);
  const key = userId
    ? `user:${userId}:${scope}`
    : ip
    ? `ip:${ip}:${scope}`
    : null;

  const baseUserId = userId || (key?.startsWith("ip:") ? ZERO_UUID : null);

  return enforceRateLimit({
    key,
    userId: baseUserId,
    limit,
    windowMs,
  });
}

export function formatRetryAfterSeconds(retryAfterMs) {
  if (!retryAfterMs || retryAfterMs <= 0) return 0;
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

// /lib/api/auth.js
// Shared authentication and authorization utilities for API routes
import { supabase } from "./supabase.js";

/**
 * Verifies JWT token from Authorization header and returns authenticated user
 * @param {Object} req - Request object
 * @returns {Object} { user, error } - Authenticated user or error
 */
export async function verifyAuth(req) {
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

    if (!token) {
      return { user: null, error: "No authorization token provided" };
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(
      token
    );

    if (authError || !authData?.user?.id) {
      return { user: null, error: "Invalid or expired token" };
    }

    return { user: authData.user, error: null };
  } catch (error) {
    console.error("Auth verification error:", error);
    return { user: null, error: "Authentication failed" };
  }
}

/**
 * Verifies that the user_id in request matches the authenticated user
 * @param {Object} req - Request object
 * @param {string} userIdFromRequest - user_id from request body/params
 * @returns {Object} { authorized: boolean, user: Object|null, error: string|null }
 */
export async function verifyUserAuthorization(req, userIdFromRequest) {
  // Verify authentication
  const { user, error: authError } = await verifyAuth(req);

  if (authError || !user) {
    return {
      authorized: false,
      user: null,
      error: authError || "Unauthorized",
    };
  }

  // If no userIdFromRequest provided, allow (for endpoints that don't need it)
  if (!userIdFromRequest) {
    return { authorized: true, user, error: null };
  }

  // Verify user_id matches authenticated user
  if (user.id !== userIdFromRequest) {
    return {
      authorized: false,
      user: null,
      error: "Forbidden: Cannot access another user's data",
    };
  }

  return { authorized: true, user, error: null };
}

/**
 * Middleware-style function to verify user owns an item_id
 * @param {Object} req - Request object
 * @param {string} itemId - item_id to verify ownership
 * @returns {Object} { authorized: boolean, userId: string|null, error: string|null }
 */
export async function verifyItemOwnership(req, itemId) {
  // First verify authentication
  const { user, error: authError } = await verifyAuth(req);

  if (authError || !user) {
    return {
      authorized: false,
      userId: null,
      error: authError || "Unauthorized",
    };
  }

  // Verify user owns this item
  const { data: item, error: itemError } = await supabase
    .from("user_items")
    .select("user_id")
    .eq("item_id", itemId)
    .eq("user_id", user.id)
    .single();

  if (itemError || !item) {
    return {
      authorized: false,
      userId: null,
      error: "Item not found or access denied",
    };
  }

  return { authorized: true, userId: user.id, error: null };
}

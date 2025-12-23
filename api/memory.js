// api/memory.js
// Vercel API Route Handler for Supermemory Profile (GET /api/memory)
// Also handles DELETE and PUT for memory operations
import { supabase } from "../lib/api/supabase.js";
import {
  fetchSupermemoryProfile,
  fetchSupermemoryMemoriesList,
  fetchSupermemoryMemories,
  deleteSupermemoryMemory,
  updateSupermemoryMemory,
  storeOnboardingMemory,
  storeGoalCreationMemory,
  storeMessageFeedback,
  loadUserProfile,
  getCachedSupermemoryDocuments,
  cacheSupermemoryDocuments,
  deleteCachedSupermemoryDocument,
  updateCachedSupermemoryDocument,
} from "../lib/memoryUtils.js";

// Simple in-memory cache for list endpoint (UI display)
// Key: userId, Value: { data: [...], timestamp: number }
const listCache = new Map();
const LIST_CACHE_TTL_MS = 30000; // 30 seconds cache for list endpoint

function getCachedList(userId) {
  const cached = listCache.get(userId);
  if (!cached) return null;
  const age = Date.now() - cached.timestamp;
  if (age > LIST_CACHE_TTL_MS) {
    listCache.delete(userId);
    return null;
  }
  return cached.data;
}

function setCachedList(userId, data) {
  listCache.set(userId, { data, timestamp: Date.now() });
}

function invalidateListCache(userId) {
  listCache.delete(userId);
}

export default async function handler(req, res) {
  // Debug logging
  console.log(`🔍 [MEMORY_API] Request received:`, {
    method: req.method,
    url: req.url,
    query: req.query,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });

  // Derive user from Supabase JWT instead of trusting client context
  let serverUserId = null;

  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

  if (token) {
    const { data: authData, error: authError } = await supabase.auth.getUser(
      token
    );
    if (!authError && authData?.user?.id) {
      serverUserId = authData.user.id;
    }
  }

  if (!serverUserId) {
    console.log(`⚠️ [MEMORY_API] Unauthorized - no userId`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log(`✅ [MEMORY_API] Authenticated user: ${serverUserId}`);

  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).json({});
  }

  // Handle different HTTP methods
  const method = req.method?.toUpperCase() || req.method;
  console.log(`🔍 [MEMORY_API] Processing ${method} request`);

  if (method === "GET") {
    try {
      // Check if requesting profile memories (full list for edit/delete)
      const isProfileMemories = req.query.type === "profile";

      if (isProfileMemories) {
        // Fetch profile memories with caching
        // 1. Check cache first - return immediately if valid
        // 2. Refresh in background if cache is invalid/empty
        
        let cachedMemories = await getCachedSupermemoryDocuments(serverUserId);
        const hasValidCache = cachedMemories !== null && cachedMemories.length > 0;
        
        // Return cached data immediately if available
        if (hasValidCache) {
          console.log(`✅ [MEMORY_API] Returning ${cachedMemories.length} cached memories for user ${serverUserId}`);
          
          // Refresh in background (fire and forget - don't await)
          (async () => {
            try {
              console.log(`🔄 [MEMORY_API] Background refresh for user ${serverUserId}`);
              const freshMemories = await fetchSupermemoryMemories(serverUserId);
              if (Array.isArray(freshMemories) && freshMemories.length > 0) {
                await cacheSupermemoryDocuments(serverUserId, freshMemories);
                console.log(`✅ [MEMORY_API] Background refresh completed for user ${serverUserId}`);
              }
            } catch (error) {
              console.warn(`⚠️ [MEMORY_API] Background refresh failed:`, error.message);
            }
          })();
          
          return res.status(200).json({
            results: cachedMemories,
            memories: cachedMemories, // Keep for backward compatibility
          });
        }
        
        // No valid cache - fetch fresh from API
        console.log(`🔄 [MEMORY_API] No valid cache, fetching fresh memories for user ${serverUserId}`);
        const memories = await fetchSupermemoryMemories(serverUserId);
        const memoriesArray = Array.isArray(memories) ? memories : [];
        
        // Cache the fresh results
        if (memoriesArray.length > 0) {
          await cacheSupermemoryDocuments(serverUserId, memoriesArray);
        }
        
        return res.status(200).json({
          results: memoriesArray,
          memories: memoriesArray, // Keep for backward compatibility
        });
      }

      // Default: Fetch profile and memory summaries from Supermemory
      // Profile is optional - if it fails, we still return memories
      // Using list endpoint for document summaries instead of search
      // Check cache first for list endpoint (UI display optimization)
      let memoriesResult = getCachedList(serverUserId);
      const shouldFetchMemories = memoriesResult === null;

      const [profile, memories] = await Promise.allSettled([
        fetchSupermemoryProfile(serverUserId),
        shouldFetchMemories
          ? fetchSupermemoryMemoriesList(serverUserId, 100) // Use list endpoint with summaries
          : Promise.resolve(memoriesResult),
      ]);

      // Update cache if we fetched fresh data
      if (shouldFetchMemories && memories.status === "fulfilled") {
        setCachedList(serverUserId, memories.value);
        memoriesResult = memories.value;
      } else if (!shouldFetchMemories) {
        // Use cached data
        memoriesResult = memoriesResult || [];
      } else {
        // Fetch failed, use empty array
        memoriesResult = memories.status === "fulfilled" ? memories.value : [];
      }

      // Extract results, handling failures gracefully
      const profileResult =
        profile.status === "fulfilled" ? profile.value : null;

      return res.status(200).json({
        profile: profileResult || null,
        memories: Array.isArray(memoriesResult) ? memoriesResult : [],
      });
    } catch (error) {
      console.error("❌ [SUPERMEMORY_PROFILE] Error:", error);
      return res.status(500).json({
        error: "Failed to fetch Supermemory profile",
        message: error.message,
      });
    }
  } else if (method === "DELETE") {
    // Delete a memory by ID
    try {
      const { memoryId, documentId } = req.query;
      console.log(
        `🔍 [MEMORY_API] DELETE request - memoryId: ${memoryId}, documentId: ${documentId}`
      );

      if (!memoryId) {
        console.log(`⚠️ [MEMORY_API] DELETE - memoryId missing`);
        return res.status(400).json({ error: "memoryId is required" });
      }

      // Use document ID (required), fallback to memory ID if document ID not available
      const idToUse = documentId || memoryId;
      if (!documentId) {
        console.log(
          `⚠️ [MEMORY_API] No document ID provided, using memory ID as fallback: ${memoryId}`
        );
      }

      const result = await deleteSupermemoryMemory(idToUse);

      // Invalidate cache after deletion
      invalidateListCache(serverUserId);
      
      // Delete from database cache
      await deleteCachedSupermemoryDocument(serverUserId, memoryId);

      console.log(`✅ [MEMORY_API] DELETE success for ${memoryId}`);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      console.error("❌ [SUPERMEMORY_DELETE] Error:", {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        memoryId: req?.query?.memoryId,
        documentId: req?.query?.documentId,
        method: req?.method,
        url: req?.url,
      });
      return res.status(500).json({
        error: "Failed to delete memory",
        message: error.message,
      });
    }
  } else if (method === "PUT") {
    // Update a memory by ID
    try {
      const { memoryId, documentId, content, metadata } = req.body;
      console.log(
        `🔍 [MEMORY_API] PUT request - memoryId: ${memoryId}, documentId: ${documentId}, content length: ${
          content?.length || 0
        }`
      );

      if (!memoryId) {
        console.log(`⚠️ [MEMORY_API] PUT - memoryId missing`);
        return res.status(400).json({ error: "memoryId is required" });
      }
      if (!content) {
        console.log(`⚠️ [MEMORY_API] PUT - content missing`);
        return res.status(400).json({ error: "content is required" });
      }

      // Use document ID (required), fallback to memory ID if document ID not available
      const idToUse = documentId || memoryId;
      if (!documentId) {
        console.log(
          `⚠️ [MEMORY_API] No document ID provided, using memory ID as fallback: ${memoryId}`
        );
      }

      const result = await updateSupermemoryMemory(idToUse, {
        content,
        metadata: metadata || {},
      });

      // Invalidate cache after update
      invalidateListCache(serverUserId);
      
      // Update database cache
      await updateCachedSupermemoryDocument(serverUserId, memoryId, {
        content,
        updated_at: new Date().toISOString(),
      });

      console.log(`✅ [MEMORY_API] PUT success for ${memoryId}`);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      console.error("❌ [SUPERMEMORY_UPDATE] Error:", error);
      return res.status(500).json({
        error: "Failed to update memory",
        message: error.message,
      });
    }
  } else if (method === "POST") {
    // Handle different POST types
    try {
      const { type } = req.body;
      console.log(`🔍 [MEMORY_API] POST request - type: ${type}`);

      if (type === "onboarding_profile") {
        // Store onboarding memory
        const { profileData, intentAnswers } = req.body;
        console.log(
          `🔍 [MEMORY_API] POST - onboarding_profile, hasProfileData: ${!!profileData}, hasIntentAnswers: ${!!intentAnswers}`
        );

        const result = await storeOnboardingMemory(
          serverUserId,
          profileData || null,
          intentAnswers || null
        );

        if (!result) {
          console.log(
            `⚠️ [MEMORY_API] POST - failed to store onboarding memory`
          );
          return res.status(500).json({
            error: "Failed to store onboarding memory",
          });
        }

        // Invalidate cache after storing new memory
        invalidateListCache(serverUserId);

        console.log(`✅ [MEMORY_API] POST success - stored onboarding memory`);
        return res.status(200).json({ success: true, result });
      } else if (type === "message_feedback") {
        // Store message feedback (like/dislike)
        const {
          messageId,
          feedbackType,
          finnyResponse,
          userMessage,
          messageMetadata,
          reportText,
        } = req.body;

        console.log(
          `🔍 [MEMORY_API] POST - message_feedback, messageId: ${messageId}, feedbackType: ${feedbackType}`
        );

        if (!messageId || !feedbackType || !finnyResponse || !userMessage) {
          console.log(`⚠️ [MEMORY_API] POST - missing required fields`);
          return res.status(400).json({
            error:
              "Missing required fields: messageId, feedbackType, finnyResponse, userMessage",
          });
        }

        if (feedbackType !== "positive" && feedbackType !== "negative") {
          console.log(
            `⚠️ [MEMORY_API] POST - invalid feedbackType: ${feedbackType}`
          );
          return res.status(400).json({
            error: "feedbackType must be 'positive' or 'negative'",
          });
        }

        // Load user profile to get finny_style preference and user name
        let finnyStyle = null;
        let userName = null;
        try {
          const profile = await loadUserProfile(serverUserId);
          finnyStyle = profile?.finny_style || null;
          userName = profile?.name || null;
        } catch (error) {
          console.warn(
            `⚠️ [MEMORY_API] Could not load profile, continuing without it:`,
            error.message
          );
        }

        // Add finny_style and userName to messageMetadata if available
        const enrichedMetadata = {
          ...(messageMetadata || {}),
          finny_style: finnyStyle,
          userName: userName,
        };

        const result = await storeMessageFeedback(
          serverUserId,
          messageId,
          feedbackType,
          finnyResponse,
          userMessage,
          enrichedMetadata,
          reportText || null
        );

        if (!result) {
          console.log(
            `⚠️ [MEMORY_API] POST - failed to store message feedback`
          );
          return res.status(500).json({
            error: "Failed to store message feedback",
          });
        }

        // Invalidate cache after storing new memory
        invalidateListCache(serverUserId);

        console.log(`✅ [MEMORY_API] POST success - stored message feedback`);
        return res.status(200).json({ success: true, result });
      } else if (type === "goal_creation") {
        // Store goal creation memory
        const { goalData, createdVia } = req.body;
        console.log(
          `🔍 [MEMORY_API] POST - goal_creation, goalId: ${goalData?.id}, createdVia: ${createdVia}`
        );

        if (!goalData || !goalData.id) {
          console.log(`⚠️ [MEMORY_API] POST - missing required fields`);
          return res.status(400).json({
            error: "Missing required fields: goalData with id",
          });
        }

        const result = await storeGoalCreationMemory(
          serverUserId,
          goalData,
          createdVia || "goals_screen",
          {}
        );

        if (!result) {
          console.log(
            `⚠️ [MEMORY_API] POST - failed to store goal creation memory`
          );
          return res.status(500).json({
            error: "Failed to store goal creation memory",
          });
        }

        // Invalidate cache after storing new memory
        invalidateListCache(serverUserId);

        console.log(`✅ [MEMORY_API] POST success - stored goal creation memory`);
        return res.status(200).json({ success: true, result });
      } else {
        console.log(`⚠️ [MEMORY_API] POST - unsupported type: ${type}`);
        return res.status(400).json({
          error: "Unsupported type",
          supportedTypes: [
            "onboarding_profile",
            "message_feedback",
            "goal_creation",
          ],
        });
      }
    } catch (error) {
      console.error("❌ [SUPERMEMORY_POST] Error:", error);
      return res.status(500).json({
        error: "Failed to store memory",
        message: error.message,
      });
    }
  } else {
    console.log(`⚠️ [MEMORY_API] Method not allowed: ${method}`);
    return res.status(405).json({
      error: "Method not allowed",
      receivedMethod: method,
      allowedMethods: ["GET", "DELETE", "PUT", "POST"],
    });
  }
}
// Note: All utility functions have been moved to lib/memoryUtils.js
// This file now only contains the Vercel API route handler

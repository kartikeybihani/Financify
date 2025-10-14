import { Supermemory } from "supermemory";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Supermemory client
const supermemoryClient = new Supermemory({
  apiKey:
    process.env.SUPERMEMORY_KEY ||
    "sm_qCVxTPU3rydaSushnrMase_VjPiglvEVJZJgrKlZgXcntHMMaNAinHgCiRMcVnlKPKUFwzlqfqnDuwihBVzpQBc",
});

/**
 * Add user message to Supermemory
 */
export async function addUserMessageToSupermemory(
  userId,
  message,
  metadata = {}
) {
  try {
    console.log("🧠 [SUPERMEMORY] Adding user message for user:", userId);

    const result = await supermemoryClient.memories.add({
      content: message,
      containerTag: `user_${userId}_life`,
      metadata: {
        type: "user_message",
        timestamp: new Date().toISOString(),
        userId: userId,
        ...metadata,
      },
    });

    console.log("✅ [SUPERMEMORY] Memory added:", result.id);
    return result;
  } catch (error) {
    console.error(
      "❌ [SUPERMEMORY] Failed to add user message:",
      error.message
    );
    return null;
  }
}

/**
 * Add AI response to Supermemory
 */
export async function addAIResponseToSupermemory(
  userId,
  userMessage,
  aiResponse,
  metadata = {}
) {
  try {
    console.log("🧠 [SUPERMEMORY] Adding AI response for user:", userId);

    const result = await supermemoryClient.memories.add({
      content: `User: ${userMessage}\nAI: ${aiResponse}`,
      containerTag: `user_${userId}_life`,
      metadata: {
        type: "conversation_exchange",
        timestamp: new Date().toISOString(),
        userId: userId,
        ...metadata,
      },
    });

    console.log("✅ [SUPERMEMORY] Conversation memory added:", result.id);
    return result;
  } catch (error) {
    console.error("❌ [SUPERMEMORY] Failed to add AI response:", error.message);
    return null;
  }
}

/**
 * Search user memories
 */
export async function searchUserMemories(userId, query, limit = 5) {
  try {
    console.log(
      "🔍 [SUPERMEMORY] Searching memories for user:",
      userId,
      "query:",
      query
    );

    const result = await supermemoryClient.search.memories({
      q: query,
      containerTag: `user_${userId}_life`,
      limit: limit,
    });

    console.log(
      "✅ [SUPERMEMORY] Search completed, found:",
      result.results?.length || 0,
      "memories"
    );
    return result;
  } catch (error) {
    console.error("❌ [SUPERMEMORY] Failed to search memories:", error.message);
    return { results: [] };
  }
}

/**
 * Get user's recent memories
 */
export async function getUserRecentMemories(userId, limit = 10) {
  try {
    console.log("📚 [SUPERMEMORY] Getting recent memories for user:", userId);

    const result = await supermemoryClient.memories.list({
      containerTag: `user_${userId}_life`,
      limit: limit,
    });

    console.log(
      "✅ [SUPERMEMORY] Retrieved",
      result.memories?.length || 0,
      "recent memories"
    );
    return result;
  } catch (error) {
    console.error(
      "❌ [SUPERMEMORY] Failed to get recent memories:",
      error.message
    );
    return { memories: [] };
  }
}

/**
 * Extract user ID from request (similar to finny.js pattern)
 */
async function extractUserIdFromRequest(req) {
  try {
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
        return authData.user.id;
      }
    }
  } catch (error) {
    console.error("⚠️ [SUPERMEMORY] Auth verification failed:", error?.message);
  }

  return null;
}

/**
 * Main API handler
 */
export default async function handler(req, res) {
  console.log("🧠 [SUPERMEMORY API] Request received:", req.method);

  if (req.method !== "POST") {
    console.log("❌ [SUPERMEMORY API] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, message, query, limit, metadata } = req.body;
  console.log("📝 [SUPERMEMORY API] Action:", action);

  // Extract user ID from JWT
  const userId = await extractUserIdFromRequest(req);
  if (!userId) {
    console.log("❌ [SUPERMEMORY API] No authenticated user found");
    return res.status(401).json({ error: "Authentication required" });
  }

  console.log("👤 [SUPERMEMORY API] Authenticated user:", userId);

  try {
    let result;

    switch (action) {
      case "add_message":
        if (!message) {
          return res.status(400).json({ error: "Message is required" });
        }
        result = await addUserMessageToSupermemory(userId, message, metadata);
        break;

      case "add_conversation":
        const { userMessage, aiResponse } = req.body;
        if (!userMessage || !aiResponse) {
          return res
            .status(400)
            .json({ error: "userMessage and aiResponse are required" });
        }
        result = await addAIResponseToSupermemory(
          userId,
          userMessage,
          aiResponse,
          metadata
        );
        break;

      case "search":
        if (!query) {
          return res.status(400).json({ error: "Query is required" });
        }
        result = await searchUserMemories(userId, query, limit);
        break;

      case "get_recent":
        result = await getUserRecentMemories(userId, limit);
        break;

      default:
        return res.status(400).json({
          error:
            "Invalid action. Supported: add_message, add_conversation, search, get_recent",
        });
    }

    console.log("✅ [SUPERMEMORY API] Action completed successfully");
    return res.status(200).json({
      success: true,
      action,
      userId,
      data: result,
    });
  } catch (error) {
    console.error("❌ [SUPERMEMORY API] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      action,
      userId,
    });
  }
}

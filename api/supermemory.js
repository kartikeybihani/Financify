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
    "sm_qCVxTPU3rydaSushnrMase_FntVFeCDBNjZgZbIiFdpByXYFthaMEgNfFFeUjZNkbYgmzwCKxNmJxemIyChZGWI",
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

    return result;
  } catch (error) {
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

    return result;
  } catch (error) {
    return null;
  }
}

/**
 * Search user memories
 */
export async function searchUserMemories(userId, query, limit = 5) {
  try {
    const result = await supermemoryClient.search.memories({
      q: query,
      containerTag: `user_${userId}_life`,
      limit: limit,
    });

    return result;
  } catch (error) {
    return { results: [] };
  }
}

/**
 * Get user's recent memories
 */
export async function getUserRecentMemories(userId, limit = 10) {
  try {
    const result = await supermemoryClient.memories.list({
      containerTag: `user_${userId}_life`,
      limit: limit,
    });

    return result;
  } catch (error) {
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
  } catch (error) {}

  return null;
}

/**
 * Main API handler
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, message, query, limit, metadata } = req.body;

  // Extract user ID from JWT
  const userId = await extractUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

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

    return res.status(200).json({
      success: true,
      action,
      userId,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      action,
      userId,
    });
  }
}

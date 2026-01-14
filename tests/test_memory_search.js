#!/usr/bin/env node

/**
 * Test script for Supermemory v4/search API endpoint (only)
 *
 * Usage:
 *   Default search:
 *     node test_memory_search.js "your query"
 *
 *   Memories-only search (searchMode: 'memories'):
 *     node test_memory_search.js "your query" -m
 *
 * Examples:
 *   node test_memory_search.js "what do you know about my goals"
 *   node test_memory_search.js "what do you know about my goals" -m
 */

const SUPERMEMORY_API_KEY =
  "sm_qCVxTPU3rydaSushnrMase_LNJzFEYUWVctsameqfqSaSfMAZzRdhubMrLqudWogbBQuYBPudcxAJOtgCxQcMGw";
const SUPERMEMORY_BASE_URL = "https://api.supermemory.ai";
const SUPERMEMORY_FETCH_TIMEOUT_MS = 15000;

// Fetch with timeout wrapper
async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = SUPERMEMORY_FETCH_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
}

// Search Supermemory using v4/search (default mode)
async function searchSupermemoryMemories(userId, query, options = {}) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("⚠️ SUPERMEMORY_API_KEY environment variable is not set");
  }

  if (!userId) {
    throw new Error("⚠️ userId is required");
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    throw new Error("⚠️ Query is required and must be a non-empty string");
  }

  const { limit = 10, threshold = 0.4 } = options;

  try {
    console.log(`\n🔍 Searching (default mode) for user: ${userId}`);
    console.log(`📝 Query: "${query}"`);
    console.log(`⚙️  Options: limit=${limit}, threshold=${threshold}\n`);

    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v4/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query.trim(),
          limit: limit,
          threshold: threshold,
          rerank: true,
          rewriteQuery: true,
          include: {
            documents: true,
            summaries: false,
            relatedmemories: true,
          },
          containerTag: `user_${userId}`,
        }),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after") || "60";
        throw new Error(`⚠️ Rate limit exceeded, retry after ${retryAfter}s`);
      }

      throw new Error(
        `❌ API error: ${
          errorData.message || errorData.error?.message || response.statusText
        } (${response.status})`
      );
    }

    const result = await response.json();
    const memories = result.results || [];

    if (!Array.isArray(memories)) {
      throw new Error(
        `⚠️ Unexpected response format, results is not an array: ${typeof memories}`
      );
    }

    return {
      memories,
      timing: result.timing || null,
      total: result.total || memories.length,
    };
  } catch (error) {
    throw new Error(`❌ Error searching memories: ${error.message}`);
  }
}

// Search Supermemory with searchMode: 'memories' (memories only, not documents)
async function searchSupermemoryMemoriesOnly(userId, query, options = {}) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("⚠️ SUPERMEMORY_API_KEY environment variable is not set");
  }

  if (!userId) {
    throw new Error("⚠️ userId is required");
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    throw new Error("⚠️ Query is required and must be a non-empty string");
  }

  const {
    limit = 10,
    threshold = 0.3,
    filters = null,
    rerank = false,
    rewriteQuery = false,
    quiet = false,
  } = options;

  try {
    if (!quiet) {
      console.log(
        `\n🔍 Searching MEMORIES ONLY (searchMode: 'memories') for user: ${userId}`
      );
      console.log(`📝 Query: "${query}"`);
      console.log(
        `⚙️  Options: limit=${limit}, threshold=${threshold}, rerank=${rerank}, rewriteQuery=${rewriteQuery}\n`
      );
    }

    const requestBody = {
      q: query.trim(),
      containerTag: `user_${userId}`,
      threshold: threshold,
      include: {
        documents: false,
        summaries: false,
        relatedMemories: false,
        forgottenMemories: false,
        chunks: false,
      },
      limit: limit,
      rerank: rerank,
      rewriteQuery: rewriteQuery,
      searchMode: "memories",
    };

    // Add filters if provided
    if (filters) {
      requestBody.filters = filters;
    }

    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v4/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after") || "60";
        throw new Error(`⚠️ Rate limit exceeded, retry after ${retryAfter}s`);
      }

      throw new Error(
        `❌ API error: ${
          errorData.message || errorData.error?.message || response.statusText
        } (${response.status})`
      );
    }

    const result = await response.json();
    const memories = result.results || [];

    if (!Array.isArray(memories)) {
      throw new Error(
        `⚠️ Unexpected response format, results is not an array: ${typeof memories}`
      );
    }

    // Debug: Log raw response structure for memories-only mode when no results
    if (memories.length === 0) {
      console.log("\n🔍 Debug: Raw API response structure:");
      console.log(JSON.stringify(result, null, 2));
    }

    return {
      memories,
      timing: result.timing || null,
      total: result.total || memories.length,
    };
  } catch (error) {
    throw new Error(`❌ Error searching memories: ${error.message}`);
  }
}

// v3/search removed intentionally (v4/search only)

// Format and display results - only main content and modes
function displayResults(results, query) {
  const { memories, timing, total } = results;

  console.log("=".repeat(80));
  console.log("📊 SEARCH RESULTS");
  console.log("=".repeat(80));
  console.log(`Query: "${query}"`);
  console.log(`Total matches: ${total}`);
  console.log(`Returned: ${memories.length}`);
  if (timing) console.log(`Response time: ${timing}ms`);
  console.log("=".repeat(80));

  if (memories.length === 0) {
    console.log("\n❌ No results found matching your query.\n");
    return;
  }

  // Calculate average similarity
  const avgSimilarity =
    memories.length > 0
      ? memories.reduce((sum, m) => sum + (m.similarity || 0), 0) /
        memories.length
      : 0;
  console.log(`Average similarity score: ${avgSimilarity.toFixed(3)}\n`);

  const memoryCount = memories.filter((m) => m.mode === "memory").length;
  if (memoryCount > 0) {
    console.log("📊 Results by endpoint:");
    console.log(`   🧠 Memories (v4/search): ${memoryCount}`);
    console.log("");
  }

  memories.forEach((item, index) => {
    console.log(`\n${"-".repeat(80)}`);
    const mode = item.mode || "unknown";
    const endpoint =
      mode === "memory" ? "MEMORY (v4/search)" : mode.toUpperCase();
    console.log(
      `📌 Result #${index + 1} [${endpoint}] (Similarity: ${(
        item.similarity || 0
      ).toFixed(3)})`
    );
    console.log(`${"-".repeat(80)}`);

    // Extract main content - prioritize memory/content fields
    let mainContent = "";
    if (item.memory) {
      mainContent = item.memory;
    } else if (item.content) {
      mainContent = item.content;
    } else if (item.text) {
      mainContent = item.text;
    } else if (item.summary) {
      mainContent = item.summary;
    } else if (item.title) {
      mainContent = item.title;
    } else if (item.body) {
      mainContent = item.body;
    } else {
      mainContent = "N/A";
    }

    console.log(`Content:\n${mainContent}`);
  });

  console.log(`${"=".repeat(80)}`);
}

// Main function
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node test_memory_search.js "your query" [mode]');
    console.error("\nModes:");
    console.error("  -m        - Memories only");
    console.error("\nExamples:");
    console.error("  # Default search:");
    console.error(
      '  node test_memory_search.js "what do you know about my goals"'
    );
    console.error("  # Search memories only:");
    console.error(
      '  node test_memory_search.js "what do you know about my goals" -m'
    );
    console.error("\nEnvironment variables required:");
    console.error("  SUPERMEMORY_API_KEY - Your Supermemory API key");
    process.exit(1);
  }

  const query = args[0];
  const memoriesOnly = args.includes("--memories-only") || args.includes("-m");

  // Always use the default userId from the file
  const userId = "f948c4ab-dc68-41d5-89bf-1935653cca37";

  try {
    let results;
    if (memoriesOnly) {
      // Use memories-only search mode
      const memoriesResult = await searchSupermemoryMemoriesOnly(
        userId,
        query,
        {
          limit: 10,
          threshold: 0.3,
          rerank: false,
          rewriteQuery: false,
        }
      );
      // Add mode labels to results
      results = {
        ...memoriesResult,
        memories: memoriesResult.memories.map((m) => ({
          ...m,
          mode: "memory",
        })),
      };
    } else {
      // Default: v4/search
      const memoriesResult = await searchSupermemoryMemories(userId, query, {
        limit: 10,
        threshold: 0.4,
      });
      results = {
        ...memoriesResult,
        memories: memoriesResult.memories.map((m) => ({
          ...m,
          mode: "memory",
        })),
      };
    }

    displayResults(results, query);
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
}

// Run the script
main();

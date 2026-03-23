#!/usr/bin/env node

/**
 * Test script for Supermemory v4/search API endpoint (only)
 *
 * Usage:
 *   Default search:
 *     node test_memory_search.js "your query"
 *
 *   Base profile memories (all memories like detailed-memories screen):
 *     node test_memory_search.js --base
 *
 * Examples:
 *   node test_memory_search.js "what do you know about my goals"
 *   node test_memory_search.js --base
 */

const SUPERMEMORY_API_KEY =
  "sm_qCVxTPU3rydaSushnrMase_LNJzFEYUWVctsameqfqSaSfMAZzRdhubMrLqudWogbBQuYBPudcxAJOtgCxQcMGw";
const SUPERMEMORY_BASE_URL = "https://api.supermemory.ai";
const SUPERMEMORY_FETCH_TIMEOUT_MS = 15000;

// Fetch with timeout wrapper
async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = SUPERMEMORY_FETCH_TIMEOUT_MS,
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
          rerank: false,
          rewriteQuery: false,
          include: {
            documents: true,
            summaries: false,
            relatedmemories: true,
          },
          containerTag: `user_${userId}`,
        }),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS,
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
        } (${response.status})`,
      );
    }

    const result = await response.json();
    const memories = result.results || [];

    if (!Array.isArray(memories)) {
      throw new Error(
        `⚠️ Unexpected response format, results is not an array: ${typeof memories}`,
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

// Fetch all profile memories (same as detailed-memories screen)
async function fetchProfileMemories(userId) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("⚠️ SUPERMEMORY_API_KEY environment variable is not set");
  }

  if (!userId) {
    throw new Error("⚠️ userId is required");
  }

  try {
    console.log(`\n🔍 Fetching all profile memories for user: ${userId}`);
    console.log(`⚙️  Query: "*" (all memories)`);
    console.log(
      `⚙️  Options: limit=100, threshold=0.0, searchMode='memories'\n`,
    );

    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v4/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: "*", // Broad query to get all memories
          limit: 100, // Get up to 100 memories
          threshold: 0.0, // Low threshold to get all results
          rerank: false,
          rewriteQuery: false,
          containerTag: `user_${userId}`,
          searchMode: "memories",
        }),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS,
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
        } (${response.status})`,
      );
    }

    const result = await response.json();
    const memories = result.results || [];

    if (!Array.isArray(memories)) {
      throw new Error(
        `⚠️ Unexpected response format, results is not an array: ${typeof memories}`,
      );
    }

    return {
      memories,
      timing: result.timing || null,
      total: result.total || memories.length,
    };
  } catch (error) {
    throw new Error(`❌ Error fetching profile memories: ${error.message}`);
  }
}

// Format and display profile memories (like detailed-memories screen)
function displayProfileMemories(results) {
  const { memories, timing, total } = results;

  console.log("=".repeat(80));
  console.log("📊 PROFILE MEMORIES (All Memories)");
  console.log("=".repeat(80));
  console.log(`Total memories: ${total}`);
  console.log(`Returned: ${memories.length}`);
  if (timing) console.log(`Response time: ${timing}ms`);
  console.log("=".repeat(80));

  if (memories.length === 0) {
    console.log("\n❌ No memories found.\n");
    return;
  }

  // Sort by date (newest first) - same as detailed-memories screen
  const sortedMemories = [...memories].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  console.log(`\n📅 Sorted by date (newest first)\n`);

  sortedMemories.forEach((memory, index) => {
    console.log(`\n${"-".repeat(80)}`);
    console.log(`📌 Memory #${index + 1}`);
    console.log(`${"-".repeat(80)}`);

    // Format date (same as detailed-memories screen)
    const dateStr =
      memory.updatedAt ||
      memory.documents?.[0]?.updatedAt ||
      memory.documents?.[0]?.createdAt ||
      memory.createdAt ||
      "N/A";
    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    console.log(`Date: ${formattedDate}`);

    // Show memory text (main content) - same as detailed-memories screen
    const memoryText = memory.memory || memory.content || "";
    if (memoryText) {
      console.log(`\nMemory:`);
      console.log(memoryText);
    }

    // Show document summary if available and different from memory
    const summary = memory.documents?.[0]?.summary || memory.summary || null;
    if (summary && summary !== memoryText) {
      console.log(`\nSummary (document):`);
      console.log(summary);
    }

    // Show additional metadata if available
    if (memory.id) {
      console.log(`\nID: ${memory.id}`);
    }
    if (memory.similarity !== undefined) {
      console.log(`Similarity: ${memory.similarity.toFixed(3)}`);
    }
  });

  console.log(`\n${"=".repeat(80)}`);
}

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
      ).toFixed(3)})`,
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

  // Check for --base flag first (profile memories test)
  const isBaseTest = args.includes("--base");

  if (isBaseTest) {
    // Always use the default userId from the file
    const userId = "f948c4ab-dc68-41d5-89bf-1935653cca37";

    try {
      const results = await fetchProfileMemories(userId);
      displayProfileMemories(results);
    } catch (error) {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    return;
  }

  if (args.length === 0) {
    console.error('Usage: node test_memory_search.js "your query" [mode]');
    console.error("\nModes:");
    console.error(
      "  --base    - Fetch all profile memories (like detailed-memories screen)",
    );
    console.error("\nExamples:");
    console.error("  # Default search:");
    console.error(
      '  node test_memory_search.js "what do you know about my goals"',
    );
    console.error("  # Fetch all profile memories:");
    console.error("  node test_memory_search.js --base");
    console.error("\nEnvironment variables required:");
    console.error("  SUPERMEMORY_API_KEY - Your Supermemory API key");
    process.exit(1);
  }

  const query = args[0];

  // Always use the default userId from the file
  const userId = "f948c4ab-dc68-41d5-89bf-1935653cca37";

  try {
    // Default: v4/search
    const memoriesResult = await searchSupermemoryMemories(userId, query, {
      limit: 10,
      threshold: 0.4,
    });
    const results = {
      ...memoriesResult,
      memories: memoriesResult.memories.map((m) => ({
        ...m,
        mode: "memory",
      })),
    };

    displayResults(results, query);
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
}

// Run the script
main();

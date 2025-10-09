/**
 * Brave Search API helper for Finny web research
 * Provides fresh web data for financial queries that need current information
 */

export async function braveSearch(query) {
  try {
    console.log("🔍 [BRAVE] Searching for:", query);

    // Check if API key is available
    if (!process.env.BRAVE_API_KEY) {
      console.warn("⚠️ [BRAVE] No API key found, skipping web search");
      return [];
    }

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query
      )}`,
      {
        headers: {
          "X-Subscription-Token": process.env.BRAVE_API_KEY,
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (!response.ok) {
      console.error(
        "❌ [BRAVE] API request failed:",
        response.status,
        response.statusText
      );
      return [];
    }

    const data = await response.json();

    // Extract top 3 results
    const results =
      data.web?.results?.slice(0, 3).map((result, index) => ({
        title: result.title || `Result ${index + 1}`,
        url: result.url || "",
        snippet:
          result.description || result.snippet || "No description available",
      })) || [];

    console.log(
      `✅ [BRAVE] Found ${results.length} results for query: "${query}"`
    );
    return results;
  } catch (error) {
    console.error("❌ [BRAVE] Search failed:", error.message);
    return [];
  }
}

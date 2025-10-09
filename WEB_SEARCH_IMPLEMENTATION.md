# Web Search Implementation for Finny

## Overview

Finny now includes web search capabilities to provide fresh, current financial information when needed. The system automatically detects when a query requires web data and fetches relevant information using the Brave Search API.

## Features Implemented

### 1. Brave Search Helper (`/lib/websearch/brave.js`)
- `braveSearch(query)` function that fetches top 3 web results
- Handles API errors gracefully
- Returns structured data with title, URL, and snippet

### 2. Web Search Detection
- **Primary**: Uses classification result `needs_web` flag from the classification system
- **Fallback**: Keyword-based detection for current rates, limits, regulations, policy changes, etc.
- Time-sensitive queries (2025, 2024, latest, new, updated)
- Regulatory queries (limits, rules, brackets, rates)

### 3. Integration with Finny
- Web search results are automatically included in system prompt
- Results are formatted as "WEB CONTEXT" section
- No blocking - if web search fails, Finny continues normally

### 4. Enhanced Logging
- `web_research: true/false` field in conversation logs
- `brave-search` added to `sources_used` when web search is performed
- Web search timing included in metrics

## Setup Required

### Environment Variable
```bash
BRAVE_API_KEY=your_brave_api_key_here
```

Get your API key from: https://brave.com/search/api/

## Example Queries That Trigger Web Search

- "What is the current Roth IRA limit for 2025?"
- "What are the latest mortgage rates?"
- "What's the current inflation rate?"
- "What are the new tax rules for 2025?"
- "Current 401k contribution limits"
- "Latest Fed interest rates"

## Example Queries That DON'T Trigger Web Search

- "How much did I spend last month?"
- "Show me my investment portfolio"
- "What's my net worth?"
- "Tell me about my goals"

## How It Works

1. User asks a question
2. `handleAsk()` calls classification to get `needs_web` flag
3. If `needs_web` is true, OR if keyword fallback detects web search needed:
   - Calls `braveSearch()` with the user's message
   - Formats results into readable web context
   - Adds to system prompt as "WEB CONTEXT" section
4. Finny processes the request with both user data and web context
5. Response includes current information from web search

## Benefits

- **Fresh Data**: Always provides current rates, limits, and regulations
- **No Manual Updates**: Automatically fetches latest information
- **Seamless Integration**: Works transparently with existing Finny features
- **Graceful Fallback**: Continues working even if web search fails
- **Comprehensive Logging**: Tracks web search usage for analytics

## Future Enhancements

- Caching of web search results
- Multiple search providers for redundancy
- Query relevance scoring
- Rate limiting and cost optimization

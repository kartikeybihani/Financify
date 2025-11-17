# 🗺️ Finny AI Flow Map - Complete Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    👤 USER SENDS MESSAGE                                 │
│                    "What's my net worth?"                                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  📱 FRONTEND: app/(tabs)/chat/index.tsx                                 │
│  └─ handleSend()                                                        │
│     ├─ Adds message to UI                                               │
│     ├─ Sets typing indicator                                            │
│     └─ Calls handleUserMessage()                                        │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🎣 HOOK: src/hooks/useChat.ts                                          │
│  └─ handleFinnyResponse()                                               │
│     ├─ Gets fresh access token                                          │
│     ├─ Shows progress: "Brewing up some financial wisdom..."            │
│     └─ Makes API call #1: CLASSIFY                                      │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🔍 API CALL #1: POST /api/finny                                        │
│  Action: "classify"                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 📍 api/finny.js → handleClassify()                                │ │
│  │                                                                   │ │
│  │ 1️⃣ Check Classification Cache (in-memory)                        │ │
│  │    ├─ Cache hit? → Return immediately (0ms) ✅                   │ │
│  │    └─ Cache miss? → Continue...                                  │ │
│  │                                                                   │ │
│  │ 2️⃣ Heuristic Pre-checks (no LLM needed)                          │ │
│  │    ├─ detectGoalIntent() → Goal query?                           │ │
│  │    ├─ financialConceptHeuristic() → Financial concept?           │ │
│  │    ├─ detectWebSearchNeeded() → Needs web search?                │ │
│  │    └─ detectOffTopic() → Off-topic?                              │ │
│  │    └─ If match → Return result (0ms) ✅                          │ │
│  │                                                                   │ │
│  │ 3️⃣ LLM Classification (if no heuristic match)                    │ │
│  │    └─ OpenRouter API Call                                         │ │
│  │       ├─ Model: OPENROUTER_MODEL (Grok)                          │ │
│  │       ├─ Temperature: 0.1                                         │ │
│  │       ├─ Max tokens: 350                                          │ │
│  │       └─ Returns: { intent, needs_web, needs_user_data }         │ │
│  │                                                                   │ │
│  │ 4️⃣ Cache Result (1 hour TTL)                                      │ │
│  │                                                                   │ │
│  │ Output: { intent: "ask_personalized", needs_web: false, ... }    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🎯 ROUTING DECISION                                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Based on intent:                                                  │ │
│  │                                                                   │ │
│  │ • "ask_personalized" → handleAsk()                                │ │
│  │ • "goal_conversation" → handleGoalConversation()                  │ │
│  │ • "off_topic" → handleOffTopic()                                  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼ (Following "ask_personalized" path)
┌─────────────────────────────────────────────────────────────────────────┐
│  📊 CONTEXT PLANNING (Deterministic - No API calls)                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ extractSlots(message)                                             │ │
│  │ ├─ Topic: "spend" | "invest" | "accounts" | "goals"              │ │
│  │ ├─ Category: "Food" | "Shopping" | etc.                          │ │
│  │ ├─ Period: "last month" | "this month"                           │ │
│  │ └─ Merchant: "Chipotle" | "Starbucks" | etc.                     │ │
│  │                                                                   │ │
│  │ planNeeds(slots, message)                                         │ │
│  │ └─ Returns: ["summary_min", "spend_total", "txns_by_category"]   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🌐 WEB SEARCH? (Conditional)                                           │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ IF needs_web === true:                                            │ │
│  │                                                                   │ │
│  │ 1️⃣ enhanceSearchQuery()                                          │ │
│  │    ├─ Personal investment query? → Fetch user holdings           │ │
│  │    └─ Generate targeted search queries                           │ │
│  │                                                                   │ │
│  │ 2️⃣ limitedBraveSearch() (Rate-limited queue)                    │ │
│  │    ├─ Max 3 concurrent requests                                  │ │
│  │    ├─ 1 second delay between requests                            │ │
│  │    ├─ 10 second timeout                                          │ │
│  │    └─ Brave Search API Call(s)                                   │ │
│  │                                                                   │ │
│  │ API Calls: 0-3 Brave Search API calls                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  📦 CONTEXT BUILDING: buildContextPacks()                               │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ For each "need" in planned needs:                                 │ │
│  │                                                                   │ │
│  │ 1️⃣ Check Cache (Two-tier)                                        │ │
│  │    ├─ In-memory cache (fastest)                                  │ │
│  │    ├─ Persistent cache (Supabase context_cache table)            │ │
│  │    └─ Cache hit? → Use immediately ✅                            │ │
│  │                                                                   │ │
│  │ 2️⃣ Fetch Data (if not cached)                                    │ │
│  │    └─ Parallel Supabase RPC Calls:                               │ │
│  │       ├─ get_net_worth()                                         │ │
│  │       ├─ get_recent_transactions()                               │ │
│  │       ├─ get_spend_by_category()                                 │ │
│  │       ├─ get_spend_summary()                                     │ │
│  │       ├─ get_transactions_by_category()                          │ │
│  │       ├─ get_investment_overview()                               │ │
│  │       ├─ get_goals_overview()                                    │ │
│  │       └─ get_cashflow_monthly()                                  │ │
│  │                                                                   │ │
│  │ 3️⃣ Cache Results                                                 │ │
│  │    ├─ In-memory cache (50% of persistent TTL)                    │ │
│  │    └─ Persistent cache (Supabase)                                │ │
│  │                                                                   │ │
│  │ API Calls: 0-8 Supabase RPC calls (parallel)                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  📈 STOCK QUERY? (Conditional)                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ IF looksLikeStockQuery(message):                                  │ │
│  │                                                                   │ │
│  │ 1️⃣ resolveTickerForQuery()                                       │ │
│  │    └─ Extract ticker symbol from message                         │ │
│  │                                                                   │ │
│  │ 2️⃣ Fetch Stock Data                                              │ │
│  │    ├─ Simple: fetchStockSnapshot()                               │ │
│  │    └─ Deep: planStockRequest() → executeStockPlan()              │ │
│  │                                                                   │ │
│  │ 3️⃣ Generate Response                                             │ │
│  │    └─ buildStockDataSummary() (deterministic, no LLM)            │ │
│  │                                                                   │ │
│  │ API Calls: 1-5 Finnhub API calls                                 │ │
│  │ Early return if stock query ✅                                    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🧠 PARALLEL PROCESSING                                                 │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                                                                   │ │
│  │ ┌─────────────────────────┐  ┌──────────────────────────────┐   │ │
│  │ │ MEMORY EXTRACTION       │  │ MAIN LLM RESPONSE            │   │ │
│  │ │ (Parallel)              │  │                              │   │ │
│  │ │                         │  │                              │   │ │
│  │ │ 1️⃣ Pre-gate Check      │  │ 1️⃣ Build System Prompt      │   │ │
│  │ │    └─ shouldRunMemory   │  │    ├─ Personality & style    │   │ │
│  │ │       Extraction()      │  │    ├─ User memory context    │   │ │
│  │ │                         │  │    ├─ Financial data context │   │ │
│  │ │ 2️⃣ Quick Extract       │  │    ├─ Web search results     │   │ │
│  │ │    └─ quickExtract()    │  │    └─ Conversation context   │   │ │
│  │ │       (1ms, regex)      │  │                              │   │ │
│  │ │                         │  │ 2️⃣ OpenRouter API Call      │   │ │
│  │ │ 3️⃣ LLM Validation      │  │    ├─ Model: OPENROUTER_MODEL│   │ │
│  │ │    └─ validateMemories  │  │    ├─ Temperature: 0.6       │   │ │
│  │ │       WithSmallModel()  │  │    ├─ Max tokens: 1200       │   │ │
│  │ │       (if passed gate)  │  │    └─ Streaming: Optional    │   │ │
│  │ │                         │  │                              │   │ │
│  │ │ 4️⃣ Fallback Extract    │  │ 3️⃣ Process Response         │   │ │
│  │ │    └─ fallbackExtract   │  │    ├─ Clean markdown         │   │ │
│  │ │       Candidates()       │  │    ├─ Split long responses   │   │ │
│  │ │                         │  │    └─ Format for display     │   │ │
│  │ │ 5️⃣ Save Memories       │  │                              │   │ │
│  │ │    └─ saveMemory        │  │                              │   │ │
│  │ │       Candidates()       │  │                              │   │ │
│  │ │       (async, non-block)│  │                              │   │ │
│  │ │                         │  │                              │   │ │
│  │ │ API: 0-1 OpenRouter     │  │ API: 1 OpenRouter call       │   │ │
│  │ └─────────────────────────┘  └──────────────────────────────┘   │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  📝 POST-PROCESSING                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                                                                   │ │
│  │ 1️⃣ Update Conversation Context                                   │ │
│  │    ├─ detectConversationTopic()                                  │ │
│  │    ├─ Extract entities (stocks, amounts, categories)             │ │
│  │    └─ updateConversationContext() (Supabase)                     │ │
│  │                                                                   │ │
│  │ 2️⃣ Log Conversation                                              │ │
│  │    ├─ logConversation() (async, non-blocking)                    │ │
│  │    ├─ Stores: message, response, intent, metrics                 │ │
│  │    └─ Retry logic (3 attempts)                                   │ │
│  │                                                                   │ │
│  │ 3️⃣ Format Response                                               │ │
│  │    ├─ cleanResponseFormatting()                                  │ │
│  │    ├─ splitLongResponse() (if >600 chars)                        │ │
│  │    └─ Prepare for frontend                                       │ │
│  │                                                                   │ │
│  │ API Calls: 2 Supabase calls (async)                              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  📤 RETURN RESPONSE                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Response Object:                                                  │ │
│  │ {                                                                 │ │
│  │   message: "Your net worth is $50,000...",                       │ │
│  │   type: "assistant",                                             │ │
│  │   isSplit: false,                                                │ │
│  │   actions: [...] (if goal flow)                                  │ │
│  │ }                                                                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  📱 FRONTEND: Display Response                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ • If streaming: Update message in real-time                       │ │
│  │ • If split: Display multiple messages with delays                 │ │
│  │ • Hide typing indicator                                           │ │
│  │ • Update chat UI                                                  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
                        📊 API CALL SUMMARY
═══════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────┐
│ BEST CASE (All Cached)                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ • Classification: 0 (cached)                                            │
│ • Context: 0 (cached)                                                   │
│ • Main LLM: 1                                                           │
│ • Context Update: 1                                                     │
│ • Logging: 1                                                            │
│ ─────────────────────────────────────────────────────────────────────── │
│ TOTAL: 3 API calls                                                      │
│ TIME: ~500ms                                                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ AVERAGE CASE (Typical Query)                                            │
├─────────────────────────────────────────────────────────────────────────┤
│ • Classification: 0 (heuristic/cached)                                  │
│ • Context: 2-3 (partial cache)                                          │
│ • Main LLM: 1                                                           │
│ • Memory: 0 (pre-gate fails)                                            │
│ • Context Update: 1                                                     │
│ • Logging: 1                                                            │
│ ─────────────────────────────────────────────────────────────────────── │
│ TOTAL: 5-6 API calls                                                    │
│ TIME: 1-2 seconds                                                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ WORST CASE (Nothing Cached, Stock Query, Web Search)                    │
├─────────────────────────────────────────────────────────────────────────┤
│ • Classification: 1                                                     │
│ • Web Search: 3                                                         │
│ • Context: 8                                                            │
│ • Stock: 5                                                              │
│ • Memory: 1                                                             │
│ • Main LLM: 1                                                           │
│ • Context Update: 1                                                     │
│ • Logging: 1                                                            │
│ ─────────────────────────────────────────────────────────────────────── │
│ TOTAL: 21 API calls                                                     │
│ TIME: ~4.7 seconds                                                      │
└─────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
                        🎯 KEY OPTIMIZATIONS
═══════════════════════════════════════════════════════════════════════════

✅ Two-Tier Caching (Memory + Persistent)
✅ Parallel Processing (Context + Memory)
✅ Heuristic Pre-checks (Avoid LLM when possible)
✅ Streaming Responses (SSE for real-time updates)
✅ Rate Limiting (Web search queue)
✅ Smart Context Planning (Deterministic slot extraction)


═══════════════════════════════════════════════════════════════════════════
                        🔄 CACHING STRATEGY
═══════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────┐
│ Classification Cache                                                    │
│ • Type: In-memory (Map)                                                 │
│ • TTL: 1 hour                                                           │
│ • Hit Rate: ~60-70%                                                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ User Data Cache (Two-Tier)                                              │
│                                                                         │
│ Tier 1: In-Memory                                                      │
│ • TTL: 50% of persistent TTL                                           │
│ • Max Size: 1000 entries                                               │
│ • Cleanup: Every 10 minutes                                            │
│                                                                         │
│ Tier 2: Persistent (Supabase)                                          │
│ • summary_min: 5 minutes                                               │
│ • spend_data: 15 minutes                                               │
│ • goals_overview: 15 minutes                                           │
│ • investments_all: 60 minutes                                          │
│ • Cleanup: Every 30 minutes                                            │
└─────────────────────────────────────────────────────────────────────────┘


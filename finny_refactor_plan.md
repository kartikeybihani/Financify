# Production-Grade Refactor Plan: api/finny.js
## Senior Engineering Analysis & Migration Strategy

---

## EXECUTIVE SUMMARY

**Current State:** 8,666 lines monolithic API handler
**Target State:** Modular, testable, maintainable architecture
**Risk Level:** HIGH (production system, complex LLM orchestration)
**Estimated Phases:** 5 phases over 3-4 weeks
**Downtime:** ZERO (100% backward compatible)

---

## 1. ARCHITECTURAL SMELLS IDENTIFIED

### Critical Issues

1. **God Object Anti-Pattern**
   - Single file contains 98 functions across 7 distinct domains
   - No separation between HTTP handling, business logic, and data access
   - Makes debugging, testing, and onboarding extremely difficult

2. **Hidden State & Global Coupling**
   - 4 global Map caches (classification, memory, data, pending requests)
   - Scattered constants (LOG_LEVEL, NEED_CONFIG, model selections)
   - Session state managed through external module but tightly coupled

3. **Mixed Abstraction Levels**
   - Lines 1860-2800: HTTP request handling + auth + routing
   - Lines 2800-4500: Core LLM orchestration (handleAsk)
   - Lines 4500-6100: Data fetching & context building
   - Lines 6100-7000: Classification logic
   - Lines 7000-8200: Stock analysis subsystem
   - Lines 8200-8666: Net worth data functions

4. **Tight Coupling to Infrastructure**
   - Direct Supabase RPC calls scattered throughout
   - OpenRouter API calls in multiple locations
   - Brave search tightly coupled to stock analysis

5. **Untestable Code**
   - No dependency injection
   - Functions access global state directly
   - Side effects everywhere (caching, logging, database writes)

6. **Configuration Sprawl**
   - Model names hardcoded with fallbacks
   - Cache TTLs and sizes scattered
   - Rate limit configs inline in handler

---

## 2. DEPENDENCY MAP

### Current Architecture (Simplified)

```
handler(req, res)
├─> Authentication & Rate Limiting
├─> Action Router (ask, classify, prebuild_context, invalidate_profile_cache)
│   ├─> handleAsk()
│   │   ├─> Classification (handleClassify)
│   │   ├─> Context Planning (selectDataPacksFromClassification)
│   │   ├─> Data Fetching (buildContextPacks, executeFetchOperation)
│   │   ├─> Web Search (enhanceSearchQuery, braveSearch)
│   │   ├─> Stock Analysis (looksLikeStockQuery, executeStockPlan)
│   │   ├─> Prompt Building (buildContextAwarePromptDetailed)
│   │   ├─> LLM Call (OpenRouter API)
│   │   └─> Response Processing (cleanResponseFormatting)
│   ├─> handleClassify()
│   │   ├─> Cache Check (getCachedClassification)
│   │   ├─> LLM Call (OpenRouter classification)
│   │   └─> Result Normalization (canonicalizeIntentType)
│   └─> handleOffTopic()
│       ├─> Net Worth Data (getNetWorthData)
│       ├─> LLM Call (off-topic prompt)
│       └─> Response
└─> Response Serialization & Logging
```

### External Dependencies
- **Supabase:** User auth, RPC calls, cache storage
- **OpenRouter:** LLM inference (6 API call sites)
- **Brave Search:** Web search for stocks/investments
- **lib/memoryUtils.js:** Session state, user memory, profiles
- **lib/prompt_engine.js:** Prompt building
- **lib/stocks.js:** Stock ticker resolution
- **api/goals.js:** Goal conversation handling

---

## 3. TARGET ARCHITECTURE

### Layered Architecture (Clean Architecture Principles)

```
api/finny.js (THIN HANDLER - 200 lines max)
    ↓ delegates to
core/finny/
├── router/
│   ├── ActionRouter.js          # Routes action → handler
│   └── middleware/
│       ├── authMiddleware.js    # JWT validation
│       └── rateLimitMiddleware.js
├── handlers/
│   ├── AskHandler.js            # ask action
│   ├── ClassifyHandler.js       # classify action
│   ├── OffTopicHandler.js       # off_topic handling
│   └── PrebuildContextHandler.js
├── services/
│   ├── ClassificationService.js # Intent classification
│   ├── ContextPlanningService.js # Data pack selection
│   ├── DataFetchService.js      # Supabase RPC orchestration
│   ├── StockAnalysisService.js  # Stock queries
│   ├── WebSearchService.js      # Brave search wrapper
│   └── LLMService.js            # OpenRouter API abstraction
├── domain/
│   ├── ResponseContract.js      # Response type logic
│   ├── MessageClassification.js # Classification result
│   └── ContextPack.js           # Data pack definitions
├── infrastructure/
│   ├── cache/
│   │   ├── CacheManager.js      # Unified cache interface
│   │   ├── InMemoryCache.js     # Map-based cache
│   │   └── SupabaseCache.js     # Persistent cache
│   ├── llm/
│   │   ├── OpenRouterClient.js  # API client
│   │   └── ModelSelector.js     # Model fallback logic
│   └── database/
│       └── SupabaseClient.js    # Centralized RPC wrapper
└── utils/
    ├── logging.js               # Structured logging
    ├── timeout.js               # withTimeout utility
    ├── formatting.js            # Response formatting
    └── validation.js            # Input validation
```

---

## 4. FOLDER STRUCTURE (Outside API Directory)

```
core/
├── finny/
│   ├── router/
│   │   ├── ActionRouter.js
│   │   └── middleware/
│   │       ├── authMiddleware.js
│   │       └── rateLimitMiddleware.js
│   ├── handlers/
│   │   ├── AskHandler.js
│   │   ├── ClassifyHandler.js
│   │   ├── OffTopicHandler.js
│   │   └── PrebuildContextHandler.js
│   ├── services/
│   │   ├── ClassificationService.js
│   │   ├── ContextPlanningService.js
│   │   ├── DataFetchService.js
│   │   ├── StockAnalysisService.js
│   │   ├── WebSearchService.js
│   │   └── LLMService.js
│   ├── domain/
│   │   ├── ResponseContract.js
│   │   ├── MessageClassification.js
│   │   ├── ContextPack.js
│   │   └── models/
│   │       ├── ClassificationResult.js
│   │       ├── DataPack.js
│   │       └── StockQuery.js
│   ├── infrastructure/
│   │   ├── cache/
│   │   │   ├── CacheManager.js
│   │   │   ├── InMemoryCache.js
│   │   │   └── SupabaseCache.js
│   │   ├── llm/
│   │   │   ├── OpenRouterClient.js
│   │   │   ├── ModelSelector.js
│   │   │   └── models/
│   │   │       └── ModelConfig.js
│   │   └── database/
│   │       ├── SupabaseClient.js
│   │       └── repositories/
│   │           ├── NetWorthRepository.js
│   │           ├── InvestmentRepository.js
│   │           └── CacheRepository.js
│   └── utils/
│       ├── logging.js
│       ├── timeout.js
│       ├── formatting.js
│       ├── validation.js
│       └── constants/
│           ├── modelConfig.js
│           ├── cacheConfig.js
│           └── needConfig.js
└── config/
    ├── finnyConfig.js           # Centralized config
    └── environmentConfig.js     # Env var loading
```

---

## 5. PHASED MIGRATION PLAN

### PHASE 1: Foundation & Infrastructure (Week 1, Days 1-3)
**Goal:** Extract infrastructure without changing behavior

**Tasks:**
1. Create folder structure
2. Extract utilities (logging, timeout, formatting)
3. Extract cache layer (CacheManager + implementations)
4. Extract configuration constants
5. Create base test infrastructure

**Files Created:**
- `core/finny/utils/logging.js` (logDebug, logInfo, logWarn, logError)
- `core/finny/utils/timeout.js` (withTimeout)
- `core/finny/utils/formatting.js` (cleanResponseFormatting, redactPII)
- `core/finny/infrastructure/cache/CacheManager.js`
- `core/finny/infrastructure/cache/InMemoryCache.js`
- `core/finny/infrastructure/cache/SupabaseCache.js`
- `core/config/finnyConfig.js` (all constants)

**Validation Checkpoint:**
- Unit tests for utilities pass
- Cache layer tested independently
- Original finny.js imports these but behavior unchanged
- Run integration test: `npm test -- finny`

**Risk:** LOW - Pure extraction, no logic changes

---

### PHASE 2: Domain Models & Services (Week 1, Days 4-5)
**Goal:** Extract business logic into services

**Tasks:**
1. Create domain models (ClassificationResult, DataPack, StockQuery)
2. Extract ClassificationService
3. Extract LLMService (OpenRouter abstraction)
4. Extract ContextPlanningService
5. Update finny.js to use services

**Files Created:**
- `core/finny/domain/models/ClassificationResult.js`
- `core/finny/services/ClassificationService.js`
- `core/finny/services/LLMService.js`
- `core/finny/services/ContextPlanningService.js`
- `core/finny/infrastructure/llm/OpenRouterClient.js`

**Changes to finny.js:**
```javascript
// BEFORE
const result = await handleClassify(message, context);

// AFTER
import { ClassificationService } from '../core/finny/services/ClassificationService.js';
const classificationService = new ClassificationService(cacheManager, llmService);
const result = await classificationService.classify(message, context);
```

**Validation Checkpoint:**
- Service unit tests pass
- End-to-end classify action works
- Response format identical to before
- Performance metrics unchanged (<5% regression acceptable)

**Risk:** MEDIUM - Logic extraction, potential for subtle bugs

---

### PHASE 3: Data Layer (Week 2, Days 1-3)
**Goal:** Extract data fetching and repository pattern

**Tasks:**
1. Create SupabaseClient wrapper
2. Extract DataFetchService
3. Create repositories (NetWorthRepository, InvestmentRepository)
4. Extract StockAnalysisService
5. Extract WebSearchService

**Files Created:**
- `core/finny/infrastructure/database/SupabaseClient.js`
- `core/finny/infrastructure/database/repositories/NetWorthRepository.js`
- `core/finny/infrastructure/database/repositories/InvestmentRepository.js`
- `core/finny/services/DataFetchService.js`
- `core/finny/services/StockAnalysisService.js`
- `core/finny/services/WebSearchService.js`

**Validation Checkpoint:**
- Data fetching works for all data pack types
- Stock queries return identical results
- Cache hit/miss behavior unchanged
- Database call count same or reduced

**Risk:** MEDIUM-HIGH - Complex data orchestration

---

### PHASE 4: Handlers & Router (Week 2, Days 4-5)
**Goal:** Extract action handlers and routing logic

**Tasks:**
1. Create ActionRouter
2. Extract AskHandler
3. Extract ClassifyHandler
4. Extract OffTopicHandler
5. Extract PrebuildContextHandler
6. Create middleware (auth, rate limiting)

**Files Created:**
- `core/finny/router/ActionRouter.js`
- `core/finny/router/middleware/authMiddleware.js`
- `core/finny/router/middleware/rateLimitMiddleware.js`
- `core/finny/handlers/AskHandler.js`
- `core/finny/handlers/ClassifyHandler.js`
- `core/finny/handlers/OffTopicHandler.js`
- `core/finny/handlers/PrebuildContextHandler.js`

**New finny.js structure:**
```javascript
import { ActionRouter } from '../core/finny/router/ActionRouter.js';

export default async function handler(req, res) {
  const router = new ActionRouter({
    cacheManager,
    llmService,
    classificationService,
    dataFetchService,
    // ... dependencies
  });
  
  return router.handle(req, res);
}
```

**Validation Checkpoint:**
- All actions work (ask, classify, prebuild_context, invalidate_profile_cache)
- Streaming responses work
- Error handling preserved
- Timing metrics comparable

**Risk:** HIGH - Full integration, routing logic critical

---

### PHASE 5: Cleanup & Optimization (Week 3)
**Goal:** Remove dead code, optimize, document

**Tasks:**
1. Remove unused functions from finny.js
2. Add comprehensive JSDoc comments
3. Create README for core/finny/
4. Performance profiling and optimization
5. Add integration tests
6. Update deployment docs

**Final finny.js size:** ~200 lines (95% reduction)

**Validation Checkpoint:**
- Full regression test suite passes
- Load testing shows no performance degradation
- Code coverage >80% for new modules
- Documentation complete

**Risk:** LOW - Polish phase

---

## 6. RISKS & MITIGATION

### Critical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Breaking changes to API contract** | HIGH | MEDIUM | Comprehensive integration tests; feature flags for gradual rollout |
| **Performance regression** | HIGH | MEDIUM | Benchmark before/after each phase; rollback plan |
| **Cache inconsistency** | MEDIUM | MEDIUM | Dual-write during migration; validation layer |
| **LLM response changes** | MEDIUM | LOW | Response comparison tests; prompt versioning |
| **Hidden coupling in session state** | MEDIUM | MEDIUM | Extensive session state testing; staged rollout |
| **Database connection pooling issues** | MEDIUM | LOW | Monitor connection counts; proper cleanup in new abstractions |

### Edge Cases & Hidden Coupling

1. **Session State Mutations**
   - `mergeSessionState()` called from multiple places
   - **Mitigation:** Centralize session management in SessionService

2. **Global Cache Invalidation**
   - `invalidateUserCache()` clears multiple cache types
   - **Mitigation:** Event-based cache invalidation in CacheManager

3. **Streaming Response State**
   - `res` object passed through 5 layers
   - **Mitigation:** Stream abstraction layer

4. **Classification Cache Heuristic Detection**
   - Complex logic to detect and purge "heuristic" classifications
   - **Mitigation:** Strict type checking in ClassificationResult model

5. **Stock Query Rate Limiting**
   - Brave search has custom rate limiting via pendingRequests Map
   - **Mitigation:** Dedicated RateLimiter for external APIs

6. **Timeout Cascades**
   - Multiple nested timeouts (LLM 20s, web search 15s, cache 2.5s)
   - **Mitigation:** Timeout budget tracking; configurable timeouts

---

## 7. MEASURABLE CHECKPOINTS

### Per-Phase Validation

**Phase 1 Checkpoint:**
- [ ] All utility functions have unit tests (100% coverage)
- [ ] Cache layer tested with 1000+ operations
- [ ] No changes to finny.js behavior (diff test)

**Phase 2 Checkpoint:**
- [ ] Classification accuracy unchanged (test with 100 sample messages)
- [ ] LLM response time within 5% of baseline
- [ ] Service layer has 90%+ test coverage

**Phase 3 Checkpoint:**
- [ ] Data fetching latency unchanged
- [ ] Cache hit rate >95% (same as before)
- [ ] Stock analysis returns identical results (regression test)

**Phase 4 Checkpoint:**
- [ ] All 4 actions work end-to-end
- [ ] Streaming responses validated
- [ ] Error responses match original format

**Phase 5 Checkpoint:**
- [ ] Load test: 100 req/min sustained for 10 minutes
- [ ] Memory usage stable (no leaks)
- [ ] Documentation complete and reviewed

### Success Metrics

| Metric | Baseline | Target | Critical Threshold |
|--------|----------|--------|-------------------|
| **Lines of code (finny.js)** | 8,666 | <300 | <500 |
| **Test coverage (core/)** | 0% | >80% | >70% |
| **Average response time** | X ms | <X+50ms | <X+100ms |
| **P95 response time** | Y ms | <Y+100ms | <Y+200ms |
| **Cache hit rate** | Z% | >Z-2% | >Z-5% |
| **Error rate** | E% | <E+0.5% | <E+1% |

---

## 8. ROLLBACK STRATEGY

### Per-Phase Rollback

Each phase maintains backward compatibility via feature flags:

```javascript
// core/config/featureFlags.js
export const FEATURE_FLAGS = {
  USE_NEW_CLASSIFICATION_SERVICE: process.env.FF_NEW_CLASSIFICATION === 'true',
  USE_NEW_DATA_FETCH_SERVICE: process.env.FF_NEW_DATA_FETCH === 'true',
  USE_NEW_ROUTER: process.env.FF_NEW_ROUTER === 'true',
};
```

### Emergency Rollback
1. Set feature flag to `false`
2. Deploy previous version
3. Monitor error rates for 10 minutes
4. Full rollback if errors persist

### Canary Deployment
- Phase 2-4: Roll out to 10% of users first
- Monitor for 24 hours
- Gradual increase: 10% → 25% → 50% → 100%

---

## 9. TESTING STRATEGY

### Unit Tests
- All services, repositories, utilities
- Mock all external dependencies
- Coverage target: 80%+

### Integration Tests
```javascript
// tests/integration/finny-ask.test.js
describe('Finny Ask Action', () => {
  it('should handle spending question', async () => {
    const req = createMockRequest({
      action: 'ask',
      message: 'How much did I spend last month?',
    });
    const res = createMockResponse();
    
    await handler(req, res);
    
    expect(res.status).toBe(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.any(String),
        type: 'assistant',
      })
    );
  });
});
```

### Regression Tests
- Record 100 real requests/responses before refactor
- Replay requests after each phase
- Compare response structure (not exact content due to LLM variability)

### Load Tests
```bash
# Apache Bench
ab -n 1000 -c 10 -H "Authorization: Bearer TOKEN" \
  -p ask_payload.json \
  https://api.finny.com/api/finny
```

---

## 10. IMPLEMENTATION SEQUENCE

### Week 1
- **Day 1-2:** Phase 1 (Foundation)
- **Day 3:** Phase 1 validation & testing
- **Day 4-5:** Phase 2 (Services)

### Week 2
- **Day 1:** Phase 2 validation
- **Day 2-3:** Phase 3 (Data layer)
- **Day 4:** Phase 3 validation
- **Day 5:** Phase 4 (Handlers) start

### Week 3
- **Day 1-2:** Phase 4 completion & validation
- **Day 3-4:** Phase 5 (Cleanup)
- **Day 5:** Final validation & documentation

### Week 4 (Buffer)
- Performance optimization
- Bug fixes
- Documentation polish

---

## 11. SAMPLE REFACTORED CODE

### Before: finny.js (excerpt)
```javascript
async function handleClassify(message, context) {
  console.log("🔍 [FINNY] Starting classification...");
  const startTime = Date.now();
  
  const cacheKey = generateClassificationCacheKey(message);
  let cachedResult = getCachedClassification(message);
  
  if (cachedResult) {
    // ... 50 lines of cache validation
  }
  
  // ... 200 lines of LLM call and parsing
}
```

### After: ClassificationService.js
```javascript
export class ClassificationService {
  constructor(cacheManager, llmClient, logger) {
    this.cache = cacheManager;
    this.llm = llmClient;
    this.logger = logger;
  }
  
  async classify(message, context) {
    const cacheKey = this._generateCacheKey(message);
    const cached = await this.cache.get(cacheKey);
    
    if (cached && this._isValid(cached)) {
      this.logger.debug('Classification cache hit');
      return new ClassificationResult(cached);
    }
    
    const result = await this._classifyWithLLM(message, context);
    await this.cache.set(cacheKey, result, { ttl: 3600 });
    
    return new ClassificationResult(result);
  }
  
  // ... clean, testable private methods
}
```

---

## CONCLUSION

This refactor transforms an **8,666-line monolith into a modular, testable, maintainable system** while maintaining **zero downtime** and **100% backward compatibility**.

**Key Benefits:**
- ✅ 95% reduction in main file size
- ✅ 80%+ test coverage
- ✅ Clear separation of concerns
- ✅ Easy to onboard new developers
- ✅ Scalable for future features
- ✅ Production-safe migration path

**Estimated Effort:** 3-4 weeks (1 senior engineer)
**Risk Level:** Managed through phased rollout
**ROI:** Massive improvement in maintainability, velocity, and reliability

# Phase 3 Extraction Summary

## ✅ Completed Extractions

### 1. Database Infrastructure (`core/finny/infrastructure/database/`)

#### `SupabaseClient.js`
- ✅ Added thin wrapper around existing shared Supabase client
- ✅ Reuses `lib/api/supabase.js` (no duplicate client creation)
- ✅ Supports optional RPC timeouts via shared `withTimeout()`

#### Repositories (`repositories/`)
- ✅ `NetWorthRepository.js`
  - `getNetWorth(userId, timeoutMs)`
- ✅ `InvestmentRepository.js`
  - `getDetailedHoldings(userId, timeoutMs)`

### 2. Data & External Services (`core/finny/services/`)

#### `DataFetchService.js`
- ✅ Centralized entry point for data-layer calls
- ✅ Uses repositories (net worth, holdings)

#### `StockAnalysisService.js`
- ✅ Wraps stock operations from `lib/stocks.js`
  - ticker resolution
  - stock snapshot fetch
  - stock summary builder
  - generic stock JSON fetch helper

#### `WebSearchService.js`
- ✅ Wraps Brave search from `lib/websearch/brave.js`
- ✅ Adds timeout + abort behavior with shared utilities

## ✅ Monolith Integration (Low-Risk)

`api/finny.js` now uses Phase 3 services at active call sites:
- Investment holdings enrichment uses `DataFetchService.getInvestmentHoldingsDetailed()`
- Net worth fetch path uses `DataFetchService.getNetWorth()`
- Limited Brave search path uses `WebSearchService.search()`
- Stock resolution/snapshot/summary/json fetch paths use `StockAnalysisService`

## ✅ Hard Extraction Completed

The following heavy monolith blocks were moved into Phase 3 services and replaced by thin delegating wrappers:

- Web research queue/rate-limit/dedup logic
  - moved to `WebSearchService.limitedSearch()`
  - `api/finny.js` now uses a thin `limitedBraveSearch()` wrapper
- Stock planning and execution
  - moved to `StockAnalysisService.planStockRequest()`
  - moved to `StockAnalysisService.executeStockPlan()`
- Stock fallback analysis paths
  - moved to `StockAnalysisService.generateFallbackStockAnalysis()`
  - moved to `StockAnalysisService.generateStockAnalysisFromWebData()`
  - moved to `StockAnalysisService.generateTrainingDataStockAnalysis()`

## ✅ Deduplication Decision

- No new Supabase client was created.
- Phase 3 explicitly reuses existing `lib/api/supabase.js` through `SupabaseClient` wrapper.

## 🧪 Validation

- ✅ `node --check api/finny.js`
- ✅ `node --check core/finny/**/*.js`
- ✅ `node tests/test_finny_architecture.js` → `3/3 checks passed`
- ✅ `eslint(no-unused-vars, config-free)` passes for `core/finny/**/*.js`

## 📉 Monolith Reduction

- `api/finny.js.phase2backup`: **8,487 lines**
- `api/finny.js` after Phase 3 hard extraction: **6,791 lines**
- Net reduction vs phase2 backup: **-1,696 lines**

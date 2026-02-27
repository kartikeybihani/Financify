# Phase 2 Extraction Summary

## ✅ Completed Extractions

### 1. Service Layer (`core/finny/services/`)

#### `ClassificationService.js`
- ✅ Classification logic extracted from monolith
- ✅ In-memory classification cache handling
- ✅ LLM classification with model fallback
- ✅ Classification result normalization and fallback contract support

#### `ContextPlanningService.js`
- ✅ Data-pack selection from `classification.data_requirements`
- ✅ Keyword fallback routing retained for backward compatibility
- ✅ Slot extraction (`topic/category/merchant/period`) extracted

### 2. LLM Infrastructure (`core/finny/infrastructure/llm/`)

#### `LLMService.js`
- ✅ Generic `callWithFallback()` extracted from monolith
- ✅ Timeout + abort handling retained
- ✅ Ordered model fallback behavior retained

## 🔧 Phase 2 Stability Fixes Applied

- ✅ Restored missing service wiring in [`api/finny.js`]
  - `classificationService`
  - `contextPlanningService`
  - `llmService`
- ✅ Added compatibility wrappers so existing monolith call sites continue to work:
  - `generateClassificationCacheKey()`
  - `getCachedClassification()`
  - `setCachedClassification()`
- ✅ Prevented crash when classification confidence is absent (`toFixed` on undefined)
- ✅ Restored model default fallbacks in extracted model config to avoid hard-fail when env vars are missing
- ✅ Preserved fallback contract (`fallback: true`) for classifier degraded mode

## 📊 Validation

- ✅ `node --check api/finny.js`
- ✅ `node --check core/**/*.js`
- ✅ `node tests/test_finny_architecture.js` → `3/3 checks passed`
- ✅ `eslint(no-unused-vars, config-free)` passes for `core/finny/**/*.js`

## ⚠️ Notes

- Network-dependent paths (Supabase/OpenRouter/Supermemory) may fail in restricted environments; fallback behavior was validated.
- `api/finny.js` still has legacy unused-code debt that is planned for Phase 5 cleanup.

## 📝 Files Added/Used In Phase 2

```
core/finny/
├── services/
│   ├── ClassificationService.js
│   └── ContextPlanningService.js
└── infrastructure/
    └── llm/
        └── LLMService.js
```

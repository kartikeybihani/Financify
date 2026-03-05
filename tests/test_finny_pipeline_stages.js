/**
 * Focused unit checks for extracted pipeline stages.
 * Usage:
 *   node tests/test_finny_pipeline_stages.js
 */

import "dotenv/config";
import assert from "node:assert/strict";

import {
  normalizeClassificationFromContext,
  executeClassificationStage,
} from "../core/finny/pipeline/ClassificationStage.js";
import { executeContextLoadingStage } from "../core/finny/pipeline/ContextLoadingStage.js";
import {
  detectWebSearchNeeded,
  looksLikeStockQuery,
  executeEnrichmentStage,
} from "../core/finny/pipeline/EnrichmentStage.js";
import {
  executePromptAssemblyStage,
  buildInsufficiencyState,
  buildHighRiskClarificationResponse,
} from "../core/finny/pipeline/PromptAssemblyStage.js";
import {
  enforceAdvisoryQuestionPolicy,
  executeExecutionStage,
} from "../core/finny/pipeline/ExecutionStage.js";
import {
  normalizeResponseEnvelope,
  executeFinalizationStage,
} from "../core/finny/pipeline/FinalizationStage.js";
import { executeAskPipeline } from "../core/finny/pipeline/index.js";

function pass(name) {
  console.log(`✅ ${name}`);
}

function fail(name, details) {
  console.error(`❌ ${name}: ${details}`);
}

async function testClassificationStage() {
  const name = "Classification stage normalizes missing fields with available context";
  const classification = normalizeClassificationFromContext(
    {
      intent: "ask_personalized",
      intent_type: "actionable",
      decision_risk: "unknown",
      info_sufficiency: "missing",
      needs_clarification: true,
      missing_fields: ["income_takehome", "current_savings", "debt_balances"],
    },
    {
      base: { liquidAssets: 1000, totalLiabilities: 100, accounts: [] },
    },
    { monthly_income: 5000 },
  );

  assert.equal(classification.missing_fields.length, 0);
  assert.equal(classification.needs_clarification, false);
  assert.equal(classification.info_sufficiency, "sufficient");
  assert.equal(classification.decision_risk, "medium");

  const stage = await executeClassificationStage({
    message: "Can I buy this?",
    classificationResult: classification,
    packs: {},
    profile: {},
    userId: null,
    chatId: null,
    continuityOverride: null,
  });
  assert.equal(stage.classification.intent, "ask_personalized");
  pass(name);
  return true;
}

async function testContextLoadingStage() {
  const name = "Context loading stage selects packs and merges slots";
  const result = await executeContextLoadingStage({
    classification: {
      data_requirements: { time_range: "current" },
    },
    message: "How much did I spend this month?",
    userId: "u1",
    contextPlanningService: {
      selectDataPacksFromClassification: () => ({
        needs: ["summary_min"],
        filters: { merchant: null, category: "food", period: "this month" },
        useMerchantRPC: false,
      }),
      extractSlots: () => ({ category: null }),
    },
    buildContextPacks: async () => ({
      packs: { base: { netWorth: 100 } },
    }),
  });

  assert.equal(result.needs[0], "summary_min");
  assert.equal(result.slots.category, "food");
  assert.ok(result.packs.base);
  pass(name);
  return true;
}

async function testEnrichmentStage() {
  const name = "Enrichment stage executes web and stock enrichment with mocks";
  assert.equal(detectWebSearchNeeded("latest market news"), true);
  assert.equal(looksLikeStockQuery("Analyze AAPL", { intent: "stock_query" }), true);

  const timings = {};
  const toolsUsed = [];
  const result = await executeEnrichmentStage({
    message: "latest news on AAPL",
    classification: { requires_web_search: true, intent: "stock_query", ticker: "AAPL" },
    packs: {},
    webSearchService: {
      search: async () => ({ results: [{ title: "x" }], summary: "summary" }),
    },
    stockAnalysisService: {
      fetchStockData: async () => ({ ticker: "AAPL", current: 200 }),
    },
    userId: "u1",
    timings,
    toolsUsed,
  });

  assert.equal(result.webResults.length, 1);
  assert.equal(result.stockData.ticker, "AAPL");
  assert.ok(timings.web_ms >= 0);
  assert.ok(timings.market_ms >= 0);
  assert.equal(toolsUsed.length, 2);
  pass(name);
  return true;
}

async function testPromptStageAndClarify() {
  const name = "Prompt stage builds messages and deterministic high-risk clarify response";
  process.env.FINNY_ADVISORY_RUNTIME_V1 = "false";

  const prompt = await executePromptAssemblyStage({
    message: "Should I buy a house now?",
    classification: {
      intent: "ask_personalized",
      intent_type: "actionable",
      decision_risk: "high",
      confidence: 0.9,
    },
    packs: {},
    enrichedData: { webSummary: "" },
    context: { user_id: "u1", profile: {} },
    continuityOverride: null,
    userRefused: false,
    ambiguousIntent: true,
  });

  assert.ok(Array.isArray(prompt.messages));
  assert.equal(prompt.messages[0].role, "system");
  assert.equal(prompt.messages[prompt.messages.length - 1].role, "user");

  const insuff = buildInsufficiencyState(
    "Should I buy a house now?",
    { decision_risk: "high" },
    {},
    {},
  );
  const clarify = buildHighRiskClarificationResponse(insuff);
  assert.match(clarify.message, /high-stakes decision/i);
  pass(name);
  return true;
}

async function testExecutionAndFinalizationStages() {
  const name = "Execution and finalization stages return normalized contract-safe response";

  const repaired = enforceAdvisoryQuestionPolicy(
    "You can proceed. Do this? Also that?",
    { resolution: { question_policy: "none" } },
  );
  assert.equal(repaired.includes("?"), false);

  const execution = await executeExecutionStage({
    messages: [{ role: "user", content: "test" }],
    responseContract: "default_coach",
    advisoryRuntime: { resolution: { question_policy: "none" } },
    message: "test",
    packs: {},
    classification: { intent: "ask_personalized" },
    profile: {},
    llmService: {
      callWithFallback: async (models) => ({
        model: models[0],
        result: {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "First answer? Second question?" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
        },
      }),
    },
    timings: {},
    toolsUsed: [],
  });
  assert.ok(typeof execution.responseText === "string");
  assert.ok(execution.responseText.length > 0);

  const final = await executeFinalizationStage({
    message: "test",
    responseText: execution.responseText,
    classification: { intent: "ask_personalized", confidence: 0.9 },
    packs: {},
    context: {},
    responseContract: "default_coach",
    advisoryRuntime: null,
    usedModel: "mock-model",
    usage: { prompt_tokens: 1 },
    timings: {},
    toolsUsed: [],
    requestId: "req-1",
    startTime: Date.now() - 5,
    logConversation: null,
  });

  assert.equal(final.response.type, "assistant");
  assert.ok(typeof final.response.message === "string");

  const normalized = normalizeResponseEnvelope("hello");
  assert.equal(normalized.type, "assistant");
  assert.equal(normalized.message, "hello");
  pass(name);
  return true;
}

async function testPipelineOrchestratorHardClarifyGate() {
  const name = "Pipeline orchestrator enforces hard clarify gate when advisory runtime is off";
  const prev = process.env.FINNY_ADVISORY_RUNTIME_V1;
  process.env.FINNY_ADVISORY_RUNTIME_V1 = "false";

  let llmCalled = false;
  const response = await executeAskPipeline({
    message: "Should I buy a house now?",
    context: { user_id: "u1", profile: {} },
    classificationResult: {
      intent: "ask_personalized",
      intent_type: "actionable",
      decision_risk: "high",
      info_sufficiency: "missing",
      needs_clarification: true,
      missing_fields: ["income_takehome", "current_savings", "timeline"],
      data_requirements: { time_range: "current" },
    },
    services: {
      contextPlanningService: {
        selectDataPacksFromClassification: () => ({
          needs: ["summary_min"],
          filters: { merchant: null, category: null, period: null },
          useMerchantRPC: false,
        }),
        extractSlots: () => ({}),
      },
      llmService: {
        callWithFallback: async () => {
          llmCalled = true;
          return {
            model: "mock",
            result: { ok: true, json: async () => ({ choices: [] }) },
          };
        },
      },
      webSearchService: { search: async () => ({ results: [] }) },
      stockAnalysisService: { fetchStockData: async () => null },
    },
    helpers: {
      buildContextPacks: async () => ({ packs: {} }),
      logConversation: async () => {},
      detectRefusalToAnswer: () => false,
      detectAmbiguousIntent: () => true,
    },
    requestMetadata: { requestId: "req-hard", startTime: Date.now() },
  });

  process.env.FINNY_ADVISORY_RUNTIME_V1 = prev;

  assert.match(response.message, /high-stakes decision/i);
  assert.equal(llmCalled, false);
  pass(name);
  return true;
}

async function main() {
  const checks = [
    testClassificationStage,
    testContextLoadingStage,
    testEnrichmentStage,
    testPromptStageAndClarify,
    testExecutionAndFinalizationStages,
    testPipelineOrchestratorHardClarifyGate,
  ];

  let passed = 0;
  for (const check of checks) {
    try {
      const ok = await check();
      if (ok) passed += 1;
    } catch (error) {
      fail(check.name, error?.message || String(error));
    }
  }

  console.log(`\n${passed}/${checks.length} checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
}

main();

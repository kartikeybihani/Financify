/**
 * Focused unit checks for extracted router + action handlers.
 * Usage:
 *   node tests/test_finny_handlers_router.js
 */

import assert from "node:assert/strict";
import { createActionRouter } from "../core/finny/router/ActionRouter.js";
import { runAskAction } from "../core/finny/handlers/AskHandler.js";
import { runClassifyAction } from "../core/finny/handlers/ClassifyHandler.js";
import { runOffTopicAction } from "../core/finny/handlers/OffTopicHandler.js";
import { runPrebuildContextAction } from "../core/finny/handlers/PrebuildContextHandler.js";
import { runStockQueryAction } from "../core/finny/handlers/StockQueryHandler.js";
import { runGoalConversationAction } from "../core/finny/handlers/GoalConversationHandler.js";
import { runStockConversationAction } from "../core/finny/handlers/StockConversationHandler.js";

function pass(name) {
  console.log(`✅ ${name}`);
}

function fail(name, details) {
  console.error(`❌ ${name}: ${details}`);
}

async function testActionRouter() {
  const name = "Action router dispatches valid actions and rejects invalid ones";
  const router = createActionRouter({
    ping: async ({ value }) => ({ ok: true, value }),
  });

  const ok = await router("ping", { value: 42 });
  assert.deepEqual(ok, { ok: true, value: 42 });

  let invalidCaught = false;
  try {
    await router("unknown", {});
  } catch (error) {
    invalidCaught = true;
    assert.equal(error.code, "INVALID_ACTION");
  }
  assert.equal(invalidCaught, true);
  pass(name);
  return true;
}

async function testClassifyHandler() {
  const name = "Classify handler clears heuristic responses and retries";
  const timings = {};
  const classificationCache = new Map();
  classificationCache.set("k1", { heuristic: true });
  let calls = 0;

  const response = await runClassifyAction({
    message: "test",
    safeContext: { user_id: "u1" },
    handleClassify: async () => {
      calls += 1;
      if (calls === 1) return { heuristic: true, intent: "ask_personalized" };
      return { intent: "ask_personalized", confidence: 0.9 };
    },
    timings,
    classificationCache,
    generateClassificationCacheKey: () => "k1",
  });

  assert.equal(calls, 2);
  assert.equal(classificationCache.has("k1"), false);
  assert.equal(response.heuristic, undefined);
  assert.equal(response.intent, "ask_personalized");
  assert.equal(typeof timings.classification_ms, "number");
  pass(name);
  return true;
}

async function testAskHandlers() {
  const name = "Ask/stock handlers route intent correctly";
  const calls = [];
  const fakeHandleAsk = async (...args) => {
    calls.push(args);
    return { type: "assistant", message: "ok" };
  };

  await runAskAction({
    message: "hello",
    safeContext: { user_id: "u1" },
    effectiveClassification: { intent: "stock_query" },
    timings: {},
    wantsStreaming: false,
    res: null,
    handleAsk: fakeHandleAsk,
  });

  await runStockQueryAction({
    message: "stock",
    safeContext: { user_id: "u1" },
    effectiveClassification: { intent: "stock_query" },
    timings: {},
    wantsStreaming: false,
    res: null,
    handleAsk: fakeHandleAsk,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][2], "stock_query");
  assert.equal(calls[1][2], "stock_query");
  pass(name);
  return true;
}

async function testOffTopicAndPrebuildHandlers() {
  const name = "Off-topic and prebuild handlers pass through expected payload";
  const offTopic = await runOffTopicAction({
    message: "hi",
    safeContext: { user_id: "u1" },
    effectiveClassification: { intent: "off_topic" },
    wantsStreaming: false,
    res: null,
    handleOffTopic: async (message, context) => ({
      message,
      hasClassification: !!context.classification_result,
    }),
  });
  assert.equal(offTopic.hasClassification, true);

  const prebuild = await runPrebuildContextAction({
    finalUserId: "u1",
    shouldSuppressLogs: true,
    handlePrebuildContext: async (uid, silent) => ({ uid, silent }),
  });
  assert.deepEqual(prebuild, { uid: "u1", silent: true });
  pass(name);
  return true;
}

async function testGoalHandler() {
  const name = "Goal conversation handler preserves goal contract responses";
  const mergeCalls = [];

  const cancel = await runGoalConversationAction({
    message: "cancel_goal",
    safeContext: { session: {} },
    finalUserId: "u1",
    handleGoalConversation: async () => ({ message: "noop" }),
    handleGoalCreation: async () => ({ message: "noop" }),
    mergeSessionState: (uid, patch) => mergeCalls.push([uid, patch]),
    logError: () => {},
    responseHasVisibleContent: (resp) => !!resp?.message,
  });
  assert.equal(cancel.intent, "goal_conversation");
  assert.equal(cancel.goal_flow.active, false);
  assert.equal(mergeCalls.length, 1);
  pass(name);
  return true;
}

async function testStockConversationHandler() {
  const name = "Stock conversation handler supports ticker updates and confirmations";
  const mergeCalls = [];

  const update = await runStockConversationAction({
    message: "update_stock_ticker",
    safeContext: { user_id: "u1" },
    sessionState: { stock_flow: { original_message: "Analyze apple" } },
    finalUserId: "u1",
    otherParams: { ticker: "aapl" },
    timings: {},
    wantsStreaming: false,
    res: null,
    handleAsk: async () => "unused",
    mergeSessionState: (uid, patch) => mergeCalls.push([uid, patch]),
    logError: () => {},
  });
  assert.equal(update.intent, "ask_personalized");
  assert.equal(update.stock_candidate.ticker, "AAPL");
  assert.equal(update.actions.length, 2);

  const confirmNoTicker = await runStockConversationAction({
    message: "confirm_stock",
    safeContext: { user_id: "u1" },
    sessionState: { stock_flow: null },
    finalUserId: "u1",
    otherParams: {},
    timings: {},
    wantsStreaming: false,
    res: null,
    handleAsk: async () => "unused",
    mergeSessionState: () => {},
    logError: () => {},
  });
  assert.match(confirmNoTicker.message, /couldn't find a ticker/i);

  const confirm = await runStockConversationAction({
    message: "confirm_stock",
    safeContext: { user_id: "u1" },
    sessionState: {
      stock_flow: { ticker: "TSLA", original_message: "Analyze TSLA stock" },
    },
    finalUserId: "u1",
    otherParams: {},
    timings: {},
    wantsStreaming: false,
    res: null,
    handleAsk: async () => "analysis done",
    mergeSessionState: (uid, patch) => mergeCalls.push([uid, patch]),
    logError: () => {},
  });
  assert.equal(confirm.hideActions, true);
  assert.equal(confirm.hideFeedback, false);
  assert.deepEqual(confirm.actions, []);
  pass(name);
  return true;
}

async function main() {
  const checks = [
    testActionRouter,
    testClassifyHandler,
    testAskHandlers,
    testOffTopicAndPrebuildHandlers,
    testGoalHandler,
    testStockConversationHandler,
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

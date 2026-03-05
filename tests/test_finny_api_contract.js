/**
 * API contract assertions for /api/finny response shapes.
 * Usage:
 *   node tests/test_finny_api_contract.js
 */

import "dotenv/config";
import assert from "node:assert/strict";
import finnyHandler from "../api/finny.js";

const TEST_USER_ID = "79952f35-b607-40d6-a32e-d81386882eb7";

function pass(name) {
  console.log(`✅ ${name}`);
}

function fail(name, details) {
  console.error(`❌ ${name}: ${details}`);
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    writableEnded: false,
    once: () => {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = { ...this.headers, ...headers };
      return this;
    },
    write() {
      return true;
    },
    end() {
      this.writableEnded = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.writableEnded = true;
      return this;
    },
    flushHeaders() {},
  };
}

async function testMethodGuard() {
  const name = "API rejects non-POST methods with error envelope";
  const req = { method: "GET", body: {}, headers: {} };
  const res = createMockRes();
  await finnyHandler(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(typeof res.body?.error, "string");
  pass(name);
  return true;
}

async function testMissingActionGuard() {
  const name = "API returns structured error for missing action";
  const req = { method: "POST", body: {}, headers: {} };
  const res = createMockRes();
  await finnyHandler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(typeof res.body?.error, "string");
  pass(name);
  return true;
}

async function testInvalidActionGuard() {
  const name = "API returns structured error for invalid action";
  const req = {
    method: "POST",
    headers: {},
    body: {
      action: "not_real_action",
      message: "hello",
      chat_id: "chat-contract-invalid",
      context: { user_id: TEST_USER_ID },
    },
  };
  const res = createMockRes();
  await finnyHandler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error, "Invalid action");
  pass(name);
  return true;
}

async function testMessageResponseEnvelope() {
  const name = "Message action preserves assistant response envelope fields";
  const req = {
    method: "POST",
    headers: {},
    body: {
      action: "message",
      message: "Should I buy a house this year?",
      chat_id: "chat-contract-message",
      context: { user_id: TEST_USER_ID },
    },
  };
  const res = createMockRes();
  await finnyHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body, "object");
  assert.equal(res.body?.type, "assistant");
  assert.equal(typeof (res.body?.message ?? res.body?.text), "string");
  pass(name);
  return true;
}

async function testClassifyResponseShape() {
  const name = "Classify action returns object classification payload";
  const req = {
    method: "POST",
    headers: {},
    body: {
      action: "classify",
      message: "How much did I spend on food?",
      context: { user_id: TEST_USER_ID },
    },
  };
  const res = createMockRes();
  await finnyHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body, "object");
  assert.equal(
    typeof res.body.intent === "string" || res.body.fallback === true,
    true,
  );
  pass(name);
  return true;
}

async function main() {
  const checks = [
    testMethodGuard,
    testMissingActionGuard,
    testInvalidActionGuard,
    testMessageResponseEnvelope,
    testClassifyResponseShape,
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

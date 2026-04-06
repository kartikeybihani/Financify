import assert from 'node:assert/strict';
import {
  applyAiSummary,
  buildStructuredLlmFailureMarker,
  classifyOnboardingAiFailure,
  createAiEnrichmentSummary,
  shouldRetryOnboardingFailure,
} from '../lib/onboarding_ai_reliability.js';

function pass(name) {
  console.log(`✅ ${name}`);
}

function fail(name, details) {
  console.error(`❌ ${name}: ${details}`);
}

async function testClassifierMappings() {
  const name = 'Classifier maps HTTP/network/timeout/parse/persist failures';

  const c401 = classifyOnboardingAiFailure({
    error: new Error('OpenRouter error 401: unauthorized'),
    stage: 'llm_request',
  });
  assert.equal(c401.reasonCode, 'FAIL_LLM_HTTP_401');
  assert.equal(c401.retryable, false);

  const c429 = classifyOnboardingAiFailure({
    error: new Error('OpenRouter error 429: rate limited'),
    stage: 'llm_request',
  });
  assert.equal(c429.reasonCode, 'FAIL_LLM_HTTP_429');
  assert.equal(c429.retryable, true);

  const timeoutErr = new Error('request timed out');
  timeoutErr.name = 'AbortError';
  const cTimeout = classifyOnboardingAiFailure({
    error: timeoutErr,
    stage: 'llm_request',
  });
  assert.equal(cTimeout.reasonCode, 'FAIL_LLM_TIMEOUT');
  assert.equal(cTimeout.retryable, true);

  const networkErr = new Error('fetch failed');
  networkErr.code = 'ENOTFOUND';
  const cNetwork = classifyOnboardingAiFailure({
    error: networkErr,
    stage: 'llm_request',
  });
  assert.equal(cNetwork.reasonCode, 'FAIL_LLM_NETWORK');
  assert.equal(cNetwork.retryable, true);

  const cParse = classifyOnboardingAiFailure({
    error: new Error('invalid json'),
    stage: 'llm_parse',
  });
  assert.equal(cParse.reasonCode, 'FAIL_LLM_INVALID_JSON');
  assert.equal(cParse.retryable, false);

  const cPersist = classifyOnboardingAiFailure({
    error: new Error('db failed'),
    stage: 'persist',
  });
  assert.equal(cPersist.reasonCode, 'FAIL_PROFILE_UPSERT');
  assert.equal(cPersist.retryable, false);

  pass(name);
  return true;
}

async function testRetryPolicyAndSummary() {
  const name = 'Retry policy + summary marker helpers are stable';
  assert.equal(shouldRetryOnboardingFailure('FAIL_LLM_HTTP_429'), true);
  assert.equal(shouldRetryOnboardingFailure('FAIL_LLM_TIMEOUT'), true);
  assert.equal(shouldRetryOnboardingFailure('FAIL_LLM_HTTP_401'), false);

  const marker = buildStructuredLlmFailureMarker({
    reasonCode: 'FAIL_LLM_HTTP_401',
    stage: 'llm_request',
    httpStatus: 401,
    retryable: false,
    attempts: 1,
    model: 'meta-llama/llama-4-scout',
    requestId: 'req-123',
    apiBuild: 'build-x',
    failureMessage: 'User not found',
  });
  assert.equal(marker.error, 'LLM_FAILED');
  assert.equal(marker.reason_code, 'FAIL_LLM_HTTP_401');
  assert.equal(marker.request_id, 'req-123');

  const summary = createAiEnrichmentSummary();
  const next = applyAiSummary(summary.early_insights, {
    status: 'failed',
    reason_code: 'FAIL_LLM_HTTP_401',
    attempts: 1,
    model: 'meta-llama/llama-4-scout',
    http_status: 401,
    retryable: false,
    run_id: 'run-1',
  });
  assert.equal(next.status, 'failed');
  assert.equal(next.reason_code, 'FAIL_LLM_HTTP_401');
  assert.equal(next.http_status, 401);

  pass(name);
  return true;
}

async function main() {
  const checks = [testClassifierMappings, testRetryPolicyAndSummary];
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

import assert from 'node:assert/strict';
import {
  classifyOnboardingAiFailure,
  shouldRetryOnboardingFailure,
} from '../lib/onboarding_ai_reliability.js';

function pass(name) {
  console.log(`✅ ${name}`);
}

function fail(name, details) {
  console.error(`❌ ${name}: ${details}`);
}

async function simulateEarlyInsightsRun(errorFactory, maxAttempts = 3) {
  let attempts = 0;
  let lastReason = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      await errorFactory(attempts);
      return { status: 'success', attempts, reason: null };
    } catch (error) {
      const classified = classifyOnboardingAiFailure({
        error,
        stage: error?.stage || 'llm_request',
      });
      lastReason = classified.reasonCode;
      const canRetry =
        attempts < maxAttempts &&
        classified.retryable === true &&
        shouldRetryOnboardingFailure(classified.reasonCode);
      if (!canRetry) {
        return { status: 'failed', attempts, reason: classified.reasonCode };
      }
    }
  }

  return { status: 'failed', attempts, reason: lastReason };
}

async function testNoRetryOn401() {
  const name = '401 failures terminate early_insights in one attempt';
  const result = await simulateEarlyInsightsRun(async () => {
    throw new Error('OpenRouter error 401: User not found');
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.attempts, 1);
  assert.equal(result.reason, 'FAIL_LLM_HTTP_401');
  pass(name);
  return true;
}

async function testRetryOn429ThenSuccess() {
  const name = '429 failures retry and can recover';
  const result = await simulateEarlyInsightsRun(async (attempt) => {
    if (attempt < 3) {
      throw new Error('OpenRouter error 429: rate limit');
    }
    return { ok: true };
  });

  assert.equal(result.status, 'success');
  assert.equal(result.attempts, 3);
  pass(name);
  return true;
}

async function testRetryExhaustionOnTimeout() {
  const name = 'Timeout retries stop at max attempts';
  const result = await simulateEarlyInsightsRun(async () => {
    const err = new Error('timed out');
    err.name = 'AbortError';
    throw err;
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.attempts, 3);
  assert.equal(result.reason, 'FAIL_LLM_TIMEOUT');
  pass(name);
  return true;
}

async function main() {
  const checks = [testNoRetryOn401, testRetryOn429ThenSuccess, testRetryExhaustionOnTimeout];
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

import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('api/transactions_sync.js', 'utf8');

function pass(name) {
  console.log(`✅ ${name}`);
}

function fail(name, details) {
  console.error(`❌ ${name}: ${details}`);
}

async function testApiBuildConsistency() {
  const name = 'transactions_sync returns shared API_BUILD constant';
  assert.match(source, /const API_BUILD\s*=\s*"[^"]+"/);
  assert.match(source, /api_build:\s*API_BUILD/);
  pass(name);
  return true;
}

async function testAiEnrichmentResponseContract() {
  const name = 'transactions_sync response includes ai_enrichment contract';
  assert.match(source, /ai_enrichment:\s*aiEnrichment/);
  assert.match(source, /request_id:\s*requestId/);
  pass(name);
  return true;
}

async function testRequestIdInputContract() {
  const name = 'transactions_sync parses optional request_id input';
  assert.match(source, /request_id/);
  assert.match(source, /const requestId\s*=\s*/);
  pass(name);
  return true;
}

async function main() {
  const checks = [
    testApiBuildConsistency,
    testAiEnrichmentResponseContract,
    testRequestIdInputContract,
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

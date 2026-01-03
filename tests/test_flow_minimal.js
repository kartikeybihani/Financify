#!/usr/bin/env node

/**
 * Minimal end-to-end chatbot-like test (interactive)
 * Flow: classify -> decide -> (clarify? wait for reply) -> proceed (placeholder)
 * - Reuses classification + orchestrator helpers from tests/test_classification_direct.js
 * - Human-friendly logs + pretty-printed JSON summary
 * - Simple PII redaction in logs (emails/phones)
 * - Clarification reply read from stdin with 4-minute timeout
 *
 * Usage:
 *   node tests/test_flow_minimal.js "your query here" [--trace]
 */

import readline from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import {
  handleClassify,
  decideClarificationAction,
  generateClarifyingQuestion,
  TraceLogger,
} from './test_classification_direct.js';

// -------------- Utils --------------
function redactPII(str) {
  if (!str || typeof str !== 'string') return str;
  // mask emails
  const maskedEmail = str.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => {
    const [user, domain] = m.split('@');
    const safeUser = user.length > 2 ? user[0] + '***' + user.slice(-1) : '***';
    return `${safeUser}@${domain}`;
  });
  // mask phone numbers (very loose)
  const maskedPhone = maskedEmail.replace(/\b(?:\+?\d[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}\b/g, (m) => {
    return m.replace(/\d/g, (d, i) => (i < m.length - 4 ? '•' : d));
  });
  return maskedPhone;
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function promptWithTimeout(question, timeoutMs) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answerPromise = new Promise((resolve) => rl.question(question, (ans) => resolve(ans)));

    const timer = delay(timeoutMs, null).then(() => {
      throw new Error('timeout');
    });

    const ans = await Promise.race([answerPromise, timer]);
    return ans;
  } finally {
    rl.close();
  }
}

// -------------- Main --------------
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tests/test_flow_minimal.js "your query here" [--trace]');
    process.exit(2);
  }

  const enableTrace = args.includes('--trace');
  const userMessage = args.find((a) => !a.startsWith('--'));

  const trace = enableTrace ? new TraceLogger() : null;
  if (trace) trace.addStep('start', { message: userMessage });

  console.log(`\n🤖 Chatbot test starting`);
  console.log('='.repeat(80));
  console.log(`👤 User: ${redactPII(userMessage)}`);

  // Step 1: Classification
  console.log('\n📋 Step 1: Classification');
  const t1 = Date.now();
  const classification = await handleClassify(userMessage, null);
  const t1d = Date.now() - t1;
  if (trace) trace.addStep('classification', {
    intent: classification.intent,
    decision_risk: classification.decision_risk,
    info_sufficiency: classification.info_sufficiency,
    clarification_needed: classification.clarification_needed,
    duration_ms: t1d,
    model_fallback: classification.model_fallback || false,
    timeout_fallback: classification.timeout_fallback || false,
  });

  console.log(`  ✅ Intent: ${classification.intent}`);
  console.log(`  ✅ Risk: ${classification.decision_risk}, Sufficiency: ${classification.info_sufficiency}`);
  console.log(`  ✅ Clarification needed: ${classification.clarification_needed}`);
  if (classification.clarification_reasons?.length) {
    console.log(`  ✅ Reasons: ${classification.clarification_reasons.join(', ')}`);
  }
  console.log(`  ⏱️  Duration: ${t1d}ms`);

  // Step 2: Decide
  console.log('\n🤔 Step 2: Decision');
  const decision = decideClarificationAction(classification);
  if (trace) trace.addStep('orchestration', { action: decision.action, rationale: decision.rationale });
  console.log(`  ✅ Action: ${decision.action.toUpperCase()}`);
  console.log(`  ✅ Rationale: ${decision.rationale}`);

  let clarifyingQuestion = null;
  let userReply = null;

  if (decision.action === 'clarify') {
    // Step 3: Clarifying Question
    console.log('\n💬 Step 3: Clarifying Question');
    const t2 = Date.now();
    clarifyingQuestion = generateClarifyingQuestion(classification, userMessage);
    const t2d = Date.now() - t2;
    if (trace) trace.addStep('question_generation', { question: clarifyingQuestion, duration_ms: t2d });

    console.log(`  💬 Finny: ${clarifyingQuestion}`);
    console.log('  ⏳ Waiting for your reply (type and press Enter). This will timeout in 4 minutes...');

    try {
      userReply = await promptWithTimeout('You: ', 4 * 60 * 1000);
      console.log(`  ✍️  Received reply: ${redactPII(userReply)}`);
    } catch (err) {
      if (err && err.message === 'timeout') {
        console.log('  ⏰ Timed out waiting for reply. Exiting after printing JSON summary.');
      } else {
        console.log(`  ❌ Error while waiting for reply: ${err?.message || err}`);
      }
    }
  }

  // Step 4: Proceed (placeholder)
  console.log('\n✅ Step 4: Proceed to Answering (placeholder)');
  const proceedPayload = {
    initial_message: userMessage,
    clarifying_reply: userReply,
    note: 'This is a placeholder. Real answering would use both messages and user data if needed.'
  };
  if (trace) trace.addStep('proceed_to_answer', { used_placeholder: true });
  console.log('  ℹ️  Would answer now using:', redactPII(pretty(proceedPayload)));

  // Trace print
  if (trace) {
    trace.print();
  }

  // Final JSON summary
  const summary = {
    trace_id: trace ? trace.trace_id : `trace_${Date.now()}`,
    classification,
    decision,
    clarifyingQuestion,
    userReply,
    durations: {
      classification_ms: t1d,
    },
    flags: {
      model_fallback: classification.model_fallback || false,
      timeout_fallback: classification.timeout_fallback || false,
    }
  };

  console.log('\n' + '='.repeat(80));
  console.log('Final JSON Summary:');
  console.log(pretty(summary));
}

main().catch((err) => {
  console.error('Unhandled error in test_flow_minimal:', err);
  process.exit(1);
});

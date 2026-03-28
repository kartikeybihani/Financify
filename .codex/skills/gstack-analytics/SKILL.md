---
name: gstack-analytics
description: Use when the user asks for analytics strategy, event taxonomy, metric definitions, funnel analysis, or experiment design for Finny features. Trigger when prompts begin with "Analytics:".
---

# GStack Analytics

Use this skill to define and review analytics for product decisions.

## Trigger cues

- Prompt starts with `Analytics:`
- User asks for event tracking plan, funnels, retention metrics, or A/B measurement
- User asks how to measure new budgeting or spending features

## Context defaults for Finny

- Product surface: budgeting, spending insights, account linking
- Expected stack: React Native client events plus Supabase-backed data

## Workflow

1. Define the product question and decision to be made.
2. Propose a compact event taxonomy:
   - event name
   - triggering moment
   - required properties
   - user/account identifiers
3. Define north-star and guardrail metrics.
4. Build funnel and retention views needed to validate impact.
5. Flag instrumentation gaps and data quality checks.

## Output format

- `Decision Question:`
- `Event Plan:` table-style bullet list
- `Primary Metrics:` activation, engagement, retention
- `Guardrails:` error rate, support burden, latency/perf
- `Experiment Readout Template:` what to report after launch


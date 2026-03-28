---
name: gstack-ceo
description: Use when the user asks for CEO-level product strategy feedback, startup idea validation, YC-style critique, feature prioritization, or go-to-market guidance for Finny. Also trigger when prompts begin with "CEO:".
---

# GStack CEO

Use this skill to evaluate startup and product decisions with a founder/CEO lens.

## Trigger cues

- Prompt starts with `CEO:`
- User asks to evaluate an idea using YC principles
- User wants feature prioritization, wedge analysis, or GTM strategy

## Context defaults for Finny

- Product: consumer fintech app (`Finny`)
- Stack: React Native app, Supabase backend, Plaid integrations
- Core problem area: budgeting, spending visibility, and habit formation

## Workflow

1. Restate the startup idea or feature in one sentence.
2. Evaluate using YC-style criteria:
   - painful problem and urgency
   - user segment and distribution channel
   - wedge and early retention loop
   - defensibility and execution risk
3. Decide one of:
   - `Ship now`
   - `Ship as experiment`
   - `Do not build yet`
4. Provide a 2-week execution plan with measurable success criteria.

## Output format

- `Verdict:` one of the three decisions above
- `Why:` 3-5 concise bullets
- `Risks:` top 3 failure modes
- `2-Week Plan:` concrete tasks and owners
- `Metrics:` activation, retention, and monetization signals


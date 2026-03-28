---
name: gstack-auth
description: Use when the user asks to design, review, or debug authentication and onboarding flows for Finny, especially React Native + Supabase auth session handling and Plaid-linked account setup.
---

# GStack Auth

Use this skill for authentication and onboarding quality reviews.

## Trigger cues

- Prompt starts with `Auth:` or `Security:`
- User asks to review login, signup, session, MFA, password reset, or token handling
- User asks for auth-flow product and engineering tradeoffs

## Context defaults for Finny

- Client: React Native (Expo)
- Backend/Auth: Supabase Auth
- Data link: Plaid for financial account connectivity

## Workflow

1. Map the exact user journey (entry point to first successful account link).
2. Check security and reliability:
   - token storage and refresh strategy
   - session expiration and recovery paths
   - account-linking edge cases (errors, retries, reconnect)
   - least-privilege and sensitive-data handling
3. Identify friction and drop-off risks in onboarding UX.
4. Propose smallest safe improvement set.

## Output format

- `Flow Map:` numbered steps
- `Findings:` ranked by severity (high/med/low)
- `Fixes:` minimal implementation plan
- `Instrumentation:` events needed to measure drop-off and auth reliability


CREATE TABLE IF NOT EXISTS public.onboarding_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text,
  request_id text NOT NULL,
  api_build text NOT NULL,
  run_type text NOT NULL CHECK (run_type IN ('early_insights', 'base_analysis')),
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  attempt_no int NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
  max_attempts int NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  model text,
  provider text NOT NULL DEFAULT 'openrouter',
  enrichment_mode text,
  consent_state text NOT NULL CHECK (consent_state IN ('onboarding', 'chat_fallback', 'none')),
  tx_rows int,
  filtered_rows int,
  pattern_count int,
  http_status int,
  latency_ms int,
  failure_stage text CHECK (failure_stage IN ('precheck', 'profile_fetch', 'tx_fetch', 'pattern_compute', 'llm_request', 'llm_parse', 'persist')),
  failure_reason_code text CHECK (
    failure_reason_code IN (
      'SKIP_MODE_DISABLED',
      'SKIP_NO_CONSENT',
      'SKIP_MISSING_API_KEY',
      'SKIP_ALREADY_PRESENT',
      'SKIP_NO_TRANSACTIONS',
      'SKIP_NO_PATTERNS',
      'FAIL_PROFILE_FETCH',
      'FAIL_TX_FETCH',
      'FAIL_LLM_HTTP_401',
      'FAIL_LLM_HTTP_403',
      'FAIL_LLM_HTTP_429',
      'FAIL_LLM_HTTP_5XX',
      'FAIL_LLM_TIMEOUT',
      'FAIL_LLM_NETWORK',
      'FAIL_LLM_EMPTY_CONTENT',
      'FAIL_LLM_INVALID_JSON',
      'FAIL_PROFILE_UPSERT',
      'FAIL_UNKNOWN'
    )
  ),
  failure_message text,
  retryable boolean,
  output_valid boolean,
  profile_write_ok boolean,
  llm_request_payload jsonb,
  llm_response_payload jsonb,
  llm_response_text text,
  result_payload jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_ai_runs_req_type_attempt
  ON public.onboarding_ai_runs(request_id, run_type, attempt_no);

CREATE INDEX IF NOT EXISTS idx_onboarding_ai_runs_user_created
  ON public.onboarding_ai_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_ai_runs_status_created
  ON public.onboarding_ai_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_ai_runs_reason_created
  ON public.onboarding_ai_runs(failure_reason_code, created_at DESC);

ALTER TABLE public.onboarding_ai_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_onboarding_ai_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_ai_runs_updated_at ON public.onboarding_ai_runs;

CREATE TRIGGER trg_onboarding_ai_runs_updated_at
BEFORE UPDATE ON public.onboarding_ai_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_onboarding_ai_runs_updated_at();

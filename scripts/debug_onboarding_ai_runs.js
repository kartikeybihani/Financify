import 'dotenv/config';
import { supabase } from '../lib/api/supabase.js';

const userId = process.argv[2] || process.env.USER_ID;

if (!userId) {
  console.error('Usage: node scripts/debug_onboarding_ai_runs.js <user_id>');
  process.exit(1);
}

async function main() {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, first_name, created_at, updated_at, early_insights, base_analysis')
    .eq('id', userId)
    .maybeSingle();

  const { data: runs, error: runsError } = await supabase
    .from('onboarding_ai_runs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  console.log(
    JSON.stringify(
      {
        user_id: userId,
        profile_error: profileError
          ? { code: profileError.code, message: profileError.message }
          : null,
        runs_error: runsError
          ? { code: runsError.code, message: runsError.message }
          : null,
        profile,
        onboarding_ai_runs: runs || [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[debug_onboarding_ai_runs] failed', error);
  process.exit(1);
});

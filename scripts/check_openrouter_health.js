import 'dotenv/config';
import fetch from 'node-fetch';

const apiKey = String(
  process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_GROK_KEY || '',
).trim();

if (!apiKey) {
  console.error('OPENROUTER_API_KEY or OPENROUTER_GROK_KEY is not configured');
  process.exit(1);
}

const model =
  String(process.env.OPENROUTER_MODEL || 'meta-llama/llama-4-scout').trim() ||
  'meta-llama/llama-4-scout';

async function main() {
  const startedAt = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer':
        process.env.OPENROUTER_HTTP_REFERER ||
        process.env.VERCEL_URL ||
        'https://financify-rose.vercel.app',
      'X-Title': process.env.OPENROUTER_X_TITLE || 'Financify',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 30,
      messages: [
        { role: 'system', content: 'Return JSON only.' },
        { role: 'user', content: '{"status":"ok"}' },
      ],
    }),
  });

  const text = await res.text();
  const latencyMs = Date.now() - startedAt;

  if (!res.ok) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          status: res.status,
          latency_ms: latencyMs,
          model,
          error_preview: String(text || '').slice(0, 500),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        status: res.status,
        latency_ms: latencyMs,
        model,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[check_openrouter_health] failed', error?.message || error);
  process.exit(1);
});

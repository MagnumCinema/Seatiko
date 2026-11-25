#!/usr/bin/env node
// Checks the OpenRouter key the Twenty CRM's AI uses: one chat request to a free model,
// with every usual failure explained. Reads OPENROUTER_API_KEY from the environment.
//
//   node --env-file=.env scripts/check-openrouter.mjs            # default model
//   node --env-file=.env scripts/check-openrouter.mjs openrouter/free
//
// Free models only (slugs ending in ":free", or the "openrouter/free" router). Without
// credits OpenRouter allows about 50 free requests a day and 20 a minute.

const BASE_URL = 'https://openrouter.ai/api/v1';
const model = process.argv[2] ?? 'nvidia/nemotron-3-ultra-550b-a55b:free';
const key = process.env.OPENROUTER_API_KEY;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!key) fail('OPENROUTER_API_KEY is not set. Create a key at https://openrouter.ai/keys and put it in the root .env.');
if (model !== 'openrouter/free' && !model.endsWith(':free')) fail(`"${model}" is not a free model; use a slug ending in ":free" or "openrouter/free".`);

const EXPLAIN = {
  400: 'the request was refused (model slug or parameters)',
  401: 'the key is invalid or was revoked — create a new one at https://openrouter.ai/keys',
  402: 'no credits for this model — free models need ":free" in the slug',
  403: 'the request was blocked by moderation or the key has no access to this model',
  404: 'no provider serves this model with your privacy settings (https://openrouter.ai/settings/privacy)',
  408: 'the model took too long — try again',
  429: 'rate limit reached (free: ~20 per minute, ~50 per day without credits) — wait and try again, or pick another free model',
  502: 'the model provider failed — try again or pick another free model',
  503: 'no provider is available for this model right now — try another free model',
};

const started = Date.now();
let response;
try {
  response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Optional: how the app is shown on openrouter.ai.
      'HTTP-Referer': 'http://localhost',
      'X-OpenRouter-Title': 'Seatiko CRM',
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      messages: [
        { role: 'system', content: 'You are the assistant of a restaurant booking CRM. Answer in Russian, in one sentence.' },
        { role: 'user', content: 'Что нужно сделать менеджеру, если пришла бронь на 10 гостей?' },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
} catch (error) {
  fail(error?.name === 'TimeoutError' ? 'no answer within 90 s — try again' : `OpenRouter is unreachable: ${error?.message ?? error}`);
}

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  const upstream = body?.error?.metadata?.raw ? ` (${String(body.error.metadata.raw).slice(0, 200)})` : '';
  fail(`HTTP ${response.status}: ${EXPLAIN[response.status] ?? body?.error?.message ?? 'unexpected error'}${upstream}`);
}
// OpenRouter can answer 200 with an error from the provider inside.
if (body?.error) fail(`provider error: ${body.error.message ?? JSON.stringify(body.error)}`);

const answer = body?.choices?.[0]?.message?.content?.trim();
if (!answer) fail(`empty answer from ${body?.model ?? model} — try again or pick another free model`);

console.log(`✓ ${body.model ?? model} answered in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(answer);
if (body.usage) console.log(`tokens: ${body.usage.prompt_tokens} in, ${body.usage.completion_tokens} out`);

import fs from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const model = process.env.OPENAI_MODEL?.trim();
if (process.env.WHYLAB_AI_ENABLED !== 'true' || !process.env.OPENAI_API_KEY?.trim() || !model) {
  console.error(JSON.stringify({ ok: false, classification: 'not_configured' }));
  process.exit(1);
}

try {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, store: false, max_output_tokens: 16, input: 'Reply with exactly: available' }),
  });
  const body = await response.json().catch(() => ({}));
  const result = response.ok
    ? { ok: true, model: body.model, status: body.status, usage: body.usage && { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens, totalTokens: body.usage.total_tokens } }
    : { ok: false, status: response.status, classification: body.error?.type ?? 'provider_error', code: body.error?.code ?? null };
  console.log(JSON.stringify(result));
  if (!response.ok) process.exit(1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, classification: 'transport_error', error: error instanceof Error ? error.name : 'Error' }));
  process.exit(1);
}

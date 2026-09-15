import { repairContextRequestSchema, buildRepairContext } from '../../lib/investigation/repair-context.ts';
﻿import { isAIConfigured } from '../../lib/server/openai-service.ts';
import { recommendRepairWithAstra } from '../../lib/server/openai-repair.ts';
import { validateRepairLabInput } from '../../lib/investigation/repair-lab.ts';
import { createBudget } from '../../lib/explanations.ts';
export const runtime = 'nodejs';
const budget = createBudget(), headers = { 'Cache-Control': 'no-store' };
export function GET() { return Response.json({ available: isAIConfigured() }, { headers }); }
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Same-origin requests required.' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Use application/json.' }, { status: 415, headers });
  let input, context;
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    let body = '', size = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
    try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 10000000) { await reader.cancel(); throw new Error(); } body += decoder.decode(r.value, { stream: true }); } } finally { reader.releaseLock(); }
    const payload = JSON.parse(body + decoder.decode()); if (payload.consent !== true) throw new Error();
    input = validateRepairLabInput(payload.input);
    if (payload.context !== undefined) { context = repairContextRequestSchema.parse(payload.context); buildRepairContext(context, input.csv); }
  } catch { return Response.json({ error: 'Provide valid repair inputs and explicit consent; request limit is 10 MB; diagnosis context must be valid, match the selected dataset and fit 64 KB.' }, { status: 400, headers }); }
  if (!isAIConfigured()) return Response.json({ error: 'Astra is not configured. Local measurement remains available.' }, { status: 503, headers });
  const release = budget.acquire(); if (!release) return Response.json({ error: 'Request limit reached. Try later.' }, { status: 429, headers });
  try { return Response.json(await recommendRepairWithAstra(input, request.signal, context), { headers }); }
  catch { return Response.json({ error: 'Astra recommendation unavailable or failed validation. No repair was applied.' }, { status: 502, headers }); }
  finally { release(); }
}

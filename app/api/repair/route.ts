import { repairContextRequestSchema, buildRepairContext } from '../../lib/investigation/repair-context.ts';
﻿import { isAIConfigured } from '../../lib/server/openai-service.ts';
import { proposeRepairPolicyWithAstra, recommendRepairWithAstra } from '../../lib/server/openai-repair.ts';
import { validateRepairLabInput, validateRepairPolicyRequest } from '../../lib/investigation/repair-lab.ts';
import { createBudget } from '../../lib/explanations.ts';
import { authorizePaidRequest } from '../../lib/server/access-control.ts';
import { enforceSharedQuota } from '../../lib/server/shared-quota.ts';
export const runtime = 'nodejs';
const budget = createBudget(), headers = { 'Cache-Control': 'no-store' };
export function GET() { return Response.json({ available: isAIConfigured() }, { headers }); }
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Same-origin requests required.' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Use application/json.' }, { status: 415, headers });
  const authorization = authorizePaidRequest(request);
  if (authorization === 'not_configured') return Response.json({ error: 'Paid endpoint access control is not configured.' }, { status: 503, headers });
  if (authorization) return Response.json({ error: 'A valid access token is required.' }, { status: 401, headers });
  const quota = await enforceSharedQuota(request, 'repair');
  if (!quota.allowed) return Response.json({ error: quota.reason === 'limited' ? 'Shared repair limit reached. Try again later.' : 'Shared usage controls are unavailable.' }, { status: quota.reason === 'limited' ? 429 : 503, headers: { ...headers, 'Retry-After': String(quota.retryAfter) } });
  let input, context, action: 'repair'|'propose_policy'='repair';
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    let body = '', size = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
    try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 10000000) { await reader.cancel(); throw new Error(); } body += decoder.decode(r.value, { stream: true }); } } finally { reader.releaseLock(); }
    const payload = JSON.parse(body + decoder.decode()); if (payload.consent !== true) throw new Error();
    if(payload.action!==undefined&&!['repair','propose_policy'].includes(payload.action))throw new Error();
    action=payload.action==='propose_policy'?'propose_policy':'repair';
    input = action==='propose_policy'?validateRepairPolicyRequest(payload.input):validateRepairLabInput(payload.input);
    if (action==='repair'&&payload.context !== undefined) { context = repairContextRequestSchema.parse(payload.context); buildRepairContext(context, input.csv); }
  } catch { return Response.json({ error: 'Provide valid repair inputs and explicit consent; request limit is 10 MB; diagnosis context must be valid, match the selected dataset and fit 64 KB.' }, { status: 400, headers }); }
  if (!isAIConfigured()) return Response.json({ error: 'Astra is not configured. Local measurement remains available.' }, { status: 503, headers });
  const release = budget.acquire(); if (!release) return Response.json({ error: 'Request limit reached. Try later.' }, { status: 429, headers });
  try { return Response.json(action==='propose_policy'?await proposeRepairPolicyWithAstra(input,request.signal):await recommendRepairWithAstra(input, request.signal, context), { headers }); }
  catch { return Response.json({ error: 'Astra recommendation unavailable or failed validation. No repair was applied.' }, { status: 502, headers }); }
  finally { release(); }
}

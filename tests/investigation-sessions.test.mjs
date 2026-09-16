import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestEvaluationCsv } from '../app/lib/investigation/evaluation-ingestion.ts';
import { runInvestigator } from '../app/lib/investigation/investigator.ts';
import { buildFinalInvestigation } from '../app/lib/investigation/final-diagnosis.ts';
import { isInvestigationSessionStoreConfigured, loadInvestigationSession, saveInvestigationSession } from '../app/lib/server/investigation-sessions.ts';

async function fixture() {
  const dataset = ingestEvaluationCsv('y_true,y_pred,y_probability\n0,0,.1\n1,0,.1', 'test.csv');
  let turn = 0;
  const run = await runInvestigator({ objective: 'Inspect evaluation', consent: true, accuracyParadoxGap: 10, datasets: [dataset], trainingLogs: [] }, async history => {
    turn++;
    const output = turn === 1 ? null : JSON.parse(history.at(-1).output);
    return { status: 'completed', output: [{ type: 'function_call', call_id: `call_${turn}`, name: turn === 1 ? 'compute_classification_metrics' : 'finish_investigation', arguments: JSON.stringify(turn === 1 ? { datasetId: dataset.metadata.id, positiveLabel: '1' } : { reason: 'insufficient_evidence', evidenceIds: output.evidence.map(e => e.id), missingEvidence: ['More evaluation rows'] }) }] };
  }, new AbortController().signal);
  return buildFinalInvestigation(run);
}

function withRedis(t, callback) {
  const previousUrl = process.env.WHYLAB_SESSION_REST_URL, previousToken = process.env.WHYLAB_SESSION_REST_TOKEN;
  process.env.WHYLAB_SESSION_REST_URL = 'https://redis.example';
  process.env.WHYLAB_SESSION_REST_TOKEN = 'session-token';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.WHYLAB_SESSION_REST_URL; else process.env.WHYLAB_SESSION_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.WHYLAB_SESSION_REST_TOKEN; else process.env.WHYLAB_SESSION_REST_TOKEN = previousToken;
  });
  return callback();
}

test('session store is disabled without a dedicated or quota Redis configuration', t => {
  const url = process.env.WHYLAB_SESSION_REST_URL, token = process.env.WHYLAB_SESSION_REST_TOKEN, quotaUrl = process.env.WHYLAB_QUOTA_REST_URL, quotaToken = process.env.WHYLAB_QUOTA_REST_TOKEN;
  delete process.env.WHYLAB_SESSION_REST_URL; delete process.env.WHYLAB_SESSION_REST_TOKEN; delete process.env.WHYLAB_QUOTA_REST_URL; delete process.env.WHYLAB_QUOTA_REST_TOKEN;
  t.after(() => {
    for (const [key, value] of Object.entries({ WHYLAB_SESSION_REST_URL: url, WHYLAB_SESSION_REST_TOKEN: token, WHYLAB_QUOTA_REST_URL: quotaUrl, WHYLAB_QUOTA_REST_TOKEN: quotaToken })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  assert.equal(isInvestigationSessionStoreConfigured(), false);
});

test('session snapshots expire after 24 hours and restore only validated investigations', async t => withRedis(t, async () => {
  const originalFetch = globalThis.fetch, calls = [];
  let stored = '';
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/set/')) { stored = JSON.parse(init.body); return new Response(JSON.stringify({ result: 'OK' })); }
    if (String(url).includes('/expire/')) return new Response(JSON.stringify({ result: 1 }));
    return new Response(JSON.stringify({ result: stored }));
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const original = await fixture();
  const sessionId = await saveInvestigationSession(original);
  assert.match(sessionId, /^[a-f0-9]{32}$/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer session-token');
  const restored = await loadInvestigationSession(sessionId);
  assert.equal(restored?.id, original.id);
  stored = JSON.stringify({ investigation: original, expiresAt: '2000-01-01T00:00:00.000Z' });
  assert.equal(await loadInvestigationSession(sessionId), null);
  assert.equal(await loadInvestigationSession('not-an-id'), null);
}));

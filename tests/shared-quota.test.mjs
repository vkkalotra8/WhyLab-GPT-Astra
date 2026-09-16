import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceSharedQuota } from '../app/lib/server/shared-quota.ts';

function configure(t) {
  const previous = { ...process.env }, originalFetch = globalThis.fetch;
  process.env.WHYLAB_QUOTA_REST_URL = 'https://quota.example'; process.env.WHYLAB_QUOTA_REST_TOKEN = 'private-token';
  t.after(() => { for (const key of ['WHYLAB_QUOTA_REST_URL','WHYLAB_QUOTA_REST_TOKEN']) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } globalThis.fetch = originalFetch; });
}
const request = () => new Request('https://app.example/api/investigate', { headers: { 'x-whylab-access-token': 'access', 'x-forwarded-for': '203.0.113.5' } });

test('shared quota fails closed without configuration', async t => {
  const before = process.env.WHYLAB_QUOTA_REST_URL; delete process.env.WHYLAB_QUOTA_REST_URL; t.after(()=>before===undefined?delete process.env.WHYLAB_QUOTA_REST_URL:process.env.WHYLAB_QUOTA_REST_URL=before);
  assert.deepEqual(await enforceSharedQuota(request(), 'investigate'), { allowed:false, reason:'not_configured', retryAfter:60 });
});

test('shared quota uses opaque keys and accepts counts within limits', async t => {
  configure(t); let sent;
  globalThis.fetch = async (_url, init) => { sent = JSON.parse(init.body); return Response.json([{result:1},{result:1},{result:1},{result:1}]); };
  assert.deepEqual(await enforceSharedQuota(request(), 'investigate'), { allowed:true });
  assert.ok(!JSON.stringify(sent).includes('access') && !JSON.stringify(sent).includes('203.0.113.5'));
});

test('shared quota returns limits and fails closed on store errors', async t => {
  configure(t); globalThis.fetch = async()=>Response.json([{result:4},{result:1},{result:4},{result:1}]);
  const limited=await enforceSharedQuota(request(),'investigate'); assert.equal(limited.allowed,false); assert.equal(limited.reason,'limited'); assert.ok(limited.retryAfter>=1);
  globalThis.fetch=async()=>{throw new Error('offline')}; assert.deepEqual(await enforceSharedQuota(request(),'repair'),{allowed:false,reason:'unavailable',retryAfter:60});
});

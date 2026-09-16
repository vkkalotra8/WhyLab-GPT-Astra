import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizePaidRequest, isAccessControlConfigured } from '../app/lib/server/access-control.ts';

function withToken(t, value) {
  const previous = process.env.WHYLAB_ACCESS_TOKEN;
  if (value === undefined) delete process.env.WHYLAB_ACCESS_TOKEN; else process.env.WHYLAB_ACCESS_TOKEN = value;
  t.after(() => previous === undefined ? delete process.env.WHYLAB_ACCESS_TOKEN : process.env.WHYLAB_ACCESS_TOKEN = previous);
}

test('paid access fails closed without deployment configuration', t => {
  withToken(t, undefined);
  assert.equal(isAccessControlConfigured(), false);
  assert.equal(authorizePaidRequest(new Request('http://localhost')), 'not_configured');
});

test('paid access rejects missing, wrong and oversized credentials', t => {
  withToken(t, 'correct-secret');
  assert.equal(authorizePaidRequest(new Request('http://localhost')), 'unauthorized');
  assert.equal(authorizePaidRequest(new Request('http://localhost', { headers: { 'x-whylab-access-token': 'wrong-secret' } })), 'unauthorized');
  assert.equal(authorizePaidRequest(new Request('http://localhost', { headers: { 'x-whylab-access-token': 'x'.repeat(513) } })), 'unauthorized');
});

test('paid access accepts only the exact configured credential', t => {
  withToken(t, 'correct-secret');
  assert.equal(isAccessControlConfigured(), true);
  assert.equal(authorizePaidRequest(new Request('http://localhost', { headers: { 'x-whylab-access-token': 'correct-secret' } })), null);
});

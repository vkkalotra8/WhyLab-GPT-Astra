import { randomUUID } from 'node:crypto';
import { validateFinalInvestigation } from '../investigation/final-diagnosis.ts';
import type { Investigation } from '../investigation/types.ts';

const ttlSeconds = 60 * 60 * 24;
const sessionIdPattern = /^[a-f0-9]{32}$/;
type PersistedSession = { investigation: Investigation; expiresAt: string };

function configuration() {
  const url = (process.env.WHYLAB_SESSION_REST_URL ?? process.env.WHYLAB_QUOTA_REST_URL)?.replace(/\/$/, '');
  const token = process.env.WHYLAB_SESSION_REST_TOKEN ?? process.env.WHYLAB_QUOTA_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function key(sessionId: string) { return `whylab:investigation-session:${sessionId}`; }

export function isInvestigationSessionStoreConfigured() { return configuration() !== null; }

export async function saveInvestigationSession(investigation: Investigation): Promise<string | null> {
  const redis = configuration();
  if (!redis) return null;
  const sessionId = randomUUID().replaceAll('-', '');
  const value = JSON.stringify({ investigation: validateFinalInvestigation(investigation), expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() } satisfies PersistedSession);
  try {
    const response = await fetch(`${redis.url}/set/${key(sessionId)}`, { method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${redis.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) return null;
    const expiry = await fetch(`${redis.url}/expire/${key(sessionId)}/${ttlSeconds}`, { method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${redis.token}` } });
    return expiry.ok ? sessionId : null;
  } catch { return null; }
}

export async function loadInvestigationSession(sessionId: string): Promise<Investigation | null> {
  if (!sessionIdPattern.test(sessionId)) return null;
  const redis = configuration();
  if (!redis) return null;
  try {
    const response = await fetch(`${redis.url}/get/${key(sessionId)}`, { cache: 'no-store', headers: { Authorization: `Bearer ${redis.token}` } });
    if (!response.ok) return null;
    const body = await response.json();
    const raw = body?.result;
    if (typeof raw !== 'string') return null;
    const stored = JSON.parse(raw) as PersistedSession;
    if (!stored || typeof stored.expiresAt !== 'string' || Date.parse(stored.expiresAt) <= Date.now()) return null;
    return validateFinalInvestigation(stored.investigation);
  } catch { return null; }
}

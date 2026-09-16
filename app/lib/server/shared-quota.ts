import { createHash } from 'node:crypto';

type QuotaResult = { allowed: true } | { allowed: false; reason: 'not_configured' | 'unavailable' | 'limited'; retryAfter: number };
const limits = { investigate: { minute: 3, day: 20 }, repair: { minute: 4, day: 30 }, explain: { minute: 10, day: 100 } } as const;

function identity(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const token = request.headers.get('x-whylab-access-token') || '';
  return createHash('sha256').update(`${token}\0${forwarded}`).digest('hex').slice(0, 32);
}

/** Atomic shared counters through an Upstash-compatible Redis REST pipeline. */
export async function enforceSharedQuota(request: Request, operation: keyof typeof limits): Promise<QuotaResult> {
  const url = process.env.WHYLAB_QUOTA_REST_URL?.replace(/\/$/, '');
  const token = process.env.WHYLAB_QUOTA_REST_TOKEN;
  if (!url || !token) return { allowed: false, reason: 'not_configured', retryAfter: 60 };
  const now = Date.now(), minute = Math.floor(now / 60000), day = Math.floor(now / 86400000), id = identity(request);
  const minuteKey = `whylab:${operation}:${id}:m:${minute}`, dayKey = `whylab:${operation}:${id}:d:${day}`;
  try {
    const response = await fetch(`${url}/pipeline`, { method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', minuteKey], ['EXPIRE', minuteKey, 120], ['INCR', dayKey], ['EXPIRE', dayKey, 172800]]) });
    if (!response.ok) return { allowed: false, reason: 'unavailable', retryAfter: 60 };
    const values = await response.json();
    const minuteCount = Number(values?.[0]?.result), dayCount = Number(values?.[2]?.result);
    if (!Number.isSafeInteger(minuteCount) || !Number.isSafeInteger(dayCount)) return { allowed: false, reason: 'unavailable', retryAfter: 60 };
    if (minuteCount > limits[operation].minute) return { allowed: false, reason: 'limited', retryAfter: Math.max(1, 60 - Math.floor(now / 1000) % 60) };
    if (dayCount > limits[operation].day) return { allowed: false, reason: 'limited', retryAfter: Math.max(1, 86400 - Math.floor(now / 1000) % 86400) };
    return { allowed: true };
  } catch { return { allowed: false, reason: 'unavailable', retryAfter: 60 }; }
}

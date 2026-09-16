import { timingSafeEqual } from 'node:crypto';

export const ACCESS_HEADER = 'x-whylab-access-token';

export function isAccessControlConfigured() {
  return Boolean(process.env.WHYLAB_ACCESS_TOKEN?.trim());
}

/** Paid endpoints fail closed when no deployment token is configured. */
export function authorizePaidRequest(request: Request): 'not_configured' | 'unauthorized' | null {
  const expected = process.env.WHYLAB_ACCESS_TOKEN?.trim();
  if (!expected) return 'not_configured';
  const supplied = request.headers.get(ACCESS_HEADER);
  if (!supplied || supplied.length > 512) return 'unauthorized';
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? null : 'unauthorized';
}

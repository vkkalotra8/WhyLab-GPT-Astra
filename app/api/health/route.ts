import { isAIConfigured } from '../../lib/server/openai-service.ts';
import { isAccessControlConfigured } from '../../lib/server/access-control.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness/readiness probe for a hosted deployment. It reports configuration
 * booleans only; credentials, model names and quota URLs are never returned.
 * `/api/health` is liveness, while `/api/health?ready=1` is the paid-feature
 * readiness gate used by deployment smoke checks.
 */
export function GET(request: Request) {
  const checks = {
    accessControl: isAccessControlConfigured(),
    sharedQuota: Boolean(process.env.WHYLAB_QUOTA_REST_URL?.trim() && process.env.WHYLAB_QUOTA_REST_TOKEN?.trim()),
    aiProvider: isAIConfigured(),
  };
  const ready = Object.values(checks).every(Boolean);
  const wantsReadiness = new URL(request.url).searchParams.get('ready') === '1';
  return Response.json(
    { status: wantsReadiness && !ready ? 'not_ready' : 'ok', checks },
    { status: wantsReadiness && !ready ? 503 : 200, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}

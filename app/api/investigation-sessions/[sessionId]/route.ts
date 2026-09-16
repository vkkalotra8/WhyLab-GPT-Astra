import { authorizePaidRequest } from '../../../lib/server/access-control.ts';
import { isInvestigationSessionStoreConfigured, loadInvestigationSession } from '../../../lib/server/investigation-sessions.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const authorization = authorizePaidRequest(request);
  if (authorization === 'not_configured') return Response.json({ error: 'Investigation restoration is not configured.' }, { status: 503, headers });
  if (authorization) return Response.json({ error: 'A valid access token is required.' }, { status: 401, headers });
  if (!isInvestigationSessionStoreConfigured()) return Response.json({ error: 'Investigation restoration is unavailable.' }, { status: 503, headers });
  const { sessionId } = await context.params;
  const investigation = await loadInvestigationSession(sessionId);
  if (!investigation) return Response.json({ error: 'This saved investigation is unavailable or has expired.' }, { status: 404, headers });
  return Response.json({ investigation }, { headers });
}

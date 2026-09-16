const base = (process.env.WHYLAB_PUBLIC_URL || '').trim().replace(/\/$/, '');
if (!base) {
  console.error('Set WHYLAB_PUBLIC_URL to the deployed HTTPS origin.');
  process.exit(2);
}
if (!/^https:\/\//i.test(base)) {
  console.error('WHYLAB_PUBLIC_URL must use HTTPS.');
  process.exit(2);
}

const checks = [];
async function check(name, request, expected) {
  try {
    const response = await fetch(request);
    const body = await response.json().catch(() => null);
    const pass = expected(response, body);
    checks.push({ name, pass, status: response.status });
    if (!pass) console.error(`${name}: unexpected response`, response.status, body);
  } catch (error) {
    checks.push({ name, pass: false, error: error instanceof Error ? error.message : String(error) });
    console.error(`${name}: request failed`, error instanceof Error ? error.message : error);
  }
}

await check('liveness', `${base}/api/health`, (response, body) => response.status === 200 && body?.status === 'ok');
await check('readiness', `${base}/api/health?ready=1`, (response, body) => response.status === 200 && body?.status === 'ok');
const failed = checks.filter(check => !check.pass);
console.log(JSON.stringify({ base, checks }, null, 2));
if (failed.length) process.exit(1);

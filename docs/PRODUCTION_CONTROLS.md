# Production controls

Every paid POST route (`/api/investigate`, `/api/repair`, and AI mode on `/api/explain`) requires a deployment access token in `X-WhyLab-Access-Token`. Configure `WHYLAB_ACCESS_TOKEN` with a long random secret and distribute it only to authorized demo users. The browser retains entered tokens only in component memory; it does not write them to local storage.

Shared rate limits use an Upstash-compatible Redis REST pipeline configured by `WHYLAB_QUOTA_REST_URL` and `WHYLAB_QUOTA_REST_TOKEN`. Missing or unavailable shared quota storage fails closed before OpenAI is called. Keys contain only a SHA-256-derived identifier, not the access token or forwarded client address.

Current shared ceilings are:

| Operation | Per minute | Per UTC day |
| --- | ---: | ---: |
| Investigation | 3 | 20 |
| Repair | 4 | 30 |
| Explanation | 10 | 100 |

Exceeded limits return HTTP 429 with `Retry-After`. Missing access/quota configuration returns 503, and invalid credentials return 401. Existing process-local budgets add concurrency and burst protection but are not the durable authority.

Provider calls retain explicit request ceilings: 1,800 output tokens for explanations and repair turns; 2,000 per investigator turn; 16 investigation rounds; 10 executed diagnostics; two repair turns; bounded response bytes; deadlines; no automatic retries; and `store:false`. Safe provider classifications distinguish exhausted credits, ordinary rate limiting, authentication, model/project access, and other provider failures without returning upstream bodies or secrets.

Before deployment:

1. Configure all six server-only variables from `.env.example`; never use a `NEXT_PUBLIC_` prefix.
2. Put the site behind HTTPS and platform DDoS/bot protection.
3. Rotate the deployment token after any public demo or suspected disclosure.
4. Verify unauthenticated, incorrect-token, quota-store-down, minute-limit, and day-limit cases before adding API credits.
5. Monitor provider usage and set the OpenAI project budget/limits independently. Application limits are defense in depth, not a billing guarantee.

## Hosted smoke check

The public deployment exposes `GET /api/health` as a liveness probe. It returns
only boolean configuration checks and never returns credentials, model names or
quota URLs. `GET /api/health?ready=1` is the paid-feature readiness gate: it
requires the access token, shared quota store and AI provider configuration.

After deploying over HTTPS, run:

```powershell
$env:WHYLAB_PUBLIC_URL = 'https://your-deployment.example'
npm.cmd run check:deployment
```

This performs liveness and readiness requests without sending an AI request or
spending API credits. A successful result proves the deployment is reachable
and configured; it does not prove OpenAI account credits or a successful Astra
investigation. Hosted CI still requires a real GitHub Actions run.

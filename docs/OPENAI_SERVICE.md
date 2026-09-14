# Milestone 11: OpenAI server foundation

The existing `/api/explain` endpoint delegates provider work to `app/lib/server/openai-service.ts`. Its `server-only` import prevents client-component use. Route-level same-origin checks, explicit AI consent, body limits, concurrency/request budgets, and no-store responses remain in place. The local explanation mode remains an explicit user choice; an AI failure never becomes a fabricated AI response.

The service uses the existing native fetch Responses API integration, strict JSON-schema output, `store: false`, and the existing runtime explanation validator (including evidence references). It rejects incomplete responses, refusals, invalid JSON and invalid claims. No SDK or package was added. Provider tools and investigator orchestration are Milestone 12.

## Configuration

Set `WHYLAB_AI_ENABLED=true`, `OPENAI_API_KEY`, and `OPENAI_MODEL` privately in `.env.local`, using a model accessible to your OpenAI project with Responses structured-output support. Blank values disable availability. No default model, guessed Astra identifier, or production mock is substituted. `/api/explain` GET exposes only an availability boolean; this indicates configuration presence, not verified account/model access. No live provider request was made during this milestone.

## Errors and diagnostics

A 25-second deadline and caller cancellation cover fetch and response-body reading. The service returns a sanitized `AIServiceError` with a bounded outcome code. The HTTP route retains its generic error response and releases request budget in `finally`.

Server logging emits only operation, outcome code, HTTP status or null, and duration. It omits keys, model configuration, prompts, evidence, provider bodies, and exception details. Codes distinguish configuration, input, transport, HTTP, response, refusal, output validation, cancellation, timeout, and success. There are no automatic retries that could duplicate provider spending.

## Verification

`tests/explanation-route.test.mjs` loads the real service through a test-only TypeScript harness; the server-only marker is stubbed only there. Fetch stubs and synthetic credentials live exclusively in tests. Tests cover route protections, structured requests, runtime evidence validation, safe errors/logs, configuration, cancellation, and deadlines. Live model access remains a deployment check.

API reference verified against [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

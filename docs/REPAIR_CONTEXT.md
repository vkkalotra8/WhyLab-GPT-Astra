# Structured diagnosis context for Astra repair

Linked repair requests now carry the original diagnosis, hypotheses, evidence, verification experiments, prior repairs/comparisons and tool provenance. The same bounded context is supplied explicitly on both provider turns. Standalone repair remains available without it. This is explicit context continuation, not a persistent provider conversation or stored hidden reasoning.

The canonical investigation and selected dataset are validated before any provider call. CSV row counts and recorded classification measurements are checked against locally recomputed values. Context excludes raw evaluation rows and full tool outputs, is limited to 64,000 UTF-8 bytes, and rejects oversize requests without silently truncating evidence. The outer request limit is 10,000,000 bytes; existing CSV input limits still apply.

Consent describes the linked diagnosis and history sent to OpenAI. Prompts treat this context as untrusted evidence, retain unresolved or rejected conclusions, and distinguish operating-policy improvement from causal verification. Client-provided history is structurally validated, not authenticated as a historical server record. Matching aggregate metrics does not prove identical underlying rows.

Validation: 322 tests, lint, type checking and production build passed on 2026-09-16. Mocked provider tests verify identical context on both turns and rejection before provider fetch for invalid context. No paid API calls were made. Live model/account access and a complete live demonstration remain unverified.

Browser validation: all 29 checks passed against an AI-disabled local server with mocked provider responses. The runner emitted the existing Node module-type warning, surfaced by PowerShell as NativeCommandError; no browser assertion failed.

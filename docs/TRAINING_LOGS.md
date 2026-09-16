# Training logs in Astra investigations

Add an optional plain-text training log alongside the required evaluation CSVs. Use the synthetic log button or paste up to 16,000 UTF-8 bytes, 200 lines, and 3,000 characters per line. Blank lines are omitted from observations but original line numbers are retained. Binary control characters and oversized input are rejected without truncation.

Each nonblank line becomes an unverified source-linked observation, not a recomputed metric. The source and evidence IDs survive final diagnosis, graph/export, and subsequent structured repair context. Astra receives the observations as untrusted evidence and can reference them when proposing hypotheses. Logs have no inferred dataset association and cannot independently verify a cause; CSV diagnostics and the existing verification protocols remain necessary.

Consent explicitly includes training-log text. Clear evidence removes it and editing resets consent/results. No paid calls are needed to exercise the controls. This increment supports pasted text; richer artifact uploads, structured epoch diagnostics inside the autonomous loop, and log-only investigations remain future work.

Validation (2026-09-16): 327 tests, lint, type checking, production build and 30 browser checks passed. Browser checks used an AI-disabled production server and mocked provider responses; no paid calls were made. An initial development-server browser run timed out during cold compilation; the production retry passed.

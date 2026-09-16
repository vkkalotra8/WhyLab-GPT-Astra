# Training logs in Astra investigations

Add an optional training artifact alongside the required evaluation CSVs. The UI accepts bounded `.txt`, `.log`, `.json`, or `.csv` artifacts, or pasted text, up to 16,000 UTF-8 bytes, 200 lines, and 3,000 characters per line. Blank lines are omitted from observations but original line numbers are retained. Binary control characters and oversized input are rejected without truncation.

Each nonblank line becomes an unverified source-linked observation, not a recomputed metric. The source and evidence IDs survive final diagnosis, graph/export, and subsequent structured repair context. Astra receives the observations as untrusted evidence and can reference them when proposing hypotheses. Logs have no inferred dataset association and cannot independently verify a cause; CSV diagnostics and the existing verification protocols remain necessary.

Consent explicitly includes artifact text. The autonomous investigator now receives both source-linked unverified observations and the local parser's structured epoch history, heuristic findings, and warnings in its first Astra context. Astra may use those artifacts to choose a relevant diagnostic, but they are not promoted to measured evaluation metrics or causal proof. Evaluation CSVs remain required; log-only investigations are intentionally not enabled.

Clear evidence removes the artifact and editing resets consent/results. No paid calls are needed to exercise the controls. Artifact parsing is bounded and deterministic; parser limitations and experiment identity are retained as limitations rather than silently inferred.

Validation (2026-09-16): 327 tests, lint, type checking, production build and 30 browser checks passed. Browser checks used an AI-disabled production server and mocked provider responses; no paid calls were made. An initial development-server browser run timed out during cold compilation; the production retry passed.

Structured epoch validation (2026-09-16): CSV and JSON metric histories, reported loss divergence, malformed/restarted epochs, warning propagation, UI preview, and clear/reset behavior are covered. 358 tests, lint, type checking, production build, and 30 browser checks passed.

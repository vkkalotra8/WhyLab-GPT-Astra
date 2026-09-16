# Local investigation draft recovery

The Astra workspace can optionally store a draft in the current browser's local storage. It preserves pasted evaluation CSV text, a training artifact, labels, objective, threshold gap, specialist lens, and steering note. On reload, the draft restores those values and asks the user to confirm consent again before starting a new investigation.

This feature does not store an access token, consent state, provider activity, completed investigation, repair state, or uploaded file handles. Users must select uploaded files again after reload. They can discard the saved draft at any time.

This is local recovery for interrupted setup, not durable asynchronous execution. A real cross-process continuation requires a deployed session store, background worker/queue, authenticated ownership, cancellation semantics, retention policy, and shared quota enforcement. WhyLab does not claim those capabilities yet.

Validation (2026-09-16): 358 tests, lint, type checking, production build, and 31 browser checks passed. The browser flow verifies reload/restore, fresh consent, empty access token, and explicit deletion. No paid provider calls were made.

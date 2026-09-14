# Milestone 14: Autonomous investigation workflow

The homepage Astra workspace connects evaluation CSV ingestion, the real server-only OpenAI investigator, deterministic diagnostics and final diagnosis. Users can choose up to three CSV files or paste predictions, set class labels and a verification gap, provide an objective, explicitly consent, and select **INVESTIGATE WITH ASTRA**.

The synthetic example supplies input predictions only. Production investigation responses always come from the configured provider and deterministic tools; no production mock or staged progress animation substitutes for execution.

## Request and stream boundary

`/api/investigate` exposes a configuration-presence check and a same-origin JSON POST. POST enforces consent, input shape, a bounded upload read with timeout, file/row limits, request budget and normalized evaluation validation. It streams newline-delimited JSON containing only safe activity messages and the validated final investigation, or a terminal error. Responses are not cached.

Activity messages describe executed actions: dataset parsing, diagnostic requests/completion, hypothesis registration, tests, reused results, rejected operations and loop completion/stopping. Provider reasoning and raw provider responses are never streamed. Repair-generation and re-evaluation events are absent because those operations have not yet been implemented.

Cancellation propagates from the browser or disconnected response to server execution. The client rejects malformed, oversized, truncated or out-of-order streams and validates final investigation objects before displaying them. Failure feedback is visible and retryable; a failed final diagnosis retains any available evidence. Browser cancellation cannot guarantee a provider request was not already billed.

## Presentation and lifecycle

The result shows diagnosis status, evidence strength, measured accuracy/balanced accuracy/minority recall, hypothesis outcomes, verification, unresolved questions, limitations and inspectable provenance. JSON export contains the canonical final investigation. Undefined metrics remain explicitly undefined. New investigation resets the Astra workspace and aborts its active request. Editing evidence/settings clears prior results and consent.

Labels, keyboard-visible focus, responsive metric grids and live status feedback are provided. Astra progress has no simulated animation; existing reduced-motion behavior is preserved. The local investigation workspace remains available independently. Astra runs are held in memory; they are not silently added to the local case library.

## Configuration and limitations

Configure private `WHYLAB_AI_ENABLED`, `OPENAI_API_KEY` and `OPENAI_MODEL` settings as described in OPENAI_SERVICE.md. The UI's configured status does not verify account/model access. Deployment must permit streaming and the route's requested execution duration; platform timeouts may interrupt runs. Live provider access was not exercised during automated verification.

## Tests

`tests/investigation-workflow.test.mjs` exercises the route with real ingestion, deterministic diagnostics and finalization behind a test-only provider boundary. It covers consent/origin/type/configuration checks, invalid uploads, progress/results, provider failure, disconnect cancellation, UTF-8 chunking, stream limits and malformed/truncated messages.

`scripts/browser-check.mjs` tests streamed result presentation, measured metrics, consent reset, cancellation and retry using a test-only browser fetch interception. Existing local workflow, keyboard, reduced-motion and mobile-overflow regressions remain included. Production source contains no test-response switch.

Next: Milestone 15, repair candidate generation.

# Repair Lab (Milestone 19)

The homepage Repair Lab accepts evaluation CSV text and an explicit objective, false-negative cost, false-positive cost, maximum total cost, and baseline threshold. **Load repair example** loads the committed synthetic melanoma fixture. Labels are currently 1/0, with probability referring to label 1. CSV size is limited to 2 MB and existing ingestion row/column limits apply. Numeric cost fields are authoritative. Astra can translate prose into a review-only numeric proposal, but those values do not become authoritative until the user explicitly confirms them.

## Workflow

1. Optionally select **Ask Astra to translate objective**. Astra proposes error weights, a maximum total cost, rationale and explicit assumptions from the prose objective and bounded dataset summary.
2. Review and explicitly confirm the proposal, edit it, or discard it. Nothing is measured or applied from an unconfirmed proposal.
3. Select **Measure local candidates**, or confirm consent and select **Ask Astra for repair**.
4. Inspect all operating-point metrics and candidate threshold. The current policy remains the baseline.
5. Select **Apply recommended policy** to run the existing re-evaluation engine on an evaluation copy. Live metrics and confusion counts change only after application. Re-test status and the canonical evidence graph appear.
6. **Restore baseline preview** returns the display to the original baseline. This discards the current applied preview; it is not a durable repair history.

Changing any evidence/policy field clears the candidate, applied preview, interpretation and consent. Busy controls are disabled; Astra requests can be cancelled. Missing configuration, refusal, incompatible objectives, invalid responses and unmet targets produce explicit feedback. Local computation is always labeled local, never attributed to Astra.

## Deterministic policy

The threshold sweep includes 0 to 1 in steps of 0.01 plus the exact baseline threshold. Baseline predictions must reproduce every supplied predicted label. Total cost is FN × declared FN cost + FP × declared FP cost. Select minimum measured cost meeting the caller's maximum; exact ties choose the highest threshold. There is no candidate when the target is infeasible. At least one cost must be positive; costs and targets are finite and bounded. Application calls Milestone 16's re-evaluation engine with the same cost policy and criterion, preserving original rows and separate before/after evidence.

The live table retains every operating-point metric, including precision, recall, specificity and balanced accuracy, with explicit undefined states. Same-data tuning/re-testing does not establish independent holdout reliability. Scores remain unchanged; no model is retrained. Cost results are labeled **Simulated impact under the supplied cost model.**

## Astra boundary

`POST /api/repair` accepts same-origin JSON, a bounded body and explicit consent. For `propose_policy`, the CSV stays on the application server; OpenAI receives the objective, row count, labels, baseline threshold and confusion counts. Strict structured output bounds all three proposed numbers and requires rationale plus assumptions. The application validates the response again, and the UI requires an explicit confirmation before copying values into authoritative fields.

For repair selection, only the objective/policy and computed summaries go to OpenAI. It uses the configured `OPENAI_MODEL`, never a substitute. The first Responses call chooses `threshold_sweep` or `decline_repair` with no model-controlled numeric arguments. The server then independently runs the deterministic engine. A second bounded call interprets trade-offs by selecting metric names and directions, including cost, recall and precision. All returned directions must match measurements; arbitrary model prose and invented numbers are not accepted. These constrained interpretations are displayed separately from authoritative values.

The provider uses a 50-second overall deadline, cancellation, 256 KB per-response bound, no retries, `store:false`, strict schemas and two calls maximum. API errors are sanitized and request budgets are process-local. The endpoint is not authenticated; public deployment still needs shared quotas/access control. Provider behavior follows the [official function-calling guide](https://developers.openai.com/api/docs/guides/function-calling).

## Verification

`tests/repair-lab.test.mjs` covers policy-translation contracts, raw-row exclusion, required assumptions, invalid model numbers, input policy bounds, candidate/application separation, changed costs, infeasible targets, canonical immutability, two-turn provider execution, tool refusal/validation, false directions, transport failures, cancellation, consent, origin and missing configuration. Provider tests use mocked fetch, not a production fallback. A live account/model call remains a manual configuration check.

This is a standalone binary evaluation Repair Lab with its own canonical investigation. It does not silently change an existing Astra diagnosis or the synthetic flagship's fixed protocol. General training repairs, custom label mapping and durable repair-history persistence remain outside this milestone.

## Connected investigation follow-up

Repair Lab is also embedded in Astra results when the original submitted dataset can be rebound safely. In this mode it appends to the existing canonical investigation and updates parent reports after application. See [Connected repair](CONNECTED_REPAIR.md). The standalone behavior described above remains available.

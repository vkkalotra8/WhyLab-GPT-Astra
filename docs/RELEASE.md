# WhyLab 0.1.0 - local release candidate

This release runs the full evidence-to-verification workflow locally, with optional server-side AI explanations. It has not been published to a hosting provider.

## Repeatable release checks

Use Node 24 (the tests use native TypeScript loading). No additional packages are needed.

```powershell
npm.cmd run check
npm.cmd run start -- --port 3109
```

In a second terminal:

```powershell
npm.cmd run test:browser
```

The browser runner uses installed Chrome and the Chrome DevTools Protocol. Override `WHYLAB_BROWSER` with an installed Chromium/Edge executable and `WHYLAB_TEST_URL` with a running local server URL if needed. It creates an isolated temporary browser profile, cleans it up, and writes screenshots and a JSON report to `artifacts/` (git-ignored). The runner does not download browser binaries or testing packages. Avoid pointing it at a shared live deployment: it exercises local case creation and imports.

The runner uses an explicit CDP port (`WHYLAB_CDP_PORT`, default `9224`) and
safe headless flags. Set a different free port when running checks in parallel.

## Coverage

- Parser rules, CSV quoting/mapping, multiple evidence files, regression metrics, and missing/ambiguous evidence.
- Dataset comparisons and hypothesis ranking, including conflicting context.
- Lesson calculations and verification comparisons.
- Case serialization, malformed import rejection, invalid metric ranges, duplicate epoch history, and inconsistent experiment deltas.
- Explanation request/output validation, provider failure/refusal/timeout handling, consent, and process-local limits (mocked provider; no paid API calls).
- Browser workflows: keyboard tab navigation and skip link, empty input, sample worker parsing, charts, lesson quiz, local explanation, controlled experiment recording, save/reload/reopen, JSON import/export, CSV mapping with multiple files, reduced motion, form labels, storage quota recovery, and the built API route.
- Layout overflow checks at 375px and 768px; screenshots also captured at desktop width.

## Release fixes

The skip link is now the first keyboard stop, before the investigation library. Unsaved case changes register a before-unload warning. Case import rejects invalid accuracy ranges, unordered/duplicate epochs, blank dataset headers, invalid experiment metrics and directions, and deltas inconsistent with recorded measurements.

## Practical limits and manual checks

These checks are not a full accessibility certification. Screen-reader usability, real touch devices, browser-specific file pickers, and Firefox/WebKit still need manual testing. Screenshots and overflow checks do not verify every visual state. Diagnosis rules are educational heuristics, not a validated causal inference system.

No live AI provider call was made during validation. Configure a model and key locally to test provider compatibility. AI is disabled by default. Before any public deployment, define access control and shared usage limits for paid endpoints: current rate limits are process-local, and same-origin checks are not authentication. Account storage, sharing, centralized quotas, monitoring, and backups remain separate production work.

Case data is saved only when the user chooses Save. Browser storage can be cleared or unavailable; JSON export provides a portable copy. Imported cases remain user-provided evidence. Unrecorded form drafts are not included in saved cases.

## Local rollout and rollback

Build with `npm.cmd run build`, then serve with `npm.cmd run start`. Keep the preceding source/build release and export important cases before updating. Roll back the source/build together; do not silently migrate or delete browser case data. Version-1 JSON imports remain explicitly validated.

## Milestone 17: reproducible flagship case

The homepage now includes a local synthetic melanoma investigation, with measured accuracy-paradox verification, cost-sensitive repair, complete operating-point comparisons, replay, and CSV/canonical JSON downloads. See [the flagship protocol](FLAGSHIP_MELANOMA.md) for the fixture, declared assumptions and limitations. All 269 tests, lint, type checking, production build, and 21 browser checks passed. Live provider access and independent holdout performance were not validated. Milestone 18 remains gated on explicit P0 review.

## Milestone 18: evidence graph

Flagship and Astra results now include a searchable, keyboard-accessible evidence explorer with directed reference traversal and original-record inspection. It preserves relationship semantics, cost assumptions and separate before/after evidence. See [Evidence graph](EVIDENCE_GRAPH.md). Validation: 274 tests, lint, type checking, production build and 22 browser checks passed. No live provider call was required.

## Milestone 19: Repair Lab

The homepage now includes explicit cost-policy entry, local candidate measurements, optional Astra optimization selection and validated trade-off interpretation, user-triggered policy application and live re-test metrics. See [Repair Lab](REPAIR_LAB.md) for supported inputs and limitations. Validation: 282 tests, lint, type checking, production build and 23 browser checks passed. Provider tests used mocked fetch; live model/account access was not exercised.

## Milestone 20: incident report export

Flagship, Astra and applied Repair Lab investigations export structured Markdown/JSON incident reports with full canonical provenance, explicit model/severity annotations, hypotheses, tests, remediation and before/after verification. Monitoring and CI/CD suggestions are clearly distinguished from executed checks. See [Incident reports](INCIDENT_REPORT.md). Validation: 288 tests, lint, type checking, production build and 24 browser checks passed.

## Milestone 21: reliability profile

Flagship, Astra and applied Repair Lab investigations now show six evidence-linked reliability dimensions with explicit missing/undefined evidence, dataset filtering and separate policy scopes. Incident reports embed the same profile. No aggregate score or safety certification is inferred. See [Reliability profile](RELIABILITY_PROFILE.md). Validation: 294 tests, lint, type checking, production build and 25 browser checks passed.

## Milestone 22: Challenge WhyLab

Canonical investigations now support a deterministic second-pass review with referenced findings and separate confidence reductions. Original diagnosis/evidence remains intact; review JSON includes the complete source snapshot. See [Challenge review](CHALLENGE_REVIEW.md). Validation: 300 tests, lint, type checking, production build and 26 browser checks passed. This review does not execute new experiments or call a model.

## Milestone 23: GitHub/CI integration

Added a GitHub Actions workflow, explicit flagship regression policy and local `npm run check:reliability` command. The check emits measured policy results and incident reports, fails on missing/undefined or unmet measurements, and clears stale artifacts. See [CI integration](CI_INTEGRATION.md). Validation: 304 tests, lint, type checking, production build, local passing policy and failure-path cleanup passed. Hosted workflow execution and branch-protection configuration remain unverified; no remote publication was performed.

## Milestone 24: additional case studies

Added reproducible synthetic calibration and site-specific failure investigations with committed CSVs, local measured diagnostics, case selection and canonical evidence/report integration. See [Case studies](CASE_STUDIES.md). Validation: 308 tests, lint, type checking, production build and 27 browser checks passed. The cases describe measured failures without claiming verified causal diagnoses or repairs.

## Milestone 25: classroom activities

The flagship and additional case studies now include measured classroom exercises, formula hints, feedback, an evidence-interpretation question, verification-plan reflection, instructor guidance and local JSON worksheet export. See [Classroom activities](CLASSROOM_ACTIVITIES.md). Validation: 312 tests, lint, type checking, production build and 28 browser checks passed. Responses are session-only unless downloaded; this is not a certified grading system.

## Strategy follow-up: connected investigation and repair

Astra results now retain matching submitted evaluation data and expose an embedded Repair Lab. Application appends assumptions, tools, evidence, repairs and comparisons to the original investigation; parent graphs and exports update together. Repeated repairs preserve history. See [Connected repair](CONNECTED_REPAIR.md). Validation: 316 tests, lint, type checking, production build and 29 browser checks passed. Browser provider responses were mocked and the test server had AI disabled; no paid API call was made. Persistent model context and live model validation remain separate follow-ups.

## Strategy follow-up: structured repair context

Linked Astra repair planning now receives validated diagnosis, hypotheses, evidence, verification history and prior repair comparisons on both provider turns. Consent discloses this context; invalid, mismatched or oversized context is rejected before provider access. See [Repair context](REPAIR_CONTEXT.md). Validation: 322 tests, lint, type checking and production build passed. Provider tests use mocks; no paid calls were made. Live demonstration remains unverified.

Browser validation: all 29 checks passed against an AI-disabled local server with mocked provider responses. The runner emitted the existing Node module-type warning, surfaced by PowerShell as NativeCommandError; no browser assertion failed.

## Strategy follow-up: training-log observations

Optional bounded pasted training logs now enter the autonomous investigation as unverified source-linked observations. Line references and source IDs survive diagnosis, export and repair context. Consent includes raw log text; evaluation CSVs remain required. Richer artifact uploads and structured epoch diagnostics remain pending. See [Training logs](TRAINING_LOGS.md).

Validation (2026-09-16): 327 tests, lint, type checking, production build and 30 browser checks passed. Browser checks used an AI-disabled production server and mocked provider responses; no paid calls were made. An initial development-server browser run timed out during cold compilation; the production retry passed.

## Strategy follow-up: release browser validation

On 2026-09-16 the production server was validated on port 3110 with the
installed Chrome CDP runner: **30 browser checks passed**, including the
linked Astra-to-Repair workflow, flagship replay, evidence graph, incident
exports, responsive overflow, form labels, storage-quota recovery and the
built local API route. Screenshots and `browser-report.json` were written to
the ignored `artifacts/` directory. The run used mocked browser provider
responses and did not make paid calls; a deployed-host run remains separate.

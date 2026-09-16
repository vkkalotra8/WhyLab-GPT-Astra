# Structured ML incident report (Milestone 20)

Flagship, Astra and applied Repair Lab results offer **Export incident Markdown** and **Export incident JSON**. Both are generated locally from a validated canonical investigation. No API call, package, upload or persistence is added.

## Contents

- User-supplied model identifier (or explicit Not supplied), canonical dataset identifiers and source metadata.
- User-declared incident severity and rationale, independent of metric values and evidence strength. The UI requires an impact rationale for an assessed severity.
- Investigation objective, observed diagnosis, evidence summary, hypotheses and evidence-strength confidence.
- Tool calls/results with versions and inputs, experiments, measured/undefined values and their provenance.
- Rejected and unresolved hypothesis IDs, final diagnosis and missing-evidence questions.
- Repair candidates, threshold/cost policy and separate baseline/after comparison evidence.
- Clearly labeled monitoring suggestions and recorded comparison criteria/status for possible CI/CD checks. No deployment gate or monitoring configuration is claimed to have run.
- Complete canonical snapshot including sources, datasets, evidence, calls, results, experiments, repairs, comparisons, events and diagnosis.

JSON reports use `reportVersion: 1` and embed the canonical investigation under `investigation`. This is a report envelope, not the older browser case-import format. Markdown includes readable sections and structured record blocks plus a complete provenance appendix. The appendix deliberately duplicates records for portable auditability. It can be large for investigations with many tool results.

Missing diagnosis, repairs or verification remain explicit. Severity and model identity are report annotations, not verified operational facts. Confidence is evidence strength, not probability. Cost effects remain simulated under the declared cost model. Same-data verification is not independent holdout validation.

## Integrity and safety

The builder validates the canonical reference graph and does not modify the investigation. Markdown escapes inline user text and uses fences longer than any backtick run inside JSON records, preventing evidence strings from breaking out of their record blocks. Markdown rendering rebuilds derived fields from the canonical snapshot and validated annotations. Exports include the full evidence already in the investigation, so users should review content before sharing.

## Validation

`tests/incident-report.test.mjs` covers canonical round-trip/provenance preservation, immutable annotations, all required sections, missing verification, unresolved hypotheses, invalid references and Markdown fencing. The browser suite downloads both formats and verifies comparison records and the provenance appendix. Run `npm run check`, start the production build and run `npm run test:browser`.

Manual check: run the flagship, reveal its measured repair, enter a model/version and severity rationale, export both formats, and inspect dataset IDs, confidence, cost policy, before/after evidence IDs and suggestions. Astra and applied Repair Lab results expose the same exporter.

## Generated CI reliability gate and issue body

The report now emits a runnable policy rather than prose alone.

`deriveCiPolicy(investigation)` builds a `ciPolicySchema` document from measured **passing**
comparisons. The metric the repair was accepted on keeps its declared operator; additional headline
metrics (`recall`, `precision`, `balanced_accuracy`, `expected_cost`) are gated by unit direction —
cost and loss `at_most`, everything else `at_least`. Thresholds are the measured values themselves:
any tolerance would be an invented number, so teams must widen the gate deliberately. Without a
passing measured comparison the policy is `null`; no gate is fabricated.

The result round-trips through `evaluateCiPolicy` unedited, so the exported gate is the same
artifact the checker runs.

`incidentIssueMarkdown(report)` renders a GitHub-issue body: severity, observed failure, diagnosis,
a verification tally by outcome, an actionable follow-up checklist, the generated gate and the
standing limitations. Like the full report, it rebuilds every derived field from the canonical
record, so edited report fields cannot steer the exported text.

Both artifacts remain clearly labeled: a generated configuration, not a deployed monitor.

# Reliability profile (Milestone 21)

A transparent six-dimension profile appears in flagship, Astra and applied Repair Lab results and is embedded in incident report JSON/Markdown. There is no aggregate score, weighting formula, LLM-generated number, or universal good/bad threshold.

## Evidence mapping

| Dimension | Recorded measurements/findings |
| --- | --- |
| Performance quality | Accuracy, balanced accuracy, F1, precision, specificity |
| Minority-class safety | Recall and minority recall, including available slices |
| Calibration | Metrics emitted by completed calibration calls |
| Drift resilience | Per-feature statistics from completed drift comparisons |
| Leakage risk | Scanner observations and their existing classifications/measurements |
| Cost alignment | Expected cost and recorded cost-comparison acceptance criteria |

Classification results describe supplied predictions. Single-point threshold evaluations retain the exact threshold and separate baseline/after comparison identifiers. Multi-point candidate sweeps are excluded from the profile to avoid treating unselected policies as active performance. Slice readings retain their column, value and sample count. Drift readings retain method, feature and both dataset identifiers. Calibration configuration and every tool result's limitations remain inspectable through the original tool records.

Each reading includes its original measurement (including undefined reason), tool result ID, call ID, dataset IDs, evidence IDs, scope and limitations. Missing separate evidence records are explicit; the original tool result remains the source. Cost checks retain the comparison, repair, criterion and distinct before/after evidence references. Tool results are not pooled across datasets or operating policies.

## Interpretation

- **Measurements available:** at least one applicable reading is defined. This is availability, not a reliability or safety rating.
- **No defined measurements:** a relevant completed diagnostic is recorded but no defined numeric reading exists. Leakage findings may still be present and must be inspected.
- **Recorded criterion only:** a cost comparison exists without a corresponding numeric reading in this projection.
- **Not assessed:** no applicable completed diagnostic or cost criterion exists in the selected scope. Failed calls do not count as successful measurements.

Select a dataset to narrow the displayed readings and checks; drift comparisons remain visible for either participating dataset. All-dataset mode retains explicit IDs and never averages values. A low observed distance, empty leakage scan or passed same-data cost target is not proof of future resilience, absence of leakage or deployment safety. Definitions are descriptive rather than arbitrary risk thresholds.

## Verification

Unit tests cover six dimensions, no score, immutability, provenance references, separate baseline/after readings, candidate exclusion, missing diagnostics, undefined calibration, leakage suspicion and incident-export inclusion. Browser checks cover all dimensions, missing evidence, original measurement provenance and dataset filtering. Run `npm run check`, then the production browser suite.

Manual review: run the flagship, show its repair and inspect **Reliability profile**. Performance, minority and cost evidence should be available; calibration, drift and leakage should remain unassessed for that fixture. Expand a dimension and inspect its original records. Export an incident report to retain the same profile and canonical snapshot.

# Flagship melanoma / accuracy-paradox demonstration

Milestone 17 connects the existing deterministic engines into a repeatable browser case. Open the homepage and select **Run flagship investigation**. No saved case, API key, or network provider is required. The browser fetches the repository's static CSV; all analysis runs locally. This fixed teaching protocol is distinct from the autonomous Astra workflow.

## Dataset and declared protocol

`public/fixtures/melanoma-synthetic.csv` contains 100 synthetic evaluation rows, not real patient observations. Label 1 represents malignant cases and label 0 represents benign cases. There are 90 negative and 10 positive labels. Predictions were generated with an inclusive 0.5 threshold. Rows comprise 86 negative scores at 0.1, four negative scores at 0.35, seven positive scores at 0.4, one positive score at 0.2, and two positive scores at 0.8. This is an intentionally constructed educational example; it is not a medical benchmark.

The protocol ingests the actual CSV, computes classification metrics, and runs exact equal-class reweighting with fixed predictions. The declared accuracy-paradox criterion requires raw accuracy to exceed both balanced accuracy and minority recall by at least 10 percentage points. Only a supporting experiment confirms the dataset-specific explanation. Shift and leakage remain unassessed because the fixture lacks the evidence needed to test them. No claim is made that imbalance caused a training failure.

Repair selection sweeps thresholds 0 through 1 in increments of 0.01. Explicit teaching costs are 10 units per false negative and 1 per false positive. The target is total error cost at most 10 units. Selection minimizes cost among eligible candidates, choosing the highest threshold on ties. Re-evaluation verifies that the baseline policy reproduces supplied predictions and retains separate before/after evidence using the same rows and criterion.

**Simulated impact under the supplied cost model.** These costs are assumptions, not estimates of clinical or financial harm.

## Measured reference results

These values document the committed fixture; the UI computes its values from the fetched rows.

| Measurement | Baseline | Repaired |
| --- | ---: | ---: |
| Threshold | 0.5 | 0.2 |
| Accuracy | 92% | 96% |
| Malignant recall | 20% | 100% |
| Precision | 100% | 71.43% |
| False negatives | 8 | 0 |
| False positives | 0 | 4 |
| Total simulated cost | 80 | 4 |

The UI preserves every operating-point metric and all confusion counts, including the precision/false-positive trade-off. Threshold tuning and re-testing use the same evaluation rows: this is not independent holdout performance, retraining, or clinical validation.

## Verification

- `node --test tests/flagship-melanoma.test.mjs` verifies the measured story, canonical export/reference integrity, replay, unresolved alternatives, changed-data diagnosis, malformed input and baseline mismatch.
- `npm run check` runs all tests, lint, type checking and production build.
- Start the built server, then `npm run test:browser`; the browser suite uses an isolated Chrome profile, runs/replays the flagship, reveals measured repairs, and checks mobile overflow with the result visible.

Manual review: run the flagship in a fresh browser session, inspect competing hypotheses and the reweighting criterion, select **Show measured repair**, inspect all metrics and evidence IDs, download the CSV and evidence JSON, and select **Run flagship again**. A failed fixture request presents an error and permits retry. There are no timed visual animations, so this component also works with reduced motion enabled.

Milestone 18 remains gated on explicit P0 review/confirmation. This demonstration adds neither the general evidence graph nor the dedicated Repair Lab UX.

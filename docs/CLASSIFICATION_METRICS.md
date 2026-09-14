# Milestone 4: deterministic binary classification diagnostics

`computeClassificationMetrics(data)` in `app/lib/investigation/classification-metrics.ts` consumes named binary classes and rows containing actual labels, predicted labels, and optional positive-class probabilities. It returns `{ output, limitations }`; `output` implements `ToolOutput<'compute_classification_metrics'>`.

`evaluateClassification(evaluationDataset, input?)` is the adapter for Milestone 2 ingestion. It checks the dataset reference, row count and positive-label mapping. No CSV is reparsed and no probability threshold is inferred. A later tool executor can attach the returned output and limitations to canonical call/evidence records.

## Definitions

TP/FP/TN/FN use the explicitly configured positive class. All rate measurements use ratios in [0,1], not formatted percentages. Each measurement records the full evaluated population as `sampleSize`; the mathematical denominator depends on the metric below.

| Measurement | Definition |
| --- | --- |
| accuracy | (TP + TN) / N |
| precision | TP / (TP + FP) |
| recall | TP / (TP + FN) |
| specificity | TN / (TN + FP) |
| F1 | 2 TP / (2 TP + FP + FN) |
| positive/negative prevalence | actual class count / N |
| balanced accuracy | (positive recall + negative recall) / 2, only when both actual classes occur |
| minority recall | recall of the uniquely less frequent actual class, requiring both actual classes |
| ROC-AUC | trapezoidal ROC area with tied score groups entering together; equivalent to positive-negative pair ranking with half credit for ties |
| PR-AUC / average precision | sum over descending-score groups of change in recall times precision at the end of each group |

PR-AUC is named `pr_auc_average_precision` explicitly. It is **non-interpolated average precision**, not trapezoidal precision-recall area. Tie handling is deterministic and independent of input row ordering. Sorting operates on a separate array; the original data is unchanged. Ranking complexity is O(N log N), with the existing 10,000-row limit.

Supplied predictions determine confusion counts and threshold-dependent metrics. Positive probabilities determine AUCs. High AUC and poor supplied-prediction accuracy can coexist; no 0.5 threshold is imposed.

## Undefined values and limitations

Undefined measurements have a reason and no numeric value. There is no blanket zero-division substitution.

- No rows: all measurements undefined, confusion counts zero.
- No predicted positives: precision undefined.
- No actual positives: positive recall undefined.
- No actual or predicted positives: F1 undefined. F1 is zero when its denominator is nonzero and TP is zero.
- One actual class: balanced accuracy, minority recall and both reported AUCs undefined under this contract. Other metrics remain available when their denominators are valid.
- Equal actual class counts: minority recall undefined because no unique minority exists.
- Any missing probability (`null`/absent): both AUCs undefined; confusion-based metrics still use all rows. No complete-case subset is silently selected.
- Invalid/nonfinite/out-of-range probability: input rejected rather than treated as missing.
- Unknown labels or identical configured labels: input rejected.

The strict CSV importer still requires probabilities. The lower-level metric function also supports label-only inputs so missing probabilities have explicit behavior without weakening ingestion validation.

Reports include limitations: results are descriptive point estimates, not confidence intervals or causal conclusions. Fewer than 30 rows triggers a plainly labeled small-sample heuristic warning; it does not make otherwise valid arithmetic undefined. When a unique minority exists, the report identifies whether its recall refers to the configured positive or negative class.

## Scope and verification

No classifier training, threshold sweep, calibration analysis, Astra calls, persistence migration or new screen is introduced. These belong to later milestones.

```powershell
node --test tests/classification-metrics.test.mjs
npm.cmd run check
```

Tests cover hand-verifiable metrics, class naming, single-class/empty populations, missing probabilities, zero denominators, supplied-policy differences, tie invariance, invalid input, serialization and independent pairwise ROC checks over 81 score configurations.

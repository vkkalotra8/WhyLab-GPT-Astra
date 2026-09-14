# Milestone 7: feature leakage suspicion scanner

`scanFeatureLeakage(data, input, assumptions?)` consumes a normalized evaluation dataset and the `scan_feature_leakage` contract. It returns typed observations and limitations. The existing canonical profiler validates the dataset, and shared column summaries provide distinct-value counts. No model, provider, or retraining operation is invoked.

## Inputs and classifications

Select actual candidate input features explicitly. `y_true`, `y_pred`, and `y_probability` cannot be scanned as features; model outputs are not automatically evidence of feature leakage. This scanner currently requires the binary evaluation target `y_true`. Selected columns and optional timing columns must exist.

The output vocabulary distinguishes:

- `observation`: a measured property of supplied records.
- `suspicion`: an explicitly heuristic reason to investigate feature availability, splitting, or task timing.
- `confirmed_evidence`: reserved by the canonical contract for independently grounded confirmation. **This scanner never emits it from CSV patterns or user assumptions alone.**

A caller's canonical tool call/result supplies dataset and input configuration provenance. Each finding names its feature, method and supporting measurements. No evidence IDs are invented; generated observations can be registered as evidence by later orchestration. Assumption IDs must resolve uniquely to supplied assumption records, but their prose does not execute instructions or promote confidence. Full source-graph validation belongs to the investigation boundary.

## Rules

| Method | Conditions and meaning |
| --- | --- |
| Exact target copy | At least three complete feature/target pairs, all exactly equal. Report an observation with complete and missing counts. Add a suspicion only when both true classes occur. |
| Near target copy | At least 20 complete pairs, at least five examples per class, and at least 95% exact agreement. Report a suspicion, not causal proof. |
| Unique identifier | ID-like column name and unique values across at least three complete observations. Recommend auditing entity splits and feature inclusion. |
| Post-outcome name | Names containing post_outcome, after_outcome, future, final_diagnosis or outcome_result as underscore-delimited tokens. This is a naming heuristic, not a timing measurement. |
| Repeated-category proxy | At least 20 complete pairs, five examples per class, 2-20 distinct categories, and at least two observations in every category. Assign each category its in-sample majority label; flag at least 95% agreement and an improvement of at least ten percentage points over the overall majority baseline. |

The category-proxy statistic is in-sample mapping accuracy, not trained-model validation accuracy. Unique or high-cardinality keys are excluded from this statistic to avoid trivial memorization. Legitimately predictive features can trigger it; independent evaluation and an availability audit are required. Continuous single-feature predictive modeling and broad correlation testing are not implemented.

Missing feature values are excluded only from that feature's paired relationship calculation and explicitly counted. Entirely missing features produce an observation that checks could not run. One-class constant copies do not automatically become leakage suspicions. Conservative sample gates are documented heuristics, not significance thresholds.

## Timing checks

Supply both distinct `predictionTimeColumn` and `outcomeTimeColumn`, or neither. The scanner counts valid pairs, missing pairs, invalid pairs and outcomes at or before prediction. A nonzero last count prompts an intended-horizon review, because retrospective tasks may legitimately have that ordering. It does not establish when any individual feature was collected.

Accepted timestamps use UTC ISO `YYYY-MM-DDTHH:mm:ssZ` or 1-3 fractional digits before Z. Calendar validity is checked by round-trip normalization. Other formats or offsets are counted as invalid, not guessed or silently treated as valid. All excluded pairs have explicit counts.

## Scope and verification

No triggered rule establishes safety, and a triggered rule establishes neither causality nor confirmed leakage. No feature is removed, model retrained, or repair claimed. The legacy dataset screen remains unchanged; autonomous UI integration is a later milestone.

```powershell
node --test tests/leakage-scanner.test.mjs
npm.cmd run check
```

Tests include obvious copies, near-copy boundaries, legitimate/clean categorical data, renamed-label proxies, unique-key exclusion, missingness, one-class constants, timing validation, untrusted context, and deterministic nonmutating output.

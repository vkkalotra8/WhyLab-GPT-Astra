# Milestone 10: Counterfactual / falsification engine

`runCounterfactualTest` implements the canonical `run_counterfactual_test` accuracy-paradox path. It returns tool output, a completed verification experiment, measurement evidence, and source/dataset references. Callers supply stable experiment, evidence, and call IDs for replay and registration alongside the referenced hypothesis and tool call.

## Prediction and explicit decision rule

The prediction is that raw accuracy exceeds **both** balanced accuracy and minority recall by the declared threshold. The supported criterion is `accuracy_paradox_gap`, `at_least`, in `percentage_points`, with a value greater than 0 and at most 100. Other criteria fail explicitly.

The gap is the minimum of `100 * (accuracy - balanced_accuracy)` and `100 * (accuracy - minority_recall)`. Both gaps meeting the threshold supports the prediction; only one meeting it weakens the joint prediction; neither meeting it rejects this specific prediction. Missing classes or no unique minority class produce an inconclusive outcome. Threshold comparisons are inclusive, using the returned unrounded measurements.

For 90 correctly predicted negatives and 10 missed positives, raw accuracy is 0.9, balanced accuracy is 0.5, minority recall is zero, and the minimum gap is 40 percentage points. A 10-point criterion supports the prediction. Perfect predictions on the same class counts reject it.

## Controlled experiment

Exact equal-class reweighting gives each true class total weight 0.5 while preserving every within-class prediction. Its accuracy is `(positive recall + negative recall) / 2`, exactly balanced accuracy. This controls evaluation prevalence without drawing a noisy subsample or discarding observations. No stochastic resampling is necessary. The request seed is recorded but unused; outputs are seed independent. Inputs and prediction policies are unchanged.

Reported sample sizes count original observations. This is a descriptive fixed-prediction evaluation experiment, not retraining, new data, a significance test, or proof that class imbalance caused training failure. The criterion is an explicit caller policy, not a calibrated confidence threshold. Small samples retain the classification engine's warnings. Rejection applies only to the operational prediction on the supplied dataset.

## Integration and verification

The canonical tool output references the returned evidence, whose provenance points to the returned experiment. Register these entities with the input call, hypothesis, dataset, and source when orchestration is introduced. The engine does not silently update a hypothesis status. UI and provider integration remain later milestones.

Run `node --test tests/counterfactual.test.mjs`. Tests cover all four outcomes, hand-computed measurements, either minority label, criterion boundaries, deterministic replay, evidence linkage, seed independence, input preservation, and invalid requests.

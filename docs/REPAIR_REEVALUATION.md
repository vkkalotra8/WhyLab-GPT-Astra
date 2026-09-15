# Milestone 16: Repair application and re-evaluation

`reevaluateRepair` implements `re_evaluate_repair` for registered operating-policy repair candidates. It accepts a canonical investigation, the selected normalized evaluation dataset, and an explicit baseline policy. It returns the updated investigation, before/after comparison, full threshold-dependent metric sets, target checks, improvement classification, and a dataset copy containing the applied predictions.

## Fixed comparison protocol

1. Validate the investigation graph, registered repair and dataset metadata.
2. Require the same positive-label mapping and cost assumptions for both policies.
3. Verify that the baseline threshold reproduces every supplied prediction. An incompatible baseline is rejected rather than silently invented.
4. Measure the baseline using its explicit probability >= threshold policy.
5. Apply the candidate threshold to a copy of the same rows. Actual labels, probability scores, attributes and row ordering remain unchanged.
6. Recompute the candidate operating-point metrics using the unchanged population and criterion.
7. Store distinct calls, tool results and measurement evidence for baseline and after-policy measurements, then register a canonical before/after comparison.

Both measurements reuse the deterministic threshold engine. The applied dataset is separately checked in tests against the classification engine. No data is filtered, resampled or retrained. Inputs are not mutated; nothing is deployed to an external model.

## Outcomes

The repair's criterion is reused unchanged. Supported criteria are the performance ratios and assumption-backed expected cost supported by candidate generation.

- `passed`: both criterion measurements are defined and the after-policy value meets the target.
- `failed`: both measurements are defined and the after-policy value misses the target.
- `inconclusive`: a criterion measurement is undefined, so a complete comparison cannot be established.

`baselineMeetsCriterion` and `afterMeetsCriterion` separately report true, false or null. `improvement` reports improved, unchanged, worsened or undefined. A passed target is not automatically an improvement: an unchanged or worsened policy may still satisfy a permissive target. All remaining threshold-dependent metrics are retained so trade-offs are visible.

## Provenance and integration

The returned investigation includes the newly measured evidence, explicit threshold-sweep calls/results and comparison. If it has a diagnosis, the repair, evidence and comparison references are also attached to that diagnosis. Existing hypothesis conclusions are not promoted or rewritten by a repair result. Prior comparisons remain intact across repeated evaluations.

Baseline and after evidence IDs are always distinct, even for identical thresholds. Costs retain their explicit user-assumption source. Training recommendations are rejected as unsupported by this evaluation-data engine.

This verifies both policies on one immutable supplied snapshot. Dataset IDs and metadata connect selection evidence, but they do not authenticate historical CSV bytes; independent holdout validation remains outstanding. The engine does not imply retraining or production improvement.

The deterministic workflow now supports candidate generation followed by application and comparison. No new public route or UI control is added here; dedicated Repair Lab controls remain Milestone 19. Milestone 17 can build the flagship case on this completed engine path.

## Validation

Run `node --test tests/repair-reevaluation.test.mjs`.

Tests cover candidate-to-comparison integration, exact metrics, separate evidence, cost assumptions, passed-versus-improved distinctions, failed/inconclusive outcomes, invalid baselines/mappings/datasets, unsupported repairs, inclusive boundaries, nonmutation, repeated comparisons and canonical serialization.

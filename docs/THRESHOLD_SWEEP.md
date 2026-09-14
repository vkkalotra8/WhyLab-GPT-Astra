# Milestone 5: threshold sweep and operating points

`runThresholdSweep(data, input, assumptions?)` in `app/lib/investigation/threshold-sweep.ts` consumes a normalized evaluation dataset and the existing `threshold_sweep` input contract. It returns `{ output, objective, costs, limitations }`; output conforms to `ToolOutput<'threshold_sweep'>`.

## Policy and calculations

Every row is predicted positive when its probability is **greater than or equal to** the candidate threshold. Supplied `y_pred` remains unchanged in the input; the sweep derives new confusion counts for each candidate from the same actual labels and probabilities.

Candidates must be unique finite ratios in [0,1], with 1-1,001 candidates. Every row needs a valid probability; empty populations or missing probabilities fail explicitly. The positive-class meaning must match ingestion. Candidate order is preserved in the returned output.

Each point contains threshold, TP, FP, TN, FN, and the shared threshold-dependent measurements: accuracy, precision, recall, specificity, F1, class prevalence, balanced accuracy and minority recall. Undefined values retain the Milestone 4 conventions and reasons. AUCs are not repeated at each operating point because they do not depend on a decision threshold.

The sweep sorts probabilities and candidates and advances through each observation once, rather than rebuilding predictions and sorting probabilities at every threshold. It reuses `metricsFromConfusion` from the classification module to keep formula and undefined-value behavior consistent. Initial classification validation is performed once. Input arrays and dataset records are not mutated.

## Optional cost objective

Supply `falseNegativeCost`, `falsePositiveCost` and `assumptionEvidenceId` in `input.costs`, plus the matching explicit assumption evidence in `assumptions`. Duplicate/missing referenced evidence or evidence not labeled as a source-backed user assumption is rejected. Full source-graph validation remains the canonical investigation boundary's responsibility.

For each candidate:

`expected_cost = FN_count * falseNegativeCost + FP_count * falsePositiveCost`

This is total error cost over the evaluation population, not per-row average cost or a clinical outcome estimate. Both costs must be finite and nonnegative. Overflow is rejected with a request to use smaller cost units.

With supplied costs, the objective is `minimize_expected_cost`; `selectedThreshold` minimizes this measured cost over the supplied candidates. Exact numerical cost ties select the **highest threshold**, independently of input order. This tie rule is deterministic, not a universal recommendation about safety. Zero costs are allowed and can make all candidates tie.

Without costs, `objective` and `selectedThreshold` are null. There is no silent fallback to maximizing accuracy or F1.

## Limits of interpretation

- Costs are explicit user assumptions; outputs retain the cost policy and its evidence reference.
- Selection considers only supplied candidates, not every possible policy.
- Under the inclusive rule, threshold 1 still predicts positive for probability 1. The [0,1] range therefore does not always contain an all-negative policy.
- One-class populations retain valid counts and explicit undefined balanced/minority metrics.
- Small-sample and evaluation-selection limitations are returned with the result.
- No policy is applied, no model is retrained, and no repair success is claimed. Application and independent reevaluation remain later milestones.
- This is a UI-independent engine, not the later Repair Lab screen or Astra orchestration.

## Verification

```powershell
node --test tests/threshold-sweep.test.mjs
npm.cmd run check
```

Tests cover exact operating-point counts, cost arithmetic, deterministic ties, inclusive endpoints, agreement with independently generated predictions, invalid inputs, missing probabilities, cost overflow, one-class populations, custom labels and nonmutation.

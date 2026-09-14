# Milestone 9: Distribution-shift diagnostics

`runDriftTests` in `app/lib/investigation/drift-tests.ts` compares explicitly identified reference and comparison evaluation datasets. It returns the validated `run_drift_tests` tool output plus reproducible PSI configuration. It does not modify either dataset or infer a causal diagnosis.

## Methods

- **KS:** maximum absolute difference between empirical cumulative distribution functions. Tied observations advance together. Values range from zero to one.
- **Wasserstein-1:** integral of the absolute empirical CDF difference, expressed in the original feature units. Unequal sample sizes are supported without resampling.
- **Numeric PSI:** equal-width interior cuts derived only from the reference minimum and maximum. Interior boundaries belong to the upper bin; outer bins include out-of-range comparison observations. The actual cuts are returned. A constant reference range produces an explicit undefined result.
- **Categorical PSI:** exact string categories from the union of both datasets, including previously unseen categories. At most 100 combined categories are supported. Class labels remain categorical even when they look numeric; mixed numeric/text features also use categorical PSI.

PSI adds a pseudocount of 0.5 to every bin on each side, normalizes the counts separately, and sums `(q - p) * ln(q / p)`. Returned configuration includes the categories or cuts and pseudocount. A bin count is required for PSI; categorical bins follow the category union instead of that numeric count.

## Evidence boundaries

Each measurement reports its method, units, nonmissing reference and comparison sample sizes, excluded missing counts, and limitations. Missing values are excluded independently per feature. All-missing inputs, unsupported numeric methods on categorical features, excessive categorical cardinality, and numeric overflow return explicit undefined measurements. Small samples receive a heuristic warning below 30 observations on either side.

Inputs must have distinct matching dataset IDs and selected columns in both datasets. Probability comparisons additionally require identical positive and negative class mappings. Feature units and preprocessing compatibility remain the caller's responsibility.

These are descriptive statistics: no p-values, significance labels, universal PSI cutoffs, confidence probabilities, or causal claims are produced. PSI depends on binning and sample-size-dependent smoothing. Equal coarse bin proportions can hide substantial within-bin movement, so zero PSI does not establish equal underlying distributions. Missingness counts are reported but missingness shift is not itself scored.

## Validation and integration

Run `node --test tests/drift-tests.test.mjs` for hand-computed distances, ties, unequal sample sizes, PSI smoothing and unseen categories, missing data, invalid requests, overflow, reproducibility, and probability label compatibility.

This milestone provides the deterministic engine and canonical tool output. Investigator orchestration and the autonomous workflow UI remain later milestones; this engine does not add a new homepage screen.

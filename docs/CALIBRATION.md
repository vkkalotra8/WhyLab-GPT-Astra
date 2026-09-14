# Milestone 6: binary calibration diagnostics

`checkCalibration(data, input)` in `app/lib/investigation/calibration.ts` consumes the normalized evaluation dataset and `check_calibration` input contract. The positive label and dataset ID must match ingestion. Predictions are irrelevant to calibration; actual labels and positive-class probabilities are used.

The report contains `status`, `output`, `requestedBins`, `strategy`, and `limitations`. Completed output conforms to `ToolOutput<'check_calibration'>`. Empty populations or any missing probability return `insufficient_data` with null output and a reason; no complete-case subset is silently selected. Invalid probabilities or unsupported tasks/configurations raise validation errors. A later executor can translate report status into the canonical tool-result envelope.

## Measurements

- **Binary Brier score:** mean `(p - y)^2`, where `y` is 1 for the configured positive class and 0 otherwise. Range [0,1], with no multiclass factor of two.
- **Expected calibration error:** sum over populated bins of `(bin count / total count) * abs(mean probability - observed positive frequency)`. Range [0,1]. This is positive-class binary calibration error, not top-label confidence calibration.
- **Bins:** lower/upper boundaries, sample count, mean probability and observed positive frequency. Empty bins retain null summaries, not zero frequencies.

Brier score measures probability prediction error, not calibration alone. ECE depends on binning; within-bin errors can cancel. Neither measure alone establishes model reliability or causal explanations.

## Bin semantics

All bins are `[lower, upper)`, except the final bin includes 1. An interior-boundary probability belongs to the bin on its right. Counts partition the entire evaluation population.

`equal_width` creates exactly the requested 2-100 bins across [0,1], retaining empty bins.

`equal_frequency` uses approximate empirical quantile cuts. For requested cut k of B, inspect the sorted row at `ceil(N*k/B)-1` and the next row. A boundary is their midpoint only when scores differ and a strictly interior floating-point midpoint exists. Duplicate boundaries and cuts through tied scores are omitted. End boundaries are 0 and 1. Consequently actual bin count may be lower than requested, populations need not be exactly equal, and tied probabilities are never split. An all-tied population yields one bin.

Rows are copied and sorted deterministically by probability then actual indicator. Input data and metadata are unchanged. No CSV reparsing, model fitting, network requests or recalibration occurs.

## Validity and limitations

One-class observations still have mathematically defined Brier score and ECE. The report explicitly limits interpretation: they cannot demonstrate calibration across both classes.

Fewer than 30 rows and populated bins with fewer than five rows trigger explicit heuristic warnings. These are not statistical validity cutoffs. No confidence intervals are estimated. Timestamp/slice calibration and multiclass calibration remain unsupported.

All measurements use `ratio` units and full evaluated sample size. Returned limitations distinguish arithmetic validity from statistical reliability. The engine does not modify probabilities or apply a repair.

## Verification

```powershell
node --test tests/calibration.test.mjs
npm.cmd run check
```

Tests cover exact Brier/ECE values, score extremes, bin boundaries and empty bins, quantile ties, one-class/small populations, missing/invalid inputs, independence from supplied predictions, determinism and serialization. No new screen is added; autonomous UI integration remains a later milestone.

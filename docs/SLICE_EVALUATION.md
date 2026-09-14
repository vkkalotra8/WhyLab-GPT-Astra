# Milestone 8: slice evaluation

`evaluateSlices(data, input)` in `app/lib/investigation/slice-evaluation.ts` consumes the normalized evaluation dataset and the `slice_evaluation` contract. It returns canonical `output` (overall metrics and slices), per-column `coverage`, and `limitations`. It reuses the Milestone 4 classifier engine without changing its metrics or undefined-value conventions.

## Grouping and measurements

Supported columns are existing `group`, `site`, `environment`, `device`, and `timestamp` metadata. Columns are evaluated independently: selecting site and device does not create their cross product. Each row can therefore contribute to one group per selected column; do not sum slice sizes across columns.

Every slice contains its column/value, population size, classifier measurements and comparison measurements. Names ending in `_delta_vs_overall` represent `(slice ratio - overall ratio) * 100` in percentage points. The overall population includes the slice and all rows with missing/invalid grouping metadata. These comparisons are descriptive, not independent statistical tests or causal findings.

If either measurement is undefined, its difference is also undefined. Minority-recall differences are always undefined because the minority class can differ across populations. Positive recall and specificity retain fixed class meanings and can be compared instead.

The configured positive class and dataset ID must match ingestion. Supplied predictions are preserved. Model performance is computed from the same metric definitions used by overall classification.

## Missingness, time and resource limits

Missing optional metadata (`null`) does not create a synthetic category. It remains in overall metrics and is counted in `coverage.missingRows`. Invalid time values likewise remain overall and contribute to `invalidRows`. `groupedRows + missingRows + invalidRows` equals the overall row count for each selected column. A wholly unusable column yields no slices and an explicit limitation.

Timestamp slices use **UTC calendar days**. Accepted input is explicit UTC ISO with seconds and optional 1-3 fractional digits. Calendar validity is checked by round-trip normalization. Other formats/offsets are counted as invalid, not interpreted according to local time.

At most 100 groups are allowed per selected column. Exceeding that limit raises an actionable error; no groups are silently truncated. Group labels use stable code-unit sorting, and literal names such as `__proto__` remain safe data via Map-based grouping. The original dataset is never mutated.

## Interpretation

`minimumSampleSize` is a caller-selected positive count. Slices below it retain their measured statistics but explicitly warn that the population is insufficient for strong conclusions. Existing one-class and small-sample limitations are also retained. Meeting the threshold does not establish statistical significance, adequate representation, fairness or reliability. No confidence intervals or automatic causal rankings are produced.

## Verification and scope

```powershell
node --test tests/slice-evaluation.test.mjs
npm.cmd run check
```

Tests cover exact slice/overall comparisons, sample-size warnings, missingness accounting, independent columns, UTC dates, invalid inputs, cardinality limits, deterministic serialization and minority-class identity. This milestone adds the deterministic engine only; no new screen or Astra orchestration is introduced.

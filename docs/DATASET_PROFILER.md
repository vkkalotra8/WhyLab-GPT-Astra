# Milestone 3: deterministic dataset profiler

`profileEvaluationDataset(data, input?)` in `app/lib/investigation/dataset-profiler.ts` consumes the normalized `EvaluationDataset` produced by Milestone 2. It implements the calculation behind the `profile_dataset` contract and returns `ToolOutput<'profile_dataset'>`, checked by the shared profile-output validator.

```typescript
const data = ingestEvaluationCsv(csvText, 'evaluation.csv');
const profile = profileEvaluationDataset(data);
```

The optional input contains `datasetId` and `targetColumn`. Defaults use the ingested dataset ID and `y_true`. A null target omits class frequencies; an explicitly selected column produces frequencies of all its nonmissing values. The request ID and column must match the supplied dataset. Invalid row counts, record positions, labels, probabilities and optional-column shapes are rejected.

## Measurements and conventions

- Row count and column order come from validated ingestion records.
- Roles identify target, prediction, probability, recognized metadata, `feature_*`, or unknown columns. Names indicate roles, not causal importance.
- Empty columns have type `empty`, zero distinct values, and null numerical summaries.
- Numeric inference requires every nonmissing value to be a finite decimal/scientific-notation number. Mixed columns are categorical. Class labels, selected targets, and named metadata are categorical even when they contain numeric codes.
- Missingness uses the existing empty/NA/NaN/N/A/null convention. It is reported as a count; the denominator is `rowCount`.
- Distinct counts preserve source spelling: `1`, `1.0`, and `1e0` count as three representations. The probability column has already been numerically normalized during ingestion.
- Numeric min/max/mean exclude missing cells. The shared mean scales values before compensated summation to avoid overflow for large finite numbers. These remain floating-point descriptive statistics, not arbitrary-precision arithmetic.
- Class counts include every observed nonmissing class, sorted by JavaScript code-unit ordering. Prevalence is `class count / nonmissing target count`, a ratio in [0,1]. Absent classes are not fabricated. A one-class dataset produces one observed class with prevalence 1.
- `sliceColumns` lists nonempty recognized group/site/environment/device columns. It describes availability, not whether a slice has sufficient samples or acceptable performance. Timestamp columns are retained as metadata but are not declared valid timestamps or usable time buckets; temporal validation belongs to later diagnostics.

The source dataset ID and selected target remain in the tool input, enabling later orchestration to attach the computed output to its call/result/evidence records. The profiler itself does not invent tool executions, timestamps, evidence IDs, or findings.

## Reuse and scope

`app/lib/column-profile.ts` supplies shared missingness, frequency and numeric-summary calculations. Both this profiler and the existing `app/lib/dataset.ts` profiler use it. Legacy review signals, display shapes and the top-five categorical display remain intact; the canonical output includes complete selected-target frequencies.

Profiling does not reparse CSV, mutate its input, make network calls, calculate classifier metrics, rank hypotheses or infer causality. It is UI-independent. Existing screens remain available; the autonomous evaluation workflow will be connected in its scheduled milestone.

## Verification

```powershell
node --test tests/dataset-profiler.test.mjs
npm.cmd run check
```

Tests use the existing synthetic evaluation fixture plus hand-verifiable examples. They check numerical summaries, prevalence denominators, complete class counts, missingness, role inference, metadata availability, one-class inputs, determinism, invalid records, large-number cancellation and compatibility with the legacy profiler.

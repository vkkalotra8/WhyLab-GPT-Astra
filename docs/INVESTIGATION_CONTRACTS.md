# Milestone 1: canonical investigation contracts

This is the shared foundation for milestones 2-17. It is not an investigation engine and is not connected to the existing workspace yet. No diagnostic tools, model calls, training, or policy repairs execute from these modules.

## Entry points

- `app/lib/investigation/types.ts`: domain schemas and inferred TypeScript types.
- `app/lib/investigation/primitives.ts`: stable IDs, measurements, evidence strength, acceptance criteria and operating policies.
- `app/lib/investigation/tool-contracts.ts`: discriminated calls/results and per-tool input/output schemas.
- `app/lib/investigation/validation.ts`: `validateInvestigation`, `serializeInvestigation`, and `parseInvestigation`. Use these at full-record boundaries; structural entity schemas alone do not validate references across records.
- `app/lib/investigation/schema.ts`: small, dependency-free, strict runtime validators. TypeScript types are inferred from the same schemas, avoiding a separately maintained runtime/type model.

All fields are required. Explicitly absent values use `null`; unknown object fields are rejected. Arrays have bounded lengths. Canonical JSON imports and exports are limited to 8,000,000 UTF-8 bytes. Validation rejects cycles, nonfinite numbers, unsupported objects, sparse arrays, and non-JSON values. Error messages carry a field/entity path.

## Identity and provenance

Call `createId(kind)` once when creating an entity. It uses `crypto.randomUUID()` in supported browser/Node runtimes. Persist the resulting ID; do not regenerate it during rendering or parsing. IDs have entity prefixes, such as `dataset_...` and `evidence_...`. Uniqueness and references are checked within the investigation.

A dataset references a source. Evidence references a source, completed tool result, or completed verification experiment. Tool-result/evidence references must be reciprocal. Source coordinates use **1-based data-row positions**, excluding the CSV header, with inclusive first/last bounds. They are not physical file-line numbers because CSV cells may span lines. Original column names must match dataset metadata. Source content digests, if supplied, use `sha256:<64 lowercase hex characters>`; this milestone validates their format, not file contents.

User assumptions have an explicit `user_assumption` source and `assumption` evidence kind. False-negative/false-positive costs reference this evidence. Source names, comments and descriptions remain untrusted data, never executable instructions.

## Numerical conventions

Measurements carry `name`, `unit`, `sampleSize`, and either:

- `status: measured` with a finite numeric value; or
- `status: undefined` with a nonblank reason and no fabricated value.

Rates and probabilities use `ratio` in [0, 1]. Counts are nonnegative safe integers. Differences expressed as percentage points use `percentage_points`. Loss and cost are nonnegative. Feature-scale distances can use `feature_units`; unitless statistics use `unitless`. Undefined metrics are distinct from zero. Measurements may use different valid sample subsets, but sample sizes cannot exceed their enclosing population where supplied.

Classification outputs identify the positive and negative labels and validate confusion-count totals. Profiler class prevalence uses the nonmissing class-count denominator. Calibration bins must be ordered/nonoverlapping, and empty bins have null summaries. Statistical implementation choices (PR-AUC definition, bin-edge membership, PSI smoothing, etc.) must be documented and tested in the corresponding later engine milestones.

An operating policy uses `probability >= threshold` to predict the named positive label. Costs are per-error, nonnegative user assumptions. Milestone 5 will compute `FN * falseNegativeCost + FP * falsePositiveCost`. Milestone 1 does not calculate these costs.

Confidence means **ordinal evidence strength**, never calibrated causal probability: `unassessed`, `limited`, `moderate`, or `strong`, with a rationale. Hypothesis relationships are `supports`, `weakens`, or `rejects`. Confirmation requires a supporting completed verification record; validating that record does not independently establish causality.

## Diagnostic contracts

| Tool | Explicit input configuration | Typed output |
| --- | --- | --- |
| `profile_dataset` | Dataset and optional target column | Row/column profiles, classes, slice availability |
| `compute_classification_metrics` | Dataset and positive label | Confusion counts and named measurements |
| `threshold_sweep` | Dataset, positive label, unique thresholds, optional costs | Threshold points and optional selected threshold |
| `check_calibration` | Dataset, positive label, bin count and strategy | Measurements and calibration bins |
| `scan_feature_leakage` | Target, features, optional timing columns, assumptions | Classified observations and supporting measurements |
| `slice_evaluation` | Dataset, positive label, slice columns, minimum sample size | Overall and per-slice measurements/limitations |
| `run_drift_tests` | Distinct reference/comparison datasets, columns, method and explicit PSI bins | Feature/method/sample-size/statistic records |
| `run_counterfactual_test` | Dataset, hypothesis, accuracy-paradox method, seed and criterion | Baseline/comparison measurements and explicit outcome |

The autonomous orchestrator additionally exposes `evaluate_diagnostic_falsification`. It references a completed non-counterfactual result and a proposed hypothesis, then compares one exact named measurement/unit with a declared `at_least` or `at_most` threshold. It creates experiment-linked measurement evidence; ambiguity or unavailable measurements produce an explicit inconclusive outcome. See `GENERAL_FALSIFICATION.md`.

Calls identify their investigation, tool, version, timestamp and typed input. Results identify the call, version, datasets, timestamp, generated evidence and limitations. A result is `completed` with tool-specific output, or `error` / `unsupported` / `insufficient_data` with a code, message and retryability. A failure cannot carry success output or generated measurement evidence. There is no executable registry or Astra tool exposure yet.

Training recommendations explicitly require an external experiment. Operating-policy candidates identify the dataset, policy and criterion. Before/after records preserve separate evidence, the same dataset, positive label, cost assumptions and acceptance criterion. These contracts do not claim a repair was executed or verify the truth of supplied numeric values; later deterministic engines will produce those values.

Events describe observable entity actions only, with ordered sequence numbers and UTC timestamps. Do not place model reasoning traces in event messages.

## Compatibility and verification

Canonical `schemaVersion: 1` is independent of legacy saved-case `version: 1`. Existing `Evidence`, `Diagnosis` and case types retain their old meanings and remain untouched. No implicit migration, browser-storage change or UI adapter is introduced. Future adapters must not fabricate source IDs, measurements or confidence from legacy display strings.

`allowImportingTsExtensions` is enabled with the project's existing `noEmit` setting so the new modules work with both Next.js/TypeScript and the existing Node 24 native-TypeScript test runner.

Run `node --test tests/investigation-contracts.test.mjs` for runtime contract tests. `npm.cmd run typecheck` also checks negative compile-time assertions in `tests/investigation-types.ts`. Run `npm.cmd run check` for all regressions, lint, type checking and build. The UI should behave exactly as before; this milestone adds no new screen.

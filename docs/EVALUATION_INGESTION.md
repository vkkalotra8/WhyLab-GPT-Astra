# Milestone 2: evaluation CSV ingestion

## Public entry points

`app/lib/investigation/evaluation-ingestion.ts` exports:

- `ingestEvaluationCsv(text, filename, options?)`: validates CSV text and returns an `EvaluationDataset`. This synchronous, UI-independent function can run inside a worker or on a server.
- `ingestEvaluationFile(file, options?)`: checks file size before reading, performs fatal UTF-8 decoding, then uses the same ingestion function.
- `EvaluationValidationError`: structured issues with a code, column, data-row position and message, plus the total issue count. At most 50 individual issues are retained.

This milestone supplies the normalized input for the subsequent deterministic profiler and diagnostics. Existing log/dataset upload components keep their current behavior. Wiring the new evaluation model into the autonomous UI remains Milestone 14; no new screen, API, persistence format, or diagnostic computation is introduced here.

## Input contract

Required, case-sensitive headers:

```csv
y_true,y_pred,y_probability
0,0,0.1
1,1,0.9
1,0,0.4
```

Default labels are positive `1` and negative `0`. For named classes, pass an explicit pair:

```typescript
const dataset = ingestEvaluationCsv(csvText, 'evaluation.csv', {
  labels: { positive: 'malignant', negative: 'benign' },
});
```

Labels are case-sensitive strings. Both actual and predicted labels must belong to that pair. Numeric-looking labels are not coerced (`01` is not `1`). Class labels must be distinct, nonmissing, at most 128 characters, and free of surrounding whitespace in the configuration. The existing CSV parser trims cell whitespace, including quoted cells.

`y_probability` means probability of the configured positive label. Values must be finite decimal numbers from 0 to 1; scientific notation is supported. Percentages, logits, hexadecimal strings, infinity and invalid numeric tokens are rejected. The positive-class meaning must be confirmed by the data producer; it cannot be inferred reliably from values.

Supplied `y_pred` is preserved even if it disagrees with a 0.5 threshold. WhyLab does not know the original operating policy and does not silently regenerate predictions.

Both classes need not appear in `y_true`: one-class datasets remain valid with an explicit warning so later metrics can report undefined values appropriately. Multiclass evaluation is not supported by this binary contract.

## Missing values and CSV behavior

The implementation reuses `parseCsv` from `app/lib/evidence.ts` without changing its behavior: quoted commas, escaped quotes, multiline fields, CRLF, reordered headers, duplicate-header rejection and consistent row widths remain supported. UTF-8 BOMs are accepted.

Missing sentinels are empty text, `NA`, `NaN`, `N/A`, and `null` (case-insensitive). Any missing/invalid required value rejects the complete import. No valid subset, imputed probability, synthetic label or fallback dataset is returned.

Physical blank lines are ignored by the shared parser. An explicit empty record such as `,,` is retained and rejected for missing required fields. Error row numbers and `sourceRow` are **1-based data-record positions**, excluding the header and ignored blank lines. They are not physical file-line numbers because quoted cells can span lines.

Optional `timestamp`, `group`, `environment`, `site`, `device`, `feature_*`, and other additional columns are retained in each row's `attributes`. Missing optional values become `null`. Other values remain text; numerical feature inference belongs to profiling. Timestamp formats/time zones are not guessed or normalized here. Temporal checks belong to the later slice/leakage diagnostics. A warning makes this explicit when a timestamp column is present.

## Limits and output

Limits align with the existing dataset workspace:

- 2,000,000 UTF-8 bytes per file/text input.
- At most 10,000 data rows and 100 columns.
- The shared parser also caps total cells at 1,000,000, including the header. At 100 columns this effectively allows 9,999 data rows.
- At most 4,000 characters per header, consistent with canonical metadata validation.

File decoding rejects invalid UTF-8 instead of replacing corrupt bytes. Text ingestion also rejects NUL/replacement characters, consistent with existing evidence ingestion.

`EvaluationDataset` contains canonical `DatasetMetadata`, an uploaded-file source, the explicit label mapping, normalized rows, and warnings. Each row contains `sourceRow`, `actual`, `predicted`, numeric `positiveProbability`, and optional attributes. Dataset/source IDs are generated once unless supplied by the caller; supplied IDs are validated and retained. No content digest is fabricated. Source capture time records ingestion time.

The normalized result is JSON-serializable and contains no file handles. This is an ingestion result, not a completed investigation. Do not pass it directly to the legacy version-1 case importer or claim it has been evaluated.

## Verification

```powershell
node --test tests/evaluation-ingestion.test.mjs
npm.cmd run check
```

`tests/fixtures/evaluation.csv` is a tiny synthetic parser fixture, not the later melanoma flagship dataset. Tests verify exact normalized values, missingness, custom labels, invalid inputs, CSV compatibility, atomic rejection, issue bounds, file decoding and resource limits.

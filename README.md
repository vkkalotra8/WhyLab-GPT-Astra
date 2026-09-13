# WhyLab

A local machine-learning failure investigator built with Next.js App Router, React, TypeScript, and Tailwind. Core parsing and case management run in the browser. An optional explanation API is available; selected evidence excerpts are sent only when the user requests AI assistance. No database or accounts are used.

## Run

```powershell
npm.cmd run dev
```

Open http://localhost:3000. Select **Try an example**, then **Investigate failure**, or provide your own evidence.

## Supported evidence

- TXT / LOG or pasted logs: named metrics such as `train_accuracy=0.98`, `val_accuracy=0.84`, `production_accuracy=61.8%`, `train_loss=0.08`, `val_loss=0.19`, `majority=72%`, and `minority_recall=0.38`. Section-style `[validation] accuracy=0.94` is also supported.
- JSON: metric objects, including `{"validation":{"accuracy":0.94},"production":{"accuracy":0.62}}`.
- CSV: a header row and consistent comma-separated data rows. Quoted commas, escaped quotes, multiline fields, and CRLF are supported. The summary reports missing cells and repeated rows. A `label`, `class`, or `target` column enables a tentative categorical balance check. Explicit metric columns such as `val_accuracy` are also recognized.

Use rates from 0 to 1 or explicit percentages. The last valid metric in source order wins. Uploads are limited to 10 MB; analysis accepts up to 10 million characters. Use UTF-8 text.

## Interpretation limits

Findings are deterministic suggestions, not proven causes or calibrated probabilities. They flag missing values, repeated observations, a majority share of at least 70%, or accuracy gaps of at least 10 percentage points. Thresholds are educational heuristics. CSV balance assumes a categorical target with 2-50 unique values; confirm that assumption before interpreting it. Repeated rows do not prove leakage. Epoch alignment, experiment identity, and split comparability are not verified. Unsupported evidence returns an explanation instead of fabricated diagnoses. The right-hand case panel remains a clearly labeled illustrative example.

Changing the evidence or analysis lens clears previous results. New investigation resets the workspace and cancels pending display updates.

## Checks

```powershell
node --test tests/evidence.test.mjs tests/training.test.mjs
npm.cmd run lint
npm.cmd run build
```

Parser tests use Node 24's built-in TypeScript support and test runner; no extra dependencies are needed.

## Epoch curves and trend checks

Use explicitly numbered records: `[epoch 1/30] train_loss=0.8 val_loss=0.9 train_accuracy=70% val_accuracy=65%`. CSV metric tables can include an `epoch` column. JSON accepts an array of epoch objects or `{"history":[{"epoch":1,"train_loss":0.8,"val_loss":0.9}]}`. Metrics on separate log lines must repeat the epoch number; unnumbered values remain summary metrics only.

Results include loss/accuracy charts, a keyboard-accessible epoch selector, and an expandable exact-values/source table. Missing metrics are not filled in. Restarted, out-of-order, or conflicting duplicate epochs disable history to avoid combining runs; complementary metrics at the same epoch can merge.

Trend rules inspect the last 4-5 consecutive recorded epochs:

- Possible overfitting: training loss falls at least 10% while validation loss rises at least 10%.
- Possible stalled learning: a positive loss series has a range at most 1% of its maximum. This may indicate convergence rather than failure.
- Possible unstable training: at least two direction reversals whose adjacent changes each reach 10% of the maximum loss.

Each finding identifies its epoch window and proposes a controlled verification experiment. These thresholds are educational heuristics, not calibrated diagnoses. Loss definitions and experiment identity still need user verification.

## Dataset investigation

The separate **Look inside your data** workspace accepts training, validation, and production CSVs. Select a classification/regression task and optional target column. Profiles show inferred types, missingness, unique counts, numeric min/mean/max, and the five most frequent categorical values. Review signals flag constant columns, unique ID-like columns, exact target copies, incompatible regression targets, and majority classes.

Split comparisons align columns by name and check exact feature-row overlap (target excluded), schema differences, missingness changes of at least 10 percentage points, unseen categorical values, and numeric mean changes exceeding 20% of the training range. Classification target-share changes of at least 10 percentage points are shown, including numeric class codes. These are screening heuristics, not statistical significance tests or proof of leakage. Dataset findings are displayed separately from the main experiment diagnoses.

Each CSV is limited to 2 MB, 10,000 rows, and 100 columns. Files remain in browser memory. **Clear datasets** resets this workspace. To run all tests: `node --test tests/dataset.test.mjs tests/evidence.test.mjs tests/training.test.mjs`.

## Implementation 3: combined diagnosis

**Build the case** combines findings from the completed log investigation and dataset workspace. Related signals merge into a single hypothesis with named sources, conflicting context, missing evidence, and a verification experiment. Context questions update the result immediately; changing evidence, datasets, target, or task clears previous answers.

Review priority uses the strongest signal: direct dataset observations (3), reported proportions or distribution changes (2), and heuristic trends or metric gaps (1). Conflicting context deducts one level. Repeated related signals never inflate priority. The resulting Limited/Low/Medium/High labels are review order, not probabilities or confirmed causes. User answers remain explicitly unverified. When logs and datasets refer to different experiments, the panel warns against treating their combined signals as corroboration.

Run all suites with `node --test tests/diagnosis.test.mjs tests/dataset.test.mjs tests/evidence.test.mjs tests/training.test.mjs`.

## Implementation 4: interactive educational lessons

After investigating, expand a hypothesis under **Build the case**, then open **04 / Learn why**. Lessons cover class imbalance, distribution shift, leakage, missing data, overfitting, stalled learning, and unstable training. Choose Beginner or Advanced, move the keyboard-accessible demonstration slider, inspect its chart/output, and answer the understanding check. Feedback explains the reasoning, and answers can be retried.

Simulations use explicitly stated toy assumptions and are never fitted to the uploaded experiment. Evidence excerpts connect the lesson to the hypothesis without claiming that the demonstration proves the diagnosis. Lesson state is browser-only and resets when the parent evidence changes. No external packages, backend, or persistence were introduced.

All tests: `node --test tests/lessons.test.mjs tests/diagnosis.test.mjs tests/dataset.test.mjs tests/evidence.test.mjs tests/training.test.mjs`.

## Implementation 5: verification experiments

Expand a hypothesis in **Build the case**, then open **05 / Verify this hypothesis**. The editable plan specifies one intervention, fixed conditions, a metric, expected direction, and a minimum meaningful change. Run training/evaluation externally, then enter baseline and experiment measurements, confirm controls, and record notes/run identifiers.

Percentage inputs use 0-100 and deltas use percentage points; loss uses absolute units. Results matching the predicted direction and minimum change are **Consistent with hypothesis**; opposite changes are **Contradicts prediction**. Smaller changes or unconfirmed controls are **Inconclusive**. These are directional checks, not significance tests or causal proof. Leakage and source-shift plans can predict a score decrease, which must not be confused with an improvement.

The latest recorded result appears beside the hypothesis. Prior attempts retain snapshots of their plan, observations, and interpretation. Original evidence priority is preserved. Results are session-only and reset when investigation inputs change; persistent case management is a later phase.

All tests: `node --test tests/experiments.test.mjs tests/lessons.test.mjs tests/diagnosis.test.mjs tests/dataset.test.mjs tests/evidence.test.mjs tests/training.test.mjs`.

## Implementation 6: investigation management

Open **06 / Investigation library** at the top of the page. Name the case, add notes, and choose **Save case**. Cases are stored explicitly in localStorage for this browser and site, not automatically synchronized. Reopen, rename, or delete cases from the library. New/open actions ask before discarding unsaved workspace changes. Deleting a saved case leaves the current workspace intact.

Saved cases include pasted logs, parsed evidence and epoch history, dataset rows and configuration, diagnosis context answers, investigation notes, and recorded verification attempts with their plan snapshots. Unrecorded experiment drafts, lesson progress, and original file-picker handles are not stored. For an uploaded log, parsed results reopen; select the original file again if you want to rerun parsing.

**Export JSON** downloads a versioned complete workspace snapshot, including dataset rows. **Import JSON** validates the structure and creates a new saved case without overwriting an existing ID. **Export Markdown** produces a readable report with metrics, combined diagnoses, dataset summaries, notes, and verification history. JSON imports are limited to 8 MB. Browser quota errors preserve the active workspace and offer export as a fallback; an unreadable existing library is not overwritten.

Changing the evidence, datasets, target, or task still invalidates context and recorded verification results; save the current case first to preserve that version. Saved cases are user-controlled records, not independently verified evidence.

All tests: `node --test tests/cases.test.mjs tests/experiments.test.mjs tests/lessons.test.mjs tests/diagnosis.test.mjs tests/dataset.test.mjs tests/evidence.test.mjs tests/training.test.mjs`.


## Implementation 7: broader input support

Open **07 / Extended evidence import** to select up to five CSV, JSON, TXT, or LOG files (10 MB combined). Map unfamiliar CSV columns to known metric names before analyzing. Duplicate destination names are rejected. Parsing runs in a Web Worker and can be cancelled; previous results remain until the new import succeeds. The main single-file/log workflow also uses background parsing.

Supported metrics now include MAE, MSE, RMSE, R2 (including negative values), precision, recall, F1, and AUC with train/validation/test/production prefixes. Slash/dot tracker names and common Keras epoch-summary lines are recognized. Error metrics retain their units, classification rates use 0-1 or explicit percentages, and R2 must not exceed 1. Regression metrics are extracted into the summary; existing trend charts and rules remain specific to loss and accuracy.

Files are analyzed independently to avoid inventing cross-file metric gaps. Findings and metric excerpts retain source names. The first file with epoch history supplies the chart; histories are not stitched together. CSV parsing is limited to one million cells, the mapping UI to 100 columns, chart rendering to the last 1,000 epochs, and displayed parser warnings to 200 per file. Original file selections and mappings are temporary; saving a case retains parsed results. Dataset profiling retains its separate limits.

All tests: `node --test tests/ingestion.test.mjs tests/cases.test.mjs tests/experiments.test.mjs tests/lessons.test.mjs tests/diagnosis.test.mjs tests/dataset.test.mjs tests/evidence.test.mjs tests/training.test.mjs`.


## Implementation 8: optional backend and AI assistance

Expand a diagnosis and open **08 / Evidence-grounded explanation**. **Explain locally** builds an evidence-linked explanation in the browser without sending evidence. The optional AI button shows the exact bounded payload and requires consent before sending it through `/api/explain` to OpenAI. Raw file contents, dataset tables, and API keys are not included in the client payload; excerpts can still contain source-specific information.

To enable AI, copy `.env.example` to `.env.local`, set `WHYLAB_AI_ENABLED=true`, `OPENAI_API_KEY`, and `OPENAI_MODEL` to a model available to your project supporting Responses structured outputs, then restart the development server. Never use NEXT_PUBLIC_ for credentials. No model is chosen automatically and no provider call is made during build or tests. Keep AI disabled until configuration is intentional.

The API validates input and output shape, checks cited evidence IDs, rejects cross-origin requests, bounds bodies to 24 KB, caps output at 1,800 tokens, and times out provider requests after 25 seconds. The process-local budget allows two concurrent calls, ten per minute, and 100 per UTC day. These counters reset on restart and are not shared between instances; they are prototype controls, not authenticated public-service billing limits. AI responses do not replace deterministic diagnoses or saved verification results. Output references do not prove factual correctness. Failures retain the workspace and offer local explanation.

WhyLab does not log or persist explanation payloads/responses. Responses are requested with `store:false`; this is not a promise of zero provider retention. Provider and hosting policies still apply. Explanation state is temporary, can be cleared by changing context, and is not included in case exports. Accounts, cloud storage, and sharing remain optional future work.

Integration references: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

Tests: `node --test tests/*.test.mjs`. Explanation endpoint tests use a mocked provider and never make paid API calls.

## Implementation 9: quality and release readiness

Run `npm.cmd run check` for tests, lint, TypeScript, and a production build. Run the production server on port 3109 and then `npm.cmd run test:browser` for the installed-Chrome end-to-end checks. Screenshots and reports are written to the ignored `artifacts/` directory. See [the release checklist](docs/RELEASE.md) for setup, coverage, manual checks, and deployment limits. This is a locally validated release candidate, not a public deployment.

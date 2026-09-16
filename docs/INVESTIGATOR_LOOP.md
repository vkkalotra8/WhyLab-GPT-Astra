# Milestone 12: Bounded diagnostic investigator

## Architecture

`investigateWithOpenAI` is the server-only production entry point. It requires explicit consent, configured private OpenAI credentials/model, and an available process-local request budget. It supplies the real native Responses API provider to `runInvestigator`. The request can include a bounded steering note and one specialist lens (`metrics`, `data_quality`, `shift`, or `leakage`); these are prioritization hints, not authority to bypass deterministic contracts. There is no production mock or default model substitution.

The provider exposes eight diagnostic functions plus `propose_hypothesis`, `evaluate_diagnostic_falsification`, and `finish_investigation`. Strict JSON schemas describe the functions, while the canonical runtime contracts and registry validate actual execution. The provider asks for one function at a time. Unsupported tools, malformed arguments and unknown IDs never dispatch arbitrary code. The model cannot execute shell commands, read files, choose URLs, or change registered datasets.

The application snapshots normalized datasets, assigns call/result/evidence/hypothesis/experiment IDs, runs deterministic tools, validates result envelopes, and appends evidence and ordered events to the run record. Full nested outputs retain slice, feature, and threshold scope. Observation evidence points to its result; counterfactual measurement evidence points to its experiment. PSI cuts and slice coverage are retained as result-linked artifacts. Dataset/source metadata are retained for provenance.

Validated reports return as `function_call_output` with the provider's matching `call_id`. Reasoning output items are carried forward with the function outputs; encrypted reasoning content is requested for stateless `store: false` turns. Raw evaluation rows are not placed in the initial provider context. Optional bounded training artifacts are registered as source-linked unverified line observations and a structured parser summary (epoch history, heuristic findings, and warnings); the summary is available to Astra for diagnostic selection but cannot be treated as measured evaluation evidence. Selected diagnostic outputs can contain sensitive category values, so consent covers those outputs as well.

## Limits

| Boundary | Maximum |
| --- | --- |
| Provider turns | 16 |
| Diagnostic executions, including failed executions | 10 |
| Invalid operations or repeated calls, cumulative | 3 |
| Proposed hypotheses | 5 |
| Investigation duration | 120 seconds |
| Individual provider request | 25 seconds |
| Provider output tokens per turn | 2,000 |
| Transcript per request | 1,000,000 UTF-8 bytes |
| Provider response | 262,144 bytes |
| Function argument string | 16,000 characters |
| Datasets / total rows | 3 / 20,000 |
| Selected columns per diagnostic | 10 |
| Thresholds / calibration or PSI bins | 51 / 20 |

Runtime limits may only be reduced and are snapshotted. Cancellation and deadlines bound provider waits, including a provider that ignores its signal. Synchronous deterministic work is bounded by dataset/operation limits and checked immediately afterward; JavaScript cannot preempt that synchronous work mid-operation. No automatic provider retry occurs.

Canonicalized argument keys deduplicate calls even if object properties or unordered selections are rearranged. Counterfactual seeds are excluded from cache keys because exact weighting does not use them. Repeated calls reuse existing evidence rather than rerun tools, and still consume the cumulative error budget. Failed executions are also retained and cached. Budget exhaustion and provider failures preserve prior successful evidence and return a stopped run, never fabricated completion.

## Hypotheses and completion

Model proposals must cite registered evidence and remain `proposed` with unassessed evidence strength. Accuracy-paradox proposals receive the application's canonical statement and use the controlled reweighting experiment. Other proposals can be tested against one completed diagnostic through `evaluate_diagnostic_falsification`: Astra must declare an exact metric, unit, direction, threshold, and plain-language prediction. The runtime locates exactly one matching measurement and returns `supports`, `rejects`, or `inconclusive`; missing, undefined, wrong-unit, and multiply scoped measurements fail closed. Final validation replays the rule from the original diagnostic result and rejects altered outcomes or evidence. These are prediction tests on supplied data, not causal confirmation or statistical significance tests. Cost policies and external user assumptions are not registered by this loop and are rejected.

Completion requires an explicit `finish_investigation` call, at least one successfully executed diagnostic, and valid nonempty evidence references. An insufficient-evidence completion also names missing evidence. This marks the orchestration stage complete, not a verified final diagnosis. Model text is never accepted as an implicit completion. Final diagnosis construction and hypothesis status reconciliation are Milestone 13; the connected workflow UI is Milestone 14.

Run records and evidence are held in memory and returned to the caller; durable storage and cross-process coordination are not implemented. The process-local request budget is not a distributed quota. Live model availability and quality were not exercised in tests.

## Verification

`tests/investigator.test.mjs` uses scripted providers to exercise the real registry and numerical engines, including both accuracy-paradox and distribution-shift diagnostic -> hypothesis -> falsification -> completion paths. It covers all eight diagnostics, reference validation, malformed output, deduplication, immutable snapshots, policy constraints, resource limits, cancellation, partial evidence retention, and final-report replay.

`tests/openai-investigator.test.mjs` stubs fetch only in tests and exercises the real server wrapper, strict tool payloads, matching function-call outputs, configuration/consent, safe diagnostics, response limits, and cancellation. The test harness removes only the Next.js server-only marker for native Node execution.

Protocol reference: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling). Provider schema descriptions are intentionally narrower than the general diagnostic contracts; update both definitions and runtime limits when expanding supported operations.

## Batched diagnostic calls

Astra may return up to three `function_call` items in one turn when every call is an allowlisted
diagnostic. Hypothesis proposals, falsification requests and completion read accumulated state, so
they must arrive alone and keep their ordering unambiguous; mixing them with a diagnostic, or
exceeding the batch limit, stops the run.

The deterministic engines are synchronous, so batching removes **provider round-trips** — the
dominant latency — rather than parallelizing computation. It is not a claim of concurrent execution.

Batched calls are executed in declaration order, so recorded events and results stay reproducible
across runs. Every call in a batch is counted individually against the tool budget, deduplicated
through the same cache, and validated independently: the budget can stop a run part-way through a
batch, and one rejected call never suppresses or contaminates its batch-mates.

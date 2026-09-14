# Milestone 13: Structured final diagnosis

`buildFinalInvestigation` turns a terminal investigator run into the existing canonical `Investigation` object. `validateFinalInvestigation` checks its graph, reference integrity, verification linkage and numerical outcome rules. The server entry point now returns `finalInvestigation` alongside the original run, so callers retain the original audit and result-linked artifacts.

## Final object

The canonical object contains the investigation ID, objective, timestamps and status; source/dataset metadata; evidence; tool calls/results; hypotheses; verification experiments; repair and comparison arrays; and a diagnosis with summary, primary hypothesis, evidence strength, references, unresolved questions and limitations. Existing serialization and parsing continue to work.

`experiments` represents executed verification tests. `repairs` is the repair-candidate field and remains empty until the repair engine milestone. `comparisons` also remains empty; no improvement is fabricated. Ordered loop events and PSI/slice artifacts remain available on the accompanying run; this milestone does not fabricate a timestamped UI timeline.

## Deterministic status rules

Only completed, linked accuracy-paradox experiments can assess the supported flagship hypothesis. Uniform supports, weakens or rejects outcomes map to supported, weakened or rejected. Untested, inconclusive or conflicting verification leaves the hypothesis proposed and unresolved. Evidence links retain the individual experimental relationships even when results conflict. No last-result-wins rule is used, and descriptive verification never automatically confirms causality.

A completed diagnosis requires explicit sufficient-evidence loop completion and a supported primary hypothesis. Other explicitly completed loops produce an inconclusive diagnosis. Stopped loops produce a failed investigation/diagnosis with partial evidence intact. Running loops cannot be finalized. If several hypotheses are supported, the first registered supported hypothesis is selected; this is deterministic selection, not a confidence ranking.

Evidence strength is limited for assessed outcomes and unassessed otherwise; it is not a probability. All final hypotheses require nonempty evidence references, including proposed hypotheses.

## Numerical integrity and prose

Generated summaries use fixed application-authored wording. Numeric findings remain in canonical tool outputs and measurement evidence. Final verification checks its call, hypothesis, criterion, seed, outcome, evidence IDs and comparison measurements against the executed counterfactual result. Gap components must match the recorded baseline ratio metrics; the joint gap and support/weaken/reject decision must follow the declared numerical rule.

This establishes provenance and internal consistency, not cryptographic authenticity or an independent remeasurement of the original CSV. Deterministic tool execution remains the trusted measurement boundary.

The accuracy-paradox statement is canonical application wording. Other model proposals are retained verbatim in the run audit but receive an explicitly unverified placeholder in the final hypothesis list. Arbitrary model prose, including unsupported numerical assertions, is not promoted to final findings. Questions in the final diagnosis are conservative application templates; the run retains the original requested missing evidence.

## Integration and verification

The investigator now captures objective and terminal timestamps. Invalid column, label and assumption references are rejected before execution registration, so failed execution records can still form a valid canonical graph.

Tests cover supported/weakened/rejected/inconclusive outcomes, contradictory experiments, stopped/empty runs, nonmutation, serialization, missing references, changed measurements/criteria/outcomes, invented summaries and active-run rejection. The mocked server integration also verifies that `finalInvestigation` is returned.

Run `node --test tests/final-diagnosis.test.mjs tests/openai-investigator.test.mjs`.

No packages, provider protocol changes, new route, or UI were added. Connected workflow/UI is Milestone 14; repair generation is Milestone 15. Live provider access was not exercised.

# Milestone 15: Repair candidate engine

`generateRepairCandidate` implements `generate_repair_candidate` as a deterministic application engine. It consumes a canonical investigation, an evidence-linked hypothesis, a completed threshold-sweep result for the selected dataset, and an explicit acceptance criterion. It returns a structured `operating_policy` repair candidate or an explicit no-candidate result. It never executes free text, applies predictions, or retrains a model.

## Selection

Supported performance criteria are accuracy, balanced accuracy, precision, recall, specificity, F1 and minority recall, expressed as `at_least` ratios in [0,1]. Among measured points satisfying the criterion, selection maximizes that same metric. Cost selection uses `expected_cost`, `at_most`, and a nonnegative cost limit; among eligible points it minimizes the measured total error cost. Exact objective ties choose the highest threshold independent of sweep input order.

Costs must come from the sweep's existing policy and registered explicit user-assumption evidence. The engine does not infer monetary or clinical costs. Criterion values are caller policy, not observed performance.

The candidate preserves positive-label mapping, probability >= threshold semantics, cost policy and acceptance criterion. Its evidence references identify the measured sweep and any cost assumption. The returned selection identifies the originating result, threshold and metric. No thresholds outside the supplied sweep are invented.

## Validation and evidence

The complete canonical graph is validated first. Unknown references, incompatible datasets, rejected/unreferenced hypotheses and unsupported criteria fail explicitly. At least one hypothesis evidence link must concern the selected dataset. Selection metrics must agree with the point's confusion counts (or the declared error-cost formula), use the requested units and cover the same evaluation population.

Undefined measurements cannot qualify. A valid but uncompleted or unreferenced sweep returns insufficient evidence; a completed sweep with no feasible measured point returns no eligible candidate. Invalid provenance graphs are rejected rather than treated as valid failed experiments.

Caller-supplied repair IDs allow deterministic replay; an omitted ID is generated once. Existing repair IDs are rejected. The returned candidate can be registered in the canonical investigation's `repairs` collection by the caller. Generation does not mutate the investigation or produce comparison records.

## Boundaries

A candidate satisfies the declared target in existing sweep evidence. It does not establish improvement over a baseline or independent holdout performance. Optimizing one metric can worsen others; the complete sweep retains those trade-offs. Threshold one is inclusive and does not necessarily produce an all-negative classifier.

No training-level recommendations are generated in this initial engine. Existing canonical contracts distinguish such future recommendations with `requires_external_experiment`; they must never be represented as evaluated repairs.

This milestone is the deterministic selection engine. It does not add a new provider tool or UI control. Application and before/after re-evaluation are Milestone 16; the dedicated Repair Lab UX is Milestone 19. The earlier diagnosis/UI correctly continues to say no repair was executed until that integration is made.

## Verification

Run `node --test tests/repair-candidates.test.mjs`. Tests cover performance and cost selection, preserved policy/provenance, ties, infeasible/undefined results, explicit cost assumptions, invalid references/criteria, corrupted metrics/populations, serialization and nonmutation.

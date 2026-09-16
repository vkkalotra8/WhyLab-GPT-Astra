# Challenge WhyLab (Milestone 22)

A local deterministic second-pass review is available in flagship, Astra and applied Repair Lab results. Select **Challenge this investigation** to inspect alternatives, contradictory relationships, weak assumptions and insufficient verification. When the original evaluation data is still retained in the session, **Run adversarial diagnostic** also executes one previously unrun allowlisted diagnostic and appends its result/evidence/events to the same investigation. This bounded pass is deterministic and does not use a provider call.

## Rules and confidence

- Recorded weakening/rejecting evidence relationships or completed weakening/rejecting test outcomes flag counter-evidence and cap evidence strength at limited.
- A non-rejected hypothesis without a completed supporting verification experiment is capped at limited.
- Unresolved questions on non-rejected hypotheses are reported as alternative/scope gaps and cap strength at moderate.
- Review never increases the original strength. The ordering is unassessed, limited, moderate, strong.
- Diagnosis strength is capped by the reviewed primary hypothesis, or limited if there is no recorded primary hypothesis.
- Declared assumptions trigger sensitivity/validation suggestions; they are not automatically treated as false. Repair comparisons trigger an independent-data verification suggestion, regardless of their same-data pass status.

These are explicit conservative review rules, not a statistical confidence calculation. A rejected hypothesis's opposing evidence is still reported; reviewed evidence strength does not reverse its recorded rejection. A review with no findings is not a certification. Alternative explanations are drawn from recorded unresolved questions; the engine does not invent new domain-specific causes or identify unlinked contradictions.

## Provenance and preservation

Every finding names the canonical hypothesis, evidence, experiment or comparison IDs it concerns. An adversarial diagnostic adds only a new canonical tool call/result and linked observation evidence; original statuses, confidence, diagnosis and prior measurements remain unchanged. The reviewed assessment is displayed separately, including original/reviewed strength, reduction flag and rationale. JSON export includes the full canonical snapshot, all findings, rules version and limitations. Re-running the same snapshot is deterministic. A changed investigation invalidates the prior displayed review.

## Verification

Tests cover actual confidence reduction, opposing evidence, insufficient verification, unchanged well-supported hypotheses, no promotion, input immutability, replay, reference integrity, missing diagnosis, rejected invalid provenance, and one appended adversarial diagnostic with matching dataset provenance. Browser checks cover review execution, reduction display, reference visibility and repeat execution. Run `npm run check`, then the production browser suite.

Manual review: run the flagship and challenge it. Its strong primary hypothesis becomes moderate in the reviewed assessment because its recorded scope question remains unresolved. Use **Run adversarial diagnostic** while the retained upload is available, inspect the appended result in the evidence graph, then export the review JSON. Proposed alternatives stay unassessed. Original diagnosis and incident exports remain the original assessment; the challenge export carries the separate second-pass review.

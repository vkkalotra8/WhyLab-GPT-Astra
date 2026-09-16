# General diagnostic falsification

WhyLab can now test non-accuracy hypotheses inside the same autonomous investigation. After Astra runs a diagnostic and proposes an evidence-linked hypothesis, it may call `evaluate_diagnostic_falsification` with:

- the hypothesis and completed diagnostic result IDs;
- a plain-language prediction;
- one exact metric name and unit;
- an `at_least` or `at_most` threshold.

The application, not the model, finds and compares the measurement. Exactly one metric/unit match is required. A measured value produces `supports` or `rejects`; a missing, undefined, wrong-unit, or multiply scoped value produces `inconclusive`. The resulting verification experiment and measurement evidence retain the original diagnostic call and result provenance.

Final-report validation independently replays the comparison from the immutable result. It rejects a changed outcome, criterion, result link, method, seed, or copied measurement. A supported prediction promotes the hypothesis to `supported`, but never to causal `confirmed`.

The protocol works with unique measurements from profiling, classification, calibration, leakage screening, drift tests, threshold analysis, and slice evaluation. When a diagnostic contains the same metric across several scopes, Astra must select a more specific diagnostic instead of silently choosing one.

The automated integration demonstration uses two evaluation datasets with shifted `feature_x` distributions. The scripted investigator selects PSI, proposes a shift hypothesis, declares `psi >= 0.1 unitless`, records a supporting experiment, completes the investigation, and passes canonical final-report replay.

## Conjunctive predictions and the weaken outcome

A single criterion can only support or reject. Strategy §6 requires three decisions, so a prediction
may instead declare `{ kind: "all_of", criteria: [...] }` with 2-4 distinct metric/unit pairs:

- every criterion met -> `supports`
- some but not all met -> `weakens`
- none met -> `rejects`
- any component absent, ambiguous or undefined -> `inconclusive` for the whole prediction

This mirrors the component rule the accuracy-paradox counterfactual already applies, so both
falsification paths reach `weakens` by the same logic. The conjunction fails closed: one unevaluable
component never becomes a partial pass.

Every matched measurement is retained on the experiment evidence in declaration order, and canonical
final-report replay recomputes the outcome from the recorded result. A hand-edited `weakens` is
rejected exactly as a hand-edited `supports` or `rejects` is, and so is restated measurement
evidence. A weakened hypothesis maps to status `weakened` and can never become the primary
diagnosis, which requires `supported`.

The criterion field is a union, not a replacement: existing single-criterion records parse unchanged,
and the counterfactual path still requires exactly one declared criterion.

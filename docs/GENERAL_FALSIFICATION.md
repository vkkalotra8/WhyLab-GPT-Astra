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

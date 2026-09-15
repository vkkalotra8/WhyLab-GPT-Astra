# Additional case studies (Milestone 24)

The homepage **More investigations** section offers two deterministic local cases. Choose a case, download its CSV or select **Run selected case**. Switching cases clears old results. Both integrate canonical provenance, reliability profile, evidence graph and incident report exports. No provider or saved browser state is required.

## Overconfident classifier

`public/fixtures/overconfident-classifier.csv` contains 100 synthetic balanced-label rows. Eighty predictions are correct, twenty incorrect; positive probabilities are 0.99 or 0.01 according to the predicted class. Classification and 10-bin equal-width calibration run on the CSV. The committed fixture measures accuracy 0.8, Brier score 0.1961 and calibration error approximately 0.19. The UI displays measured tool results rather than embedding expected values.

Teaching question: does confidence match observed outcomes? Next experiment: fit a calibration mapping using separate data and evaluate it on a holdout. This case performs no recalibration and does not claim the training cause is verified.

## Site-specific failure

`public/fixtures/site-failure.csv` contains 100 synthetic balanced-label rows. Site A has 90 correct predictions; site B has 10 incorrect predictions. Probabilities are 0.8/0.2, and both sites contain both labels. The deterministic slice evaluator uses the site column and minimum sample size 5. The committed fixture measures overall accuracy 0.9, site A accuracy 1 and site B accuracy 0.

Teaching question: what does an aggregate metric hide? Next experiment: collect more site-B observations and inspect acquisition, labeling and preprocessing. A site association does not identify a causal mechanism. The small slice has no confidence interval or operational safety certification.

## Reproducibility and scope

All rows are explicitly synthetic educational evidence. Canonical results retain dataset/source IDs, tool version/input, metrics and diagnostic limitations. Descriptive diagnoses remain inconclusive; no unsupported hypothesis confirmation, experiment execution or repair is fabricated. The main melanoma flagship retains its original full verification/repair workflow.

Tests verify hand-computed fixture results, changed-data sensitivity, replay, canonical export round-trips and invalid input handling. Browser checks run both cases and verify stale-result reset, followed by responsive overflow checks. Manual review: run each case in a fresh session, expand the measured records and reliability dimensions, download the CSV and export an incident report.

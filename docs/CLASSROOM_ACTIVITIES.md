# Expanded classroom activities (Milestone 25)

The flagship and both additional case studies now include a **Classroom worksheet** alongside the existing toy-model interactive lessons. The worksheet uses the current canonical investigation, not a fixed answer key.

## Activity sequence

1. Inspect the case's measured classification results.
2. Report accuracy and balanced accuracy as percentages. Each exercise cites its tool result, call, dataset and evidence IDs. Hints explain the formulas.
3. Choose an interpretation that respects the evidence scope rather than claiming a proven training cause or universal safety.
4. Write a verification plan naming the hypothesis, required data, changed factor, controlled factors, acceptance criterion and a falsifying outcome.
5. Check answers, discuss the instructor key, or download a JSON worksheet containing responses, feedback, lesson key and complete source investigation.

Numeric feedback accepts finite values from 0 to 100 with an explicit 0.05 percentage-point rounding tolerance. Undefined metrics generate no numeric question. Missing evidence does not manufacture an answer. The reflection is for discussion and is not automatically graded or executed. The answer key is intentionally accessible for teaching; this is not a secure exam or certified grading system.

## State and export

Answers remain in React page state only. Reset clears answers, feedback and reflection. Switching or re-running a case unmounts/replaces its worksheet. Reload discards the session. No classroom account, name, grade database, auto-save or server submission is added. Download is a local JSON artifact and includes the answer key and source evidence; it is not a saved-case import format.

## Verification

Tests cover measured answer provenance, rounding/invalid-answer handling, changed-data answers, immutable input, undefined metrics and invalid references. Browser checks verify numerical feedback and reset with the site case, followed by mobile overflow checks. Manual review: run either case, fill the worksheet, check answers, inspect hints and instructor guidance, write a verification plan and download the worksheet.

The previously implemented investigation, repair, reporting, reliability and CI features remain the core workflow. This milestone adds teaching activities without changing diagnostic measurements or claiming a clinical/operational qualification.

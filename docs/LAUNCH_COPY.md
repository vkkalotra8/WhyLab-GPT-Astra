# WhyLab launch copy — draft for your edit

Drafted 2026-09-16. Nothing here has been sent anywhere. Edit freely; the point is to give you
something to cut down rather than a blank page.

**Read the honesty gate at the bottom before posting.** Some lines below claim a live Astra
investigation. If `npm run check:astra` has not succeeded by launch time, those lines must change.

---

## Product name

WhyLab

## Tagline (Product Hunt caps this at 60 characters)

> Find why your ML model fails, prove it, then repair it

53 characters. Alternatives, all under the cap:

- `Investigate why your ML model failed — and prove it` (50)
- `An AI incident investigator for machine-learning models` (54)
- `Your model says 94% accurate. WhyLab checks.` (43)

Keep whichever you choose identical to the thumbnail and the video's closing card. The site title is
currently "WhyLab — Investigate the failure. Prove the why." — either align the tagline to that or
update `app/layout.tsx` so the story matches everywhere.

## Description (~260 characters)

> Upload evaluation data and WhyLab investigates why your model is failing. GPT-6 Astra chooses
> bounded statistical diagnostics, forms hypotheses, and runs experiments that can disprove them.
> Then it repairs the operating policy and measures what actually changed.

## Category

AI Reliability / ML Debugging — position it next to Sentry and Datadog: Sentry for software
failures, Datadog for infrastructure, WhyLab for machine-learning failures.

---

## Maker comment

> Hi Product Hunt 👋
>
> A model can report 92% accuracy and still miss 4 out of 5 malignant cases. The metric isn't
> wrong — it's just measuring the wrong thing when one class is rare. I kept watching teams ship on
> a number like that, so I built the thing that argues with it.
>
> **WhyLab is an incident investigator for ML models.** You give it evaluation data. GPT-6 Astra
> decides which diagnostics to run — profiling, calibration, leakage screening, drift tests, slice
> evaluation, threshold sweeps — then proposes explanations and tests them.
>
> Two decisions shaped the whole product:
>
> **Astra investigates, it doesn't narrate.** It picks the tools and declares the predictions. But
> it can only call an allowlisted set of deterministic statistical engines, and it never computes a
> number itself. Every figure you see was measured by the application, not written by the model.
>
> **It tries to prove itself wrong.** Before running a test, Astra states a prediction and a
> threshold. The app evaluates it and returns supports, weakens, or rejects. A weakened hypothesis
> can't become the diagnosis. Findings are replayed from the recorded measurements at export time,
> so a tampered outcome is rejected.
>
> Then the Repair Lab: you declare what errors actually cost you, WhyLab finds operating points that
> meet it, and you apply one and see the confusion matrix move. Before and after, same data, same
> acceptance criterion, both retained in one auditable history you can download.
>
> **What it doesn't do.** The flagship case is synthetic. Repairs tune the decision threshold — no
> retraining. A same-data improvement is not independent holdout validation, and nothing here is
> clinically validated. All of that is stated in the product, not just here.
>
> I'd genuinely like to hear where this breaks on your data. What failure would you want it to
> catch that it currently can't?

---

## Comment replies worth pre-writing

**"Isn't this just GPT explaining a confusion matrix?"**
> That was the thing I most wanted to avoid. Astra picks which diagnostic to run next and declares
> the falsification criterion before seeing the result — if the measurement misses, the hypothesis
> is weakened or rejected and can't become the diagnosis. The statistics are deterministic code;
> the investigation strategy is the model's. Remove Astra and you have a calculator with no
> investigator.

**"Why not just use balanced accuracy?"**
> Balanced accuracy tells you something is wrong, not what or what to do. WhyLab separates
> imbalance from threshold misalignment from drift from leakage, tests between them, and then
> converts your stated error costs into an operating point you can apply and measure.

**"Does it work on my data?"**
> Any CSV with `y_true`, `y_pred`, `y_probability`. Optional `timestamp`, `group`, `site`,
> `environment` and `feature_*` columns unlock slice and drift analysis. Binary classification
> today.

---

## Honesty gate before you post

Strategy §14 and §21 both require this, and it's the fastest way to lose credibility if ignored.

- [ ] `npm run check:astra` succeeded. **If not**, remove every claim that Astra ran live and say
      the demo shows the deterministic protocol. Do not imply live model use.
- [ ] The video shows a real run, not the deterministic flagship replay presented as one.
- [ ] Tagline in the PH form == thumbnail == video closing card == `app/layout.tsx`.
- [ ] Every number on screen is measured, or labeled "simulated under the supplied cost model."
- [ ] The synthetic-data and no-retraining limits appear in the maker comment, not only in docs.

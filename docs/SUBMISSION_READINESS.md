# WhyLab launch and submission readiness

Updated 2026-09-16 for the Product Hunt / OpenAI GPT-6 Astra Challenge.

## Positioning

**Name:** WhyLab

**Tagline:** Let Astra investigate why your ML model failed—then repair the policy and prove what changed.

**One sentence:** WhyLab turns prediction files and training artifacts into an evidence-linked investigation where GPT-6 Astra chooses bounded diagnostics, tests explanations, proposes a measurable operating-policy repair, and preserves the re-test in one auditable history.

Do not position the deterministic flagship as proof of autonomous Astra behavior. The launch demonstration must use **Load flagship for Astra**, show the observable model-selected tool sequence, continue into the embedded Repair Lab, apply the candidate to the evaluation copy, and download the resulting canonical investigation.

## 60–90 second demonstration

1. **0–10s — Problem:** Show 92% accuracy beside 20% malignant recall. Say: “The headline metric looks healthy; the consequential class is failing.”
2. **10–22s — Evidence:** Select **Load flagship for Astra**. Briefly show the evaluation CSV, synthetic training log, objective, and consent boundary.
3. **22–45s — Astra investigates:** Start the live investigation. Keep the observable activity and chosen diagnostics visible. State that the app executes only allowlisted deterministic tools and retains their measured outputs.
4. **45–62s — Falsification and diagnosis:** Show the evidence graph, the completed verification experiment where present, unresolved leakage/shift questions, and the Challenge review. Avoid claiming that an untested cause is proven.
5. **62–80s — Repair and re-test:** Continue in the embedded Repair Lab, use the explicit cost policy, request Astra's repair selection, apply it to the evaluation copy, and show recall/cost before and after.
6. **80–90s — Audit trail:** Download the investigation JSON. Close with: “One investigation, from anomaly to repair, with every claim linked to measured evidence.”

Record the demo only after `npm run check:astra`, `npm run check`, and the browser suite pass. Keep the provider model name and sanitized access-check result visible in separate recording notes; never display `.env.local`, API keys, or provider reasoning payloads.

## Launch assets

Repository launch kit: `public/launch/`. Validate it with `npm run check:launch-assets`.
The SVG thumbnail and gallery cards are synthetic launch illustrations; they do
not substitute for screenshots of a successful public Astra run.
Set `NEXT_PUBLIC_SITE_URL` to the deployed HTTPS origin so Open Graph and
Twitter image metadata resolve to the public host.

- Thumbnail: 1270×760 or the current Product Hunt recommended size; use the product name, the “92% accuracy / 20% recall” contrast, and the evidence graph. Verify dimensions in the launch form before export.
- Gallery 1: autonomous investigation input and consent boundary.
- Gallery 2: observable Astra-selected diagnostic activity.
- Gallery 3: evidence graph and falsification outcome.
- Gallery 4: linked repair before/after metrics and retained comparison.
- Demo video: 60–90 seconds following the script above, with captions and no secrets or real patient data.
- Maker comment: explain the accuracy paradox, why allowlisted deterministic tools matter, what Astra chooses, and the current limits (synthetic data, same-data threshold tuning, no retraining or clinical validation).

## Current challenge requirements

The rule check is recorded in [CHALLENGE_RULES_VERIFICATION.md](CHALLENGE_RULES_VERIFICATION.md).
It was checked on 2026-09-16; the official page currently shows the September
18, 2026 challenge date, five winners, and a live submission countdown. The
linked submission guide was not fetchable during that check, so its form and
eligibility details remain a human pre-submit check.

The official Product Hunt challenge page says to build something ambitious with GPT-6 Astra, schedule/launch it on Product Hunt on **Friday, September 18, 2026**, and lists five prizes consisting of a year of ChatGPT Pro, $10,000 in API credits, and OpenAI promotion. Confirm the countdown and final launch-form requirements immediately before scheduling:

- https://www.producthunt.com/contests/gpt-6-astra-challenge
- https://www.producthunt.com/p/producthunt/product-hunt-teams-up-with-openaidevs-for-the-gpt-6-astra-challenge

This project is not a robotics submission. The similarly named HIM Arena challenge closes September 16 and requires a robot project, ZIP, and MP4; those rules do not match WhyLab's strategy document.

## Blocking release gates

- Add API credits, then obtain a successful `npm run check:astra` result for `gpt-6-astra`.
- Record a complete live flagship investigation and linked repair JSON; mocked tests and the deterministic flagship are insufficient.
- Deploy to a public HTTPS URL with authenticated or platform-gated paid endpoints and shared usage limits. Process-local counters reset and are not adequate public quota controls.
- Run `npm run check:deployment` against that HTTPS URL; `/api/health?ready=1` must report readiness before recording the live demo.
- Re-authenticate GitHub CLI, push the reviewed branch, and run `.github/workflows/ci.yml` remotely. Preserve the hosted run URL and uploaded incident artifact.
- Optional investigator controls are now available: bounded specialist lenses and steering hints. Async fan-out, specialist sub-agent handoffs, and durable cross-process continuation still require a deployment-backed job/session store and remain outside the essential live workflow.
- Run the production browser suite against the release build and capture desktop/mobile screenshots.
- Schedule the Product Hunt launch for September 18 and recheck the challenge page immediately before submission.

## Evidence already established

- Local automated suite: 327 tests pass on 2026-09-16.
- Lint, TypeScript, and Next.js 16.3.5 production build pass on 2026-09-16.
- The configured model typo was corrected from `gpt-6-astraresu` to `gpt-6-astra` in the ignored local environment.
- A live bounded request reached OpenAI but returned `insufficient_quota / credit_balance_exhausted`; successful Astra access is therefore not yet established.
- GitHub remote exists, but the local `gh` credentials are invalid; hosted CI has not been run from this workspace.

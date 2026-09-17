# WhyLab Vision — Implementation Brief for the Antigravity Agent

Copy everything below the line into Antigravity as your task prompt.

---

## 0. How I want you to work

You are extending an existing, nearly-finished production Next.js app. Do not scaffold a new project and do not rewrite what works.

1. **Explore first.** Read the repo before proposing anything: `app/`, `components/`, `lib/`, `app/api/`, existing tool definitions for the Astra investigator, the CSV parsing layer, the design tokens/theme, and the existing fixtures in `public/fixtures/`. Report what you found and how my naming conventions work.
2. **Produce an Implementation Plan artifact before writing code.** It must list every new file, every modified file, the tool schemas, and the verification steps. Wait for my approval on the plan.
3. **Ask me at most 5 clarifying questions**, all at once, only if something is genuinely blocking. Otherwise choose a sensible default, state it in the plan, and move on.
4. **Verify in the browser.** After each phase, run the app, drive the new flow end to end with the browser tool, screenshot the result, and confirm the acceptance criteria for that phase. "It compiles" is not verification.
5. **Work in phases (P0 → P1 → P2 below).** Do not start a phase until the previous one passes its acceptance criteria. Keep the app deployable at the end of every phase.
6. **Never break the existing tabular investigator.** All new code is additive. Shared utilities get extracted, not forked.
7. Produce a **Walkthrough artifact** at the end of each phase: what changed, how to demo it, what is still unproven.

---

## 1. Context

**WhyLab** (live: `https://why-lab-gpt-astra.vercel.app/`) is an ML incident investigator. A user supplies evaluation data; GPT-6 Astra acts as the *investigator* — it decides which deterministic diagnostic tools to call, ranks root-cause hypotheses, runs falsification experiments, proposes a repair, and re-tests it. It currently works only on **tabular binary classification** (`y_true, y_pred, y_probability` CSVs) with local statistical diagnostics, an evidence-linked diagnosis, a Repair Lab for threshold/cost policy, and a Markdown/JSON incident export.

It is being submitted to the GPT-6 Astra Challenge on Product Hunt. The product's entire credibility rests on one rule:

> **Astra proposes. Deterministic code disposes.** The model never asserts a finding. Every displayed claim traces to a measured number produced by code, or is explicitly labelled as an unverified hypothesis or a user assumption.

**Your job: extend WhyLab from tabular models to computer-vision models — without ever violating that rule.**

---

## 2. What you are building: WhyLab Vision

A vision-model failure investigator in which a **multimodal model generates semantic hypotheses that pixel statistics cannot produce**, and **deterministic code then tries to falsify each one**.

This is the differentiator. Almost every "LLM + CV" project shows a vision model describing images. WhyLab Vision does the opposite: the vision model is only allowed to *guess*, and the app's job is to see whether the guess survives a statistical test on held-out data.

The product sentence to build toward:

> *Astra looked at 40 of your model's worst failures and said: "these look like flash-lit night shots with motion blur." WhyLab then labelled 600 held-out images against that rubric and measured it: error rate 8.1% without the concept, 47.3% with it. Difference 39.2pp, 95% CI [31.4, 46.6], p < 0.001, Benjamini–Hochberg corrected across 6 concepts. Hypothesis survived falsification.*

Nothing on screen is the model's opinion. The model only supplied the *question*.

---

## 3. Non-negotiable design principles

| # | Principle | What it forbids |
|---|---|---|
| 1 | Discovery and testing use **disjoint image splits** | Never report a concept's effect size on the same images Astra looked at to invent it. That is circular and a judge will catch it. |
| 2 | Every concept becomes a **written rubric**, then labels, then counts, then a test | No "Astra thinks lighting is the issue" shown as a finding |
| 3 | **"Insufficient evidence" is a first-class result** | No filling empty space with a confident-sounding cause |
| 4 | **Multiple-comparison correction** is mandatory | Testing 8 concepts and reporting the best p-value unadjusted is p-hacking |
| 5 | **Minimum sample floors** enforced in code | A concept present in 4 images yields "underpowered", not a percentage |
| 6 | **Pixels stay local by default** | Image statistics, hashing, embeddings and augmentation all run in the browser. Only an explicitly consented, bounded, downscaled sample ever leaves the device |
| 7 | **Every number is reproducible** | Fixed seeds, versioned tool outputs, deterministic ordering, an audit log of every executed tool call |

---

## 4. Capabilities to build

### P0 — the spine

**A. Vision evidence ingestion**
- Accept a predictions CSV with `image_id, y_true, y_pred, y_probability` plus optional `split` (`train` / `val` / `production`), `site`, `device`, `capture_time`, `annotator`.
- Accept an image folder (`webkitdirectory`) or a ZIP, matched to `image_id` by filename stem. Support a metadata-only mode where no images are supplied — the app must degrade gracefully and say exactly which diagnostics became unavailable.
- Enforce and surface limits: image count, per-image size, total bytes, accepted formats. Report unmatched IDs rather than silently dropping them.

**B. Local image profiling (Web Worker + OffscreenCanvas, zero network)**
For every image compute, deterministically: width, height, aspect ratio, mean/std luminance, RMS contrast, saturation, colorfulness (Hasler–Süsstrunk), sharpness (variance of Laplacian), edge density (Sobel), estimated noise, clipped-highlight and crushed-black fractions, dominant hue histogram, estimated JPEG quality / blockiness, file size per megapixel, and a 64-bit perceptual hash (dHash) plus an average hash.
Store as a tidy per-image feature table. This table is the substrate every later test runs on. Show a progress indicator; this is the slowest step.

**C. Near-duplicate & train/test leakage scan** *(deterministic, fast, and the most under-served real CV failure)*
- Hamming distance over perceptual hashes, bucketed by BK-tree or LSH so it does not go quadratic on 10k images.
- Report: duplicate clusters within a split, and — critically — **cross-split near-duplicates between train and val/production**.
- Quantify the consequence honestly: accuracy on leaked-duplicate images vs. accuracy on the rest, with a confidence interval. That gap is the leakage-inflated performance estimate.
- Render side-by-side thumbnail pairs with their Hamming distance. This is visually devastating in a demo and it is pure arithmetic.

**D. Vision metrics + slice evaluation**
- Standard metrics from the existing tabular engine, reused, not rewritten.
- Slice by supplied metadata (`site`, `device`, `capture_time` bucket) **and** by quantile bins of every computed image feature (e.g. sharpness decile, brightness quintile). Report per-slice error rate, support, and a CI; rank slices by (effect size × support), not by effect size alone.

**E. The Concept Falsification Loop — the signature feature**
1. **Sample.** Deterministically select a *discovery set*: top-k false negatives, top-k false positives, top-k high-confidence errors, plus a matched control sample of correct predictions. Downscale to ≤512px longest edge, strip EXIF, optionally blur detected faces.
2. **Hypothesize.** Send the discovery set to Astra with a strict instruction: *propose 3–8 candidate visual concepts that might distinguish failures from successes. For each, write a binary labelling rubric precise enough that a different annotator applies it identically. Do not state a conclusion.* Return via Structured Outputs: `{concept_id, name, rubric, positive_example_ids, negative_example_ids, why_plausible, expected_direction}`.
3. **Label.** Apply each rubric to a **held-out test set** the model has not seen, in small batches, with the rubric as the only instruction and the image as the only input. Persist the labels, the rubric version, and the batch order. Record per-image label confidence and treat low-confidence labels as `uncertain`, not as `absent`.
4. **Audit the labeller.** Re-label a random 10% subset a second time with shuffled batch composition and report self-consistency (Cohen's κ). If κ is low, say so and mark the concept's result unreliable. *This one check will impress an engineering-literate judge more than any UI polish.*
5. **Test.** Two-proportion test of error rate with vs. without the concept: difference in proportions, Wilson score interval, Fisher's exact where counts are small, and risk ratio. Apply Benjamini–Hochberg across all concepts tested in the investigation. Enforce a minimum cell count (default 25 per group) before reporting anything but "underpowered".
6. **Confound check.** For a surviving concept, re-test it stratified within site/device and within brightness/sharpness quantiles, so an obvious pixel-statistic confound is surfaced rather than hidden. Report whether the effect survives stratification.
7. **Verdict.** `supported` / `weakened` / `rejected` / `underpowered` / `unreliable-labelling`, with the numbers that produced it.

**F. Vision investigation log + evidence provenance**
Extend the existing evidence-graph / investigation-log pattern so every vision node carries: the tool that produced it, its inputs, the image IDs involved, the statistic, the interval, and which hypothesis it supports or weakens. Clicking an evidence node must open the actual images behind it.

---

### P1 — the demo climax

**G. Counterfactual robustness sweep (real re-inference in the browser)**
Ship one small ONNX image classifier and run it with `onnxruntime-web` / `transformers.js` so the app can actually re-predict. Then apply deterministic canvas perturbations at graded strengths — Gaussian blur σ, brightness/gamma shift, JPEG quality reduction, additive noise, rotation, downscale-upscale, hue shift, occlusion patch — and plot accuracy/recall degradation curves against perturbation strength.
This turns a hypothesis into a controlled experiment: *"production images are 2.3× blurrier on average; here is the measured accuracy of the same model at that blur level."* Report the operating point of the real production distribution on each curve.
If no runnable model is available, this tool must return `unavailable` with a clear reason — never a simulated curve.

**H. Embedding slice discovery + Astra names the slice**
CLIP-style embeddings in-browser → k-means / HDBSCAN → per-cluster error rate with CIs → rank clusters by excess error × support. Then send the *top failing cluster's* sample images to Astra purely to **name and describe** it, clearly labelled in the UI as a model-generated label over a statistically-derived cluster. Show a 2D PCA/UMAP scatter coloured by correctness, with the failing cluster highlighted.

**I. Vision Repair Lab**
Extend the existing Repair Lab from a single global threshold to vision-appropriate policies, each applied to an evaluation copy and re-measured with the same acceptance criteria:
- per-slice / per-concept thresholds under a stated FN:FP cost model,
- an abstain / route-to-human band with measured coverage-vs-risk trade-off,
- a **preprocessing or acquisition-policy** recommendation (e.g. reject captures below a measured sharpness threshold) with the measured retained-coverage cost,
- a **training-data recommendation** (augmentation policy, re-balancing, duplicate removal) that is explicitly labelled as *not verified in-app* because it requires retraining.
Before/after must always be measured on the same held-out data, with the delta shown for every affected metric — including the ones that got worse.

**J. Vision Incident Report export**
Extend the existing export: dataset and image-corpus fingerprint (counts, hash summary, splits), leakage findings, ranked slices, every concept tested *including the rejected ones*, labelling-consistency stats, robustness curves, the applied repair, before/after numbers, residual risk, and recommended production monitors (e.g. "alert if median sharpness drops below X" — derived from the measured curves).

---

### P2 — only if P0 and P1 are rock solid

**K. Challenge WhyLab (adversarial vision review)** — a second pass that actively tries to find an alternative explanation for the leading diagnosis and re-runs the stratified tests against it.
**L. Object-detection support** — IoU/mAP, per-class confusion, localization-vs-classification error decomposition (a TIDE-style breakdown).
**M. Annotation-quality audit** — surface probable label errors via high-confidence disagreement plus embedding-neighbourhood label inconsistency, for human review only.

---

## 5. Technical constraints

- **Stack:** stay on the existing Next.js App Router + TypeScript + the current styling system. Match existing component patterns and design tokens exactly — this must look like one product, not a bolted-on module.
- **Heavy compute is client-side** in a Web Worker: pixel stats, hashing, clustering, augmentation, ONNX inference. Keep the main thread responsive and stream progress.
- **Server routes** (`app/api/vision/...`) only orchestrate Astra: hypothesis generation, concept labelling batches, slice naming, repair translation, report narration. Enforce strict payload caps, per-session request limits, and a hard cap on images per request. Set sane `maxDuration`; chunk labelling into multiple bounded requests rather than one long one.
- **Astra integration:** use the Responses API with Structured Outputs (JSON schema validated server-side with Zod — reject and retry on schema failure, never render unvalidated model output), function/tool calling for the diagnostic tools, async/parallel tool calls where the tests are independent, and prompt caching for the repeated rubric-labelling calls. **Verify the current model id, multimodal input format, and image size/count limits against OpenAI's live docs before coding** — do not trust any model id you remember. Put it behind a thin `lib/astra/client.ts` adapter so a model change is a one-line edit.
- **Privacy:** default to local-only. Sending images requires an explicit, specific consent checkbox that states exactly how many images, at what resolution, to which provider. Provide a metadata-only mode and an optional face-blur pass. Strip EXIF. Never persist user images server-side.
- **Determinism:** seed every sampler and clusterer; sort every output stably; version every tool's output schema; log every tool invocation with inputs, duration and result into the investigation log.
- **Failure handling:** every tool returns a typed result or a typed error with an actionable message. A failed or unavailable tool must appear in the UI as unavailable. Under no circumstances may a missing measurement be replaced by a model-generated estimate.

---

## 6. Flagship demo fixture — build this, do not improvise it at demo time

Generate, with a build-time script and a fixed seed, a small **synthetic image dataset with three planted defects**, shipped in `public/fixtures/vision/` with a README stating plainly that it is synthetic:

1. **A planted shortcut:** a subtle marker (a scale ruler / corner watermark) present on ~78% of positive-class training images and ~5% of production positives. This is what the concept loop must discover and confirm.
2. **Planted near-duplicates:** ~6% of the validation set is a near-copy of training images (slight crop/JPEG re-encode), which the hash scan must find, with a measured accuracy gap between leaked and clean subsets.
3. **A planted acquisition shift:** production images are systematically blurrier and dimmer, which the robustness sweep must quantify against the real degradation curve.

Ship the accompanying `predictions.csv` from a real small model trained on it, so every number in the demo is genuinely measured. Add a "Load vision flagship" button mirroring the existing flagship-case pattern, and an end-to-end test that reproduces the flagship investigation from a clean session and asserts the key numbers, so the demo cannot silently rot.

**Target demo arc (≤90s):** headline metric looks fine → WhyLab finds a 6% leakage-inflated subset → slices show production collapsing → Astra proposes six concepts from 40 failures → five die, one survives on held-out data with a corrected p-value and a stratification check → robustness curve shows the measured blur operating point → Repair Lab applies a per-slice threshold plus an acquisition gate and re-measures → incident report exports.

---

## 7. Acceptance criteria

Phase is not done until every box is true and you have shown me browser evidence of each.

- [ ] Predictions CSV + image folder ingest, match by ID, and report unmatched IDs
- [ ] All per-image statistics computed locally, reproducibly, with progress feedback, on 2,000+ images without freezing the UI
- [ ] Cross-split near-duplicate leakage detected, thumbnail pairs rendered with distances, and the leaked-vs-clean accuracy gap reported with a CI
- [ ] Slice evaluation over metadata and feature quantiles, ranked by effect × support, every slice showing its support count
- [ ] Astra returns schema-valid concepts with usable rubrics; server rejects invalid output rather than rendering it
- [ ] Concept labelling runs on a **held-out split**, and the UI states the discovery/test split sizes on screen
- [ ] Self-consistency (κ) computed on a re-labelled subset and displayed
- [ ] Two-proportion test + Wilson CI + Fisher fallback + BH correction, all implemented in code, with unit tests against known values
- [ ] Minimum-count floors enforced; an underpowered concept renders as underpowered, not as a number
- [ ] Stratified confound re-test runs for every surviving concept
- [ ] Every evidence node links to the tool call and the actual images behind it
- [ ] No image leaves the browser without an explicit, specific consent action
- [ ] Every tool has a typed error path; no fabricated values anywhere, verified by grepping for placeholder/mock data before you call it done
- [ ] Flagship vision case reproduces end to end from a clean browser session, asserted by an automated test
- [ ] Existing tabular investigator, Repair Lab and exports still pass their checks
- [ ] Mobile and dark-mode render correctly; no dead buttons, no unexplained metrics

---

## 8. Explicit non-goals

Do not build: in-app model training, a general image annotation tool, a dataset marketplace, user accounts, server-side image storage, or support for every task type at once. Do not add an Astra capability solely to claim you used it. Do not generate images. Do not make any clinical, diagnostic or safety claim about any real-world use.

---

## 9. Deliverables at the end

1. Implementation Plan artifact (before code) and a Walkthrough artifact per phase.
2. The code, phased, each phase independently deployable.
3. `docs/vision-methodology.md` — every statistical method, its assumptions, its failure modes, the exact formula behind any displayed score, and the known limitations of LLM-generated concept labels. Link it from the UI. A judge who reads this should trust the rest of the product more, not less.
4. A demo script with exact click order and expected on-screen numbers.
5. A short "what we could not verify" list — the honest residual risks.

**One small fix while you are in there:** the deployed page's Open Graph image URL points at `http://localhost:3000/...`, so link previews on Product Hunt, X and Slack will be broken. Set the metadata base URL from the deployment URL and confirm the preview renders.

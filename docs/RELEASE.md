# WhyLab 0.1.0 - local release candidate

This release runs the full evidence-to-verification workflow locally, with optional server-side AI explanations. It has not been published to a hosting provider.

## Repeatable release checks

Use Node 24 (the tests use native TypeScript loading). No additional packages are needed.

```powershell
npm.cmd run check
npm.cmd run start -- --port 3109
```

In a second terminal:

```powershell
npm.cmd run test:browser
```

The browser runner uses installed Chrome and the Chrome DevTools Protocol. Override `WHYLAB_BROWSER` with an installed Chromium/Edge executable and `WHYLAB_TEST_URL` with a running local server URL if needed. It creates an isolated temporary browser profile, cleans it up, and writes screenshots and a JSON report to `artifacts/` (git-ignored). The runner does not download browser binaries or testing packages. Avoid pointing it at a shared live deployment: it exercises local case creation and imports.

## Coverage

- Parser rules, CSV quoting/mapping, multiple evidence files, regression metrics, and missing/ambiguous evidence.
- Dataset comparisons and hypothesis ranking, including conflicting context.
- Lesson calculations and verification comparisons.
- Case serialization, malformed import rejection, invalid metric ranges, duplicate epoch history, and inconsistent experiment deltas.
- Explanation request/output validation, provider failure/refusal/timeout handling, consent, and process-local limits (mocked provider; no paid API calls).
- Browser workflows: keyboard tab navigation and skip link, empty input, sample worker parsing, charts, lesson quiz, local explanation, controlled experiment recording, save/reload/reopen, JSON import/export, CSV mapping with multiple files, reduced motion, form labels, storage quota recovery, and the built API route.
- Layout overflow checks at 375px and 768px; screenshots also captured at desktop width.

## Release fixes

The skip link is now the first keyboard stop, before the investigation library. Unsaved case changes register a before-unload warning. Case import rejects invalid accuracy ranges, unordered/duplicate epochs, blank dataset headers, invalid experiment metrics and directions, and deltas inconsistent with recorded measurements.

## Practical limits and manual checks

These checks are not a full accessibility certification. Screen-reader usability, real touch devices, browser-specific file pickers, and Firefox/WebKit still need manual testing. Screenshots and overflow checks do not verify every visual state. Diagnosis rules are educational heuristics, not a validated causal inference system.

No live AI provider call was made during validation. Configure a model and key locally to test provider compatibility. AI is disabled by default. Before any public deployment, define access control and shared usage limits for paid endpoints: current rate limits are process-local, and same-origin checks are not authentication. Account storage, sharing, centralized quotas, monitoring, and backups remain separate production work.

Case data is saved only when the user chooses Save. Browser storage can be cleared or unavailable; JSON export provides a portable copy. Imported cases remain user-provided evidence. Unrecorded form drafts are not included in saved cases.

## Local rollout and rollback

Build with `npm.cmd run build`, then serve with `npm.cmd run start`. Keep the preceding source/build release and export important cases before updating. Roll back the source/build together; do not silently migrate or delete browser case data. Version-1 JSON imports remain explicitly validated.

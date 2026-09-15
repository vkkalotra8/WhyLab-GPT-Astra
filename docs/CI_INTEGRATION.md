# GitHub / CI integration (Milestone 23)

`.github/workflows/ci.yml` runs on pull requests, pushes and manual dispatch. It checks out the repository without persisting credentials, installs the lockfile dependencies with Node 24, runs tests/lint/type checking/build, then executes the synthetic flagship reliability policy. The job has read-only repository permissions, a 20-minute timeout and no model credentials. It does not post issues, comments, deploy, or alter branch protection.

## Local reproduction

```sh
npm run check
npm run check:reliability
```

The policy runner can also take an explicit policy path:

```sh
node scripts/reliability-check.mjs policies/flagship-reliability.json
```

It always evaluates the committed synthetic melanoma fixture through the deterministic investigation/repair workflow. `policies/flagship-reliability.json` declares repaired recall >= 0.9, precision >= 0.7 and total simulated cost <= 10. These are reviewable fixture regression thresholds, not a production safety certification or a clinical policy. The underlying demo's declared cost assumptions remain in the incident artifact.

Each check declares baseline/after scope, metric, operator, target and unit. Results retain the actual measured value, dataset ID, comparison ID and separate policy-stage evidence IDs. Undefined/missing measurements or mismatched units become inconclusive and fail the overall gate. Invalid or empty policies fail validation. All checks must pass for exit code 0; failed/inconclusive checks or execution errors return exit code 1.

## Artifacts

`artifacts/ci/` receives:

- `reliability-check.json`: policy, measured results and gate status (or explicit execution failure).
- `incident-report.json`: structured report with complete canonical provenance and reliability profile.
- `incident-report.md`: portable incident report with provenance appendix.

Before each run, only those three generated filenames are cleared, preventing stale reports from being presented after an error. Artifacts remain git-ignored. GitHub Actions uploads this directory with a run-specific name and 14-day retention, including when a preceding validation/check step fails, unless cancelled. A missing artifact directory fails the upload step. No browser session or local user dataset is uploaded.

The workflow uses the documented [setup-node](https://github.com/actions/setup-node) and [upload-artifact](https://github.com/actions/upload-artifact) interfaces. It is intended for GitHub-hosted Ubuntu runners; a hosted execution has not been performed locally. Branch protection must be configured separately by a repository administrator if the check should block merging. Browser tests remain the documented local release check and are not part of this CI job.

## Verification

Unit tests cover passing measured policy, failed baseline/stricter targets, absent/undefined measurements, unit mismatches and invalid policies. The CLI is also exercised locally for success and malformed-policy failure. No remote workflow run, GitHub issue, commit or push is performed by this milestone.

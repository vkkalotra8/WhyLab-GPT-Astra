# WhyLab — next implementation plan

Created: 2026-09-16 (T-2 days from the September 18, 2026 Product Hunt launch date)
Basis: `WhyLab_GPT6_Astra_Challenge_Winning_Strategy.docx` sections 6, 7, 13, 17, 19, 21
Supersedes the stale "12 remaining items" list as a planning input. See the reconciliation below.

---

## 0. Reality check before planning

Two facts drive the ordering of everything below.

1. **The launch window is ~48 hours.** Strategy §21 requires the launch to be scheduled for
   September 18, 2026. This is not a normal feature-planning horizon.
2. **The stale status list overstates the remaining code work.** Five of its twelve items were
   implemented after it was written. The genuinely code-deliverable gap is narrower and more
   specific than the list suggests — but the single hard blocker (item 1, live Astra access) is
   external and cannot be closed by writing code.

Consequence: the critical path to a valid submission is almost entirely **external** (billing,
deployment, recording). Code work is a *secondary* track that should be strictly time-boxed and
chosen only where it strengthens the 60–90 second demo (strategy §16).

---

## 1. Reconciliation: stale list vs. verified repository state

Verified by reading the source, not the status notes.

| # | Stale claim | Verified state | Real residual gap |
|---|---|---|---|
| 1 | Live Astra unvalidated | **True.** `insufficient_quota / credit_balance_exhausted` | External: billing only |
| 2 | Flagship demo unrecorded | **True.** `Load flagship for Astra` exists; no recording | External: recording |
| 3 | Production infra absent | **True.** `/api/health?ready=1` fails closed by design | External: deploy + secrets |
| 4 | Falsification engine narrow | **Mostly closed.** `diagnostic-falsification.ts` covers any non-counterfactual diagnostic | **Real gap — see B1** |
| 5 | Objective→policy manual | **Closed.** `repair-lab.ts` `repairPolicyProposalSchema` + explicit user confirmation | None |
| 6 | Adversarial pass inert | **Closed.** `runAdversarialChallenge` executes one unrun allowlisted diagnostic | Bounded by design |
| 7 | Artifacts limited to CSV | **Closed for local paths.** TXT/LOG/JSON/CSV ingest via `training-logs.ts` | Provider file search — B5 |
| 8 | Optional Astra capabilities | **Partly closed.** Steering + 5 specialist lenses shipped | **Async fan-out — see B2** |
| 9 | Operational remedies are prose | **True.** `incident-report.ts` emits "Suggestions only" | **Real gap — see B4** |
| 10 | Hosted CI unverified | **True.** `gh` credentials invalid locally | External: re-auth |
| 11 | Launch assets incomplete | **Partly.** SVG kit shipped; screenshots/video absent | External: capture |
| 12 | Final submission validation | **True.** | External: scheduling |

Also found, not present in the stale list at all:

- **Strategy §19 lists ten first-release tools. The investigator allowlist has eight** plus
  falsification. `generate_repair_candidate` and `re_evaluate_repair` exist but live on a separate
  Repair Lab surface rather than inside the Astra loop. See **B3**.

---

## 2. Track A — Critical path (external, blocking, do first)

None of this is code. All of it gates strategy §21.

| ID | Action | Gate it unblocks | Verify with |
|---|---|---|---|
| A1 | Add OpenAI API credits to the project | §21 "live product uses GPT-6 Astra" | `npm run check:astra` succeeds for `gpt-6-astra` |
| A2 | Deploy to a public HTTPS origin | §21 "repeatable from a clean browser" | `npm run check:deployment` |
| A3 | Configure `WHYLAB_ACCESS_TOKEN` + shared Redis quota | Paid-endpoint protection | `/api/health?ready=1` reports ready |
| A4 | Set OpenAI project spend limits | Cost containment during launch traffic | OpenAI dashboard |
| A5 | Record the live flagship run (§16 script) | §21 "Astra calls at least one real diagnostic tool" | Downloaded investigation JSON from the live run |
| A6 | Capture production screenshots for the 4 gallery slots | §21 "page, thumbnail, tagline, video tell one story" | `npm run check:launch-assets` |
| A7 | Re-auth `gh`, push branch, run hosted CI | §17 P2 GitHub/CI | Hosted run URL + uploaded artifact |
| A8 | Schedule the launch; re-verify the challenge page | §21 final gate | Product Hunt submission form |

**A1 is the hard blocker.** A5, A6 and the entire submission depend on it. If A1 cannot be closed,
the submission cannot honestly claim Astra-native behavior, and no amount of B-track work changes that.

---

## 3. Track B — Code work, ranked by demo leverage per hour

### B1 — Complete the falsification decision space *(recommended: do this one)*

**Strategy basis:** §6 decision row states outcomes are *"Support, weaken, or reject."*
**Checklist:** F (P0).

**Current state.** `app/lib/investigation/diagnostic-falsification.ts` returns only
`supports | rejects | inconclusive`. The `weakens` outcome exists in the schema
(`types.ts` `verificationExperimentSchema`) and in the accuracy-paradox path
(`counterfactual.ts:43`), but the *general* engine can never produce it. A prediction that
misses its threshold by 0.001 is reported identically to one that misses by an order of
magnitude.

**Work.**
1. Extend the criterion with an optional tolerance band so a near-miss resolves to `weakens`
   rather than `rejects`.
2. Emit `weakens` from `evaluateDiagnosticFalsification`; keep the rationale string explicit that
   the band is a declared test policy, not a significance test.
3. Confirm the general path reaches the `weakens → weakened` mapping in `final-diagnosis.ts:78`
   (the mapping already exists; only the counterfactual path currently reaches it).
4. Extend the replay check in `validation.ts` so a tampered `weakens` outcome is rejected exactly
   as `supports`/`rejects` are today.

**Acceptance.**
- A scripted investigation produces each of `supports`, `weakens`, `rejects`, `inconclusive` from
  the general engine.
- Canonical final-report replay rejects a hand-edited outcome in all four cases.
- `docs/GENERAL_FALSIFICATION.md` updated.

**Why it earns the slot:** it lands at the 43–58s mark of the §16 demo — the exact beat where the
product claims *"WhyLab runs experiments that can disprove the diagnosis."* A binary
supports/rejects engine visibly under-delivers that claim. Small, contained, testable.

---

### B2 — Concurrent diagnostic fan-out *(only if B1 finishes early)*

**Strategy basis:** §7 names async tool calling in the *prioritize-first* set, not the optional set.

**Current state.** `investigator.ts` hard-stops on more than one call per round:

    if (calls.length !== 1) return stop('expected_one_call');

**Correction to a prior note.** This was previously deferred as needing "deployment-backed job
infrastructure." That is true only for *durable cross-process continuation*. Executing several
independent deterministic diagnostics concurrently within one turn needs none of it — the tools are
pure functions over an already-snapshotted dataset map.

**Work.**
1. Accept 1..N (N ≤ 3) `function_call` entries per round.
2. Execute via `Promise.all` over `executeDiagnostic`, with per-call error isolation so one
   failure does not abort the batch.
3. Append results to `history` in **call order, not completion order**, so runs stay reproducible.
4. Count every call against the existing `limits.tools` budget; leave `finish_investigation`,
   `propose_hypothesis` and `evaluate_diagnostic_falsification` single-call-only.

**Acceptance.**
- Scripted provider issuing 3 independent diagnostics in one round yields 3 results.
- Event sequence is identical across repeated runs.
- Tool budget and all existing stop codes still enforced.

**Risk:** touches the core loop two days before launch. Do **not** start this unless A1–A3 are
already closed and B1 is merged and green.

---

### B3 — Repair tools inside the Astra loop *(post-launch)*

**Strategy basis:** §19 first-release tool set; checklist G.

Add `generate_repair_candidate` and `re_evaluate_repair` to the investigator allowlist so one
investigation runs anomaly → diagnosis → repair → re-test without a surface switch. The engines
already exist (`repair-candidates.ts`, `repair-reevaluation.ts`); this is wiring plus contracts, not
new analysis. Deferred because the linked Repair Lab already satisfies the demo narrative, and
enlarging the allowlist is a security-relevant change that deserves more than 48 hours of soak.

---

### B4 — Turn operational remedies into real artifacts *(post-launch)*

**Strategy basis:** §13 stretch goal.

`incident-report.ts:25` emits "Suggestions only; not configured or executed." Meanwhile
`ci-policy.ts` already defines an executable `ciPolicySchema` with a working `evaluateCiPolicy`.
The gap is that the report does not *emit* a policy that checker can consume.

Work: derive a concrete `ciPolicy` object from the measured before/after thresholds, emit it in the
incident export alongside a GitHub-issue markdown body, and keep the honesty labeling ("generated
configuration, not a deployed monitor"). Acceptance: the exported policy round-trips through
`evaluateCiPolicy` without hand-editing.

---

### B5 — Provider file input / file search *(deferred)*

**Strategy basis:** §7. Blocked behind A1 — cannot be designed against an unexercised API surface.
Local artifact ingestion already covers the demo. Lowest priority of the five.

---

## 4. Recommended sequencing for the next 48 hours

```
Now        A1 add credits ──> npm run check:astra
             │ (blocked?) ──> escalate; B-track cannot substitute
             ▼
+2h        A2 A3 A4 deploy + secrets + spend caps
             ▼
+6h        B1 falsification weakens  ◄── the one code item that fits the window
             ▼
+10h       npm run check (tests/lint/typecheck/build) + browser suite
             ▼
+14h       A5 record live flagship  ──  A6 capture screenshots
             ▼
+20h       A7 hosted CI
             ▼
Sep 17     A8 schedule launch, re-verify challenge page, clean-browser pass
Sep 18     Launch
```

**Stop rule:** if A1 is still blocked 24 hours before launch, freeze the B track entirely and spend
the remaining time on honest positioning — the §14 credibility rule and the §21 gates both require
that unproven claims be labeled, not implied.

---

## 5. Post-launch backlog (strategy items intentionally not attempted now)

- B3 repair tools in the main allowlist
- B4 executable CI/monitoring artifacts
- B5 provider file input and file search
- Specialist sub-agent handoffs (§8) — UX constraint: still one investigator surface
- Durable cross-process investigation continuation (§7 persisted reasoning) — needs a session store
- Aggregate reliability score (§12) — currently shipped as the documented risk profile fallback,
  which §12 explicitly permits. Do not add a single number without a defensible weighting.

---

## 6. Implementation status (updated 2026-09-16)

Validated after the work below: **356 tests, lint, TypeScript, Next.js production build, and 30
browser checks against the production server on port 3110.** Baseline before the work was 343 tests.
No paid provider calls were made; the browser run uses mocked provider responses.

### B1 — Falsification decision space — DONE

Delivered a different design from the one sketched above. A tolerance band would have meant changing
`criterionSchema`, which repair candidates, comparisons and the counterfactual all share. Instead the
experiment criterion became a **backward-compatible union**: either the existing single criterion, or
`{ kind: "all_of", criteria: [2-4] }`.

Three-way outcomes now follow the rule the codebase already used at `counterfactual.ts:43` — all
components met supports, some met weakens, none met rejects — so both falsification paths reach
`weakens` by the same logic rather than by a new invented threshold concept.

- `primitives.ts`: `compositeCriterionSchema`, `experimentCriterionSchema`
- `diagnostic-falsification.ts`: per-component evaluation; `measurement` became `measurements[]`
- `types.ts`, `investigator.ts`, `investigator-tools.ts`: union threaded through to the provider schema
- `final-diagnosis.ts`: replay covers the new outcomes; counterfactual still requires one criterion
- 8 new tests, including replay rejection of a tampered `weakens` and of restated evidence

Existing single-criterion records parse unchanged; all 343 original tests passed without edits.

### B2 — Batched diagnostic calls — DONE

`investigator.ts` accepts up to three `function_call` items per turn when all are allowlisted
diagnostics. Control operations still arrive alone.

**Scope correction:** the deterministic engines are synchronous, so this removes provider
round-trips, not CPU time. It is documented as such and is *not* presented as concurrent execution.

One existing test (`multiple calls fail closed`) encoded the old single-call rule and was rewritten
to assert the new boundary: two control ops, a mixed batch, and an over-limit batch all still fail
closed. Added tests prove three diagnostics cost one provider turn, that declaration order drives the
recorded sequence across repeated runs, and that the tool budget can stop a run mid-batch.

### B4 — Executable operational remedies — DONE

`deriveCiPolicy(investigation)` generates a `ciPolicySchema` document from measured **passing**
comparisons that round-trips through `evaluateCiPolicy` unedited. Thresholds are the measured values;
no tolerance is invented. Without a passing comparison the policy is `null`.
`incidentIssueMarkdown(report)` renders a GitHub-issue body. Both rebuild derived fields from the
canonical record, so edited report fields cannot steer the output. 5 new tests.

### B3 — Repair tools in the Astra loop — NOT IMPLEMENTED (blocked on a safety boundary)

This was attempted and deliberately stopped. The blocker is not effort.

1. **The loop forbids cost policies by design.** `tool-registry.ts:30` rejects a non-null `costs`, and
   `investigator-tools.ts:18` declares `costs: {type:"null"}`. Costs are a user assumption that must
   carry explicit assumption evidence.
2. **The repair engines require exactly that.** `repair-candidates.ts:48` fails with "cost selection
   requires the sweep cost policy and its explicit user-assumption evidence".

So an autonomous `generate_repair_candidate` would need the model to invent false-negative and
false-positive costs — contradicting this project's own boundary and strategy §14, which requires
domain costs to come from the user and simulated impact to be labeled.

Two further obstacles, both real but secondary: the repair engines need a validated `Investigation`,
which does not exist mid-run (`final-diagnosis.ts:92` hardcodes `repairs: []`), so the change needs a
mid-run materialization step in the most security-sensitive path.

**This is not a gap in the product.** Checklist G is already satisfied by the connected Repair Lab,
where the user supplies costs and explicitly applies the candidate. Moving it inside the loop is a
design change about *who declares costs*, and it belongs after launch with proper soak time.

### Remaining

B5 (provider file input) stays blocked behind A1. Track A is unchanged and still the critical path.

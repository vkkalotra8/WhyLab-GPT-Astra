# WhyLab Engineering Progress & Audit Log

Branch: `feature/claude-extension`  
Last Updated: 2026-09-17  
Target: GPT-6 Astra Challenge (Product Hunt)

---

## Codebase Architecture & System Exploration

### 1. Page & Component Structure
- **App Shell & Root Layout** (`app/layout.tsx`, `app/page.tsx`):
  - Next.js App Router with metadata configuration, custom system fonts, and design tokens in `app/globals.css`.
  - Root page wraps the application in `CaseManager` (handling local browser storage, saved cases, and JSON export/import) and mounts `InvestigationLab`.
- **Workbench Container** (`app/components/investigation-lab.tsx`):
  - Contains top sticky navigation, hero section, 4-step workflow overview (`Observe → Investigate → Test → Repair`), and workspace tabs for custom evaluation datasets/training logs.
  - Mounts specialized investigation components:
    1. `FlagshipMelanoma` (`app/components/flagship-melanoma.tsx`): 1-click deterministic medical classifier case demonstrating the accuracy paradox.
    2. `CaseStudies` (`app/components/case-studies.tsx`): Calibration drift and multi-site shift scenarios.
    3. `AstraInvestigation` (`app/components/astra-investigation.tsx`): Autonomous AI-driven diagnostics powered by GPT-6 Astra.
    4. `RepairLab` (`app/components/repair-lab.tsx`): Decision threshold optimization and cost-sensitive re-testing workbench.

### 2. "Investigate with Astra" & "Repair Lab" Wiring
- **Astra Investigator Flow**:
  - Client component polls `/api/investigate` on mount to detect server capability (`available: boolean`).
  - When initiated, client streams NDJSON events (`progress`, `tool_call`, `result`) from `/api/investigate`.
  - The server investigator (`app/lib/investigation/investigator.ts`) executes an autonomous multi-turn tool loop using registered diagnostics (`compute_classification_metrics`, `test_hypothesis`, `inspect_slices`, etc.) against bounded evidence summaries.
  - Result synthesis yields structured hypotheses, verified claims, and bounds, which bind into the linked `RepairLab`.
- **Repair Lab Flow**:
  - Operates either standalone (loading arbitrary CSV) or linked directly from an active investigation.
  - Executes local threshold sweeps (`app/lib/investigation/repair-lab.ts`) across 101 candidate operating points without mutating original data.
  - When AI is engaged, queries `/api/repair` for policy proposal translation and trade-off commentary.

### 3. Client-Side vs. Server-Side Demarcation
- **Client-Side (Deterministic & Local)**:
  - All dataset parsing, metric calculations, confusion matrices, slice metrics, threshold sweeps, and graph visualizations run 100% in-browser on the client.
  - Works offline or without API keys / tokens.
- **Server-Side (Astra AI Integration)**:
  - Next.js Route Handlers (`/api/investigate`, `/api/repair`) manage OpenAI API interactions, streaming responses, and quota enforcement.
  - Strictly bound to sanitised summaries; raw evaluation rows are not transmitted.

---

## Phase 1: Fix What's Broken (Completed)

### Changes Made:
1. **Dynamic OpenGraph & Twitter Metadata (`app/layout.tsx`)**:
   - Replaced broken `http://localhost:3000/launch/whylab-thumbnail.svg` reference.
   - Configured dynamic `metadataBase` resolving from `process.env.NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `https://why-lab-gpt-astra.vercel.app`.
   - Pointed social image tags to `/launch/whylab-thumbnail.png` (high-res 1270×760 raster PNG, 352,034 bytes).
   - Updated `scripts/validate-launch-assets.mjs` and `.env.example`.
2. **Robust Connection Health Probe (`app/components/astra-investigation.tsx`)**:
   - Added a 6,000ms timeout with explicit abort handling to the `/api/investigate` probe.
   - Guaranteed that if server probe fails, errors out, or times out, the UI transitions immediately to `CONFIGURATION REQUIRED` or `STATUS UNAVAILABLE` with clear remediation guidance, rather than hanging indefinitely in `CHECKING CONNECTION`.

### Browser Verifications:
- Verified rendered `<head>` in live Chrome: `og:image` and `twitter:image` resolve to `https://why-lab-gpt-astra.vercel.app/launch/whylab-thumbnail.png`.
- Verified `/launch/whylab-thumbnail.png` serves HTTP 200 with `image/png` content-type.
- Verified live Astra connection status in Chrome CDP: successfully resolves to `AI CONFIGURED` with active credentials or clean status messaging if unconfigured.
- All 360 unit tests and 31 automated browser tests pass cleanly.

### Judgments / Trade-offs:
- Used PNG raster instead of SVG for `og:image` as major social preview parsers (LinkedIn, Slack, Discord, Twitter/X) do not render SVG preview cards.

---

## Phase 2: Build the Signature Differentiator (Investigation Report - Completed)

### Changes Made:
1. **Built Shareable Investigation Report Modal (`app/components/investigation-report-modal.tsx`)**:
   - Designed a standalone, screenshot-friendly, and printable report artifact card (`#printable-investigation-report`).
   - Surfaces:
     - **Observed Symptoms**: High-contrast cards for overall accuracy, minority recall, and balanced accuracy.
     - **Tested Hypotheses**: Categorized cleanly as `SUPPORTED`, `FALSIFIED`, or `INCONCLUSIVE` with direct citations of deciding empirical evidence.
     - **Applied Policy Repair & Measured Re-Test**: Operating threshold delta (e.g., `0.50 → 0.20`), before/after comparison table with measured impacts (e.g. `False negatives: 8 → 0 (-100%)`, `Malignant Recall: 20.0% → 100.0% (+80.0 pp)`, `Total Cost: 80 → 4 units (-95.0%)`), and explicit criterion verification status.
     - **Honest Provenance & Disclosures**: Detailed dataset row counts, execution mode (Deterministic Local Solver vs Astra Autonomous AI), generation timestamp, and clear statement that this is empirical analysis, not a certification or regulatory clearance.
   - Built-in Actions:
     - **1-Click Copy Summary**: Formats an executive Markdown summary and copies to clipboard with visual status confirmation.
     - **Print / Save as PDF**: `@media print` CSS isolating the report card into a clean, margin-perfect executive PDF without screen chrome or backgrounds.
     - **Keyboard accessibility**: Closes on Escape key or backdrop click.
2. **Wired "Generate Investigation Report" Across Key Workflows**:
   - **Flagship Melanoma Case (`app/components/flagship-melanoma.tsx`)**: Available immediately on diagnosis completion and inside the repair drawer.
   - **Astra Autonomous Investigator (`app/components/astra-investigation.tsx`)**: Available in the synthesis header and footer for both live and recorded runs.
   - **Scenario Studies (`app/components/case-studies.tsx`)**: Available for calibration drift and site shift cases.
3. **Report & Print Styles in `app/globals.css`**:
   - Added complete modal, card, symptom grid, hypothesis status badges, repair table, and `@media print` rules.

### Browser Verifications:
- Verified end-to-end flow with automated CDP browser runner (`verify_investigation_report.mjs`):
  - Ran flagship case in 1 click.
  - Inspected measured repair.
  - Clicked `Generate Investigation Report` button (`.btn-generate-report`).
  - Confirmed `#printable-investigation-report` rendered with exact numbers: Validation Accuracy 92.0%, Malignant Recall 20.0%, Balanced Accuracy 60.0%, 3 hypotheses, -100% missed cancers impact, -95% cost impact, and honest disclosure.
  - Confirmed `Copy summary` action and Escape key modal dismiss.
  - Captured full high-resolution visual screenshot (`investigation_report_artifact.png`).
- Confirmed zero regressions across all 360 unit tests and all 31 browser checks.

### Judgments / Trade-offs:
- Used native `@media print` with browser print-to-PDF rather than heavy, fragile canvas-based snapshot libraries (e.g., html2canvas), ensuring razor-sharp vector text, zero added bundle dependencies, and perfect fidelity.

---

## Phase 3: Reduce Friction (Completed)

### Changes Made:
1. **Pre-computed Recorded Astra Investigation (`public/fixtures/recorded-astra-investigation.json`, `app/components/astra-investigation.tsx`)**:
   - Built a high-fidelity pre-computed Astra investigation fixture grounded on the real `melanoma-synthetic.csv` 100-row evaluation dataset.
   - Added an "Instant Demo · No Token Required" callout above the Astra input form with 1-click "View recorded investigation" and dataset preset chips.
   - Designed a prominent amber `RECORDED INVESTIGATION` badge box clearly stating: *"Example output: Pre-computed, verified investigation result generated by Astra on the melanoma dataset. Fully interactive linked repair available below — no API token or OpenAI key required."*
   - Ensured zero confusion between live OpenAI streaming runs and recorded demo output.
   - Linked seamlessly to the interactive Repair Lab with pre-populated demo policy proposals (`Missing a malignant case weighted 50× more heavily than false positive`).
2. **Hero Section Local vs. Astra Distinction Banner (`app/components/investigation-lab.tsx`)**:
   - Added an explicit, elegant distinction banner directly below the hero badge row:
     - **Local deterministic analysis**: *Free, instant, runs completely in your browser without API keys.*
     - **Astra-powered investigation**: *Autonomous AI diagnostics requiring your own API/deployment token.*
   - Immediately informs first-time visitors and contest judges what is free/local versus what needs an OpenAI token.
3. **Demo Fallback in Repair Lab (`app/components/repair-lab.tsx`)**:
   - Allows users without an OpenAI API token to test the AI policy proposal and candidate measurement workflows via verified recorded proposals, eliminating dead-ends.

### Browser Verifications:
- Ran automated Chrome CDP test script (`verify_phase3.mjs`):
  - Confirmed Hero distinction banner is rendered with exact wording for local vs. Astra token requirements.
  - Clicked "View recorded investigation" (`.btn-recorded-example`) without entering any API key.
  - Confirmed recorded run banner displays with `RECORDED INVESTIGATION` badge, pre-computed verified measurements (92.0% accuracy, 20.0% minority recall), tested hypotheses, and linked repair drawer.
  - Confirmed "Generate Investigation Report" works directly on recorded investigation runs.
- Ran full test suites:
  - 360 unit tests pass (0 failures).
  - 31 browser checks pass (0 failures).

### Judgments / Trade-offs:
- Stored the pre-computed run as a static JSON fixture under `/public/fixtures/recorded-astra-investigation.json` so it loads instantaneously (<20ms) without consuming serverless function execution limits or triggering cold starts.

---

## Phase 4: Polish & Final Verifications (Completed)

### Changes Made:
1. **Real Operating-Point Trade-off Chart (`app/components/flagship-chart.tsx`, `app/components/flagship-melanoma.tsx`)**:
   - Built a custom, zero-dependency SVG visualization rendering the precision-recall and cost curves derived directly from the 101-threshold sweep of `melanoma-synthetic.csv` (100 rows, 10 malignant, 90 benign).
   - Features glowing cyan Malignant Recall curve and coral dashed Total Error Cost curve with shaded area.
   - Interactive threshold markers at key operating points (Baseline T=0.50 with Cost=80, Repaired T=0.20 with Cost=4).
   - Dynamic comparison panel on the right updating live on hover or touch tap.
   - Explicit "Honest Data Guarantee" banner grounding all data in real dataset measurements.
2. **Comprehensive Polish & Zero-Warning Auditing**:
   - Cleaned all TypeScript explicit `any` casts in `investigation-report-modal.tsx`, `flagship-melanoma.tsx`, `astra-investigation.tsx`, and `case-studies.tsx`.
   - Elevated button styling for `.btn-generate-report` with high specificity, gradient treatment, and crisp SVG icon.
   - Verified that ESLint (`npm run lint`), TypeScript (`npm run typecheck`), and the full unit suite (`npm test`, 360 tests) pass with 0 errors and 0 warnings.
3. **Comprehensive End-to-End Browser Pass**:
   - Executed full headless Chrome browser verification (`verify_phase4_comprehensive.mjs`) navigating fresh from hero to Flagship, Astra recorded demo, and Repair Lab.
   - Confirmed 0 console errors during the full run.

---

## Frontend Quality Pass

### Baseline Viewport Audits (375px, 768px, 1440px):
- Captured initial baseline screenshots:
  - Mobile: `baseline_mobile_375.png` (375×812)
  - Tablet: `baseline_tablet_768.png` (768×1024)
  - Desktop: `baseline_desktop_1440.png` (1440×1000)

### Item 1: Section Numbering (Completed)
- **Problem**: Section numbers were previously mapped to a theoretical 8-stage pipeline (`06` for CaseManager library, `01` for workspace, `02` for dataset, `07` for extended import, `03` for diagnosis, `04` for lesson, `05` for experiment). In the actual DOM and visual layout, this caused jarring out-of-order numbers: a visitor saw `06 / Investigation library` at the very top of the page before `01`, and `07 / Extended evidence import` directly below `01 / Investigation workspace`.
- **Changes Made**:
  - Renumbered all 8 numbered sections to match their exact visual, logical, and DOM reading order from top to bottom:
    1. `01 / Investigation library` (`app/components/case-manager.tsx`)
    2. `02 / Investigation workspace` (`app/components/investigation-lab.tsx`)
    3. `03 / Dataset investigation` (`app/components/dataset-lab.tsx`)
    4. `04 / Extended evidence import` (`app/components/evidence-import.tsx`)
    5. `05 / Combined diagnosis` (`app/components/diagnosis-panel.tsx`)
    6. `06 / Learn why: {lesson.title}` (`app/components/interactive-lesson.tsx`)
    7. `07 / Verify this hypothesis` (`app/components/experiment-workflow.tsx`)
    8. `08 / Evidence-grounded explanation` (`app/components/explanation-assistant.tsx`)
- **Browser Verifications**:
  - Verified in browser across DOM tree that section numbers now proceed strictly sequentially from `01` to `08`.
  - Confirmed all 360 unit tests and 31 automated browser checks pass without regression.


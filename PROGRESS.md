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

## Phase 3: Reduce Friction (In Progress)



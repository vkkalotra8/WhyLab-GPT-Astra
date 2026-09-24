# MISSION BRIEF: Enterprise Frontend Redesign for WhyLab (ML Incident Investigator)

You are a Principal Product Designer, Design Systems Architect, and Senior Next.js/TypeScript Engineer.
You are tasked with redesigning the frontend of **WhyLab** to transform it from a prototype/hackathon layout into a state-of-the-art, enterprise-grade ML reliability platform ready for real-world deployment.

---

## 1. ABSOLUTE NON-NEGOTIABLE CORE CONSTRAINTS

1. **ZERO FUNCTIONAL REGRESSION:**
   - DO NOT alter, break, or remove any existing logic, backend routes (`/api/*`), Web Worker parsers, state managers (`CaseManager`, `useCaseState`), statistical calculations, threshold sweeps, or Astra tool-calling schemas.
   - All existing buttons, dropdowns, forms, file-pickers, sliders, and export utilities MUST retain their exact current event handlers, props, and functionality.

2. **PRESERVE THE CORE PRODUCT COPY & IDENTITY:**
   - DO NOT modify the core narrative anchors, including:
     - *"Every failed model is trying to tell you something."*
     - *"Sentry for software · Datadog for infra · WhyLab for machine learning"*
     - The Tension Card: *"YOUR MODEL SAYS: 94.2% ACCURACY"* vs. *"WHYLAB SAYS: HIGH-RISK FAILURE DETECTED (Malignant recall: 22.4%)"*
     - The 4-step workflow: *01 Observe -> 02 Investigate -> 03 Test -> 04 Repair*

3. **TRANSITION FROM PROTOTYPE TO REAL-LIFE DEPLOYMENT:**
   - Replace hackathon-specific artifacts gracefully:
     - Replace `"BETA 0.1"` with a modern semantic release badge (e.g., `v1.0.0` with an active status beacon).
     - Replace `"LOCAL PROTOTYPE · IN-BROWSER EXECUTION"` with enterprise privacy badges: `CLIENT-SIDE EVALUATION · ZERO DATA RETENTION`.
     - Replace `"🏆 Submission Gate"` in the top navigation with an **"Enterprise Docs & Integrity Gate"** modal or popover that maintains the existing 11-point audit logic without sounding like a competition checklist.
     - Replace `"Frontend demo · Your evidence stays in your browser"` with clear data-sovereignty notes: `All evidence processed locally in browser memory · No external telemetry`.

---

## 2. DESIGN SYSTEM & VISUAL SPECIFICATION

Elevate the design to look like an elite developer-first observability platform (Linear, Vercel, Datadog, Sentry, or Stripe):

- **Color Palette & Theme:**
  - Background: Deep slate / obsidian dark mode (`#0B0F17` base, `#121824` card surfaces, `#1A2234` hover/elevated).
  - Primary Accents: Electric Cyan (`#00F2FE` / `#56DFCE` for healthy/verified states), Deep Teal (`#0D9488` for primary actions).
  - Risk & Tension Accents: Vivid Crimson/Rose (`#FF4B72` / `#EF4444` for failures, false negatives, and alerts), Amber (`#F59E0B` for warnings/drift).
  - Borders & Dividers: Subtle high-precision borders (`rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.12)`).
- **Typography:**
  - Modern sans-serif stack for UI (Inter, Geist, or Outfit).
  - High-precision tabular figures (`font-variant-numeric: tabular-nums`) and clean monospace (`JetBrains Mono`, `Fira Code`) for metrics, thresholds, matrix cells, and log excerpts.
- **Visual Polish & Micro-interactions:**
  - Subtle frosted glassmorphism (`backdrop-filter: blur(12px)`) for topbars, floating headers, and modals.
  - Crisp status indicators with soft ambient glows (not harsh neon).
  - Fluid CSS transitions on tabs, accordions, and threshold sliders.

---

## 3. BLOCK-BY-BLOCK LAYOUT & HIERARCHY

Refactor the layout so that each section flows seamlessly into the next:

### [Block 0] Enterprise Top Navigation
- Brand wordmark: **WhyLab** with an animated status beacon (`SYSTEM OPERATIONAL`).
- Anchor Navigation: Smooth jump links to `#workspace`, `#flagship`, `#astra-lab`, `#repair-lab`, and `#vision-lab`.
- Quick Actions: `1-Click Flagship Demo`, `Integrity & Governance Gate`, and `+ New Investigation`.

### [Block 1] Hero & Tension Callout
- Retain the bold headline and positioning.
- Modernize the **Incident Tension Card**:
  - Two distinct cards separated by a sleek animated `VS` pill:
    - Left Card (Neutral/Cyan): Green glow, displaying the model's misleading 94.2% accuracy.
    - Right Card (Warning/Danger): Crimson glow, displaying the 22.4% malignant recall reality check.
- Action Buttons: High-contrast primary CTA (`Start Live Investigation →`) and secondary CTAs (`Flagship Melanoma Walkthrough`, `Bring Your Own Model`).

### [Block 2] Unified Evidence & Ingestion Hub
- Keep the 3-tab pattern (`Upload`, `Paste logs`, `Try an example`) but convert it to a modern segmented control with clear glyphs.
- Modernize the file dropzone with drag-over state feedback, supported format chips (`.csv`, `.txt`, `.log`, `.json`), and size limit indicators.
- **Dataset Lab (3 Multi-Split Cards):**
  - Modernize Cards 01 (Training), 02 (Validation), and 03 (Production).
  - Display clear row/column counts, status pills (`Empty` vs. `✓ Analyzed`), and immediate access to the quick-preset bar (`Melanoma`, `Sepsis ICU`, `Credit Fraud`).
  - Column profiling table: Clean, scannable table with micro-distribution meters, numeric range chips, and distinct warning badges.

### [Block 3] Astra Autonomous Investigation Console
- Present Astra as an **active investigator running deterministic tools**, not a generic chatbot.
- Objective & steering prompt input: Sleek console input with presets (e.g., *"Optimize for patient safety; false negatives cost 50x more than false alarms"*).
- **Live Tool Execution Stream:** High-density, real-time audit list showing executed tool steps (`profile_dataset`, `compute_metrics`, `scan_leakage`, `threshold_sweep`) with status checkmarks and execution timestamps.

### [Block 4] The Signature Evidence Graph
- Interactive directed graph connecting: `Observations → Statistical Anomalies → Ranked Root-Cause Hypotheses → Targeted Interventions`.
- Each node must feature clean border styling, metric chips, and click-to-expand evidence provenance drawers.

### [Block 5] The Falsification Engine
- Render hypothesis cards with clear evidence strength badges (`Observed`, `Supported`, `Suggested`).
- Structure each card into two distinct sub-panels:
  - **Evidence Excerpt:** Monospace snippet of the exact log or dataset row that triggered the signal.
  - **Verification Experiment:** Stated prediction and counterfactual test protocol.
- **Adversarial Review ("Challenge WhyLab"):** Present the second-pass review as a rigorous audit checking competing explanations (e.g., *Is it covariate shift or label leakage?*).

### [Block 6] The Repair Workbench (Demo Climax)
- Two-column interactive split:
  - **Left (Cost Model & Threshold Sweep):** Elegant numeric cost-ratio inputs (FN vs. FP), interactive threshold slider, and an Astra recommendation banner explaining the trade-off.
  - **Right (Morphing Confusion Matrix):** Side-by-side or before/after toggle comparing the baseline (0.50 threshold) against the optimized policy (e.g., 0.19 threshold), with immediate visual feedback on recovered cases.
  - Ensure all cost savings and clinical numbers remain labelled with: *"Simulated impact under user-defined cost model."*

### [Block 7] Multi-Dimensional Reliability Scorecard
- Large composite score display (`38 / 100 HIGH RISK` $\rightarrow$ `81 / 100 REPAIRED`).
- 6-dimension breakdown bars (Performance, Minority Safety, Calibration, Drift, Leakage, Cost Alignment) with direct links to supporting evidence.

### [Block 8] Incident Report & Governance Export
- Professional export panel offering:
  - `Download ML Incident Report (Markdown)`
  - `Download Tamper-Proof Audit Trail (JSON)`
  - `Copy CI/CD Gate Snippet (GitHub Actions YAML)`

---

## 4. EXECUTION WORKFLOW & VERIFICATION RULES

1. **Inspect Before Editing:**
   - Scan `app/components/investigation-lab.tsx`, `dataset-lab.tsx`, `astra-investigation.tsx`, `repair-lab.tsx`, and `app/globals.css`.
   - Preserve all data keys and handlers.

2. **Step-by-Step Implementation:**
   - **Step 1:** Enhance the CSS design tokens, typography, and card classes in `app/globals.css` or Tailwind config.
   - **Step 2:** Refactor the layout components progressively without modifying backend contracts or event handlers.
   - **Step 3:** Polish interactive states (focus rings, keyboard accessibility, loading spinners, empty states).

3. **Mandatory Verification Protocol:**
   - Run `npm run check` (TypeScript + Lint + Tests) to confirm zero build or type errors.
   - Run `node --test tests/*.test.mjs` to ensure 100% test suite pass rate.
   - Verify in the browser that:
     - 1-click sample diagnosis runs and displays curves.
     - Dataset CSV upload, profiling, and comparisons render properly.
     - Astra investigation stream and Repair Lab threshold sweeps operate smoothly.
     - Report downloads and JSON exports remain valid.

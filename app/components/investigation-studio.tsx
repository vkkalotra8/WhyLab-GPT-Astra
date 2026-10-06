"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, FileText, Sparkles, ArrowRight, ExternalLink } from "lucide-react";
import StudioHeader from "./studio-header";
import StageStepper from "./stage-stepper";
import DatasetLab from "./dataset-lab";
import AstraInvestigation from "./astra-investigation";
import RepairLab from "./repair-lab";
import EvidenceGraph from "./evidence-graph";
import ReliabilityProfile from "./reliability-profile";
import ChallengeReview from "./challenge-review";
import ClassroomLesson from "./classroom-lesson";
import IncidentReportExport from "./incident-report-export";
import EvidenceImport from "./evidence-import";
import EvidenceSummary from "./evidence-summary";
import SubmissionReadinessModal from "./submission-readiness-modal";
import { useInvestigation } from "./investigation-context";
import { useCaseState } from "./case-manager";
import { runIngestion } from "../lib/ingestion-client";
import { filterFindings } from "../lib/evidence";

const sample = `[experiment] image_classifier_v3 / ResNet-18
[epoch 26/30] train_loss=0.14 val_loss=0.15 train_accuracy=0.95 val_accuracy=0.948
[epoch 27/30] train_loss=0.12 val_loss=0.16 train_accuracy=0.96 val_accuracy=0.946
[epoch 28/30] train_loss=0.10 val_loss=0.17 train_accuracy=0.97 val_accuracy=0.945
[epoch 29/30] train_loss=0.09 val_loss=0.18 train_accuracy=0.98 val_accuracy=0.943
[epoch 30/30] train_loss=0.084 val_loss=0.192 train_accuracy=0.985 val_accuracy=0.942
[validation] accuracy=0.942 samples=2400
[production] accuracy=0.618 samples=1800
[data] train=studio_images production=mobile_photos
[classes] majority=72% minority_recall=0.38
[audit] duplicate_check=pending`;

const tabs = ["Upload", "Paste logs", "Try an example"];
const stages = ["Inspecting evidence", "Testing hypotheses", "Building lesson"];

function Chart() {
  return (
    <div className="chart">
      <div className="chart-heading">
        <span>ACCURACY ACROSS ENVIRONMENTS</span>
        <span>30 epochs</span>
      </div>
      <svg
        viewBox="0 0 440 125"
        role="img"
        aria-label="Illustrative accuracy curves: validation reaches 94.2 percent and production reaches 61.8 percent."
      >
        <g stroke="#283443" strokeDasharray="3 5">
          <path d="M34 20H425M34 60H425M34 100H425" />
        </g>
        <g fill="#94a1b4" fontSize="10" fontFamily="monospace">
          <text x="0" y="24">100</text>
          <text x="7" y="64">70</text>
          <text x="7" y="104">40</text>
        </g>
        <path
          d="M35 101 65 84 95 67 125 57 155 42 185 35 215 30 245 27 275 25 305 23 335 23 365 22 423 22"
          fill="none"
          stroke="#56dfce"
          strokeWidth="2.5"
        />
        <path
          d="M35 106 65 92 95 84 125 77 155 70 185 72 215 68 245 71 275 69 305 73 335 71 365 74 423 73"
          fill="none"
          stroke="#c1a2ff"
          strokeWidth="2.5"
          strokeDasharray="5 4"
        />
        <circle cx="423" cy="22" r="4" fill="#56dfce" />
        <circle cx="423" cy="73" r="4" fill="#c1a2ff" />
      </svg>
      <div className="legend">
        <span className="cyan">● Validation</span>
        <span className="violet">● Production</span>
        <span>Illustrative data</span>
      </div>
    </div>
  );
}

export default function InvestigationStudio() {
  const {
    activeStage,
    handleStageSelect,
    stagesCompleted,
    stagesAvailable,
    isStale,
    setIsStale,
    astraKey,
    deploymentToken,
    setDeploymentToken,
    sharedEvaluationData,
    activeInvestigation,
    boundRepairDatasets,
    sessionId,
    showReadinessModal,
    setShowReadinessModal,
    handleTransferToAstra,
    handleInvestigationComplete,
  } = useInvestigation();

  // Legacy snapshot bindings for workspace and worker compatibility
  const [tab, setTab] = useCaseState("tab");
  const [logs, setLogs] = useCaseState("logs");
  const [analysis, setAnalysis] = useCaseState("analysis");
  const [complete, setComplete] = useCaseState("complete");
  const [evidence, setEvidence] = useCaseState("evidence");

  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(-1);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [reading, setReading] = useState(false);
  const [extendedBusy, setExtendedBusy] = useState(false);

  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLElement>(null);
  const request = useRef(0);
  const parserController = useRef<AbortController | null>(null);

  const busy = stage >= 0 || reading || extendedBusy;
  const hypotheses = evidence ? filterFindings(evidence, analysis) : [];

  function invalidate() {
    parserController.current?.abort();
    request.current++;
    setEvidence(null);
    setComplete(false);
    setError("");
    setExpanded(0);
    if (activeInvestigation) setIsStale(true);
  }

  useEffect(() => () => {
    parserController.current?.abort();
    request.current++;
  }, []);

  useEffect(() => {
    if (stage < 0) return;
    const timer = window.setTimeout(
      () => {
        if (stage < 2) setStage(stage + 1);
        else {
          setStage(-1);
          setComplete(true);
        }
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 850
    );
    return () => window.clearTimeout(timer);
  }, [stage, setComplete]);

  useEffect(() => {
    if (complete) result.current?.focus();
  }, [complete]);

  function choose(next: number) {
    invalidate();
    setTab(next);
    setError("");
    if (next === 2) {
      setLogs(sample);
      setAnalysis("General diagnosis");
    }
  }

  function accept(next?: File) {
    invalidate();
    setFile(null);
    setDrag(false);
    if (!next) return;
    if (!/\.(csv|txt|log|json)$/i.test(next.name)) {
      setError("Choose a CSV, TXT, LOG, or JSON file.");
      return;
    }
    if (next.size > 50 * 1024 * 1024) {
      setError("Please choose a file smaller than 50 MB.");
      return;
    }
    setFile(next);
    setError("");
  }

  async function investigate() {
    if (tab === 0 ? !file : !logs.trim()) {
      setError(
        tab === 0
          ? "Add an evidence file or try the example to begin."
          : "Paste your training logs to begin."
      );
      return;
    }
    invalidate();
    const current = request.current;
    setReading(true);
    const controller = new AbortController();
    parserController.current = controller;
    try {
      const text = tab === 0 ? await file!.text() : logs;
      if (current !== request.current) return;
      const parsed = await runIngestion<import("../lib/evidence").Evidence>(
        "analyze",
        [
          {
            text,
            name:
              tab === 0
                ? file!.name
                : tab === 2
                ? "Example logs"
                : "Pasted logs",
          },
        ],
        controller.signal
      );
      if (current !== request.current) return;
      setEvidence(parsed);
      setStage(0);
    } catch (cause) {
      if (current === request.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to read this file. Try exporting it as UTF-8 text."
        );
    } finally {
      if (current === request.current) setReading(false);
    }
  }

  async function example(autoRun: boolean = true) {
    choose(2);
    if (autoRun) {
      invalidate();
      const current = request.current;
      setReading(true);
      const controller = new AbortController();
      parserController.current = controller;
      try {
        const parsed = await runIngestion<import("../lib/evidence").Evidence>(
          "analyze",
          [{ text: sample, name: "Example logs" }],
          controller.signal
        );
        if (current !== request.current) return;
        setEvidence(parsed);
        setStage(0);
      } catch (cause) {
        if (current === request.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to read this file. Try exporting it as UTF-8 text."
          );
      } finally {
        if (current === request.current) setReading(false);
      }
    }
  }

  // Ensure page scrolls cleanly to top whenever active stage changes (next, prev, stepper)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [activeStage]);

  const toggleCaseManager = () => {
    const details = document.querySelector(".case-manager details") as HTMLDetailsElement | null;
    if (details) details.open = !details.open;
  };

  return (
    <div className="studio-workbench-shell">
      <StudioHeader onToggleCaseManager={toggleCaseManager} />

      <main className="studio-main-content">
        <StageStepper
          activeStage={activeStage}
          onSelectStage={handleStageSelect}
          stagesCompleted={stagesCompleted}
          stagesAvailable={stagesAvailable}
          isStale={isStale}
        />

        {/* =========================================================================
            STAGE 01: INGEST
            ========================================================================= */}
        <div
          id="stage-ingest"
          className="studio-stage-section"
          style={{ display: activeStage === 1 ? "block" : "none" }}
          aria-labelledby="stage-01-title"
        >
          <div className="stage-banner-header">
            <div className="stage-banner-left">
              <span className="stage-banner-num">STAGE 01</span>
              <span className="stage-banner-sep">/</span>
              <span className="stage-banner-title" id="stage-01-title">
                INGEST — Evidence &amp; Log Acquisition
              </span>
            </div>
            <span className="stage-banner-tag">EVALUATION CSV · LOGS · PRESETS</span>
          </div>

          <section id="workspace">
            <div className="section-heading">
              <h2>
                <span className="section-number">01 /</span> Investigation workspace
              </h2>
              <span className="local-note">
                <span className="status-dot" /> CLIENT-SIDE EVALUATION · ZERO DATA RETENTION
              </span>
            </div>
            <div className="workspace-grid">
              <section className="panel input-panel" aria-labelledby="evidence-heading">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">START WITH THE EVIDENCE</span>
                    <h3 id="evidence-heading">What went wrong?</h3>
                  </div>
                  <span className="step-number">01</span>
                </div>
                <p className="description">
                  Bring your logs, metrics, or dataset. Let’s connect the dots.
                </p>
                <div role="tablist" aria-label="Evidence source" className="tabs">
                  {tabs.map((item, i) => (
                    <button
                      key={item}
                      id={`tab-${i}`}
                      role="tab"
                      aria-selected={tab === i}
                      aria-controls="evidence-panel"
                      tabIndex={tab === i ? 0 : -1}
                      disabled={busy}
                      onClick={() => choose(i)}
                      onKeyDown={(e) => {
                        if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
                          e.preventDefault();
                          const next =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                              ? 2
                              : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                          choose(next);
                          document.getElementById(`tab-${next}`)?.focus();
                        }
                      }}
                    >
                      <span aria-hidden="true" className="tab-glyph">
                        {i === 0 ? <Upload size={14} /> : i === 1 ? <FileText size={14} /> : <Sparkles size={14} />}
                      </span>
                      {item}
                    </button>
                  ))}
                </div>
                <div id="evidence-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
                  {tab === 0 ? (
                    <>
                      <input
                        ref={input}
                        className="sr-only"
                        type="file"
                        tabIndex={-1}
                        aria-label="Evidence file"
                        accept=".csv,.txt,.log,.json"
                        disabled={busy}
                        onChange={(e) => accept(e.target.files?.[0])}
                      />
                      <button
                        className={`dropzone ${drag ? "dragging" : ""}`}
                        disabled={busy}
                        onClick={() => input.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!busy) setDrag(true);
                        }}
                        onDragLeave={() => setDrag(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!busy) accept(e.dataTransfer.files[0]);
                        }}
                      >
                        <Upload size={24} />
                        <strong>{file ? file.name : "Drop your evidence here"}</strong>
                        <span>
                          {file ? (
                            `${(file.size / 1024).toFixed(1)} KB · Click to replace file`
                          ) : (
                            <>or <em>browse files</em> to get started</>
                          )}
                        </span>
                        <small>
                          CSV, TXT, LOG, JSON · Up to 50 MB (Kaggle &amp; enterprise datasets supported)
                        </small>
                      </button>
                    </>
                  ) : (
                    <div className="logs-wrap">
                      <div className="logs-label-row">
                        <label htmlFor="logs">
                          {tab === 2 ? "IMAGE CLASSIFIER · SAMPLE LOGS" : "TRAINING LOGS & METRICS"}
                        </label>
                        {tab === 2 && (
                          <button
                            type="button"
                            className="btn-text-run"
                            disabled={busy}
                            onClick={() => void example(true)}
                          >
                            ⚡ Run sample diagnosis (1-click)
                          </button>
                        )}
                      </div>
                      <textarea
                        id="logs"
                        value={logs}
                        disabled={busy}
                        onChange={(e) => {
                          invalidate();
                          setLogs(e.target.value);
                        }}
                        placeholder="Paste epoch logs, metrics, or experiment notes..."
                        spellCheck={false}
                      />
                    </div>
                  )}
                </div>
                <label className="select-label" htmlFor="analysis">
                  Analysis type <span>Choose your investigation lens</span>
                </label>
                <select
                  id="analysis"
                  value={analysis}
                  disabled={busy}
                  onChange={(e) => {
                    invalidate();
                    setAnalysis(e.target.value);
                  }}
                >
                  <option>General diagnosis</option>
                  <option>Data quality & distribution</option>
                  <option>Training & optimization</option>
                  <option>Evaluation & leakage</option>
                </select>
                <p className="error" role="alert">{error}</p>
                <button className="investigate-button" disabled={busy} onClick={investigate}>
                  <Sparkles size={16} />
                  <span>
                    {reading
                      ? "Reading evidence…"
                      : stage >= 0
                      ? stages[stage]
                      : "Investigate failure"}
                  </span>
                  <ArrowRight size={16} />
                </button>
                <div className="input-footnote" role="status">
                  {busy ? (
                    <span className="stages">
                      {stages.map((label, i) => (
                        <span key={label} className={i <= stage ? "cyan" : ""}>
                          {i < stage ? "✓" : `0${i + 1}`} {label}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "Client-side processing · Your evidence never leaves your browser"
                  )}
                </div>
              </section>

              <section className="panel preview-panel" aria-labelledby="case-heading">
                <div className="case-top">
                  <span className="eyebrow">· CASE FILE / 001</span>
                  <span className="badge">SAMPLE INVESTIGATION</span>
                </div>
                <h3 id="case-heading">
                  Great in validation.<br />Lost in production.
                </h3>
                <p className="description">
                  An image classifier with a real-world reality check.
                </p>
                <div className="model-tags">
                  <span>Computer vision</span>
                  <span>ResNet-18</span>
                  <span>30 epochs</span>
                </div>
                <div className="metrics">
                  <div>
                    <span>Validation accuracy</span>
                    <strong className="cyan">94.2<small>%</small></strong>
                    <span>Looking good in the lab</span>
                  </div>
                  <div>
                    <span>Production accuracy</span>
                    <strong className="violet">61.8<small>%</small></strong>
                    <span>A different story outside</span>
                  </div>
                </div>
                <Chart />
                <div className="gap-note">
                  <span>↘</span>
                  <p>
                    <strong>32.4 percentage points. One important question.</strong><br />
                    What changed between validation and the real world?
                  </p>
                </div>
                <div className="case-bottom">
                  <span>3 hypotheses. A path to understanding.</span>
                  <div className="case-bottom-actions">
                    <button disabled={busy} onClick={() => void example(true)}>
                      Run sample diagnosis (1-click) <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </section>

          <EvidenceImport
            disabled={stage >= 0 || reading}
            onBusyChange={setExtendedBusy}
          />

          {complete && evidence && (
            <section className="results panel" ref={result} tabIndex={-1} aria-labelledby="stage-01-results-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow cyan">INVESTIGATION COMPLETE / LOCAL EVIDENCE</span>
                  <h2 id="stage-01-results-heading">Follow the evidence.</h2>
                </div>
                <span className="badge">{analysis}</span>
              </div>
              <p className="description">
                Rule-based suggestions from your evidence, not confirmed causes.
              </p>
              <EvidenceSummary evidence={evidence} />
            </section>
          )}

          <div className="stage-nav-footer">
            <div />
            <button
              type="button"
              className="btn-stage-nav btn-stage-next"
              onClick={() => handleStageSelect(2)}
            >
              Next: Stage 02 Profile →
            </button>
          </div>
        </div>

        {/* =========================================================================
            STAGE 02: PROFILE
            ========================================================================= */}
        <div
          id="stage-profile"
          className="studio-stage-section"
          style={{ display: activeStage === 2 ? "block" : "none" }}
          aria-labelledby="stage-02-title"
        >
          <div className="stage-banner-header">
            <div className="stage-banner-left">
              <span className="stage-banner-num">STAGE 02</span>
              <span className="stage-banner-sep">/</span>
              <span className="stage-banner-title" id="stage-02-title">
                PROFILE — Data Ingestion &amp; Drift Check
              </span>
            </div>
            <span className="stage-banner-tag">
              COLUMN TYPES · DISTRIBUTIONS · CLASS FREQUENCY
            </span>
          </div>

          <DatasetLab
            evidence={complete ? evidence : null}
            sharedToken={deploymentToken}
            onSharedTokenChange={setDeploymentToken}
            onTransferToAstra={handleTransferToAstra}
            onNavigateToStage={(stageName) => {
              const map: Record<string, number> = {
                ingest: 1,
                profile: 2,
                investigate: 3,
                verify: 4,
                repair: 5,
                report: 6,
              };
              handleStageSelect(map[stageName] || 3);
            }}
          />

          <div className="stage-nav-footer">
            <button
              type="button"
              className="btn-stage-nav btn-stage-prev"
              onClick={() => handleStageSelect(1)}
            >
              ← Previous: Stage 01 Ingest
            </button>
            <button
              type="button"
              className="btn-stage-nav btn-stage-next"
              onClick={() => handleStageSelect(3)}
            >
              Next: Stage 03 Investigate →
            </button>
          </div>
        </div>

        {/* =========================================================================
            STAGE 03: INVESTIGATE
            ========================================================================= */}
        <div
          id="stage-investigate"
          className="studio-stage-section"
          style={{ display: activeStage === 3 ? "block" : "none" }}
          aria-labelledby="stage-03-title"
        >
          <div className="stage-banner-header">
            <div className="stage-banner-left">
              <span className="stage-banner-num">STAGE 03</span>
              <span className="stage-banner-sep">/</span>
              <span className="stage-banner-title" id="stage-03-title">
                INVESTIGATE — Autonomous AI &amp; Case Diagnostics
              </span>
            </div>
            <span className="stage-banner-tag">
              ASTRA AGENT · DETERMINISTIC LOCAL PROTOCOL
            </span>
          </div>

          <AstraInvestigation
            key={astraKey}
            sharedToken={deploymentToken}
            onSharedTokenChange={setDeploymentToken}
            incomingEvaluationData={sharedEvaluationData}
            onInvestigationComplete={handleInvestigationComplete}
          />

          <div className="stage-nav-footer">
            <button
              type="button"
              className="btn-stage-nav btn-stage-prev"
              onClick={() => handleStageSelect(2)}
            >
              ← Previous: Stage 02 Profile
            </button>
            <button
              type="button"
              className="btn-stage-nav btn-stage-next"
              onClick={() => handleStageSelect(4)}
            >
              Next: Stage 04 Verify →
            </button>
          </div>
        </div>

        {/* =========================================================================
            STAGE 04: VERIFY
            ========================================================================= */}
        <div
          id="stage-verify"
          className="studio-stage-section"
          style={{ display: activeStage === 4 ? "block" : "none" }}
          aria-labelledby="stage-04-title"
        >
          <div className="stage-banner-header">
            <div className="stage-banner-left">
              <span className="stage-banner-num">STAGE 04</span>
              <span className="stage-banner-sep">/</span>
              <span className="stage-banner-title" id="stage-04-title">
                VERIFY — Causal Evidence DAG &amp; Falsification Tests
              </span>
            </div>
            <span className="stage-banner-tag">
              EVIDENCE GRAPH · COUNTERFACTUAL TESTS · LESSONS
            </span>
          </div>

          {activeInvestigation ? (
            <div className="verify-active-container">
              <EvidenceGraph investigation={activeInvestigation} />
              <ReliabilityProfile investigation={activeInvestigation} />
              <ChallengeReview investigation={activeInvestigation} datasets={boundRepairDatasets} />
              <ClassroomLesson investigation={activeInvestigation} />
            </div>
          ) : complete && evidence ? (
            <section className="results panel" ref={result} tabIndex={-1} aria-labelledby="results-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow cyan">INVESTIGATION COMPLETE / LOCAL EVIDENCE</span>
                  <h2 id="results-heading">Follow the evidence.</h2>
                </div>
                <span className="badge">{analysis}</span>
              </div>
              <p className="description">
                Rule-based suggestions from your evidence, not confirmed causes.
              </p>
              <EvidenceSummary evidence={evidence} />
              {hypotheses.map((h, i) => (
                <article className={`hypothesis tone-${i}`} key={h.title}>
                  <button
                    className="hypothesis-toggle"
                    aria-expanded={expanded === i}
                    aria-controls={`hypothesis-${i}`}
                    onClick={() => setExpanded(expanded === i ? null : i)}
                  >
                    <span className="rank">0{i + 1}</span>
                    <span className="hypothesis-title">{h.title}</span>
                    <span className="confidence">
                      {h.strength}<small>evidence strength</small>
                    </span>
                    <span>{expanded === i ? "−" : "+"}</span>
                  </button>
                  {expanded === i && (
                    <div id={`hypothesis-${i}`} className="hypothesis-detail">
                      <div>
                        <span className="eyebrow">EVIDENCE EXCERPT</span>
                        <p>{h.evidence}</p>
                      </div>
                      <div>
                        <span className="eyebrow">VERIFICATION EXPERIMENT</span>
                        <p>{h.experiment}</p>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </section>
          ) : (
            <div className="stage-empty-guidance">
              <div className="empty-guidance-card">
                <h3>No active investigation findings to verify yet</h3>
                <p>
                  Run an autonomous Astra investigation in Stage 03, or load an evaluation dataset in Stage 01 to view the causal evidence graph, reliability profile, and counterfactual tests.
                </p>
                <div className="empty-guidance-actions">
                  <button
                    type="button"
                    className="btn-stage-nav btn-stage-next"
                    onClick={() => handleStageSelect(3)}
                  >
                    Go to Stage 03: Investigate →
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="stage-nav-footer">
            <button
              type="button"
              className="btn-stage-nav btn-stage-prev"
              onClick={() => handleStageSelect(3)}
            >
              ← Previous: Stage 03 Investigate
            </button>
            <button
              type="button"
              className="btn-stage-nav btn-stage-next"
              onClick={() => handleStageSelect(5)}
            >
              Next: Stage 05 Repair →
            </button>
          </div>
        </div>

        {/* =========================================================================
            STAGE 05: REPAIR
            ========================================================================= */}
        <div
          id="stage-repair"
          className="studio-stage-section"
          style={{ display: activeStage === 5 ? "block" : "none" }}
          aria-labelledby="stage-05-title"
        >
          <div className="stage-banner-header">
            <div className="stage-banner-left">
              <span className="stage-banner-num">STAGE 05</span>
              <span className="stage-banner-sep">/</span>
              <span className="stage-banner-title" id="stage-05-title">
                REPAIR — Decision Threshold Sweeps &amp; Policy Optimization
              </span>
            </div>
            <span className="stage-banner-tag">
              COST MODELS · CONFUSION MATRIX BEFORE/AFTER
            </span>
          </div>

          <RepairLab
            key={`repair-${astraKey}`}
            sharedToken={deploymentToken}
            onSharedTokenChange={setDeploymentToken}
          />

          <div className="stage-nav-footer">
            <button
              type="button"
              className="btn-stage-nav btn-stage-prev"
              onClick={() => handleStageSelect(4)}
            >
              ← Previous: Stage 04 Verify
            </button>
            <button
              type="button"
              className="btn-stage-nav btn-stage-next"
              onClick={() => handleStageSelect(6)}
            >
              Next: Stage 06 Report →
            </button>
          </div>
        </div>

        {/* =========================================================================
            STAGE 06: REPORT
            ========================================================================= */}
        <div
          id="stage-report"
          className="studio-stage-section"
          style={{ display: activeStage === 6 ? "block" : "none" }}
          aria-labelledby="stage-06-title"
        >
          <div className="stage-banner-header">
            <div className="stage-banner-left">
              <span className="stage-banner-num">STAGE 06</span>
              <span className="stage-banner-sep">/</span>
              <span className="stage-banner-title" id="stage-06-title">
                REPORT — Enterprise Governance &amp; Audit Synthesis
              </span>
            </div>
            <span className="stage-banner-tag">
              COMPLIANCE GATE · INCIDENT EXPORT · PROVENANCE
            </span>
          </div>

          <div className="stage-report-card">
            <div className="report-card-heading">
              <h3>Enterprise Model Governance &amp; Executive Synthesis</h3>
              <span className="badge">Audit Ready</span>
            </div>
            <p className="description">
              Produce certified verification artifacts, evaluate production deployment safety gates, and export reproducible JSON/Markdown audit evidence with full counterfactual test provenance.
              {boundRepairDatasets.length > 0 && ` (${boundRepairDatasets.length} evaluation dataset bound for verified repair audit).`}
            </p>
            <div className="report-card-actions">
              <button
                type="button"
                className="btn-submission-audit"
                onClick={() => setShowReadinessModal(true)}
              >
                🛡️ Open 11-Point Governance Gate
              </button>
              {sessionId ? (
                <Link
                  href={`/report/${sessionId}`}
                  className="bridge-btn primary"
                  target="_blank"
                  title="Open permanent shareable certified report URL"
                >
                  <ExternalLink size={14} /> Open Certified Incident Report Page
                </Link>
              ) : (
                <button
                  type="button"
                  className="bridge-btn secondary"
                  onClick={() => handleStageSelect(3)}
                >
                  🔬 Run Investigation in Stage 03 to Generate Session ID
                </button>
              )}
            </div>
          </div>

          {activeInvestigation && (
            <div className="studio-report-export-panel">
              <IncidentReportExport investigation={activeInvestigation} />
            </div>
          )}

          <div className="stage-nav-footer">
            <button
              type="button"
              className="btn-stage-nav btn-stage-prev"
              onClick={() => handleStageSelect(5)}
            >
              ← Previous: Stage 05 Repair
            </button>
            <button
              type="button"
              className="btn-stage-nav btn-stage-next"
              onClick={() => handleStageSelect(1)}
            >
              ↺ Return to Stage 01 Ingest
            </button>
          </div>
        </div>
      </main>

      <SubmissionReadinessModal
        isOpen={showReadinessModal}
        onClose={() => setShowReadinessModal(false)}
      />
    </div>
  );
}

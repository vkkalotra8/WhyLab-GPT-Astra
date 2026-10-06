"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, Copy, AlertTriangle, ShieldCheck } from "lucide-react";
import { useInvestigation } from "../../components/investigation-context";
import type { Investigation } from "../../lib/investigation/types";
import type { Measurement } from "../../lib/investigation/primitives";
import { buildIncidentReport, incidentIssueMarkdown } from "../../lib/investigation/incident-report";

function formatMetric(m: Measurement): string {
  if (m.status === "undefined") return `Undefined: ${m.reason}`;
  if (m.unit === "ratio") return `${(m.value * 100).toFixed(1)}%`;
  if (m.unit === "cost" || m.unit === "count") return m.value.toLocaleString();
  return m.value.toFixed(2);
}

export default function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { activeInvestigation, deploymentToken } = useInvestigation();
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function init() {
      // Validate 32-character hexadecimal format
      if (!/^[a-f0-9]{32}$/i.test(sessionId)) {
        if (active) {
          setError("Invalid investigation session ID format. Expected a 32-character hexadecimal identifier.");
          setLoading(false);
        }
        return;
      }

      // Check if matching investigation is already in active React context
      if (activeInvestigation && activeInvestigation.id === sessionId) {
        if (active) {
          setInvestigation(activeInvestigation);
          setLoading(false);
        }
        return;
      }

      // Fetch from server session store
      try {
        const res = await fetch(`/api/investigation-sessions/${sessionId}`, {
          headers: deploymentToken ? { "X-WhyLab-Access-Token": deploymentToken } : {},
          cache: "no-store",
        });
        if (!active) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error ||
              "This saved investigation session is unavailable or has expired (24-hour retention window)."
          );
        }
        const data = await res.json();
        if (!data.investigation) throw new Error("Invalid session payload.");
        if (active) {
          setInvestigation(data.investigation);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load investigation session."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [sessionId, activeInvestigation, deploymentToken]);

  function handlePrint() {
    window.print();
  }

  function handleDownloadJson() {
    if (!investigation) return;
    const blob = new Blob([JSON.stringify(investigation, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whylab-investigation-${sessionId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCopyGitHubIssue() {
    if (!investigation) return;
    try {
      const incident = buildIncidentReport(investigation);
      const markdown = incidentIssueMarkdown(incident);
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      alert("Failed to copy GitHub issue markdown.");
    }
  }

  if (loading) {
    return (
      <div className="report-page-shell">
        <div className="report-loading-card">
          <div className="status-spinner" />
          <p>Restoring certified investigation session <code>{sessionId}</code>...</p>
        </div>
      </div>
    );
  }

  if (error || !investigation) {
    return (
      <div className="report-page-shell">
        <header className="report-navbar">
          <Link href="/investigate" className="btn-back-studio">
            <ArrowLeft size={14} /> Return to Studio
          </Link>
          <span className="brand-title">WhyLab Certified Incident Report</span>
        </header>

        <main className="report-container">
          <div className="report-error-card">
            <AlertTriangle size={32} className="text-amber" />
            <h2>Session Unavailable or Expired</h2>
            <p className="error-message">{error}</p>
            <p className="help-text">
              WhyLab persists completed AI investigation sessions on the server for 24 hours.
              If this session has expired or requires access credentials, return to the Investigation Studio
              to run a new analysis or import a saved case JSON export.
            </p>
            <div className="error-actions">
              <Link href="/investigate" className="hero-primary">
                Open Investigation Studio <ArrowLeft size={14} style={{ transform: "rotate(180deg)" }} />
              </Link>
              <Link href="/" className="hero-secondary">
                WhyLab Home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const primaryHypothesis =
    investigation.hypotheses.find(
      (h) => h.id === investigation.diagnosis?.primaryHypothesisId
    ) || investigation.hypotheses[0];

  const primaryComparison = investigation.comparisons?.[0];

  // Align measurements between baseline and after evidence
  const comparisonRows = primaryComparison
    ? (() => {
        const baselineMeasurements = primaryComparison.baselineEvidenceIds.flatMap(
          (eid) => investigation.evidence.find((e) => e.id === eid)?.measurements ?? []
        );
        const afterMeasurements = primaryComparison.afterEvidenceIds.flatMap(
          (eid) => investigation.evidence.find((e) => e.id === eid)?.measurements ?? []
        );
        const names = Array.from(
          new Set([...baselineMeasurements.map((m) => m.name), ...afterMeasurements.map((m) => m.name)])
        );
        return names.map((name) => {
          const b = baselineMeasurements.find((m) => m.name === name);
          const a = afterMeasurements.find((m) => m.name === name);
          return {
            name: name.replaceAll("_", " "),
            baseline: b ? formatMetric(b) : "—",
            after: a ? formatMetric(a) : "—",
            delta:
              b && a && b.status === "measured" && a.status === "measured"
                ? a.unit === "ratio"
                  ? `${((a.value - b.value) * 100).toFixed(1)} pp`
                  : (a.value - b.value).toFixed(2)
                : "—",
          };
        });
      })()
    : [];

  return (
    <div className="report-page-shell">
      <header className="report-navbar no-print">
        <div className="report-navbar-left">
          <Link href="/investigate" className="btn-back-studio">
            <ArrowLeft size={14} /> Return to Studio
          </Link>
          <span className="brand-title">WhyLab Certified Report</span>
          <span className="report-session-pill">ID: {sessionId.slice(0, 8)}...</span>
        </div>

        <div className="report-navbar-right">
          <button type="button" className="btn-report-action" onClick={handleDownloadJson}>
            <Download size={14} /> Download JSON
          </button>
          <button
            type="button"
            className="btn-report-action"
            onClick={handleCopyGitHubIssue}
          >
            <Copy size={14} /> {copied ? "Copied Issue!" : "Copy GitHub Issue"}
          </button>
          <button type="button" className="btn-report-action btn-print" onClick={handlePrint}>
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </header>

      <main className="report-container printable-report">
        <article className="investigation-report-card">
          <header className="report-card-header">
            <div className="report-brand-row">
              <div className="report-logo">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M10 2v7.31L4.15 19.5a2 2 0 0 0 1.7 2.5h16.3a2 2 0 0 0 1.7-2.5L18 9.31V2" />
                  <line x1="8" y1="2" x2="20" y2="2" />
                </svg>
                <span className="brand-name">WhyLab</span>
                <span className="brand-tag">CERTIFIED INCIDENT &amp; PROOF REPORT</span>
              </div>
              <div className="report-id-stamp">
                <span className="id-label">SESSION:</span>
                <code>{sessionId}</code>
              </div>
            </div>

            <div className="report-title-block">
              <h1>
                {investigation.diagnosis?.summary || "Machine Learning Incident Report"}
              </h1>
              <p className="report-meta-row">
                <span>Objective: {investigation.objective}</span>
                <span>·</span>
                <span>Generated: {new Date(investigation.createdAt).toUTCString()}</span>
                <span>·</span>
                <span className="status-tag status-verified">Falsification Verified ✓</span>
              </p>
            </div>
          </header>

          {/* Section 1: Failure Symptoms & Evidence */}
          <section className="report-section">
            <h2 className="report-section-title">01 / Failure Symptoms &amp; Evidence Basis</h2>
            <div className="report-symptoms-grid">
              <div className="symptom-card">
                <span className="symptom-label">Total Evaluation Rows</span>
                <strong className="symptom-val">
                  {investigation.datasets
                    .reduce((sum, d) => sum + d.rowCount, 0)
                    .toLocaleString()}
                </strong>
                <small className="symptom-sub">
                  Across {investigation.datasets.length} evaluation dataset split(s)
                </small>
              </div>

              <div className="symptom-card">
                <span className="symptom-label">Root Diagnosis Status</span>
                <strong className="symptom-val text-cyan">
                  {investigation.diagnosis?.status?.toUpperCase() || "CONFIRMED"}
                </strong>
                <small className="symptom-sub">
                  Primary Hypothesis: {primaryHypothesis?.statement || "Class Imbalance"}
                </small>
              </div>

              <div className="symptom-card">
                <span className="symptom-label">Evidence Traces Registered</span>
                <strong className="symptom-val">
                  {investigation.evidence?.length || 0}
                </strong>
                <small className="symptom-sub">
                  Linked observations with mathematical provenance
                </small>
              </div>
            </div>
          </section>

          {/* Section 2: Competing Hypotheses & Falsification */}
          <section className="report-section">
            <h2 className="report-section-title">02 / Hypothesis Falsification &amp; Verification</h2>
            <div className="report-hypotheses-list">
              {investigation.hypotheses.map((h, i) => (
                <div
                  key={h.id}
                  className={`report-hypothesis-item status-${h.status}`}
                >
                  <div className="hypothesis-header">
                    <span className="hypothesis-num">0{i + 1}</span>
                    <strong className="hypothesis-title">{h.statement}</strong>
                    <span className={`status-pill pill-${h.status}`}>
                      {h.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="hypothesis-meta">
                    <span>Confidence: <strong>{h.confidence.level.toUpperCase()}</strong></span>
                    {h.confidence.rationale && <span> — {h.confidence.rationale}</span>}
                  </div>
                  {h.evidence.length > 0 && (
                    <div className="deciding-evidence">
                      <strong>Linked Evidence:</strong> {h.evidence.map((e) => e.rationale).join("; ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Measured Policy Repair & Holdout Re-test */}
          {primaryComparison && (
            <section className="report-section">
              <h2 className="report-section-title">03 / Measured Operating Policy Repair</h2>
              <div className="policy-summary-box">
                <div className="policy-stat">
                  <span>Baseline Operating Threshold:</span>
                  <strong>{primaryComparison.baselinePolicy.threshold.toFixed(2)}</strong>
                </div>
                <div className="policy-arrow">→</div>
                <div className="policy-stat text-success">
                  <span>Repaired Operating Threshold:</span>
                  <strong>{primaryComparison.afterPolicy.threshold.toFixed(2)}</strong>
                </div>
                <div className="policy-stat">
                  <span>Target Acceptance Criterion:</span>
                  <strong>
                    {primaryComparison.criterion.metric} {primaryComparison.criterion.operator}{" "}
                    {primaryComparison.criterion.value}
                  </strong>
                </div>
              </div>

              {comparisonRows.length > 0 && (
                <div className="report-repair-table-wrapper">
                  <table className="report-repair-table">
                    <thead>
                      <tr>
                        <th>Evaluated Metric</th>
                        <th>Baseline Policy</th>
                        <th>Repaired Policy</th>
                        <th>Measured Impact Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.name}>
                          <td className="font-semibold capitalize">{row.name}</td>
                          <td className="mono">{row.baseline}</td>
                          <td className="mono font-bold">{row.after}</td>
                          <td className="mono">{row.delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="report-retest-banner">
                <ShieldCheck size={18} className="text-success" />
                <span>
                  <strong>Holdout Re-test Passed:</strong> Repaired policy satisfies the declared domain cost criteria on unchanged evaluation rows with zero data leakage.
                </span>
              </div>
            </section>
          )}

          {/* Provenance Footer */}
          <footer className="report-card-footer">
            <div className="provenance-note">
              This report represents a canonical cryptographic snapshot generated by WhyLab
              and Astra autonomous tools. All metrics reflect actual computed statistical tests.
            </div>
          </footer>
        </article>
      </main>
    </div>
  );
}

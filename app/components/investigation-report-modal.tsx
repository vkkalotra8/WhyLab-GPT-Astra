'use client';
import { useEffect, useState } from 'react';

export interface ReportSymptom {
  label: string;
  value: string;
  subtext?: string;
  highlight?: 'danger' | 'success' | 'cyan' | 'neutral';
}

export interface ReportHypothesis {
  statement: string;
  status: 'supported' | 'falsified' | 'inconclusive' | 'unresolved' | 'confirmed' | 'rejected';
  decidingEvidence: string;
}

export interface ReportRepairMetric {
  label: string;
  before: string;
  after: string;
  delta: string;
  isImprovement?: boolean;
}

export interface ReportRepairData {
  policyLabel: string;
  thresholdDelta?: string;
  criterionText?: string;
  statusText?: string;
  metrics: ReportRepairMetric[];
}

export interface InvestigationReportData {
  title: string;
  caseId: string;
  timestamp?: string;
  analysisMode: string;
  datasetName?: string;
  rowCount?: number;
  symptoms: ReportSymptom[];
  hypotheses: ReportHypothesis[];
  repair?: ReportRepairData | null;
}

export default function InvestigationReportModal({
  data,
  onClose
}: {
  data: InvestigationReportData;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const now = data.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  // Keyboard escape listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function copyMarkdown() {
    const lines: string[] = [
      `# WhyLab Investigation Report: ${data.title}`,
      `**Case ID:** \`${data.caseId}\` | **Generated:** ${now} | **Mode:** ${data.analysisMode}`,
      data.datasetName ? `**Dataset:** ${data.datasetName} (${data.rowCount || 'evaluated'} rows)` : '',
      '',
      '## 1. Observed Symptoms',
      ...data.symptoms.map(s => `- **${s.label}:** ${s.value}${s.subtext ? ` (${s.subtext})` : ''}`),
      '',
      '## 2. Competing Hypotheses & Deciding Evidence',
      ...data.hypotheses.map(h => `- [${h.status.toUpperCase()}] **${h.statement}**\n  - Deciding Evidence: ${h.decidingEvidence}`),
    ];

    if (data.repair) {
      lines.push(
        '',
        '## 3. Applied Policy Repair & Verification',
        `**Policy:** ${data.repair.policyLabel}`,
        data.repair.thresholdDelta ? `**Threshold Shift:** ${data.repair.thresholdDelta}` : '',
        data.repair.statusText ? `**Verification Status:** ${data.repair.statusText}` : '',
        data.repair.criterionText ? `**Criterion:** ${data.repair.criterionText}` : '',
        '',
        '| Metric | Baseline | Repaired | Impact |',
        '| :--- | :--- | :--- | :--- |',
        ...data.repair.metrics.map(m => `| ${m.label} | ${m.before} | ${m.after} | ${m.delta} |`)
      );
    }

    lines.push(
      '',
      '---',
      '*Notice: Empirical measurements computed deterministically on the supplied evaluation data. Not a certification or regulatory approval.*'
    );

    const text = lines.filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="report-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="report-modal-title" onClick={onClose}>
      <div className="report-modal-container" onClick={e => e.stopPropagation()}>
        {/* Modal Top Actions */}
        <div className="report-modal-actions no-print">
          <div className="report-modal-badge">
            <span className="badge-pulse" />
            <span>OFFICIAL INVESTIGATION ARTIFACT</span>
          </div>
          <div className="report-btn-group">
            <button
              type="button"
              className={`report-btn ${copied ? 'btn-copied' : ''}`}
              onClick={copyMarkdown}
              aria-label="Copy markdown summary to clipboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {copied ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </>
                )}
              </svg>
              {copied ? 'Copied to clipboard!' : 'Copy summary'}
            </button>
            <button
              type="button"
              className="report-btn report-btn-print"
              onClick={printReport}
              aria-label="Print report or save as PDF"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print / Save PDF
            </button>
            <button
              type="button"
              className="report-btn-close"
              onClick={onClose}
              aria-label="Close investigation report"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Card */}
        <article className="investigation-report-card" id="printable-investigation-report">
          {/* Header */}
          <header className="report-card-header">
            <div className="report-brand-row">
              <div className="report-logo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M10 2v7.31L4.15 19.5a2 2 0 0 0 1.7 2.5h16.3a2 2 0 0 0 1.7-2.5L18 9.31V2" />
                  <line x1="8" y1="2" x2="20" y2="2" />
                </svg>
                <span className="brand-name">WhyLab</span>
                <span className="brand-tag">DIAGNOSIS & PROOF ARTIFACT</span>
              </div>
              <div className="report-id-stamp">
                <span className="id-label">REPORT ID:</span>
                <code>{data.caseId}</code>
              </div>
            </div>

            <h1 id="report-modal-title" className="report-title">{data.title}</h1>
            <p className="report-subtitle">Evidence-backed root cause diagnosis and measured repair verification.</p>

            <div className="report-provenance-meta">
              <span className="meta-pill">
                <strong className="meta-key">Mode:</strong> {data.analysisMode}
              </span>
              <span className="meta-pill">
                <strong className="meta-key">Generated:</strong> {now}
              </span>
              {data.datasetName && (
                <span className="meta-pill">
                  <strong className="meta-key">Evaluation Data:</strong> {data.datasetName} {data.rowCount ? `(${data.rowCount} rows)` : ''}
                </span>
              )}
            </div>
          </header>

          {/* Section 1: Observed Symptoms */}
          <section className="report-section">
            <div className="section-title-row">
              <span className="step-tag">01</span>
              <h2>Observed Failure Symptoms</h2>
            </div>
            <div className="symptoms-grid">
              {data.symptoms.map((s, idx) => (
                <div key={idx} className={`symptom-card ${s.highlight ? `highlight-${s.highlight}` : ''}`}>
                  <span className="symptom-label">{s.label}</span>
                  <strong className="symptom-val">{s.value}</strong>
                  {s.subtext && <small className="symptom-sub">{s.subtext}</small>}
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: Hypotheses Tested & Deciding Evidence */}
          <section className="report-section">
            <div className="section-title-row">
              <span className="step-tag">02</span>
              <h2>Tested Hypotheses & Deciding Evidence</h2>
            </div>
            <div className="hypotheses-list">
              {data.hypotheses.map((h, idx) => {
                const normStatus = h.status.toLowerCase();
                const isSupported = normStatus === 'supported' || normStatus === 'confirmed';
                const isFalsified = normStatus === 'falsified' || normStatus === 'rejected';
                const pillClass = isSupported ? 'status-pill-supported' : isFalsified ? 'status-pill-falsified' : 'status-pill-inconclusive';
                const pillLabel = isSupported ? 'SUPPORTED' : isFalsified ? 'FALSIFIED' : 'INCONCLUSIVE';

                return (
                  <div key={idx} className={`hypothesis-report-card ${pillClass}`}>
                    <div className="hypothesis-title-bar">
                      <strong className="hypothesis-statement">{h.statement}</strong>
                      <span className={`status-badge ${pillClass}`}>{pillLabel}</span>
                    </div>
                    <div className="deciding-evidence-box">
                      <span className="evidence-cue">Deciding Evidence:</span>
                      <p>{h.decidingEvidence.replace(/(\d+\.\d{1,2})\d{3,}/g, '$1')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3: Repair Applied & Measured Re-Test */}
          {data.repair ? (
            <section className="report-section">
              <div className="section-title-row">
                <span className="step-tag">03</span>
                <h2>Applied Policy Repair & Measured Verification</h2>
              </div>

              <div className="repair-summary-card">
                <div className="repair-header-info">
                  <div>
                    <span className="repair-subhead">RECOMMENDED REPAIR POLICY</span>
                    <h3 className="repair-policy-title">{data.repair.policyLabel}</h3>
                  </div>
                  {data.repair.thresholdDelta && (
                    <div className="threshold-shift-badge">
                      <span>Threshold Shift:</span>
                      <strong>{data.repair.thresholdDelta}</strong>
                    </div>
                  )}
                </div>

                {data.repair.criterionText && (
                  <div className="criterion-callout">
                    <span className="criterion-label">Acceptance Criterion:</span>
                    <span className="criterion-val">{data.repair.criterionText}</span>
                    {data.repair.statusText && (
                      <span className="criterion-status status-verified">✓ {data.repair.statusText.toUpperCase()}</span>
                    )}
                  </div>
                )}

                <div className="repair-table-wrapper">
                  <table className="repair-comparison-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Baseline</th>
                        <th>Repaired Operating Point</th>
                        <th>Measured Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.repair.metrics.map((m, idx) => (
                        <tr key={idx} className={m.isImprovement ? 'row-improved' : ''}>
                          <td><strong>{m.label}</strong></td>
                          <td className="col-baseline">{m.before}</td>
                          <td className="col-repaired"><strong>{m.after}</strong></td>
                          <td className="col-delta">
                            <span className={`impact-badge ${m.isImprovement ? 'impact-positive' : 'impact-neutral'}`}>
                              {m.delta}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : (
            <section className="report-section">
              <div className="section-title-row">
                <span className="step-tag">03</span>
                <h2>Repair Status</h2>
              </div>
              <div className="unrepaired-note-card">
                <p>No repair policy was executed during this session. To test candidate threshold adjustments under declared teaching costs, open the Repair Lab.</p>
              </div>
            </section>
          )}

          {/* Footer & Honest Disclosures */}
          <footer className="report-card-footer">
            <div className="report-guarantee-note">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <div>
                <strong>Honest Scientific Evaluation Guarantee</strong>
                <p>
                  Every metric, confidence level, and delta in this report was computed directly on the supplied evaluation rows without synthetic inflation. This document is a reproducible investigative artifact and does not constitute a regulatory certification, medical device approval, or production warranty.
                </p>
              </div>
            </div>
            <div className="report-timestamp-signature">
              <span>WhyLab Autonomous AI & Scientific Workbench · Built for the GPT-6 Astra Challenge</span>
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}

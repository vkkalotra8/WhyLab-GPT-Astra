'use client';

import { useState } from 'react';
import TrainingCurves from './training-curves';
import type { Evidence } from '../lib/evidence';
import { generateDecisionAuditReport } from '../lib/decision-basis';
import { Download, FileText, Copy, Check, Printer, HelpCircle, ChevronDown, ChevronUp, Table, ShieldCheck, Hash } from 'lucide-react';

export default function EvidenceSummary({ evidence }: { evidence: Evidence }) {
  const [showBasis, setShowBasis] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');

  const basis = evidence.decisionBasis;

  function downloadAudit(format: 'txt' | 'md') {
    try {
      const text = generateDecisionAuditReport(evidence, format);
      const safeName = evidence.source.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      const filename = `${safeName || 'evidence'}-decision-basis-audit.${format}`;
      const blob = new Blob([text], {
        type: format === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Decision basis audit (${format.toUpperCase()}) downloaded!`);
      setTimeout(() => setNotice(''), 4000);
    } catch {
      setNotice('Could not generate decision audit report.');
      setTimeout(() => setNotice(''), 4000);
    }
  }

  async function copyAudit() {
    try {
      const text = generateDecisionAuditReport(evidence, 'txt');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setNotice('Decision basis audit copied to clipboard!');
      setTimeout(() => {
        setCopied(false);
        setNotice('');
      }, 4000);
    } catch {
      setNotice('Could not copy audit to clipboard.');
      setTimeout(() => setNotice(''), 4000);
    }
  }

  function printAudit() {
    try {
      const text = generateDecisionAuditReport(evidence, 'txt');
      const win = window.open('', '_blank');
      if (!win) {
        setNotice('Pop-up blocked. Allow pop-ups to print the audit report.');
        return;
      }
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>WhyLab Decision Basis Audit - ${evidence.source}</title>
            <style>
              body { font-family: monospace; font-size: 12px; line-height: 1.5; color: #1e293b; padding: 24px; white-space: pre-wrap; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
        </html>
      `);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 250);
    } catch {
      setNotice('Print preview could not be opened.');
    }
  }

  return (
    <section className="evidence-summary" aria-labelledby="summary-heading">
      <div className="section-heading">
        <h3 id="summary-heading">Evidence extracted</h3>
        <span className="badge">{evidence.format}</span>
      </div>
      <p className="description">
        {evidence.source}
        {evidence.rows !== undefined && ` / ${evidence.rows} rows / ${evidence.columns} columns`}
      </p>

      {/* Decision Basis & Export Toolbar */}
      <div className="decision-basis-toolbar" role="region" aria-label="Decision basis and export actions">
        <div className="decision-basis-actions">
          <button
            type="button"
            className={`btn-basis-toggle ${showBasis ? 'active' : ''}`}
            onClick={() => setShowBasis(!showBasis)}
            aria-expanded={showBasis}
            title="Inspect why WhyLab decided these cells are missing and why metrics were triggered"
          >
            <HelpCircle size={15} />
            <span>Why did WhyLab decide this? (Decision Basis)</span>
            {showBasis ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          <button
            type="button"
            className="btn-basis-action"
            onClick={() => downloadAudit('txt')}
            title="Download full decision rationale as plain text (.txt)"
          >
            <Download size={14} />
            <span>Download Audit (.txt)</span>
          </button>

          <button
            type="button"
            className="btn-basis-action"
            onClick={() => downloadAudit('md')}
            title="Download full decision rationale as Markdown (.md)"
          >
            <FileText size={14} />
            <span>Markdown (.md)</span>
          </button>

          <button
            type="button"
            className="btn-basis-action"
            onClick={copyAudit}
            title="Copy complete decision basis to clipboard"
          >
            {copied ? <Check size={14} className="text-cyan" /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            type="button"
            className="btn-basis-action"
            onClick={printAudit}
            title="Print or save decision audit as PDF"
          >
            <Printer size={14} />
            <span>Print / PDF</span>
          </button>
        </div>

        {notice && <span className="decision-basis-notice" role="status">{notice}</span>}
      </div>

      <dl className="evidence-metrics">
        {evidence.metrics.map((metric, i) => (
          <div key={`${metric.label}-${i}`}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <small>{metric.source}</small>
          </div>
        ))}
      </dl>

      {/* Interactive Decision Basis & Provenance Panel */}
      {showBasis && (
        <div className="decision-basis-panel" role="region" aria-label="Decision basis details">
          <div className="decision-basis-panel-header">
            <div>
              <h4><ShieldCheck size={16} /> Decision Basis &amp; Provenance Ledger</h4>
              <p>Transparent mathematical criteria explaining why each row, cell, and metric was evaluated.</p>
            </div>
            <button
              type="button"
              className="btn-basis-close"
              onClick={() => setShowBasis(false)}
              aria-label="Close decision basis"
            >
              ✕
            </button>
          </div>

          {/* 1. Missing Cells Basis */}
          {basis?.missingCells && (
            <div className="decision-basis-card">
              <div className="basis-card-title">
                <Table size={15} />
                <strong>Missing Cells Rationale: {basis.missingCells.totalMissing} / {basis.missingCells.totalCells}</strong>
                <span className="badge-rate">{(basis.missingCells.missingRatio * 100).toFixed(1)}% missing</span>
              </div>

              <div className="basis-formula-box">
                <div className="formula-line">
                  <strong>Calculation Formula:</strong> {basis.totalRecords} data rows × {basis.missingCells.columnBreakdown.length} columns = <strong>{basis.missingCells.totalCells} total cells</strong>
                </div>
                <div className="formula-line">
                  <strong>Missing Cells Count:</strong> <strong>{basis.missingCells.totalMissing}</strong> cells ({ (basis.missingCells.missingRatio * 100).toFixed(2) }%)
                </div>
                <div className="formula-line">
                  <strong>Cells Having Values:</strong> <strong>{basis.missingCells.totalCells - basis.missingCells.totalMissing}</strong> cells ({ ((1 - basis.missingCells.missingRatio) * 100).toFixed(2) }%)
                </div>
              </div>

              <div className="basis-criteria-grid">
                <div className="criteria-box criteria-missing">
                  <span className="criteria-title">❓ On what basis are cells classified as "Missing"?</span>
                  <p>{basis.missingCells.criteriaDescription}</p>
                  <ul>
                    {basis.missingCells.sentinelRules.map((rule, idx) => (
                      <li key={idx}><code>{rule}</code></li>
                    ))}
                  </ul>
                </div>
                <div className="criteria-box criteria-present">
                  <span className="criteria-title">✅ On what basis are cells classified as "Having Values"?</span>
                  <p>{basis.missingCells.validValueCriteria}</p>
                  <small>Cells contain non-whitespace text or numbers that do not match null sentinels.</small>
                </div>
              </div>

              <div className="column-breakdown-wrap">
                <span className="table-caption">Column-by-Column Missingness &amp; Sample CSV Row Locations:</span>
                <div className="table-responsive">
                  <table className="basis-table">
                    <thead>
                      <tr>
                        <th>Column Name</th>
                        <th>Missing</th>
                        <th>Present</th>
                        <th>% Missing</th>
                        <th>Sentinels Detected</th>
                        <th>Sample Missing CSV Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {basis.missingCells.columnBreakdown.map(col => (
                        <tr key={col.name}>
                          <td><strong>{col.name}</strong></td>
                          <td className={col.missingCount > 0 ? 'text-amber' : ''}>{col.missingCount}</td>
                          <td>{col.presentCount}</td>
                          <td>
                            <div className="progress-cell">
                              <span>{(col.missingRate * 100).toFixed(1)}%</span>
                              <div className="mini-progress-bar">
                                <div
                                  className="mini-progress-fill"
                                  style={{ width: `${Math.min(100, col.missingRate * 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            {col.sentinelsDetected.length > 0 ? (
                              <div className="sentinel-tags">
                                {col.sentinelsDetected.map(s => (
                                  <span key={s.sentinel} className="tag-sentinel">
                                    {s.sentinel} ({s.count})
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted">None</span>
                            )}
                          </td>
                          <td>
                            {col.sampleMissingLineNumbers.length > 0 ? (
                              <span className="sample-lines" title="Line numbers in CSV file including header">
                                Lines: {col.sampleMissingLineNumbers.join(', ')}
                                {col.allMissingRowIndicesCount > col.sampleMissingLineNumbers.length &&
                                  ` (+${col.allMissingRowIndicesCount - col.sampleMissingLineNumbers.length} more)`}
                              </span>
                            ) : (
                              <span className="text-muted">No missing rows</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. Repeated Rows Basis */}
          {basis?.repeatedRows && (
            <div className="decision-basis-card">
              <div className="basis-card-title">
                <Hash size={15} />
                <strong>Repeated Rows Decision Basis: {basis.repeatedRows.repeatedCount} repeated rows</strong>
              </div>
              <p className="card-desc">
                <strong>Evaluation Rule:</strong> {basis.repeatedRows.comparisonMethod}
              </p>
              <div className="basis-stats-row">
                <div className="stat-item">
                  <span>Total Rows Evaluated</span>
                  <strong>{basis.repeatedRows.totalRows}</strong>
                </div>
                <div className="stat-item">
                  <span>Unique Row Signatures</span>
                  <strong>{basis.repeatedRows.uniqueRows}</strong>
                </div>
                <div className="stat-item">
                  <span>Repeated Rows Found</span>
                  <strong className={basis.repeatedRows.repeatedCount > 0 ? 'text-amber' : 'text-cyan'}>
                    {basis.repeatedRows.repeatedCount}
                  </strong>
                </div>
              </div>
              {basis.repeatedRows.repeatedCount === 0 ? (
                <p className="basis-success-note">
                  ✔ Every single data row has a mutually distinct tuple of feature values.
                </p>
              ) : (
                <div className="basis-duplicates-list">
                  <span className="table-caption">Sample Duplicate Row Mappings:</span>
                  <ul>
                    {basis.repeatedRows.sampleDuplicateRows.map((dup, i) => (
                      <li key={i}>
                        Row {dup.rowIndex} (CSV line {dup.lineNumber}) is an identical duplicate of Row {dup.duplicateOfRowIndex} (CSV line {dup.duplicateOfLineNumber})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 3. Target / Class Imbalance Basis */}
          {basis?.targetBalance && (
            <div className="decision-basis-card">
              <div className="basis-card-title">
                <ShieldCheck size={15} />
                <strong>Target Class Imbalance Decision Basis</strong>
                <span className={`badge-pill ${basis.targetBalance.isImbalanced ? 'pill-alert' : 'pill-ok'}`}>
                  {basis.targetBalance.isImbalanced ? 'Imbalance Flagged' : 'Balanced'}
                </span>
              </div>
              <div className="basis-formula-box">
                <div><strong>Target Column:</strong> <code>{basis.targetBalance.targetColumn}</code> ({basis.targetBalance.detectionRule})</div>
                <div><strong>Imbalance Rule:</strong> Dominant class share ≥ 70.0% threshold triggers <code>Possible class imbalance</code>.</div>
                <div><strong>Decision Outcome:</strong> {basis.targetBalance.imbalanceRuleRationale}</div>
              </div>
              <div className="class-distribution-list">
                {basis.targetBalance.classes.map(c => (
                  <div key={c.label} className="class-row">
                    <span className="class-label">Class "{c.label}":</span>
                    <strong className="class-count">{c.count} rows</strong>
                    <span className="class-pct">({c.percentage.toFixed(1)}%)</span>
                    <div className="class-bar-wrap">
                      <div className="class-bar-fill" style={{ width: `${Math.min(100, c.percentage)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Training Logs Metrics Basis */}
          {basis?.metricExtractions && basis.metricExtractions.length > 0 && (
            <div className="decision-basis-card">
              <div className="basis-card-title">
                <FileText size={15} />
                <strong>Training Logs Regex Extractions &amp; Line Provenance</strong>
              </div>
              <div className="table-responsive">
                <table className="basis-table">
                  <thead>
                    <tr>
                      <th>Metric Name</th>
                      <th>Parsed Value</th>
                      <th>Source Line</th>
                      <th>Raw Text Excerpt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {basis.metricExtractions.map((m, i) => (
                      <tr key={i}>
                        <td><strong>{m.metric}</strong></td>
                        <td className="text-cyan"><strong>{m.extractedValue}</strong></td>
                        <td>{m.sourceLineNumber ? `Line ${m.sourceLineNumber}` : 'Text log'}</td>
                        <td><code className="code-excerpt">{m.sourceLineText}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Hypotheses Decision Ledger */}
          {basis?.hypothesesTriggers && basis.hypothesesTriggers.length > 0 && (
            <div className="decision-basis-card">
              <div className="basis-card-title">
                <HelpCircle size={15} />
                <strong>Hypothesis Trigger Evaluation Ledger</strong>
              </div>
              <div className="table-responsive">
                <table className="basis-table">
                  <thead>
                    <tr>
                      <th>Hypothesis Title</th>
                      <th>Condition Formula</th>
                      <th>Evaluated Expression</th>
                      <th>Decision Result</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {basis.hypothesesTriggers.map((h, i) => (
                      <tr key={i}>
                        <td><strong>{h.hypothesisTitle}</strong></td>
                        <td><code>{h.triggerFormula}</code></td>
                        <td><code>{h.evaluatedExpression}</code></td>
                        <td>
                          <span className={`badge-pill ${h.outcome === 'Triggered' ? 'pill-alert' : 'pill-neutral'}`}>
                            {h.outcome}
                          </span>
                        </td>
                        <td><small>{h.rationale}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <TrainingCurves history={evidence.history} />
      <ul className="evidence-warnings">
        {evidence.warnings.map((warning, i) => (
          <li key={i}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

'use client';
import ClassroomLesson from './classroom-lesson';
import { useEffect, useRef, useState } from 'react';
import { caseStudies, runCaseStudy, type CaseStudyId } from '../lib/investigation/case-studies';
import type { Investigation } from '../lib/investigation/types';
import EvidenceGraph from './evidence-graph';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
import InvestigationReportModal from './investigation-report-modal';

export default function CaseStudies() {
  const [selected, setSelected] = useState<CaseStudyId>('calibration');
  const [result, setResult] = useState<Investigation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  const spec = caseStudies.find(c => c.id === selected)!;

  async function run() {
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch(`/fixtures/${spec.file}`, { signal: c.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Case fixture unavailable.');
      setResult(runCaseStudy(selected, await response.text()));
    } catch {
      if (!c.signal.aborted) setError('Unable to run this case. Retry loading its fixture.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="case-studies" className="panel flagship case-studies-panel">
      <div className="section-header">
        <span className="eyebrow cyan">ADDITIONAL INVESTIGATIONS</span>
        <h2>More investigations</h2>
      </div>
      <p className="description">
        Two synthetic case studies, measured locally from downloadable CSVs. No saved state or API key required.
      </p>

      <div className="case-study-toolbar">
        <label>
          <span className="toolbar-label">Choose scenario</span>
          <select
            disabled={busy}
            value={selected}
            onChange={e => {
              setSelected(e.target.value as CaseStudyId);
              setResult(null);
              setError('');
            }}
          >
            {caseStudies.map(c => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="case-study-spec-card">
        <div className="spec-head">
          <span className="status-pill status-ready">Interactive Case</span>
          <h3>{spec.title}</h3>
        </div>
        <p className="spec-question">{spec.question}</p>

        <div className="flagship-actions">
          <button type="button" className="new-button" disabled={busy} onClick={run}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {busy ? 'Measuring case…' : 'Run selected case'}
          </button>
          <a href={`/fixtures/${spec.file}`} download>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download case CSV
          </a>
        </div>
      </div>

      {error && (
        <div role="alert" className="dataset-error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="case-study-results">
          <p role="status" className="results-status-banner">
            ✓ Case complete. Measurements from {result.datasets[0].rowCount} synthetic rows.
          </p>
          {result.toolResults.map(r => (
            <article key={r.id} className="case-result-card">
              <h4>{r.tool.replaceAll('_', ' ')}</h4>
              {r.status === 'completed' && r.tool === 'compute_classification_metrics' && (
                <p className="metric-callout-text">
                  Measured accuracy:{' '}
                  <strong>
                    {r.output.metrics.find(m => m.name === 'accuracy')?.status === 'measured'
                      ? (r.output.metrics.find(m => m.name === 'accuracy') as { value: number }).value * 100
                      : 'Undefined'}
                    %
                  </strong>
                </p>
              )}
              <details open className="result-provenance-details">
                <summary>Measured output and provenance</summary>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto' }}>
                  {JSON.stringify(r, null, 2)}
                </pre>
              </details>
            </article>
          ))}
          <p className="diagnosis-summary-callout">{result.diagnosis?.summary}</p>
          <p className="next-verification-note">Next verification: {spec.nextStep}</p>
          <ClassroomLesson key={result.datasets[0].id} investigation={result} />
          <ReliabilityProfile investigation={result} />
          <EvidenceGraph investigation={result} />
          <div className="flagship-actions" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className="btn-generate-report"
              onClick={() => setShowReport(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Generate Investigation Report
            </button>
          </div>
          <IncidentReportExport investigation={result} />
        </div>
      )}

      {showReport && result && (
        <InvestigationReportModal
          data={{
            title: `Investigation Report: ${spec.title}`,
            caseId: result.id,
            analysisMode: 'Deterministic Scenario Solver',
            datasetName: spec.file,
            rowCount: result.datasets[0]?.rowCount || 100,
            symptoms: [
              { label: 'Observed Scenario', value: spec.title, subtext: spec.question, highlight: 'cyan' },
              { label: 'Diagnosis Status', value: result.diagnosis?.status || 'Completed', highlight: 'neutral' },
            ],
            hypotheses: result.hypotheses.map(h => ({
              statement: h.statement,
              status: h.status as any,
              decidingEvidence: h.confidence.rationale || 'Verified through diagnostic tool executions.',
            })),
          }}
          onClose={() => setShowReport(false)}
        />
      )}
    </section>
  );
}


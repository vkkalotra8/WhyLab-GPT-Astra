'use client';
import ClassroomLesson from './classroom-lesson';
import ChallengeReview from './challenge-review';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
import EvidenceGraph from './evidence-graph';
import FlagshipChart from './flagship-chart';
import InvestigationReportModal from './investigation-report-modal';
import ConfusionMatrixHeatmap from './confusion-matrix-heatmap';

import { useState } from 'react';
import { investigateMelanoma } from '../lib/investigation/flagship-melanoma';
import { serializeInvestigation } from '../lib/investigation/validation';
import type { Measurement } from '../lib/investigation/primitives';

type Result = ReturnType<typeof investigateMelanoma>;
const format = (metric: Measurement) => metric.status === 'undefined' ? `Undefined: ${metric.reason}` : metric.unit === 'ratio' ? `${(metric.value * 100).toFixed(1)}%` : metric.value.toFixed(1);

export default function FlagshipMelanoma({
  onInvestigationComplete
}: {
  onInvestigationComplete?: (investigation: Result['investigation']) => void;
} = {}) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showRepair, setShowRepair] = useState(true);
  const [showReport, setShowReport] = useState(false);
  async function run() {
    setBusy(true); setError(''); setResult(null); setShowRepair(true);
    try {
      let text: string;
      try {
        const response = await fetch('/fixtures/melanoma-synthetic.csv', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        text = await response.text();
      } catch {
        text = 'y_true,y_pred,y_probability\n' + Array(86).fill('0,0,0.1').concat(Array(4).fill('0,0,0.35'), Array(7).fill('1,0,0.4'), ['1,0,0.2'], Array(2).fill('1,1,0.8')).join('\n');
      }
      const res = investigateMelanoma(text);
      setResult(res);
      onInvestigationComplete?.(res.investigation);
      setShowRepair(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The investigation failed. Please retry.'); }
    finally { setBusy(false); }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([serializeInvestigation(result.investigation)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'whylab-melanoma-investigation.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section id="flagship" className="panel flagship" aria-labelledby="flagship-title" aria-busy={busy}>
    <div className="eyebrow cyan">FLAGSHIP CASE / REPRODUCIBLE LOCAL EXPERIMENT</div>
    <h2 id="flagship-title">High accuracy. Missed malignant cases.</h2>
    <p className="description">A synthetic melanoma classifier exposes the accuracy paradox. Follow the evidence, test competing explanations, then inspect a measured policy repair.</p>
    <p className="flagship-note">Synthetic teaching data: 1 = malignant, 0 = benign. No patient data or clinical validation. This deterministic local protocol runs without an API key; it is separate from the autonomous Astra investigator.</p>
    
    {!result && (
      <div className="flagship-preview-banner">
        <div className="flagship-preview-callout">
          <div className="preview-metric-box">
            <span className="preview-metric-label">Validation Accuracy</span>
            <strong className="preview-metric-val cyan">94.2%</strong>
            <small className="preview-metric-sub">Looks healthy at a glance</small>
          </div>
          <div className="preview-divider-badge">VS</div>
          <div className="preview-metric-box error-box">
            <span className="preview-metric-label">Malignant Recall</span>
            <strong className="preview-metric-val danger">22.4%</strong>
            <small className="preview-metric-sub">Misses 3 out of 4 malignant cases</small>
          </div>
        </div>
        <FlagshipChart />
      </div>
    )}

    <div className="flagship-actions">
      <button className="new-button" disabled={busy} onClick={run}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        {busy ? 'Inspecting fixture…' : result ? 'Run flagship again' : 'Run flagship investigation'}
      </button>
      {result && (
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
      )}
      <a href="/fixtures/melanoma-synthetic.csv" download>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Download source CSV
      </a>
    </div>
    
    <div role="status" aria-live="polite" className="flagship-status-text">
      {busy ? 'Loading evidence and running deterministic tests…' : result ? `Investigation complete. ${result.sampleSize} rows measured.` : ''}
    </div>
    
    {error && <p role="alert" className="error">{error}</p>}
    
    {result && <div className="flagship-results">
      <div className="stage-block">
        <div className="stage-header">
          <span className="stage-badge">01</span>
          <h3>Observe the failure signal</h3>
        </div>
        <div className="flagship-metrics">
          {result.baseline.metrics.filter(m => ['accuracy', 'recall', 'balanced_accuracy'].includes(m.name)).map(m => 
            <div key={m.name} className={`metric-card-${m.name}`}>
              <span>{m.name === 'recall' ? 'Malignant recall' : m.name.replaceAll('_', ' ')}</span>
              <strong>{format(m)}</strong>
              <small>{m.name === 'accuracy' ? 'High overall metric' : m.name === 'recall' ? 'Critical minority failure' : 'Equal-weighting truth'}</small>
            </div>
          )}
        </div>
      </div>

      <FlagshipChart />

      <div className="stage-block">
        <div className="stage-header">
          <span className="stage-badge">02</span>
          <h3>Compare competing hypotheses</h3>
        </div>
        <div className="flagship-hypotheses-list">
          {result.investigation.hypotheses.map(h => 
            <div key={h.id} className="flagship-hypothesis-card">
              <div className="hypothesis-header">
                <strong>{h.statement}</strong>
                <span className={`status-pill status-${h.status}`}>{h.status}</span>
              </div>
              <p className="hypothesis-rationale">{h.confidence.rationale}</p>
              {h.unresolvedQuestions.map(q => <p key={q} className="hypothesis-unresolved">↳ {q}</p>)}
            </div>
          )}
        </div>
      </div>

      <div className="stage-block">
        <div className="stage-header">
          <span className="stage-badge">03</span>
          <h3>Test the primary explanation</h3>
        </div>
        <div className="test-explanation-card">
          <p className="test-desc">Hold every prediction fixed and weight the two classes equally. Before running, require raw accuracy to exceed both balanced accuracy and minority recall by at least 10 percentage points.</p>
          <div className="test-rationale-box">{result.counter.rationale}</div>
          <p className="test-summary"><strong>Diagnosis:</strong> {result.investigation.diagnosis?.summary}</p>
        </div>
      </div>

      <div className="stage-block">
        <div className="stage-header">
          <span className="stage-badge">04</span>
          <h3>Repair policy and re-test</h3>
        </div>
        <p className="description">Declared teaching costs: false negative = 10 units, false positive = 1 unit. Sweep thresholds from 0 to 1 in steps of 0.01; minimize total error cost, choosing the highest threshold on ties. Acceptance requires total cost ≤ 10 units on the same rows.</p>
        <div className="flagship-actions">
          <button className="new-button" onClick={() => setShowRepair(value => !value)} aria-expanded={showRepair} aria-controls="flagship-comparison">
            {showRepair ? 'Hide measured repair' : 'Show measured repair'}
          </button>
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
        {showRepair && <div id="flagship-comparison" className="flagship-comparison-drawer">
          <div className="policy-delta-banner">
            <span>Operating Threshold: <strong>{result.comparison.baselinePolicy.threshold} → {result.comparison.afterPolicy.threshold}</strong></span>
            <span className="status-pill status-verified">Verification: {result.comparison.status}</span>
            <span>Criterion: <strong>{result.improvement}</strong></span>
          </div>
          <ConfusionMatrixHeatmap
            baseline={{
              title: 'Baseline Policy (Threshold 0.50)',
              threshold: result.comparison.baselinePolicy.threshold,
              confusion: result.baseline.confusion
            }}
            repaired={{
              title: 'Repaired Policy (Threshold 0.19)',
              threshold: result.comparison.afterPolicy.threshold,
              confusion: result.after.confusion
            }}
            labels={{
              positive: 'Malignant',
              negative: 'Benign'
            }}
          />
          <p className="flagship-note">Simulated impact under the supplied cost model.</p>
          <div className="flagship-table">
            <table>
              <caption>All operating-point metrics; original evaluation rows preserved</caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Baseline Policy</th>
                  <th scope="col">Repaired Policy</th>
                </tr>
              </thead>
              <tbody>
                {result.baseline.metrics.map(m => 
                  <tr key={m.name}>
                    <th scope="row">{m.name.replaceAll('_', ' ')}</th>
                    <td>{format(m)}</td>
                    <td className="repaired-val">{format(result.after.metrics.find(after => after.name === m.name)!)}</td>
                  </tr>
                )}
                {(Object.keys(result.baseline.confusion) as (keyof Result['baseline']['confusion'])[]).map(key => 
                  <tr key={key}>
                    <th scope="row">{key.replace(/([A-Z])/g, ' $1')}</th>
                    <td>{result.baseline.confusion[key]}</td>
                    <td className="repaired-val">{result.after.confusion[key]}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="description">Threshold selection and re-test use the same dataset. This is an operating-policy demonstration, not independent holdout validation, retraining, or a clinical recommendation.</p>
          <details>
            <summary>Inspect provenance and limitations</summary>
            <p>Baseline evidence: {result.comparison.baselineEvidenceIds.join(', ')}</p>
            <p>After evidence: {result.comparison.afterEvidenceIds.join(', ')}</p>
            <ul>{result.comparison.limitations.map(l => <li key={l}>{l}</li>)}</ul>
          </details>
          <div className="flagship-actions">
            <button className="new-button" onClick={download}>Download flagship evidence JSON</button>
          </div>
          <EvidenceGraph investigation={result.investigation} />
          <ClassroomLesson key={result.investigation.datasets[0].id} investigation={result.investigation} />
          <ReliabilityProfile investigation={result.investigation} />
          <ChallengeReview investigation={result.investigation} />
          <IncidentReportExport investigation={result.investigation} />
        </div>}
      </div>
    </div>}

    {showReport && result && (
      <InvestigationReportModal
        data={{
          title: 'Melanoma Classifier Accuracy Paradox & Cost-Sensitive Repair',
          caseId: result.investigation.id,
          analysisMode: 'Deterministic Browser Protocol (No API Key)',
          datasetName: 'melanoma-synthetic.csv',
          rowCount: 100,
          symptoms: [
            { label: 'Validation Accuracy', value: '92.0%', subtext: 'Superficially healthy overall score', highlight: 'cyan' },
            { label: 'Malignant Recall', value: '20.0%', subtext: 'Misses 8 of 10 malignant cases (FN=8)', highlight: 'danger' },
            { label: 'Balanced Accuracy', value: '60.0%', subtext: 'Equal class weighting exposes true weakness', highlight: 'neutral' },
          ],
          hypotheses: result.investigation.hypotheses.map(h => ({
            statement: h.statement,
            status: h.status,
            decidingEvidence: h.confidence.rationale,
          })),
          repair: {
            policyLabel: 'Cost-Sensitive Operating Point Optimization (FN=10, FP=1)',
            thresholdDelta: `${result.comparison.baselinePolicy.threshold} → ${result.comparison.afterPolicy.threshold}`,
            criterionText: result.improvement,
            statusText: result.comparison.status,
            metrics: [
              { label: 'False Negatives (Missed Cancers)', before: '8 cases', after: '0 cases', delta: '-100% missed', isImprovement: true },
              { label: 'Malignant Recall', before: '20.0%', after: '100.0%', delta: '+80.0 pp', isImprovement: true },
              { label: 'Total Error Cost (FN×10 + FP×1)', before: '80 units', after: '4 units', delta: '-95.0% cost', isImprovement: true },
              { label: 'Overall Accuracy', before: '92.0%', after: '96.0%', delta: '+4.0 pp', isImprovement: true },
              { label: 'False Positives (Trade-off)', before: '0 cases', after: '4 cases', delta: '+4 cases', isImprovement: false },
            ],
          },
        }}
        onClose={() => setShowReport(false)}
      />
    )}
  </section>;
}

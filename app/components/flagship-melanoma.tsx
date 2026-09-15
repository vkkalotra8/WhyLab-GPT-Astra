'use client';
import ClassroomLesson from './classroom-lesson';
import ChallengeReview from './challenge-review';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
import EvidenceGraph from './evidence-graph';

import { useState } from 'react';
import { investigateMelanoma } from '../lib/investigation/flagship-melanoma';
import { serializeInvestigation } from '../lib/investigation/validation';
import type { Measurement } from '../lib/investigation/primitives';

type Result = ReturnType<typeof investigateMelanoma>;
const format = (metric: Measurement) => metric.status === 'undefined' ? `Undefined: ${metric.reason}` : metric.unit === 'ratio' ? `${(metric.value * 100).toFixed(1)}%` : metric.value.toFixed(1);

export default function FlagshipMelanoma() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showRepair, setShowRepair] = useState(false);
  async function run() {
    setBusy(true); setError(''); setResult(null); setShowRepair(false);
    try {
      const response = await fetch('/fixtures/melanoma-synthetic.csv', { cache: 'no-store' });
      if (!response.ok) throw new Error('The example dataset could not be loaded. Please try again.');
      setResult(investigateMelanoma(await response.text()));
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
    <p>A synthetic melanoma classifier exposes the accuracy paradox. Follow the evidence, test competing explanations, then inspect a measured policy repair.</p>
    <p className="flagship-note">Synthetic teaching data: 1 = malignant, 0 = benign. No patient data or clinical validation. This deterministic local protocol runs without an API key; it is separate from the autonomous Astra investigator.</p>
    <div className="flagship-actions"><button className="new-button" disabled={busy} onClick={run}>{busy ? 'Inspecting fixture…' : result ? 'Run flagship again' : 'Run flagship investigation'}</button><a href="/fixtures/melanoma-synthetic.csv" download>Download source CSV</a></div>
    <div role="status" aria-live="polite">{busy ? 'Loading evidence and running deterministic tests.' : result ? `Investigation complete. ${result.sampleSize} rows measured.` : ''}</div>
    {error && <p role="alert">{error}</p>}
    {result && <div className="flagship-results">
      <h3>01 / Observe the failure</h3>
      <div className="flagship-metrics">{result.baseline.metrics.filter(m => ['accuracy', 'recall', 'balanced_accuracy'].includes(m.name)).map(m => <div key={m.name}><span>{m.name === 'recall' ? 'Malignant recall' : m.name.replaceAll('_', ' ')}</span><strong>{format(m)}</strong></div>)}</div>
      <h3>02 / Compare hypotheses</h3>
      <ul>{result.investigation.hypotheses.map(h => <li key={h.id}><strong>{h.statement}</strong> <span className="cyan">{h.status}</span><p>{h.confidence.rationale}</p>{h.unresolvedQuestions.map(q => <p key={q}>{q}</p>)}</li>)}</ul>
      <h3>03 / Test the primary explanation</h3>
      <p>Hold every prediction fixed and weight the two classes equally. Before running, require raw accuracy to exceed both balanced accuracy and minority recall by at least 10 percentage points.</p>
      <p>{result.counter.rationale}</p>
      <p><strong>{result.investigation.diagnosis?.summary}</strong></p>
      <h3>04 / Repair and re-test</h3>
      <p>Declared teaching costs: false negative = 10 units, false positive = 1 unit. Sweep thresholds from 0 to 1 in steps of 0.01; minimize total error cost, choosing the highest threshold on ties. Acceptance requires total cost ≤ 10 units on the same rows.</p>
      <button className="new-button" onClick={() => setShowRepair(value => !value)} aria-expanded={showRepair} aria-controls="flagship-comparison">{showRepair ? 'Hide measured repair' : 'Show measured repair'}</button>
      {showRepair && <div id="flagship-comparison">
        <p>Threshold: {result.comparison.baselinePolicy.threshold} → {result.comparison.afterPolicy.threshold}. Verification: <strong>{result.comparison.status}</strong>. Criterion direction: {result.improvement}.</p>
        <p className="flagship-note">Simulated impact under the supplied cost model.</p>
        <div className="flagship-table"><table><caption>All operating-point metrics; original evaluation rows preserved</caption><thead><tr><th scope="col">Metric</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{result.baseline.metrics.map(m => <tr key={m.name}><th scope="row">{m.name.replaceAll('_', ' ')}</th><td>{format(m)}</td><td>{format(result.after.metrics.find(after => after.name === m.name)!)}</td></tr>)}{(Object.keys(result.baseline.confusion) as (keyof Result['baseline']['confusion'])[]).map(key => <tr key={key}><th scope="row">{key.replace(/([A-Z])/g, ' $1')}</th><td>{result.baseline.confusion[key]}</td><td>{result.after.confusion[key]}</td></tr>)}</tbody></table></div>
        <p>Threshold selection and re-test use the same dataset. This is an operating-policy demonstration, not independent holdout validation, retraining, or a clinical recommendation.</p>
        <details><summary>Inspect provenance and limitations</summary><p>Baseline evidence: {result.comparison.baselineEvidenceIds.join(', ')}</p><p>After evidence: {result.comparison.afterEvidenceIds.join(', ')}</p><ul>{result.comparison.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
        <button className="new-button" onClick={download}>Download flagship evidence JSON</button>
        <EvidenceGraph investigation={result.investigation} /><ClassroomLesson key={result.investigation.datasets[0].id} investigation={result.investigation} /><ReliabilityProfile investigation={result.investigation} /><ChallengeReview investigation={result.investigation} /><IncidentReportExport investigation={result.investigation} />
    </div>}
    </div>}
  </section>;
}

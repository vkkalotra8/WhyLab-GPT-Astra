'use client';
import { useMemo, useState } from 'react';
import { buildReliabilityProfile } from '../lib/investigation/reliability-profile';
import type { Investigation } from '../lib/investigation/types';

export default function ReliabilityProfile({ investigation }: { investigation: Investigation }) {
  const profile = useMemo(() => buildReliabilityProfile(investigation), [investigation]);
  const [dataset, setDataset] = useState('all');
  return <section className="reliability-profile"><h3>Reliability profile</h3><p>{profile.explanation}</p><label>Reliability dataset scope<select value={dataset} onChange={e => setDataset(e.target.value)}><option value="all">All datasets (kept separate)</option>{investigation.datasets.map(d => <option key={d.id} value={d.id}>{d.name} — {d.id}</option>)}</select></label>
    {profile.components.map(c => {
      const readings = c.readings.filter(r => dataset === 'all' || r.datasetIds.some(id => id === dataset));
      const findings = c.findings.filter(r => dataset === 'all' || r.datasetIds.some(id => id === dataset));
      const checks = c.checks.filter(r => dataset === 'all' || r.datasetId === dataset);
      const results = investigation.toolResults.filter(r => c.resultIds.includes(r.id) && (dataset === 'all' || r.datasetIds.some(id => id === dataset)));
      const status = readings.some(r => r.measurement.status === 'measured') ? 'Measurements available' : results.length ? 'No defined measurements' : checks.length ? 'Recorded criterion only' : 'Not assessed';
      return <article key={c.id}><h4>{c.title} · {status}</h4><p>{c.limitation}</p>
        {!results.length && !checks.length && <p>No applicable completed measurements are recorded for this scope.</p>}
        <details><summary>Inspect {c.title.toLowerCase()} evidence ({readings.length} readings)</summary>
          {readings.map((r, i) => <div key={`${r.resultId}-${i}`}><p><strong>{r.measurement.name.replaceAll('_', ' ')}</strong>: {r.measurement.status === 'measured' ? `${r.measurement.value} ${r.measurement.unit}; n=${r.measurement.sampleSize}` : `Undefined: ${r.measurement.reason}`}</p><p>{r.scope}</p><p>Datasets: {r.datasetIds.join(', ')} · Result: {r.resultId} · Call: {r.callId} · Evidence: {r.evidenceIds.join(', ') || 'No separate evidence record'}</p></div>)}
          {findings.map((f, i) => <p key={i}>{f.classification}: {f.description} · Result: {f.resultId} · Evidence: {f.evidenceIds.join(', ') || 'No separate evidence record'}</p>)}
          {checks.map(check => <div key={check.id}><p>Declared cost criterion: {check.criterion.operator} {check.criterion.value} {check.criterion.unit} · {check.status}</p><p>Comparison {check.id} · Baseline: {check.baselineEvidenceIds.join(', ')} · After: {check.afterEvidenceIds.join(', ')}</p></div>)}
          {results.length > 0 && <details><summary>Original tool records, configuration and limitations</summary><pre>{JSON.stringify({ calls: investigation.toolCalls.filter(call => results.some(r => r.callId === call.id)), results }, null, 2)}</pre></details>}
        </details></article>;
    })}
  </section>;
}

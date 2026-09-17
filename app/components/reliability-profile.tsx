'use client';
import { useMemo, useState } from 'react';
import { buildReliabilityProfile } from '../lib/investigation/reliability-profile';
import type { Investigation } from '../lib/investigation/types';

export default function ReliabilityProfile({ investigation }: { investigation: Investigation }) {
  const profile = useMemo(() => buildReliabilityProfile(investigation), [investigation]);
  const [dataset, setDataset] = useState('all');
  const cs = profile.compositeScore;

  return (
    <section className="reliability-profile" id="reliability-lab">
      <div className="section-header-row">
        <div>
          <h3>WhyLab Reliability Score</h3>
          <p className="description">{profile.explanation}</p>
        </div>
        <label className="dataset-filter-label">
          Scope:
          <select value={dataset} onChange={e => setDataset(e.target.value)}>
            <option value="all">All datasets</option>
            {investigation.datasets.map(d => (
              <option key={d.id} value={d.id}>{d.name} — {d.id}</option>
            ))}
          </select>
        </label>
      </div>

      {cs && (
        <div className="reliability-score-dashboard">
          <div className="score-hero-card">
            <div className="score-main-gauge">
              <span className="score-pre-title">OVERALL RELIABILITY INDEX</span>
              <div className="score-number-row">
                <span className="score-big">{cs.score}</span>
                <span className="score-denom">/ 100</span>
                <span className={`risk-badge ${cs.riskBand === 'LOW RISK / RELIABLE' ? 'risk-low' : cs.riskBand === 'MODERATE RISK' ? 'risk-mod' : 'risk-high'}`}>
                  {cs.riskBand}
                </span>
              </div>
            </div>

            {cs.afterRepairScore !== null && (
              <div className="score-repair-comparison">
                <div className="repair-badge-header">
                  <span className="badge-tag">AFTER REPAIR DELTA</span>
                  <span className="improvement-callout">+{cs.scoreDelta} pts</span>
                </div>
                <div className="score-transition-display">
                  <span className="score-before">{cs.score}</span>
                  <span className="score-arrow">→</span>
                  <span className="score-after">{cs.afterRepairScore}</span>
                  <span className="score-after-denom">/ 100</span>
                  <span className="risk-badge risk-low">{cs.afterRepairRiskBand}</span>
                </div>
                <p className="repair-impact-note">
                  Operating policy re-calibrated under declared objective. Minority recall safely recovered without full model retraining.
                </p>
              </div>
            )}
          </div>

          <div className="sub-scores-grid">
            {cs.subScores.map(s => (
              <div key={s.id} className="sub-score-card">
                <div className="sub-score-top">
                  <span className="sub-score-title">{s.title}</span>
                  <span className="sub-score-val">{s.score} <small>/ 100</small></span>
                </div>
                <div className="sub-score-bar-bg">
                  <div
                    className={`sub-score-bar-fill ${s.score < 40 ? 'bar-critical' : s.score < 70 ? 'bar-warning' : 'bar-good'}`}
                    style={{ width: `${s.score}%` }}
                  />
                </div>
                <div className="sub-score-meta">
                  <small>Weight: {Math.round(s.weight * 100)}% · {s.availability}</small>
                </div>
              </div>
            ))}
          </div>

          <details className="score-formula-details">
            <summary>Score Methodology, Weights & Formal Assumptions</summary>
            <div className="formula-card">
              <p><strong>Aggregation Formula:</strong> {cs.formula}</p>
              <p className="provenance-note">
                <strong>Provenance Guarantee:</strong> Every sub-score maps directly to verifiable deterministic measurements. Simulated baseline proxies are strictly labeled and never confused with empirical findings.
              </p>
            </div>
          </details>
        </div>
      )}

      <div className="raw-evidence-breakdown">
        <h4>Diagnostic Dimension Evidence ({profile.components.length} dimensions)</h4>
        {profile.components.map(c => {
          const readings = c.readings.filter(r => dataset === 'all' || r.datasetIds.some(id => id === dataset));
          const findings = c.findings.filter(r => dataset === 'all' || r.datasetIds.some(id => id === dataset));
          const checks = c.checks.filter(r => dataset === 'all' || r.datasetId === dataset);
          const results = investigation.toolResults.filter(r => c.resultIds.includes(r.id) && (dataset === 'all' || r.datasetIds.some(id => id === dataset)));
          const status = readings.some(r => r.measurement.status === 'measured') ? 'Measurements available' : results.length ? 'No defined measurements' : checks.length ? 'Recorded criterion only' : 'Not assessed';
          return (
            <article key={c.id} className="dimension-evidence-card">
              <div className="dimension-header">
                <h4>{c.title} · {status}</h4>
                <span className="status-pill">{status}</span>
              </div>
              <p className="dimension-limitation">{c.limitation}</p>
              {!results.length && !checks.length && (
                <p className="no-data-note">No applicable completed measurements recorded for this scope.</p>
              )}
              <details>
                <summary>Inspect {c.title.toLowerCase()} evidence ({readings.length} readings)</summary>
                {readings.map((r, i) => (
                  <div key={`${r.resultId}-${i}`} className="reading-item">
                    <p><strong>{r.measurement.name.replaceAll('_', ' ')}</strong>: {r.measurement.status === 'measured' ? `${r.measurement.value} ${r.measurement.unit}; n=${r.measurement.sampleSize}` : `Undefined: ${r.measurement.reason}`}</p>
                    <p className="scope-note">{r.scope}</p>
                    <small>Datasets: {r.datasetIds.join(', ')} · Result: {r.resultId} · Call: {r.callId} · Evidence: {r.evidenceIds.join(', ') || 'None'}</small>
                  </div>
                ))}
                {findings.map((f, i) => (
                  <p key={i} className="finding-item">{f.classification}: {f.description} · Result: {f.resultId}</p>
                ))}
                {checks.map(check => (
                  <div key={check.id} className="check-item">
                    <p>Declared cost criterion: {check.criterion.operator} {check.criterion.value} {check.criterion.unit} · <strong>{check.status}</strong></p>
                    <small>Comparison {check.id}</small>
                  </div>
                ))}
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}


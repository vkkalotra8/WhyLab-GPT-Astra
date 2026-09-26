'use client';
import { useState } from 'react';
import { challengeInvestigation, runAdversarialChallenge } from '../lib/investigation/challenge-review';
import type { Investigation } from '../lib/investigation/types';
import type { EvaluationDataset } from '../lib/investigation/evaluation-ingestion';

export default function ChallengeReview({ investigation, datasets = [], onUpdate }: { investigation: Investigation; datasets?: EvaluationDataset[]; onUpdate?: (value: Investigation) => void }) {
  const [review, setReview] = useState<ReturnType<typeof challengeInvestigation> | null>(null);
  const [error, setError] = useState('');
  const [adversarial, setAdversarial] = useState<{ selectedTool: string; rationale: string; executed: boolean } | null>(null);
  // A replaced investigation invalidates its previous review even when IDs are reused.
  const active = review?.investigation.updatedAt === investigation.updatedAt && JSON.stringify(review.investigation) === JSON.stringify(investigation) ? review : null;

  function run() { try { setReview(challengeInvestigation(investigation)); setError(''); } catch { setError('The investigation failed validation; no review was generated.'); } }
  function runAdversarial() { try { const result = runAdversarialChallenge(investigation, datasets); setAdversarial(result); if (result.executed) { onUpdate?.(result.investigation); setReview(challengeInvestigation(result.investigation)); } setError(''); } catch { setError('The adversarial diagnostic could not be executed; the original investigation was preserved.'); } }
  function download() { if (!active) return; const url = URL.createObjectURL(new Blob([JSON.stringify(active, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'whylab-challenge-review.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

  const primaryHypo = investigation.hypotheses.find(h => h.id === investigation.diagnosis?.primaryHypothesisId) || investigation.hypotheses[0];
  const allDatasetNames = Array.from(new Set([...investigation.datasets.map(d => d.name), ...datasets.map(d => d.metadata.name)]));

  return (
    <section className="challenge-review">
      <div className="section-header">
        <span className="eyebrow cyan">ADVERSARIAL STRESS-TEST</span>
        <h3>Challenge WhyLab</h3>
      </div>
      <p>
        Review recorded alternatives, opposing evidence, assumptions and untested hypotheses. The adversarial pass can run one additional bounded diagnostic against retained evaluation data; it does not alter the original diagnosis or hypothesis statuses.
      </p>

      {allDatasetNames.length > 1 && (
        <div className="multi-dataset-banner" style={{ background: 'rgba(86, 223, 206, 0.06)', border: '1px solid rgba(86, 223, 206, 0.2)', borderRadius: '6px', padding: '0.6rem 0.8rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <strong style={{ color: 'var(--cyan, #56dfce)' }}>Multi-Dataset Scope ({allDatasetNames.length} splits registered):</strong>{' '}
          <span style={{ color: 'var(--text-secondary, #94a1b4)' }}>{allDatasetNames.join(' · ')}</span>
        </div>
      )}

      <div className="flagship-actions">
        <button type="button" className="new-button" onClick={run}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {active ? 'Review challenge again' : 'Challenge this investigation'}
        </button>
        {datasets.length > 0 && (
          <button type="button" onClick={runAdversarial}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {datasets.length > 1 ? 'Run adversarial multi-dataset check' : 'Run adversarial diagnostic'}
          </button>
        )}
      </div>

      {adversarial && <p role="status">{adversarial.executed ? `Ran ${adversarial.selectedTool}. ${adversarial.rationale}` : adversarial.rationale}</p>}
      {error && <p role="alert">{error}</p>}

      {active && (
        <div>
          {primaryHypo && (
            <div className="challenge-primary-card" style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border, #283443)', borderRadius: '6px', padding: '0.8rem 1rem', marginTop: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--cyan, #56dfce)' }}>PRIMARY HYPOTHESIS UNDER REVIEW</span>
                <span className="badge" style={{ fontSize: '0.7rem' }}>{primaryHypo.status}</span>
              </div>
              <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary, #f1f5f9)' }}>{primaryHypo.statement}</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a1b4)', marginTop: '0.3rem' }}>
                Original confidence: <code>{primaryHypo.confidence.level}</code> · Provenance: {primaryHypo.confidence.rationale}
              </div>
            </div>
          )}

          {active.confidenceShift && (
            <div className="adversarial-confidence-banner">
              <div className="confidence-banner-top">
                <span className="badge-tag">ADVERSARIAL REVIEW STATUS</span>
                <span className={`confidence-shift-badge ${active.confidenceShift.status === 'increased' ? 'shift-up' : active.confidenceShift.status === 'decreased' ? 'shift-down' : 'shift-neutral'}`}>
                  Confidence: {active.confidenceShift.initialPercentage}% → {active.confidenceShift.reviewedPercentage}%
                </span>
              </div>
              <p className="confidence-verdict-lead">
                <strong>Adversarial Verdict:</strong> {active.confidenceShift.verdict}
              </p>
            </div>
          )}

          {active.canonicalAlternatives && (
            <div className="canonical-alternatives-section">
              <h4>Alternative Failure Causes Evaluated</h4>
              <div className="alternatives-grid">
                {active.canonicalAlternatives.map(alt => (
                  <div key={alt.cause} className="alternative-cause-card">
                    <div className="cause-header">
                      <strong>{alt.cause}</strong>
                      <span className={`status-pill pill-${alt.status}`}>
                        {alt.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="cause-summary">{alt.evidenceSummary}</p>
                    <small className="cause-impact">
                      {alt.impactOnDiagnosis === 'supports_primary' ? '✓ Corroborates primary root cause' :
                       alt.impactOnDiagnosis === 'eliminates_alternative' ? '✓ Eliminated by evidence' :
                       '⚠ Unresolved boundary'}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active.multiDatasetComparisons && active.multiDatasetComparisons.length > 0 && (
            <div className="canonical-alternatives-section" style={{ marginTop: '1.2rem' }}>
              <h4>Multi-Dataset Empirical Comparisons</h4>
              <div className="alternatives-grid">
                {active.multiDatasetComparisons.map(comp => (
                  <div key={comp.pair + comp.evaluationType} className="alternative-cause-card">
                    <div className="cause-header">
                      <strong>{comp.pair}</strong>
                      <span className={`status-pill pill-${comp.status}`}>
                        {comp.evaluationType.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="cause-summary">{comp.summary}</p>
                    <small className="cause-impact">
                      {comp.metric}: <strong>{comp.value !== null ? comp.value : 'N/A'}</strong>
                    </small>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p role="status">Review complete: {active.findings.length} findings. {active.assessments.filter(a => a.reduced).length} hypothesis confidence reductions.</p>
          <p>Diagnosis evidence strength: {active.diagnosisConfidence.original ?? 'Not recorded'} → {active.diagnosisConfidence.reviewed ?? 'Not recorded'} (reviewed assessment).</p>
          {active.assessments.map(a => <article key={a.hypothesisId}><h4>{a.hypothesisId}</h4><p>{a.originalLevel} → {a.reviewedLevel} · {a.reduced ? 'Reduced' : 'Not increased'}</p><p>Original status: {a.status}</p><ul>{a.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></article>)}
          {active.findings.length ? <ul>{active.findings.map((f, i) => <li key={i}><strong>{f.category}</strong>: {f.explanation}<p>References: {f.entityIds.join(', ')}</p><p>Next check: {f.nextStep}</p></li>)}</ul> : <p>No rule-triggered concerns found. This does not certify the investigation.</p>}
          <details><summary>Review rules and limitations</summary><p>Opposing evidence or missing supporting verification caps strength at limited. Unresolved questions cap it at moderate. Review never increases the original strength. Diagnosis strength is capped by its primary hypothesis, or limited when none is recorded.</p><ul>{active.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
          <div className="flagship-actions">
            <button type="button" onClick={download}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export challenge review JSON
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

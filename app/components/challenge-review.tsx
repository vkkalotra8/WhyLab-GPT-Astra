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
  return <section className="challenge-review"><h3>Challenge WhyLab</h3><p>Review recorded alternatives, opposing evidence, assumptions and untested hypotheses. The adversarial pass can run one additional bounded diagnostic against retained evaluation data; it does not alter the original diagnosis or hypothesis statuses.</p><div className="flagship-actions"><button onClick={run}>{active ? 'Review challenge again' : 'Challenge this investigation'}</button>{datasets.length > 0 && <button onClick={runAdversarial}>Run adversarial diagnostic</button>}</div>{adversarial && <p role="status">{adversarial.executed ? `Ran ${adversarial.selectedTool}. ${adversarial.rationale}` : adversarial.rationale}</p>}{error && <p role="alert">{error}</p>}
    {active && <div><p role="status">Review complete: {active.findings.length} findings. {active.assessments.filter(a => a.reduced).length} hypothesis confidence reductions.</p><p>Diagnosis evidence strength: {active.diagnosisConfidence.original ?? 'Not recorded'} → {active.diagnosisConfidence.reviewed ?? 'Not recorded'} (reviewed assessment).</p>
      {active.assessments.map(a => <article key={a.hypothesisId}><h4>{a.hypothesisId}</h4><p>{a.originalLevel} → {a.reviewedLevel} · {a.reduced ? 'Reduced' : 'Not increased'}</p><p>Original status: {a.status}</p><ul>{a.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></article>)}
      {active.findings.length ? <ul>{active.findings.map((f, i) => <li key={i}><strong>{f.category}</strong>: {f.explanation}<p>References: {f.entityIds.join(', ')}</p><p>Next check: {f.nextStep}</p></li>)}</ul> : <p>No rule-triggered concerns found. This does not certify the investigation.</p>}
      <details><summary>Review rules and limitations</summary><p>Opposing evidence or missing supporting verification caps strength at limited. Unresolved questions cap it at moderate. Review never increases the original strength. Diagnosis strength is capped by its primary hypothesis, or limited when none is recorded.</p><ul>{active.limitations.map(l => <li key={l}>{l}</li>)}</ul></details><button onClick={download}>Export challenge review JSON</button>
    </div>}
  </section>;
}

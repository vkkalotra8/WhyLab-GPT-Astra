import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';

const levels = ['unassessed', 'limited', 'moderate', 'strong'] as const;
type Level = typeof levels[number];
export type ChallengeFinding = { category: 'alternative' | 'contradiction' | 'assumption' | 'verification'; entityIds: string[]; explanation: string; nextStep: string };
/** A deterministic second pass over recorded evidence, not another model opinion. */
export function challengeInvestigation(value: Investigation) {
  const v = validateInvestigation(value);
  const findings: ChallengeFinding[] = [];
  const assessments = v.hypotheses.map(h => {
    const experiments = v.experiments.filter(e => e.hypothesisId === h.id);
    const counterEvidence = h.evidence.filter(e => e.relationship !== 'supports');
    const counterTests = experiments.filter(e => e.status === 'completed' && ['weakens', 'rejects'].includes(e.outcome ?? ''));
    const supporting = experiments.some(e => e.status === 'completed' && e.outcome === 'supports');
    let cap: Level = 'strong';
    const reasons: string[] = [];
    if (counterEvidence.length || counterTests.length) {
      cap = 'limited'; reasons.push('Recorded counter-evidence or counter-test outcomes require reconciliation.');
      findings.push({ category: 'contradiction', entityIds: [h.id, ...counterEvidence.map(e => e.evidenceId), ...counterTests.map(e => e.id)], explanation: reasons.at(-1)!, nextStep: 'Reconcile supporting and opposing evidence under matching dataset and policy scopes before relying on this hypothesis.' });
    }
    if (!supporting && h.status !== 'rejected') {
      cap = 'limited'; reasons.push('No completed supporting verification experiment is recorded.');
      findings.push({ category: 'verification', entityIds: [h.id, ...experiments.map(e => e.id)], explanation: reasons.at(-1)!, nextStep: 'Declare a falsifiable prediction and acceptance criterion, then execute a test with linked measured evidence.' });
    }
    if (h.unresolvedQuestions.length && h.status !== 'rejected') {
      findings.push({ category: 'alternative', entityIds: [h.id], explanation: 'This hypothesis retains unresolved questions: ' + h.unresolvedQuestions.join(' '), nextStep: 'Gather evidence addressing these questions; unresolved does not mean disproved.' });
      if (cap === 'strong') { cap = 'moderate'; reasons.push('Unresolved questions limit the scope of the conclusion.'); }
    }
    const reviewed = levels[Math.min(levels.indexOf(h.confidence.level), levels.indexOf(cap))];
    return { hypothesisId: h.id, originalLevel: h.confidence.level, reviewedLevel: reviewed, reduced: reviewed !== h.confidence.level, reasons, status: h.status };
  });
  for (const e of v.evidence.filter(e => e.kind === 'assumption')) findings.push({ category: 'assumption', entityIds: [e.id], explanation: 'Declared assumption is not a measured fact: ' + e.description, nextStep: 'Validate the assumption with stakeholders and test sensitivity to plausible alternative values.' });
  for (const c of v.comparisons) findings.push({ category: 'verification', entityIds: [c.id, c.repairId, ...c.baselineEvidenceIds, ...c.afterEvidenceIds], explanation: `Recorded repair comparison is ${c.status}; evaluation evidence does not establish independent holdout performance.`, nextStep: 'Repeat the fixed acceptance criterion on independent evaluation data before operational adoption.' });
  const diagnosis = v.diagnosis;
  let reviewedDiagnosis: Level | null = diagnosis?.confidence.level ?? null;
  if (diagnosis) {
    const primary = assessments.find(h => h.hypothesisId === diagnosis.primaryHypothesisId);
    const cap: Level = primary?.reviewedLevel ?? 'limited';
    reviewedDiagnosis = levels[Math.min(levels.indexOf(diagnosis.confidence.level), levels.indexOf(cap))];
  }
  return { reviewVersion: 1, investigationId: v.id, method: 'recorded_evidence_review_v1', findings, assessments,
    diagnosisConfidence: { original: diagnosis?.confidence.level ?? null, reviewed: reviewedDiagnosis, reduced: diagnosis ? reviewedDiagnosis !== diagnosis.confidence.level : false },
    limitations: ['Deterministic review of recorded relationships and test outcomes only; no new experiment was executed.', 'Evidence-strength caps are conservative review rules, not probabilities or statistical confidence intervals.', 'Unlinked contradictions and unrecorded alternative explanations cannot be detected by this pass.', 'Original hypothesis statuses, confidence and investigation records are preserved. Reviewed confidence is a separate assessment.'],
    investigation: v };
}

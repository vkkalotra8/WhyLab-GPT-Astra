import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { createId } from './primitives.ts';
import { executeDiagnostic } from './tool-registry.ts';
import { diagnosticToolCallSchema } from './tool-contracts.ts';

const levels = ['unassessed', 'limited', 'moderate', 'strong'] as const;
type Level = typeof levels[number];
export type ChallengeFinding = { category: 'alternative' | 'contradiction' | 'assumption' | 'verification'; entityIds: string[]; explanation: string; nextStep: string };
export type AdversarialChallenge = { investigation: Investigation; selectedTool: string; rationale: string; executed: boolean };

/**
 * Run one bounded, deterministic adversarial check against the retained datasets.
 * The selector only chooses an allowlisted diagnostic that has not already run;
 * all numerical work is performed by the canonical registry and appended to the
 * same evidence history. It never changes hypotheses or promotes a diagnosis.
 */
export function runAdversarialChallenge(value: Investigation, datasets: readonly EvaluationDataset[]): AdversarialChallenge {
  const v = validateInvestigation(value);
  if (!datasets.length) return { investigation: v, selectedTool: 'none', rationale: 'No original evaluation dataset is available to run an additional challenge.', executed: false };
  const available = new Map(datasets.map(dataset => [dataset.metadata.id, dataset]));
  const primary = datasets[0];
  const completed = new Set(v.toolResults.map(result => result.tool));
  const target = primary.metadata.targetColumn ?? 'y_true';
  const positiveLabel = primary.labels.positive;
  let tool: 'compute_classification_metrics'|'scan_feature_leakage'|'profile_dataset'|'run_drift_tests';
  let input: Record<string, unknown>;
  let rationale = '';
  if (datasets.length > 1 && !completed.has('run_drift_tests')) {
    const comparison = datasets[1];
    const columns = primary.metadata.columns.filter(column => comparison.metadata.columns.includes(column) && !['y_true','y_pred','y_probability'].includes(column)).slice(0, 10);
    if (columns.length) { tool = 'run_drift_tests'; input = { referenceDatasetId: primary.metadata.id, comparisonDatasetId: comparison.metadata.id, columns, method: 'psi', bins: 5 }; rationale = 'Challenge the recorded conclusion with a distribution-shift check across the first two retained datasets.'; }
    else tool = 'profile_dataset';
  } else if (!completed.has('scan_feature_leakage')) {
    const features = primary.metadata.columns.filter(column => !['y_true','y_pred','y_probability'].includes(column)).slice(0, 10);
    if (features.length) { tool = 'scan_feature_leakage'; input = { datasetId: primary.metadata.id, targetColumn: target, featureColumns: features, predictionTimeColumn: null, outcomeTimeColumn: null, assumptionEvidenceIds: [] }; rationale = 'Challenge the conclusion by screening retained features for target-copy and availability signals.'; }
    else tool = 'compute_classification_metrics';
  } else if (!completed.has('compute_classification_metrics')) tool = 'compute_classification_metrics';
  else if (!completed.has('profile_dataset')) tool = 'profile_dataset';
  else return { investigation: v, selectedTool: 'none', rationale: 'Every bounded challenge diagnostic is already recorded for the retained dataset scope.', executed: false };
  if (!input!) {
    input = tool === 'compute_classification_metrics' ? { datasetId: primary.metadata.id, positiveLabel } : { datasetId: primary.metadata.id, targetColumn: primary.metadata.targetColumn };
    rationale = tool === 'compute_classification_metrics' ? 'Challenge the conclusion with an independently re-executed classification metric result.' : 'Challenge the conclusion with a fresh descriptive dataset profile.';
  }
  const at = new Date().toISOString();
  const call = diagnosticToolCallSchema.parse({ id: createId('call'), investigationId: v.id, tool, toolVersion: 1, requestedAt: at, input });
  const execution = executeDiagnostic(call, available);
  const updatedAt = new Date().toISOString();
  const updated = validateInvestigation({ ...v, updatedAt, toolCalls: [...v.toolCalls, call], toolResults: [...v.toolResults, execution.result], evidence: [...v.evidence, ...execution.evidence], events: [...v.events,
    { id: createId('event'), sequence: v.events.length, at, kind: 'tool_requested', entityId: call.id, message: 'Adversarial challenge diagnostic requested.' },
    { id: createId('event'), sequence: v.events.length + 1, at: updatedAt, kind: 'tool_completed', entityId: execution.result.id, message: 'Adversarial challenge diagnostic completed.' }] });
  return { investigation: updated, selectedTool: tool, rationale, executed: true };
}
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
    limitations: ['This review evaluates recorded relationships and test outcomes only; use the separate adversarial diagnostic action to execute one additional deterministic check.', 'Evidence-strength caps are conservative review rules, not probabilities or statistical confidence intervals.', 'Unlinked contradictions and unrecorded alternative explanations cannot be detected by this pass.', 'Original hypothesis statuses, confidence and investigation records are preserved. Reviewed confidence is a separate assessment.'],
    investigation: v };
}

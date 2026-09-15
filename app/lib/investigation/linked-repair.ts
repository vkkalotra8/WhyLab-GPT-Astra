import { createId } from './primitives.ts';
import { validateInvestigation } from './validation.ts';
import { profileEvaluationDataset } from './dataset-profiler.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import type { Investigation } from './types.ts';
import { validateRepairLabInput, type RepairLabInput } from './repair-lab.ts';
import { runThresholdSweep } from './threshold-sweep.ts';
import { generateRepairCandidate } from './repair-candidates.ts';

/** Append policy investigation to an existing diagnosis without replacing its history. */
export function prepareLinkedRepair(value: RepairLabInput, parent: Investigation, dataset: EvaluationDataset) {
  const input = validateRepairLabInput(value), v = validateInvestigation(parent);
  profileEvaluationDataset(dataset);
  if (!v.datasets.some(d => JSON.stringify(d) === JSON.stringify(dataset.metadata))) throw new Error('Repair data must match a registered investigation dataset.');
  if (dataset.rows.some(r => r.predicted !== (r.positiveProbability >= input.baselineThreshold ? dataset.labels.positive : dataset.labels.negative))) throw new Error('Baseline threshold must reproduce the original predictions.');
  const at = new Date().toISOString(), sourceId = createId('source'), assumptionId = createId('evidence'), evidenceId = createId('evidence'), callId = createId('call'), resultId = createId('result'), hypothesisId = createId('hypothesis');
  const costs = { falseNegativeCost: input.falseNegativeCost, falsePositiveCost: input.falsePositiveCost, assumptionEvidenceId: assumptionId };
  const assumption = { id: assumptionId, kind: 'assumption' as const, description: `User repair objective: ${input.objective.slice(0,3000)}. FN cost ${input.falseNegativeCost}; FP cost ${input.falsePositiveCost}.`, measurements: [], provenance: { kind: 'source' as const, sourceId, datasetId: null, rows: null, columns: [] } };
  const args = { datasetId: dataset.metadata.id, positiveLabel: dataset.labels.positive, thresholds: [...new Set([...Array.from({ length: 101 }, (_, i) => i / 100), input.baselineThreshold])], costs };
  const sweep = runThresholdSweep(dataset, args, [assumption]);
  const updated = validateInvestigation({ ...v, updatedAt: at,
    sources: [...v.sources, { id: sourceId, kind: 'user_assumption', name: 'Repair cost policy', capturedAt: at, contentDigest: null }],
    evidence: [...v.evidence, assumption, { id: evidenceId, kind: 'observation', description: 'Measured policy candidates for this investigation dataset.', measurements: [], provenance: { kind: 'tool_result', resultId } }],
    toolCalls: [...v.toolCalls, { id: callId, investigationId: v.id, tool: 'threshold_sweep', toolVersion: 1, requestedAt: at, input: args }],
    toolResults: [...v.toolResults, { id: resultId, callId, tool: 'threshold_sweep', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: [evidenceId], limitations: sweep.limitations, status: 'completed', output: sweep.output }],
    hypotheses: [...v.hypotheses, { id: hypothesisId, statement: 'An operating-policy change may meet the declared cost criterion.', status: 'proposed', confidence: { kind: 'evidence_strength', level: 'unassessed', rationale: 'Policy optimization does not confirm the original causal diagnosis.' }, evidence: [{ evidenceId, relationship: 'supports', rationale: 'Measured sweep provides candidates to test.' }], unresolvedQuestions: ['Independent holdout performance remains unknown.'] }],
    diagnosis: v.diagnosis ? { ...v.diagnosis, evidenceIds: [...v.diagnosis.evidenceIds, assumptionId, evidenceId], hypothesisIds: [...v.diagnosis.hypothesisIds, hypothesisId] } : null });
  const proposal = generateRepairCandidate(updated, { datasetId: dataset.metadata.id, hypothesisId, sweepResultId: resultId, criterion: { metric: 'expected_cost', operator: 'at_most', value: input.maximumCost, unit: 'cost' } });
  const candidate = proposal.candidate;
  const investigation = validateInvestigation({ ...updated, repairs: [...updated.repairs, ...(candidate ? [candidate] : [])], diagnosis: updated.diagnosis && candidate ? { ...updated.diagnosis, repairIds: [...updated.diagnosis.repairIds, candidate.id] } : updated.diagnosis });
  return { input, dataset: structuredClone(dataset), investigation, proposal, baseline: sweep.output.points.find(p => p.threshold === input.baselineThreshold)!, suggested: candidate?.kind === 'operating_policy' ? sweep.output.points.find(p => p.threshold === candidate.policy.threshold)! : null };
}
/** Provider repair endpoint accepts 1/0 labels; normalize only its evaluation copy. */
export function repairCsv(dataset: EvaluationDataset) {
  return 'y_true,y_pred,y_probability\n' + dataset.rows.map(r => `${r.actual === dataset.labels.positive ? 1 : 0},${r.predicted === dataset.labels.positive ? 1 : 0},${r.positiveProbability}`).join('\n');
}

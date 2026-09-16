import { object, text, number, type Infer } from './schema.ts';
import { ingestEvaluationCsv } from './evaluation-ingestion.ts';
import { array } from './schema.ts';
import { runThresholdSweep } from './threshold-sweep.ts';
import { generateRepairCandidate } from './repair-candidates.ts';
import { reevaluateRepair } from './repair-reevaluation.ts';
import { validateInvestigation } from './validation.ts';

export const repairLabSchema = object({ csv: text, objective: text, falseNegativeCost: number(0, 1000000), falsePositiveCost: number(0, 1000000), maximumCost: number(0, 10000000000), baselineThreshold: number(0, 1) });
export const repairPolicyProposalSchema = object({ falseNegativeCost: number(0, 1000000), falsePositiveCost: number(0, 1000000), maximumCost: number(0, 10000000000), rationale: text, assumptions: array(text, 1, 6) });
export type RepairPolicyProposal = Infer<typeof repairPolicyProposalSchema>;
export type RepairLabInput = Infer<typeof repairLabSchema>;
// CSV has a separate byte bound; canonical text intentionally has a smaller limit.
export function validateRepairLabInput(value: unknown): RepairLabInput {
  if (!value || typeof value !== 'object' || !('csv' in value) || typeof value.csv !== 'string' || new TextEncoder().encode(value.csv).length > 2000000) throw new Error('Provide an evaluation CSV up to 2 MB.');
  const checked = repairLabSchema.parse({ ...value, csv: 'validated separately' });
  if (!value.csv.trim()) throw new Error('Provide evaluation rows.');
  if (checked.falseNegativeCost + checked.falsePositiveCost === 0) throw new Error('At least one error cost must be positive.');
  return { ...checked, csv: value.csv };
}
export function validateRepairPolicyRequest(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Provide a policy request.');
  const record=value as Record<string,unknown>;
  if(Object.keys(record).some(key=>!['csv','objective','baselineThreshold'].includes(key)))throw new Error('Unknown policy request field.');
  return validateRepairLabInput({ ...record, falseNegativeCost:1, falsePositiveCost:1, maximumCost:10000000000 });
}
export function validateRepairPolicyProposal(value: unknown): RepairPolicyProposal {
  const proposal=repairPolicyProposalSchema.parse(value);
  if(proposal.falseNegativeCost+proposal.falsePositiveCost===0)throw new Error('At least one proposed error cost must be positive.');
  return proposal;
}
export function prepareRepair(value: RepairLabInput) {
  const input = validateRepairLabInput(value);
  const dataset = ingestEvaluationCsv(input.csv, 'repair-evaluation.csv');
  if (dataset.rows.some(r => r.predicted !== ((r.positiveProbability ?? -1) >= input.baselineThreshold ? '1' : '0'))) throw new Error('Baseline threshold must reproduce the supplied predictions.');
  const at = new Date().toISOString();
  const costs = { falseNegativeCost: input.falseNegativeCost, falsePositiveCost: input.falsePositiveCost, assumptionEvidenceId: 'evidence_repair_cost' as const };
  const assumption = { id: costs.assumptionEvidenceId, kind: 'assumption' as const, description: `User objective: ${input.objective.slice(0, 3000)}. Declared costs: FN ${input.falseNegativeCost}; FP ${input.falsePositiveCost}.`, measurements: [], provenance: { kind: 'source' as const, sourceId: 'source_repair_cost' as const, datasetId: null, rows: null, columns: [] } };
  const sweepInput = { datasetId: dataset.metadata.id, positiveLabel: '1', thresholds: [...new Set([...Array.from({ length: 101 }, (_, i) => i / 100), input.baselineThreshold])], costs };
  const sweep = runThresholdSweep(dataset, sweepInput, [assumption]);
  const investigation = validateInvestigation({ schemaVersion: 1, id: 'investigation_repair_lab', objective: input.objective, status: 'running', createdAt: at, updatedAt: at,
    sources: [dataset.source, { id: 'source_repair_cost', kind: 'user_assumption', name: 'Repair Lab cost policy', capturedAt: at, contentDigest: null }], datasets: [dataset.metadata],
    evidence: [assumption, { id: 'evidence_repair_sweep', kind: 'observation', description: 'Measured candidate operating points under the declared policy.', measurements: [], provenance: { kind: 'tool_result', resultId: 'result_repair_sweep' } }],
    toolCalls: [{ id: 'call_repair_sweep', investigationId: 'investigation_repair_lab', tool: 'threshold_sweep', toolVersion: 1, requestedAt: at, input: sweepInput }],
    toolResults: [{ id: 'result_repair_sweep', callId: 'call_repair_sweep', tool: 'threshold_sweep', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: ['evidence_repair_sweep'], limitations: sweep.limitations, status: 'completed', output: sweep.output }],
    hypotheses: [{ id: 'hypothesis_repair_policy', statement: 'A different operating threshold may meet the declared cost target.', status: 'proposed', confidence: { kind: 'evidence_strength', level: 'unassessed', rationale: 'Operating-policy optimization does not establish a training cause.' }, evidence: [{ evidenceId: 'evidence_repair_sweep', relationship: 'supports', rationale: 'Measured candidates can be checked against the declared target.' }], unresolvedQuestions: ['Independent holdout performance remains unknown.'] }], experiments: [], repairs: [], comparisons: [], events: [], diagnosis: null });
  const proposal = generateRepairCandidate(investigation, { datasetId: dataset.metadata.id, hypothesisId: 'hypothesis_repair_policy', sweepResultId: 'result_repair_sweep', criterion: { metric: 'expected_cost', operator: 'at_most', value: input.maximumCost, unit: 'cost' } });
  const baseline = sweep.output.points.find(p => p.threshold === input.baselineThreshold)!;
  const candidate = proposal.candidate;
  return { input, dataset, investigation: validateInvestigation({ ...investigation, repairs: candidate ? [candidate] : [] }), proposal, baseline, suggested: candidate?.kind === 'operating_policy' ? sweep.output.points.find(p => p.threshold === candidate.policy.threshold)! : null };
}
export function applyPreparedRepair(prepared: ReturnType<typeof prepareRepair>) {
  const candidate = prepared.proposal.candidate;
  if (!candidate || candidate.kind !== 'operating_policy') throw new Error('No eligible repair to apply.');
  return reevaluateRepair(prepared.investigation, prepared.dataset, { repairId: candidate.id, baselinePolicy: { ...candidate.policy, threshold: prepared.input.baselineThreshold } });
}
export function measuredTradeoffs(prepared: ReturnType<typeof prepareRepair>) {
  if (!prepared.suggested) return [];
  return prepared.baseline.metrics.map(before => {
    const after = prepared.suggested!.metrics.find(m => m.name === before.name)!;
    return { metric: before.name, direction: before.status !== 'measured' || after.status !== 'measured' ? 'undefined' : after.value > before.value ? 'increased' : after.value < before.value ? 'decreased' : 'unchanged', before, after };
  });
}

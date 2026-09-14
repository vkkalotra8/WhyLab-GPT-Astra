import { metricsFromConfusion } from './classification-metrics.ts';
﻿import { object, type Infer, fail } from './schema.ts';
import { id, criterionSchema, createId, type Id } from './primitives.ts';
import { repairCandidateSchema, type RepairCandidate, type Investigation } from './types.ts';
import { validateInvestigation } from './validation.ts';

export const repairRequestSchema = object({
  datasetId: id('dataset'), hypothesisId: id('hypothesis'), sweepResultId: id('result'), criterion: criterionSchema,
});
export type RepairRequest = Infer<typeof repairRequestSchema>;
export type RepairProposal = {
  status: 'candidate' | 'no_eligible_candidate' | 'insufficient_evidence';
  candidate: RepairCandidate | null;
  selection: { resultId: Id<'result'>; threshold: number; metric: string } | null;
  reason: string;
  limitations: string[];
};
const performanceMetrics = new Set(['accuracy', 'balanced_accuracy', 'precision', 'recall', 'specificity', 'f1', 'minority_recall']);

/** generate_repair_candidate: select from measured sweep evidence, never apply or retrain. */
export function generateRepairCandidate(investigation: Investigation, value: RepairRequest, repairId: Id<'repair'> = createId('repair')): RepairProposal {
  const request = repairRequestSchema.parse(value);
  id('repair').parse(repairId);
  const v = validateInvestigation(investigation);
  if (v.repairs.some(r => r.id === repairId)) fail('$.repairId', 'repair ID is already registered');
  const { criterion } = request;
  const cost = criterion.metric === 'expected_cost';
  if (cost ? criterion.operator !== 'at_most' || criterion.unit !== 'cost' || criterion.value < 0 : !performanceMetrics.has(criterion.metric) || criterion.operator !== 'at_least' || criterion.unit !== 'ratio' || criterion.value < 0 || criterion.value > 1) {
    fail('$.criterion', 'use at_least a supported performance ratio in [0,1], or at_most a nonnegative expected_cost');
  }
  const hypothesis = v.hypotheses.find(h => h.id === request.hypothesisId);
  if (!hypothesis || !hypothesis.evidence.length || hypothesis.status === 'rejected') fail('$.hypothesisId', 'provide an evidence-linked hypothesis that has not been rejected');
  const dataset = v.datasets.find(d => d.id === request.datasetId);
  if (!dataset || dataset.task !== 'binary_classification') fail('$.datasetId', 'provide a registered binary evaluation dataset');
  const result = v.toolResults.find(r => r.id === request.sweepResultId);
  if (!result || result.tool !== 'threshold_sweep' || result.datasetIds.length !== 1 || result.datasetIds[0] !== dataset.id) fail('$.sweepResultId', 'provide a threshold sweep for the selected dataset');
  const limitations = [
    'Candidate only: no policy was applied and no before/after improvement was verified.',
    'Selection uses the supplied evaluation sweep; performance on an independent holdout is unknown.',
    'The criterion is caller-declared. Selection optimizes only that metric; other metric trade-offs remain in the sweep.',
    'Exact objective ties choose the highest threshold. Only measured supplied candidates are considered.',
    'A threshold of one still predicts positive for probability one.',
  ];
  const none = (status: 'no_eligible_candidate' | 'insufficient_evidence', reason: string): RepairProposal => ({ status, candidate: null, selection: null, reason, limitations });
  if (result.status !== 'completed' || !result.evidenceIds.length) return none('insufficient_evidence', 'A completed, evidence-linked threshold sweep is required.');
  const call = v.toolCalls.find(c => c.id === result.callId);
  if (!call || call.tool !== 'threshold_sweep') fail('$.sweepResultId', 'sweep call is missing');
  if (cost && !call.input.costs) fail('$.criterion', 'cost selection requires the sweep cost policy and its explicit user-assumption evidence');
  if (hypothesis.evidence.every(link => !evidenceDatasets(v, link.evidenceId).includes(dataset.id))) fail('$.hypothesisId', 'hypothesis evidence does not concern the selected dataset');
  const points = result.output.points;
  const eligible = points.flatMap(point => {
    if (Object.values(point.confusion).reduce((a,b)=>a+b,0) !== dataset.rowCount) fail('$.sweepResultId', 'sweep population differs from dataset');
    const metric = point.metrics.find(m => m.name === criterion.metric);
    const expected = cost ? { status: 'measured', value: point.confusion.falseNegative * call.input.costs!.falseNegativeCost + point.confusion.falsePositive * call.input.costs!.falsePositiveCost } : metricsFromConfusion(point.confusion).find(m=>m.name===criterion.metric);
    if (metric && expected && (metric.status !== expected.status || metric.status === 'measured' && expected.status === 'measured' && metric.value !== expected.value)) fail('$.sweepResultId', 'criterion measurement disagrees with confusion counts or cost policy');
    if (!metric || metric.status !== 'measured') return [];
    if (metric.unit !== criterion.unit) fail('$.criterion', 'sweep metric unit differs from criterion');
    // Threshold-dependent metrics must describe the entire unchanged evaluation population.
    if (metric.sampleSize !== dataset.rowCount) fail('$.sweepResultId', 'selection metric does not cover the evaluation population');
    if (cost ? metric.value > criterion.value : metric.value < criterion.value) return [];
    return [{ point, metric }];
  });
  if (!eligible.length) return none(points.some(p => p.metrics.some(m => m.name === criterion.metric && m.status === 'measured')) ? 'no_eligible_candidate' : 'insufficient_evidence', 'No measured operating point satisfies the declared criterion.');
  eligible.sort((a, b) => (cost ? a.metric.value - b.metric.value : b.metric.value - a.metric.value) || b.point.threshold - a.point.threshold);
  const selected = eligible[0].point;
  const evidenceIds = [...result.evidenceIds];
  if (call.input.costs && !evidenceIds.includes(call.input.costs.assumptionEvidenceId)) evidenceIds.push(call.input.costs.assumptionEvidenceId);
  const candidate = repairCandidateSchema.parse({
    id: repairId, hypothesisId: hypothesis.id, kind: 'operating_policy', verification: 'evaluation_data', datasetId: dataset.id,
    policy: { threshold: selected.threshold, positiveLabel: call.input.positiveLabel, comparison: 'greater_than_or_equal', costs: call.input.costs },
    criterion, evidenceIds,
    rationale: cost ? 'Propose the lowest measured total error cost among eligible sweep points under the declared cost assumption.' : 'Propose the highest measured criterion value among eligible sweep points. Review the remaining metric trade-offs before application.',
  });
  return { status: 'candidate', candidate, selection: { resultId: result.id, threshold: selected.threshold, metric: criterion.metric }, reason: 'A measured operating point satisfies the declared criterion; independent application verification is still required.', limitations };
}
function evidenceDatasets(v: Investigation, evidenceId: string): string[] {
  const evidence = v.evidence.find(e => e.id === evidenceId)!;
  const provenance = evidence.provenance;
  if (provenance.kind === 'source') return provenance.datasetId ? [provenance.datasetId] : [];
  if (provenance.kind === 'tool_result') return v.toolResults.find(r => r.id === provenance.resultId)?.datasetIds ?? [];
  const experiment = v.experiments.find(e => e.id === provenance.experimentId)!;
  return experiment.callIds.flatMap(callId => v.toolResults.find(r => r.callId === callId)?.datasetIds ?? []);
}

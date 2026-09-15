import { object, type Infer, fail } from './schema.ts';
import { id, policySchema, createId } from './primitives.ts';
import { beforeAfterComparisonSchema, datasetMetadataSchema, type Investigation } from './types.ts';
import { diagnosticToolCallSchema, diagnosticToolResultSchema } from './tool-contracts.ts';
import { validateInvestigation } from './validation.ts';
import { profileEvaluationDataset } from './dataset-profiler.ts';
import { runThresholdSweep } from './threshold-sweep.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';

export const reevaluationRequestSchema = object({ repairId: id('repair'), baselinePolicy: policySchema });
export type ReevaluationRequest = Infer<typeof reevaluationRequestSchema>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const supported = new Set(['accuracy','balanced_accuracy','precision','recall','specificity','f1','minority_recall']);

/** re_evaluate_repair: apply a registered policy to a copy of one immutable evaluation population. */
export function reevaluateRepair(investigation: Investigation, dataset: EvaluationDataset, value: ReevaluationRequest) {
  const request = reevaluationRequestSchema.parse(value);
  const v = validateInvestigation(investigation);
  const data = structuredClone(dataset);
  profileEvaluationDataset(data);
  const repair = v.repairs.find(r => r.id === request.repairId);
  if (!repair || repair.kind !== 'operating_policy') fail('$.repairId','only registered operating policies can be evaluated on current data');
  const metadata = v.datasets.find(d => d.id === repair.datasetId);
  if (!metadata || !same(metadata, datasetMetadataSchema.parse(data.metadata)) || data.source.id !== metadata.sourceId) fail('$.dataset','dataset differs from the registered repair population');
  const baselinePolicy = request.baselinePolicy, afterPolicy = repair.policy;
  if (baselinePolicy.positiveLabel !== data.labels.positive || afterPolicy.positiveLabel !== data.labels.positive || !same(baselinePolicy.costs, afterPolicy.costs)) fail('$.baselinePolicy','class mapping and cost assumptions must remain unchanged');
  const criterion = repair.criterion;
  const cost = criterion.metric === 'expected_cost';
  if (cost ? criterion.unit !== 'cost' || criterion.operator !== 'at_most' || criterion.value < 0 || !afterPolicy.costs : !supported.has(criterion.metric) || criterion.unit !== 'ratio' || criterion.operator !== 'at_least' || criterion.value < 0 || criterion.value > 1) fail('$.criterion','unsupported or ungrounded repair criterion');
  const prediction = (probability: number, threshold: number) => probability >= threshold ? data.labels.positive : data.labels.negative;
  if (data.rows.some(row => row.predicted !== prediction(row.positiveProbability, baselinePolicy.threshold))) fail('$.baselinePolicy','baseline threshold does not reproduce supplied predictions; provide their actual decision policy');
  const assumptions = v.evidence.filter(e => e.kind === 'assumption');
  const evaluate = (policy: typeof baselinePolicy, stage: 'baseline' | 'after') => {
    const call = diagnosticToolCallSchema.parse({ id: createId('call'), investigationId: v.id, tool: 'threshold_sweep', toolVersion: 1, requestedAt: new Date().toISOString(), input: { datasetId: data.metadata.id, positiveLabel: policy.positiveLabel, thresholds: [policy.threshold], costs: policy.costs } });
    if (call.tool !== 'threshold_sweep') throw new Error('Unexpected tool');
    const report = runThresholdSweep(data, call.input, assumptions);
    const resultId = createId('result'), evidenceId = createId('evidence');
    const result = diagnosticToolResultSchema.parse({ id: resultId, callId: call.id, tool: call.tool, toolVersion: 1, completedAt: new Date().toISOString(), datasetIds: [data.metadata.id], evidenceIds: [evidenceId], status: 'completed', output: report.output, limitations: ['Single-policy measurement on the fixed evaluation snapshot.'] });
    const evidence = { id: evidenceId, kind: 'measurement' as const, description: `${stage === 'baseline' ? 'Baseline' : 'After-policy'} measurements on the same evaluation rows.`, measurements: report.output.points[0].metrics, provenance: { kind: 'tool_result' as const, resultId } };
    return { call, result, evidence, point: report.output.points[0] };
  };
  const before = evaluate(baselinePolicy,'baseline');
  const appliedDataset = structuredClone(data);
  appliedDataset.rows = appliedDataset.rows.map(row => ({ ...row, predicted: prediction(row.positiveProbability, afterPolicy.threshold) }));
  const after = evaluate(afterPolicy,'after');
  const baselineMetric = before.evidence.measurements.find(m => m.name === criterion.metric)!;
  const afterMetric = after.evidence.measurements.find(m => m.name === criterion.metric)!;
  const defined = baselineMetric.status === 'measured' && afterMetric.status === 'measured';
  const meets = (metric: typeof baselineMetric) => metric.status === 'measured' ? (cost ? metric.value <= criterion.value : metric.value >= criterion.value) : null;
  const status = !defined ? 'inconclusive' : meets(afterMetric) ? 'passed' : 'failed';
  const improvement = !defined ? 'undefined' : baselineMetric.value === afterMetric.value ? 'unchanged' : (cost ? afterMetric.value < baselineMetric.value : afterMetric.value > baselineMetric.value) ? 'improved' : 'worsened';
  const limitations = [
    'Passed means the declared after-policy target was reached; it does not by itself establish improvement over baseline.',
    'Both policies use exactly the same supplied rows, labels, probabilities, costs and acceptance criterion. No rows were filtered or resampled.',
    'Application changes predictions only in the returned dataset copy; no production model or external system is modified.',
    'This is evaluation-data verification, not independent holdout validation or retraining.',
    'Dataset IDs and metadata link prior selection evidence; this does not authenticate historical CSV contents.',
    'All threshold-dependent metrics are retained, including trade-offs outside the selected criterion.',
  ];
  const comparison = beforeAfterComparisonSchema.parse({ id: createId('comparison'), repairId: repair.id, datasetId: data.metadata.id, baselinePolicy, afterPolicy, baselineEvidenceIds: [before.evidence.id], afterEvidenceIds: [after.evidence.id], criterion, status, limitations });
  const updatedAt = new Date().toISOString();
  const updated = validateInvestigation({ ...v, updatedAt, toolCalls: [...v.toolCalls,before.call,after.call], toolResults: [...v.toolResults,before.result,after.result], evidence: [...v.evidence,before.evidence,after.evidence], comparisons: [...v.comparisons,comparison], diagnosis: v.diagnosis ? { ...v.diagnosis, evidenceIds: [...new Set([...v.diagnosis.evidenceIds,before.evidence.id,after.evidence.id])], repairIds: [...new Set([...v.diagnosis.repairIds,repair.id])], comparisonIds: [...v.diagnosis.comparisonIds,comparison.id], limitations: [...v.diagnosis.limitations.filter(l => l !== 'No repair candidates or before/after verification have been generated at this milestone.'), ...limitations] } : null });
  return { investigation: updated, comparison, appliedDataset, baseline: before.point, after: after.point, baselineMeetsCriterion: meets(baselineMetric), afterMeetsCriterion: meets(afterMetric), improvement };
}

import { ingestEvaluationCsv } from './evaluation-ingestion.ts';
import { evaluateClassification } from './classification-metrics.ts';
import { runCounterfactualTest } from './counterfactual.ts';
import { runThresholdSweep } from './threshold-sweep.ts';
import { generateRepairCandidate } from './repair-candidates.ts';
import { reevaluateRepair } from './repair-reevaluation.ts';
import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';

/** Local, deterministic teaching protocol. No model response or fabricated measurements. */
export function investigateMelanoma(csv: string) {
  const ingested = ingestEvaluationCsv(csv, 'melanoma-synthetic.csv');
  const dataset = { ...ingested, source: { ...ingested.source, kind: 'fixture' as const } };
  const at = new Date().toISOString();
  const metrics = evaluateClassification(dataset);
  const input = { datasetId: dataset.metadata.id, positiveLabel: '1' };
  const counterInput = { ...input, hypothesisId: 'hypothesis_paradox' as const, method: 'accuracy_paradox' as const, seed: 42,
    criterion: { metric: 'accuracy_paradox_gap', operator: 'at_least' as const, value: 10, unit: 'percentage_points' as const } };
  const counter = runCounterfactualTest(dataset, counterInput, { experimentId: 'experiment_reweight', evidenceId: 'evidence_reweight', callId: 'call_reweight' });
  const costs = { falseNegativeCost: 10, falsePositiveCost: 1, assumptionEvidenceId: 'evidence_cost' as const };
  const assumption = { id: 'evidence_cost' as const, kind: 'assumption' as const, description: 'Teaching policy: false negative costs 10 units; false positive costs 1 unit. Not estimated clinical or financial costs.', measurements: [], provenance: { kind: 'source' as const, sourceId: 'source_cost' as const, datasetId: null, rows: null, columns: [] } };
  const sweepInput = { ...input, thresholds: Array.from({ length: 101 }, (_, i) => i / 100), costs };
  const sweep = runThresholdSweep(dataset, sweepInput, [assumption]);
  const verified = counter.output.outcome === 'supports';
  const confidence = { kind: 'evidence_strength' as const, level: verified ? 'strong' as const : 'limited' as const, rationale: counter.output.rationale };
  const unresolved = ['Distribution shift needs a separate reference dataset.', 'Leakage needs training provenance, features and split identifiers.'];
  let investigation: Investigation = validateInvestigation({
    schemaVersion: 1, id: 'investigation_melanoma', objective: 'Test whether aggregate accuracy masks malignant-class errors, then re-evaluate a cost-sensitive operating policy.', status: 'completed', createdAt: at, updatedAt: at,
    sources: [dataset.source, { id: 'source_cost', kind: 'user_assumption', name: 'Explicit synthetic demo cost policy', capturedAt: at, contentDigest: null }], datasets: [dataset.metadata],
    evidence: [assumption,
      { id: 'evidence_metrics', kind: 'measurement', description: 'Classification measurements from supplied fixture rows; positive label 1 represents synthetic malignant cases.', measurements: metrics.output.metrics, provenance: { kind: 'tool_result', resultId: 'result_metrics' } },
      counter.evidence,
      { id: 'evidence_sweep', kind: 'observation', description: 'Measured operating points on the same evaluation rows.', measurements: [], provenance: { kind: 'tool_result', resultId: 'result_sweep' } }],
    toolCalls: [
      { id: 'call_metrics', investigationId: 'investigation_melanoma', tool: 'compute_classification_metrics', toolVersion: 1, requestedAt: at, input },
      { id: 'call_reweight', investigationId: 'investigation_melanoma', tool: 'run_counterfactual_test', toolVersion: 1, requestedAt: at, input: counterInput },
      { id: 'call_sweep', investigationId: 'investigation_melanoma', tool: 'threshold_sweep', toolVersion: 1, requestedAt: at, input: sweepInput }],
    toolResults: [
      { id: 'result_metrics', callId: 'call_metrics', tool: 'compute_classification_metrics', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: ['evidence_metrics'], status: 'completed', output: metrics.output, limitations: metrics.limitations },
      { id: 'result_reweight', callId: 'call_reweight', tool: 'run_counterfactual_test', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: [], status: 'completed', output: counter.output, limitations: counter.experiment.limitations },
      { id: 'result_sweep', callId: 'call_sweep', tool: 'threshold_sweep', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: ['evidence_sweep'], status: 'completed', output: sweep.output, limitations: sweep.limitations }],
    hypotheses: [
      { id: 'hypothesis_paradox', statement: 'Majority-weighted accuracy masks poor malignant/minority recall on these evaluation rows.', status: verified ? 'confirmed' : 'proposed', confidence, evidence: [{ evidenceId: 'evidence_metrics', relationship: 'supports', rationale: 'Inspect class-specific performance.' }, ...(verified ? [{ evidenceId: 'evidence_reweight', relationship: 'supports', rationale: counter.output.rationale }] : [])], unresolvedQuestions: ['This does not establish why training produced these predictions.'] },
      ...(['shift', 'leakage'] as const).map((name, i) => ({ id: `hypothesis_${name}`, statement: name === 'shift' ? 'Distribution shift may explain poor recall.' : 'Data leakage may inflate reported performance.', status: 'proposed', confidence: { kind: 'evidence_strength', level: 'unassessed', rationale: 'Required evidence is absent; this alternative has not been ruled out.' }, evidence: [], unresolvedQuestions: [unresolved[i]] }))],
    experiments: [counter.experiment], repairs: [], comparisons: [], events: [],
    diagnosis: { id: 'diagnosis_melanoma', investigationId: 'investigation_melanoma', status: verified ? 'completed' : 'inconclusive', summary: verified ? 'Verified on this dataset: majority-weighted accuracy conceals poor minority recall. The training cause remains unresolved.' : 'The declared accuracy-paradox prediction was not verified on the supplied rows.', evidenceIds: ['evidence_metrics', 'evidence_reweight'], hypothesisIds: ['hypothesis_paradox', 'hypothesis_shift', 'hypothesis_leakage'], primaryHypothesisId: verified ? 'hypothesis_paradox' : null, confidence, experimentIds: ['experiment_reweight'], repairIds: [], comparisonIds: [], unresolvedQuestions: unresolved, limitations: ['Synthetic educational data, not patient observations or clinical validation.', 'This fixed local protocol is not an autonomous Astra run.', ...counter.experiment.limitations] }
  });
  const proposal = generateRepairCandidate(investigation, { datasetId: dataset.metadata.id, hypothesisId: 'hypothesis_paradox', sweepResultId: 'result_sweep', criterion: { metric: 'expected_cost', operator: 'at_most', value: 10, unit: 'cost' } });
  if (!proposal.candidate || proposal.candidate.kind !== 'operating_policy') throw new Error('No operating policy meets the declared cost target on these rows.');
  investigation = validateInvestigation({ ...investigation, repairs: [proposal.candidate] });
  const repair = reevaluateRepair(investigation, dataset, { repairId: proposal.candidate.id, baselinePolicy: { ...proposal.candidate.policy, threshold: .5 } });
  return { ...repair, counter: counter.output, sampleSize: dataset.rows.length, dataset };
}

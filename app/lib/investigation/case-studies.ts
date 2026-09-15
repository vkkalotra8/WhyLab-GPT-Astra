import { ingestEvaluationCsv } from './evaluation-ingestion.ts';
import { evaluateClassification } from './classification-metrics.ts';
import { checkCalibration } from './calibration.ts';
import { evaluateSlices } from './slice-evaluation.ts';
import { validateInvestigation } from './validation.ts';
import type { DiagnosticToolCall, DiagnosticToolResult } from './tool-contracts.ts';
export const caseStudies = [
  { id: 'calibration', title: 'Confident predictions, unreliable probabilities', file: 'overconfident-classifier.csv', question: 'Does high prediction confidence match observed correctness?', nextStep: 'Fit calibration on separate training/validation data, then compare Brier score and calibration bins on a held-out set.' },
  { id: 'site', title: 'Strong overall results, one failing site', file: 'site-failure.csv', question: 'Does aggregate performance conceal errors in a smaller site?', nextStep: 'Collect more labeled data from the affected site and compare acquisition, labeling and preprocessing before proposing a repair.' },
] as const;
export type CaseStudyId = typeof caseStudies[number]['id'];
export function runCaseStudy(id: CaseStudyId, csv: string) {
  const spec = caseStudies.find(c => c.id === id); if (!spec) throw new Error('Unknown case study.');
  const ingested = ingestEvaluationCsv(csv, spec.file), dataset = { ...ingested, source: { ...ingested.source, kind: 'fixture' as const } };
  const at = new Date().toISOString(), investigationId = 'investigation_case_study' as const;
  const metrics = evaluateClassification(dataset);
  const input = { datasetId: dataset.metadata.id, positiveLabel: '1' };
  let diagnosticCall: DiagnosticToolCall, diagnosticResult: DiagnosticToolResult;
  if (id === 'calibration') {
    const args = { ...input, bins: 10, strategy: 'equal_width' as const }, result = checkCalibration(dataset, args);
    if (!result.output) throw new Error('Calibration requires complete probability evidence.');
    diagnosticCall = { id: 'call_case_diagnostic', investigationId, tool: 'check_calibration', toolVersion: 1, requestedAt: at, input: args };
    diagnosticResult = { id: 'result_case_diagnostic', callId: diagnosticCall.id, tool: 'check_calibration', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: ['evidence_case_diagnostic'], status: 'completed', output: result.output, limitations: result.limitations };
  } else {
    const args = { ...input, columns: ['site'], minimumSampleSize: 5 }, result = evaluateSlices(dataset, args);
    diagnosticCall = { id: 'call_case_diagnostic', investigationId, tool: 'slice_evaluation', toolVersion: 1, requestedAt: at, input: args };
    diagnosticResult = { id: 'result_case_diagnostic', callId: diagnosticCall.id, tool: 'slice_evaluation', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: ['evidence_case_diagnostic'], status: 'completed', output: result.output, limitations: result.limitations };
  }
  return validateInvestigation({ schemaVersion: 1, id: investigationId, objective: spec.question, status: 'completed', createdAt: at, updatedAt: at,
    sources: [dataset.source], datasets: [dataset.metadata],
    evidence: [{ id: 'evidence_case_metrics', kind: 'measurement', description: 'Classification measurements computed from the case CSV.', measurements: metrics.output.metrics, provenance: { kind: 'tool_result', resultId: 'result_case_metrics' } }, { id: 'evidence_case_diagnostic', kind: 'observation', description: 'Diagnostic output computed from the supplied fixture; inspect original result for scope and measurements.', measurements: [], provenance: { kind: 'tool_result', resultId: diagnosticResult.id } }],
    toolCalls: [{ id: 'call_case_metrics', investigationId, tool: 'compute_classification_metrics', toolVersion: 1, requestedAt: at, input }, diagnosticCall],
    toolResults: [{ id: 'result_case_metrics', callId: 'call_case_metrics', tool: 'compute_classification_metrics', toolVersion: 1, completedAt: at, datasetIds: [dataset.metadata.id], evidenceIds: ['evidence_case_metrics'], status: 'completed', output: metrics.output, limitations: metrics.limitations }, diagnosticResult],
    hypotheses: [], experiments: [], repairs: [], comparisons: [], events: [],
    diagnosis: { id: 'diagnosis_case_study', investigationId, status: 'inconclusive', summary: 'Descriptive diagnostics completed. Inspect the measured results; a causal explanation and verified repair remain unresolved.', evidenceIds: ['evidence_case_metrics', 'evidence_case_diagnostic'], hypothesisIds: [], primaryHypothesisId: null, confidence: { kind: 'evidence_strength', level: 'limited', rationale: 'Descriptive measurements alone do not verify a causal explanation.' }, experimentIds: [], repairIds: [], comparisonIds: [], unresolvedQuestions: [spec.nextStep], limitations: ['Synthetic educational rows, not a validated operational benchmark.', 'This fixed local case protocol does not call Astra.', ...diagnosticResult.limitations] } });
}

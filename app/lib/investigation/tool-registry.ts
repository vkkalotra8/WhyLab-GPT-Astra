import { profileEvaluationDataset } from './dataset-profiler.ts';
import { evaluateClassification } from './classification-metrics.ts';
import { runThresholdSweep } from './threshold-sweep.ts';
import { checkCalibration } from './calibration.ts';
import { scanFeatureLeakage } from './leakage-scanner.ts';
import { runDriftTests } from './drift-tests.ts';
import { evaluateSlices } from './slice-evaluation.ts';
import { runCounterfactualTest } from './counterfactual.ts';
import { diagnosticToolCallSchema, diagnosticToolResultSchema, type DiagnosticToolCall } from './tool-contracts.ts';
import { createId, type Id } from './primitives.ts';
import { evidenceSchema, type Evidence, type VerificationExperiment } from './types.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';

/** Typed allowlist: model input can never select arbitrary code, files, URLs or credentials. */
export function executeDiagnostic(value: DiagnosticToolCall, datasets: ReadonlyMap<string, EvaluationDataset>) {
  const call = diagnosticToolCallSchema.parse(value);
  if ('columns' in call.input && call.input.columns.length > 10 || 'featureColumns' in call.input && call.input.featureColumns.length > 10) throw new Error('Excessive columns');
  const datasetIds = 'datasetId' in call.input ? [call.input.datasetId] : [call.input.referenceDatasetId, call.input.comparisonDatasetId];
  const get = (id: Id<'dataset'>) => { const d = datasets.get(id); if (!d) throw new Error('Unknown dataset'); return d; };
  datasetIds.forEach(get);
  const resultId = createId('result');
  const evidence: Evidence[] = [];
  const experiments: VerificationExperiment[] = [];
  let output: unknown;
  let limitations: string[] = [];
  let details: unknown = null;
  switch (call.tool) {
    case 'profile_dataset': output = profileEvaluationDataset(get(call.input.datasetId), call.input); limitations = ['Descriptive profile only; no causal conclusion.']; break;
    case 'compute_classification_metrics': { const r = evaluateClassification(get(call.input.datasetId), call.input); output = r.output; limitations = r.limitations; break; }
    case 'threshold_sweep': { if (call.input.costs !== null || call.input.thresholds.length > 51) throw new Error('Unsupported cost policy or excessive thresholds'); const r = runThresholdSweep(get(call.input.datasetId), call.input); output = r.output; limitations = r.limitations; break; }
    case 'check_calibration': { if (call.input.bins > 20) throw new Error('Excessive bins'); const r = checkCalibration(get(call.input.datasetId), call.input); if (!r.output) throw new Error('Insufficient calibration data'); output = r.output; limitations = r.limitations; break; }
    case 'scan_feature_leakage': { if (call.input.assumptionEvidenceIds.length) throw new Error('Unknown assumptions'); const r = scanFeatureLeakage(get(call.input.datasetId), call.input); output = r.output; limitations = r.limitations; break; }
    case 'run_drift_tests': { if (call.input.bins !== null && call.input.bins > 20) throw new Error('Excessive bins'); const r = runDriftTests(get(call.input.referenceDatasetId), get(call.input.comparisonDatasetId), call.input); output = r.output; limitations = r.output.comparisons.flatMap(c => c.limitations); details = r.psiConfiguration; break; }
    case 'slice_evaluation': { const r = evaluateSlices(get(call.input.datasetId), call.input); output = r.output; limitations = r.limitations; details = r.coverage; break; }
    case 'run_counterfactual_test': { const r = runCounterfactualTest(get(call.input.datasetId), call.input, { experimentId: createId('experiment'), evidenceId: createId('evidence'), callId: call.id }); output = r.output; evidence.push(r.evidence); experiments.push(r.experiment); limitations = r.experiment.limitations; break; }
  }
  // The canonical result retains all nested measurements. Observation evidence links to it
  // without flattening away feature/slice/threshold scope or duplicating metric names.
  const observation = evidenceSchema.parse({ id: createId('evidence'), kind: 'observation', description: `Validated ${call.tool} output; consult the referenced result for measurements and limitations.`, measurements: [], provenance: { kind: 'tool_result', resultId } });
  evidence.push(observation);
  const result = diagnosticToolResultSchema.parse({ id: resultId, callId: call.id, tool: call.tool, toolVersion: 1, completedAt: new Date().toISOString(), datasetIds, evidenceIds: [observation.id], limitations, status: 'completed', output });
  return { result, evidence, experiments, details };
}

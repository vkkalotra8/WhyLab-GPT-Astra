import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';
import type { Measurement } from './primitives.ts';

export type ReliabilityReading = { measurement: Measurement; resultId: string; callId: string; datasetIds: string[]; evidenceIds: string[]; scope: string; limitations: readonly string[] };
const definitions = [
  ['performance', 'Performance quality', 'Accuracy, balanced accuracy and F1 describe supplied predictions, not deployment reliability.'],
  ['minority', 'Minority-class safety', 'Recall, minority recall and slice measurements describe observed errors; they do not certify safety.'],
  ['calibration', 'Calibration', 'Calibration depends on the dataset, probability mapping and bin configuration.'],
  ['drift', 'Drift resilience', 'Distribution distances describe tested datasets/features; they do not prove resilience to future drift.'],
  ['leakage', 'Leakage risk', 'Scanner findings are limited to supplied features and assumptions; no finding does not prove leakage is absent.'],
  ['cost', 'Cost alignment', 'Expected cost uses declared assumptions. Acceptance is evaluation-only and comparison-specific.'],
] as const;
export function buildReliabilityProfile(value: Investigation) {
  const v = validateInvestigation(value);
  const components = definitions.map(([id, title, limitation]) => ({ id, title, limitation, readings: [] as ReliabilityReading[], findings: [] as { resultId: string; datasetIds: string[]; description: string; classification: string; evidenceIds: string[] }[], checks: v.comparisons.filter(c => id === 'cost' && c.criterion.metric === 'expected_cost'), resultIds: [] as string[] }));
  for (const r of v.toolResults) {
    if (r.status !== 'completed') continue;
    const record = (index: number, measurements: readonly Measurement[], scope: string) => {
      const c = components[index]; if (!c.resultIds.includes(r.id)) c.resultIds.push(r.id);
      c.readings.push(...measurements.map(measurement => ({ measurement, resultId: r.id, callId: r.callId, datasetIds: [...r.datasetIds], evidenceIds: [...r.evidenceIds], scope, limitations: r.limitations })));
    };
    const classification = (metrics: readonly Measurement[], scope: string) => {
      const p = metrics.filter(m => ['accuracy', 'balanced_accuracy', 'f1', 'precision', 'specificity'].includes(m.name));
      const minority = metrics.filter(m => ['recall', 'minority_recall'].includes(m.name));
      if (p.length) record(0, p, scope); if (minority.length) record(1, minority, scope);
      const costs = metrics.filter(m => m.name === 'expected_cost'); if (costs.length) record(5, costs, scope);
    };
    if (r.tool === 'compute_classification_metrics') classification(r.output.metrics, 'Supplied predictions');
    if (r.tool === 'threshold_sweep' && r.output.points.length === 1) {
      const role = v.comparisons.flatMap(c => r.evidenceIds.some(id => c.baselineEvidenceIds.includes(id)) ? [`Baseline for ${c.id}`] : r.evidenceIds.some(id => c.afterEvidenceIds.includes(id)) ? [`After for ${c.id}`] : []);
      classification(r.output.points[0].metrics, `${role.join('; ') || 'Single evaluated policy'}; threshold ${r.output.points[0].threshold}`);
    }
    if (r.tool === 'slice_evaluation') r.output.slices.forEach(s => classification(s.metrics, `Slice ${s.column}=${s.value}; n=${s.sampleSize}`));
    if (r.tool === 'check_calibration') record(2, r.output.metrics, 'Probability calibration; inspect call for bin configuration');
    if (r.tool === 'run_drift_tests') r.output.comparisons.forEach(c => record(3, [c.statistic], `${c.method}: ${c.feature}; reference n=${c.referenceSize}, comparison n=${c.comparisonSize}`));
    if (r.tool === 'scan_feature_leakage') {
      record(4, [], 'Leakage scan');
      r.output.observations.forEach(o => { record(4, o.measurements, `${o.method}: ${o.feature}`); components[4].findings.push({ resultId: r.id, datasetIds: [...r.datasetIds], description: o.description, classification: o.classification, evidenceIds: [...new Set([...r.evidenceIds, ...o.evidenceIds])] }); });
    }
  }
  return { version: 1, investigationId: v.id, aggregateScore: null, explanation: 'No aggregate reliability score or universal pass threshold is defined. Review each measured dimension and its scope.', components: components.map(c => ({ ...c, availability: c.readings.some(r => r.measurement.status === 'measured') ? 'Measurements available' : c.resultIds.length ? 'No defined measurements' : c.checks.length ? 'Recorded criterion only' : 'Not assessed' })) };
}

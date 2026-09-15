import { array, enumeration, literal, number, object, text } from './schema.ts';
import type { investigateMelanoma } from './flagship-melanoma.ts';
export const ciPolicySchema = object({ version: literal(1), name: text, checks: array(object({ stage: enumeration(['baseline', 'after']), metric: text, operator: enumeration(['at_least', 'at_most']), value: number(), unit: enumeration(['ratio', 'cost', 'count', 'percentage_points', 'loss', 'feature_units', 'unitless']) }), 1, 50) });
export function evaluateCiPolicy(value: unknown, run: ReturnType<typeof investigateMelanoma>) {
  const policy = ciPolicySchema.parse(value);
  const checks = policy.checks.map(check => {
    const measurement = run[check.stage].metrics.find(m => m.name === check.metric && m.unit === check.unit);
    const evidenceIds = check.stage === 'baseline' ? run.comparison.baselineEvidenceIds : run.comparison.afterEvidenceIds;
    const status = !measurement || measurement.status !== 'measured' ? 'inconclusive' : (check.operator === 'at_least' ? measurement.value >= check.value : measurement.value <= check.value) ? 'passed' : 'failed';
    return { ...check, status, measurement: measurement ?? null, evidenceIds, comparisonId: run.comparison.id, datasetId: run.comparison.datasetId };
  });
  return { policy, passed: checks.every(c => c.status === 'passed'), checks };
}

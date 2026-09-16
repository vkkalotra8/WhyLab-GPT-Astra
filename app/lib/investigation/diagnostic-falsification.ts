import { criterionSchema, experimentCriterionSchema, id, type Measurement } from './primitives.ts';
import { object, text } from './schema.ts';
import { diagnosticToolResultSchema, type DiagnosticToolResult } from './tool-contracts.ts';

const requestSchema = object({
  hypothesisId: id('hypothesis'), resultId: id('result'), prediction: text, criterion: experimentCriterionSchema,
});

type Criterion = ReturnType<typeof criterionSchema.parse>;

export type DiagnosticFalsification = {
  hypothesisId: string; resultId: string; prediction: string;
  criterion: ReturnType<typeof experimentCriterionSchema.parse>;
  outcome: 'supports' | 'weakens' | 'rejects' | 'inconclusive';
  measurements: Measurement[]; rationale: string;
};

function measurements(value: unknown, found: Measurement[] = []): Measurement[] {
  if (Array.isArray(value)) { for (const item of value) measurements(item, found); return found; }
  if (!value || typeof value !== 'object') return found;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && (record.status === 'measured' || record.status === 'undefined') && typeof record.unit === 'string' && typeof record.sampleSize === 'number') found.push(record as Measurement);
  else for (const item of Object.values(record)) measurements(item, found);
  return found;
}

/** `met === null` means the component could not be evaluated at all; it never counts as a miss. */
type Component = { met: boolean | null; measurement: Measurement | null; reason: string };

function evaluateComponent(output: unknown, criterion: Criterion): Component {
  const matches = measurements(output).filter(item => item.name === criterion.metric && item.unit === criterion.unit);
  if (matches.length !== 1) return { met: null, measurement: null, reason: matches.length ? `${criterion.metric} is ambiguous across multiple result scopes; select a more specific diagnostic.` : `The declared metric ${criterion.metric} (${criterion.unit}) is absent from the referenced result.` };
  const measurement = matches[0];
  if (measurement.status === 'undefined') return { met: null, measurement, reason: `${measurement.name} is undefined: ${measurement.reason}` };
  const met = criterion.operator === 'at_least' ? measurement.value >= criterion.value : measurement.value <= criterion.value;
  return { met, measurement, reason: `The measured ${measurement.name} (${measurement.value} ${measurement.unit}) ${met ? 'meets' : 'does not meet'} the declared ${criterion.operator} criterion (${criterion.value} ${criterion.unit}).` };
}

/** Evaluate a declared prediction against one already-validated diagnostic result. */
export function evaluateDiagnosticFalsification(resultValue: DiagnosticToolResult, requestValue: unknown): DiagnosticFalsification {
  const result = diagnosticToolResultSchema.parse(resultValue), request = requestSchema.parse(requestValue);
  if (result.id !== request.resultId) throw new Error('The falsification request references a different diagnostic result.');
  if (result.status !== 'completed') return { ...request, outcome: 'inconclusive', measurements: [], rationale: 'The referenced diagnostic did not complete, so the prediction cannot be evaluated.' };
  const criteria: Criterion[] = 'kind' in request.criterion ? request.criterion.criteria : [request.criterion];
  const components = criteria.map(criterion => evaluateComponent(result.output, criterion));
  const observed = components.flatMap(c => c.measurement ? [c.measurement] : []);
  const caveat = ' This evaluates the prediction on the recorded result; it does not establish causality.';
  // Fail closed: one unevaluable component makes the conjunction unevaluable, never a partial pass.
  const unevaluable = components.filter(c => c.met === null);
  if (unevaluable.length) return { ...request, outcome: 'inconclusive', measurements: observed, rationale: unevaluable.map(c => c.reason).join(' ').slice(0, 3900) };
  const met = components.filter(c => c.met).length;
  const outcome = met === components.length ? 'supports' : met ? 'weakens' : 'rejects';
  const summary = components.length > 1 ? ` ${met} of ${components.length} declared criteria hold, so the conjunctive prediction is ${outcome === 'supports' ? 'supported' : outcome === 'weakens' ? 'only partially met and therefore weakened' : 'rejected'}.` : '';
  return { ...request, outcome, measurements: observed, rationale: (components.map(c => c.reason).join(' ') + summary + caveat).slice(0, 3900) };
}

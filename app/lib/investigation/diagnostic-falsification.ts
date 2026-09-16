import { criterionSchema, id, type Measurement } from './primitives.ts';
import { object, text } from './schema.ts';
import { diagnosticToolResultSchema, type DiagnosticToolResult } from './tool-contracts.ts';

const requestSchema = object({
  hypothesisId: id('hypothesis'), resultId: id('result'), prediction: text, criterion: criterionSchema,
});

export type DiagnosticFalsification = {
  hypothesisId: string; resultId: string; prediction: string;
  criterion: ReturnType<typeof criterionSchema.parse>;
  outcome: 'supports' | 'rejects' | 'inconclusive';
  measurement: Measurement | null; rationale: string;
};

function measurements(value: unknown, found: Measurement[] = []): Measurement[] {
  if (Array.isArray(value)) { for (const item of value) measurements(item, found); return found; }
  if (!value || typeof value !== 'object') return found;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && (record.status === 'measured' || record.status === 'undefined') && typeof record.unit === 'string' && typeof record.sampleSize === 'number') found.push(record as Measurement);
  else for (const item of Object.values(record)) measurements(item, found);
  return found;
}

/** Evaluate a declared prediction against one already-validated diagnostic result. */
export function evaluateDiagnosticFalsification(resultValue: DiagnosticToolResult, requestValue: unknown): DiagnosticFalsification {
  const result = diagnosticToolResultSchema.parse(resultValue), request = requestSchema.parse(requestValue);
  if (result.id !== request.resultId) throw new Error('The falsification request references a different diagnostic result.');
  if (result.status !== 'completed') return { ...request, outcome:'inconclusive', measurement:null, rationale:'The referenced diagnostic did not complete, so the prediction cannot be evaluated.' };
  const matches = measurements(result.output).filter(item => item.name === request.criterion.metric && item.unit === request.criterion.unit);
  if (matches.length !== 1) return { ...request, outcome:'inconclusive', measurement:null, rationale:matches.length ? 'The metric is ambiguous across multiple result scopes; select a more specific diagnostic.' : 'The declared metric and unit are absent from the referenced result.' };
  const measurement = matches[0];
  if (measurement.status === 'undefined') return { ...request, outcome:'inconclusive', measurement, rationale:`${measurement.name} is undefined: ${measurement.reason}` };
  const passed = request.criterion.operator === 'at_least' ? measurement.value >= request.criterion.value : measurement.value <= request.criterion.value;
  return { ...request, outcome:passed?'supports':'rejects', measurement, rationale:`The measured ${measurement.name} (${measurement.value} ${measurement.unit}) ${passed?'meets':'does not meet'} the declared ${request.criterion.operator} criterion (${request.criterion.value} ${request.criterion.unit}). This evaluates the prediction on the recorded result; it does not establish causality.` };
}

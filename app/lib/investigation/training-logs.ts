import { analyzeEvidence, analyzeTrends } from '../evidence.ts';
import { schema, object, text } from './schema.ts';
import { createId } from './primitives.ts';
import { sourceSchema, evidenceSchema } from './types.ts';

export const trainingLogSchema = object({ name: text, text: schema<string>(value => {
  if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).length > 16000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error('Training logs must contain 1?16,000 bytes of plain text.');
  const lines = value.split(/\r?\n/);
  if (lines.length > 200 || lines.some(line => line.length > 3000)) throw new Error('Use at most 200 log lines, each at most 3,000 characters.');
  return value;
}) });
export type TrainingLog = ReturnType<typeof trainingLogSchema.parse>;

/** Preserve user-reported text without interpreting it as independently measured evidence. */
export function ingestTrainingLog(value: unknown) {
  const log = trainingLogSchema.parse(value);
  const source = sourceSchema.parse({ id: createId('source'), kind: 'pasted_logs', name: log.name, capturedAt: new Date().toISOString(), contentDigest: null });
  const evidence = log.text.split(/\r?\n/).flatMap((line, index) => line.trim() ? [evidenceSchema.parse({
    id: createId('evidence'), kind: 'observation',
    description: 'Unverified training log, line ' + (index + 1) + ': ' + line,
    measurements: [], provenance: { kind: 'source', sourceId: source.id, datasetId: null, rows: null, columns: [] },
  })] : []);
  const parsed = analyzeEvidence(log.text, log.name);
  const diagnostics = { history: parsed.history, findings: analyzeTrends(parsed.history), warnings: parsed.warnings };
  const descriptions = [
    ...diagnostics.history.map(point => 'Reported epoch ' + point.epoch + ': ' + JSON.stringify(point.metrics)),
    ...diagnostics.findings.map(finding => 'Heuristic: ' + finding.title + '. ' + finding.evidence + ' Suggested verification: ' + finding.experiment),
    ...diagnostics.warnings.map(warning => 'Parser limitation: ' + warning),
  ];
  for (const description of descriptions) evidence.push(evidenceSchema.parse({
    id: createId('evidence'), kind: 'observation', description: 'Unverified training-log analysis. ' + description,
    measurements: [], provenance: { kind: 'source', sourceId: source.id, datasetId: null, rows: null, columns: [] },
  }));
  return { source, evidence, diagnostics };
}

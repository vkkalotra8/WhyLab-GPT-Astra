import { summarizeColumn } from '../column-profile.ts';
import { EVALUATION_LIMITS, type EvaluationDataset } from './evaluation-ingestion.ts';
import { datasetMetadataSchema } from './types.ts';
import { fail } from './schema.ts';
import { toolSchemas, profileOutput, type ToolInput, type ToolOutput } from './tool-contracts.ts';

const metadataNames = new Set(['timestamp', 'group', 'site', 'environment', 'device']);
const sliceNames = new Set(['group', 'site', 'environment', 'device']);

/** Descriptive measurements only: no model metrics, causal ranking, or provider calls. */
export function profileEvaluationDataset(
  data: EvaluationDataset,
  input: ToolInput<'profile_dataset'> = { datasetId: data.metadata.id, targetColumn: data.metadata.targetColumn },
): ToolOutput<'profile_dataset'> {
  const request = toolSchemas.profile_dataset.input.parse(input);
  const metadata = datasetMetadataSchema.parse(data.metadata);
  if (request.datasetId !== metadata.id) fail('$.input.datasetId', 'dataset does not match request');
  if (request.targetColumn !== null && !metadata.columns.includes(request.targetColumn)) fail('$.input.targetColumn', 'column is absent from dataset');
  if (!Array.isArray(data.rows) || data.rows.length === 0 || data.rows.length > EVALUATION_LIMITS.rows || data.rows.length !== metadata.rowCount) fail('$.rows', 'expected nonempty rows matching metadata within ingestion limits');
  if (metadata.targetColumn !== 'y_true' || metadata.predictionColumn !== 'y_pred' || metadata.probabilityColumn !== 'y_probability' || metadata.task !== 'binary_classification') fail('$.metadata', 'expected normalized binary evaluation columns');
  if (!data.labels || typeof data.labels.positive !== 'string' || typeof data.labels.negative !== 'string' || !data.labels.positive || !data.labels.negative || data.labels.positive === data.labels.negative || metadata.positiveLabel !== data.labels.positive) fail('$.labels', 'invalid label configuration');
  const extraNames = metadata.columns.filter(name => !['y_true','y_pred','y_probability'].includes(name));
  data.rows.forEach((row, i) => {
    if (!row || row.sourceRow !== i + 1 || ![data.labels.positive,data.labels.negative].includes(row.actual) || ![data.labels.positive,data.labels.negative].includes(row.predicted) || typeof row.positiveProbability !== 'number' || !Number.isFinite(row.positiveProbability) || row.positiveProbability < 0 || row.positiveProbability > 1) fail(`$.rows[${i}]`, 'invalid normalized evaluation record; re-ingest the CSV');
    if (!row.attributes || typeof row.attributes !== 'object' || Array.isArray(row.attributes) || Object.keys(row.attributes).length !== extraNames.length || extraNames.some(name => !Object.hasOwn(row.attributes,name) || (row.attributes[name] !== null && typeof row.attributes[name] !== 'string'))) fail(`$.rows[${i}].attributes`, 'optional columns do not match metadata');
  });
  const classes: ToolOutput<'profile_dataset'>['classes'] = [];
  const sliceColumns: string[] = [];
  const columns = metadata.columns.map(name => {
    const values = data.rows.map(row => name === 'y_true' ? row.actual : name === 'y_pred' ? row.predicted : name === 'y_probability' ? String(row.positiveProbability) : row.attributes[name] ?? '');
    const summary = summarizeColumn(values);
    const role: ToolOutput<'profile_dataset'>['columns'][number]['role'] = name === request.targetColumn ? 'target' : name === 'y_pred' ? 'prediction' : name === 'y_probability' ? 'probability' : metadataNames.has(name) ? 'metadata' : name.startsWith('feature_') ? 'feature' : name === 'y_true' ? 'target' : 'unknown';
    // Numeric-looking class labels remain categories; metadata names do not prove date validity.
    const categorical = name === 'y_true' || name === 'y_pred' || name === request.targetColumn || metadataNames.has(name);
    const type: ToolOutput<'profile_dataset'>['columns'][number]['type'] = summary.observed === 0 ? 'empty' : summary.numeric && !categorical ? 'numeric' : 'categorical';
    if (name === request.targetColumn && summary.observed) {
      // Exact, complete frequencies, not a top-five display summary. Stable code-unit ordering.
      for (const label of [...summary.counts.keys()].sort()) classes.push({label,count:summary.counts.get(label)!,prevalence:summary.counts.get(label)! / summary.observed});
    }
    if (sliceNames.has(name) && summary.observed > 0) sliceColumns.push(name);
    return { name, role, type, missingCount: summary.missing, distinctCount: summary.counts.size, minimum: type === 'numeric' ? summary.min! : null, maximum: type === 'numeric' ? summary.max! : null, mean: type === 'numeric' ? summary.mean! : null };
  });
  const output: ToolOutput<'profile_dataset'> = {rowCount:data.rows.length,columns,classes,sliceColumns};
  return profileOutput.parse(output);
}

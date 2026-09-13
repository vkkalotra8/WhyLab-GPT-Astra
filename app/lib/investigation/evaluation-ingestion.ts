import { parseCsv } from '../evidence.ts';
import { createId, id, type Id } from './primitives.ts';
import { datasetMetadataSchema, sourceSchema, type DatasetMetadata } from './types.ts';
import type { Infer } from './schema.ts';

export const EVALUATION_LIMITS = Object.freeze({ bytes: 2_000_000, rows: 10_000, columns: 100, cells: 1_000_000, issues: 50 });
const required = ['y_true', 'y_pred', 'y_probability'] as const;
const missing = (value: string) => !value || /^(null|na|nan|n\/a)$/i.test(value);
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
export type EvaluationIssue = {
  code: 'configuration' | 'file_type' | 'encoding' | 'limit' | 'csv' | 'required_column' | 'missing_value' | 'label' | 'probability';
  message: string;
  /** 1-based data-record index, excluding the header and physical blank lines. */
  row: number | null;
  column: string | null;
};
export class EvaluationValidationError extends Error {
  readonly issues: EvaluationIssue[];
  readonly totalIssues: number;
  constructor(issues: EvaluationIssue[], totalIssues = issues.length) {
    super(issues.map(i => `${i.row === null ? '' : `Data row ${i.row}, `}${i.column ? `${i.column}: ` : ''}${i.message}`).join('\n') + (totalIssues > issues.length ? `\nShowing ${issues.length} of ${totalIssues} issues.` : ''));
    this.name = 'EvaluationValidationError';
    this.issues = issues;
    this.totalIssues = totalIssues;
  }
}
function reject(code: EvaluationIssue['code'], message: string): never {
  throw new EvaluationValidationError([{ code, message, row: null, column: null }]);
}
export type EvaluationOptions = {
  /** Probability must refer to this positive class; labels are case-sensitive. */
  labels?: { positive: string; negative: string };
  datasetId?: Id<'dataset'>;
  sourceId?: Id<'source'>;
};
export type EvaluationRow = {
  sourceRow: number;
  actual: string;
  predicted: string;
  positiveProbability: number;
  /** Extra columns retain text without guessing units, types, or date formats. */
  attributes: Record<string, string | null>;
};
export type EvaluationDataset = {
  schemaVersion: 1;
  metadata: DatasetMetadata;
  source: Infer<typeof sourceSchema>;
  labels: { positive: string; negative: string };
  rows: EvaluationRow[];
  warnings: string[];
};

/** Pure synchronous ingestion boundary, suitable for a worker or server. No metric computation. */
export function ingestEvaluationCsv(text: string, name: string, options: EvaluationOptions = {}): EvaluationDataset {
  if (typeof name !== 'string' || !name.trim() || name.length > 4000 || !/\.csv$/i.test(name)) reject('file_type', 'Choose a named .csv evaluation file.');
  if (typeof text !== 'string') reject('encoding', 'Supply UTF-8 CSV text.');
  if (text.length > EVALUATION_LIMITS.bytes || new TextEncoder().encode(text).byteLength > EVALUATION_LIMITS.bytes) reject('limit', 'Evaluation CSV exceeds 2 MB (2,000,000 UTF-8 bytes).');
  if (text.includes('\0') || text.includes('\uFFFD')) reject('encoding', 'Export readable UTF-8 text; binary or replacement characters were detected.');
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['labels', 'datasetId', 'sourceId'].includes(k))) reject('configuration', 'Invalid evaluation options.');
  const labels = options.labels === undefined ? { positive: '1', negative: '0' } : options.labels;
  if (!labels || typeof labels !== 'object' || Array.isArray(labels) || Object.keys(labels).some(k => !['positive', 'negative'].includes(k)) || [labels.positive, labels.negative].some(v => typeof v !== 'string' || missing(v) || v !== v.trim() || v.length > 128) || labels.positive === labels.negative) reject('configuration', 'Provide two distinct nonmissing class labels, at most 128 characters each, with no surrounding whitespace.');
  const datasetId = options.datasetId === undefined ? createId('dataset') : options.datasetId;
  const sourceId = options.sourceId === undefined ? createId('source') : options.sourceId;
  try { id('dataset').parse(datasetId); id('source').parse(sourceId); }
  catch { reject('configuration', 'Invalid dataset or source identifier.'); }
  let records: string[][];
  try { records = parseCsv(text.replace(/^\uFEFF/, '')); }
  catch (error) { reject(error instanceof Error && /exceeds/.test(error.message) ? 'limit' : 'csv', error instanceof Error ? error.message : 'Malformed CSV.'); }
  const [headers, ...data] = records;
  if (headers.length > EVALUATION_LIMITS.columns || data.length > EVALUATION_LIMITS.rows) reject('limit', 'Use at most 100 columns and 10,000 data rows.');
  if (headers.some(h => h.length > 4000)) reject('limit', 'Column names must contain at most 4,000 characters.');
  const absent = required.filter(c => !headers.includes(c));
  if (absent.length) throw new EvaluationValidationError(absent.map(column => ({code:'required_column',column,row:null,message:'Required column is missing (header names are case-sensitive).'})));
  const positions = required.map(c => headers.indexOf(c));
  const extras = headers.map((name, index) => ({name, index})).filter(c => !required.includes(c.name as typeof required[number]));
  const issues: EvaluationIssue[] = [];
  let totalIssues = 0;
  const add = (code: EvaluationIssue['code'], row: number, column: string, message: string) => {
    totalIssues++;
    if (issues.length < EVALUATION_LIMITS.issues) issues.push({code,row,column,message});
  };
  const rows: EvaluationRow[] = [];
  const actualLabels = new Set<string>();
  let optionalMissing = 0;
  for (const [index, record] of data.entries()) {
    const sourceRow = index + 1;
    const [actual, predicted, rawProbability] = positions.map(i => record[i]);
    const before = totalIssues;
    for (const [column, value] of [['y_true', actual], ['y_pred', predicted]] as const) {
      if (missing(value)) add('missing_value',sourceRow,column,'A class label is required; rows are not silently dropped.');
      else if (value !== labels.positive && value !== labels.negative) add('label',sourceRow,column,'Label is outside the configured positive/negative pair. Check spelling and case.');
    }
    let probability = Number.NaN;
    if (missing(rawProbability)) add('missing_value',sourceRow,'y_probability','A probability for the configured positive class is required.');
    else if (!numeric.test(rawProbability) || !Number.isFinite(Number(rawProbability)) || Number(rawProbability) < 0 || Number(rawProbability) > 1) add('probability',sourceRow,'y_probability','Use a finite decimal probability from 0 to 1, not percentages or logits.');
    else probability = Number(rawProbability);
    const attributes = Object.fromEntries(extras.map(({name,index}) => {
      const value = record[index];
      if (missing(value)) { optionalMissing++; return [name,null]; }
      return [name,value];
    }));
    if (totalIssues === before) {
      actualLabels.add(actual);
      rows.push({sourceRow,actual,predicted,positiveProbability:probability,attributes});
    }
  }
  // Atomic ingestion: never return a valid subset after any invalid required value.
  if (totalIssues) throw new EvaluationValidationError(issues,totalIssues);
  const warnings = ['y_probability is interpreted as the probability of the configured positive label. This semantic mapping cannot be verified from the CSV alone.', 'Supplied y_pred values are preserved; no decision threshold is inferred from probabilities.'];
  if (actualLabels.size === 1) warnings.push('Only one true class is present. Some classification metrics will be undefined; no rows or classes were fabricated.');
  if (optionalMissing) warnings.push(`${optionalMissing} missing optional values were retained as null.`);
  if (headers.includes('timestamp')) warnings.push('Timestamp values are preserved as text. Temporal validity and time-bucket semantics have not been checked.');
  const source = sourceSchema.parse({id:sourceId,kind:'uploaded_file',name,capturedAt:new Date().toISOString(),contentDigest:null});
  const metadata = datasetMetadataSchema.parse({id:datasetId,sourceId,name,rowCount:rows.length,columns:headers,role:'evaluation',task:'binary_classification',targetColumn:'y_true',predictionColumn:'y_pred',probabilityColumn:'y_probability',positiveLabel:labels.positive});
  return {schemaVersion:1,metadata,source,labels:{...labels},rows,warnings};
}

/** Checks bytes before decoding; decoding is fatal rather than silently replacing invalid UTF-8. */
export async function ingestEvaluationFile(file: File, options: EvaluationOptions = {}): Promise<EvaluationDataset> {
  if (!/\.csv$/i.test(file.name)) reject('file_type', 'Choose a .csv evaluation file.');
  if (file.size > EVALUATION_LIMITS.bytes) reject('limit', 'Evaluation CSV exceeds 2 MB (2,000,000 bytes).');
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); } catch { return reject('encoding', 'Could not read this file. Select it again.'); }
  if (bytes.byteLength > EVALUATION_LIMITS.bytes) reject('limit', 'Evaluation CSV exceeds 2 MB.');
  let text: string;
  try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch { return reject('encoding', 'Invalid UTF-8 bytes. Export this CSV as UTF-8.'); }
  return ingestEvaluationCsv(text,file.name,options);
}

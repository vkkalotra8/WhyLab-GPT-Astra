import { validateInvestigation } from './validation.ts';
import { id } from './primitives.ts';
import { object, schema } from './schema.ts';
import { ingestEvaluationCsv } from './evaluation-ingestion.ts';
import { evaluateClassification } from './classification-metrics.ts';

export const repairContextRequestSchema = object({ investigation: schema(validateInvestigation), datasetId: id('dataset') });
export type RepairContextRequest = ReturnType<typeof repairContextRequestSchema.parse>;
/** Explicit bounded context, never hidden reasoning or raw evaluation rows. */
export function buildRepairContext(value: unknown, normalizedCsv?: string) {
  const { investigation: v, datasetId } = repairContextRequestSchema.parse(value);
  const dataset = v.datasets.find(d => d.id === datasetId);
  if (!dataset || dataset.task !== 'binary_classification') throw new Error('Choose a registered binary dataset for repair context.');
  if (normalizedCsv !== undefined) {
    const current = ingestEvaluationCsv(normalizedCsv, 'repair-context.csv');
    if (current.rows.length !== dataset.rowCount) throw new Error('Repair CSV row count differs from the selected investigation dataset.');
    const measured = evaluateClassification(current).output;
    for (const r of v.toolResults) if (r.status === 'completed' && r.tool === 'compute_classification_metrics' && r.datasetIds.includes(datasetId)) {
      if (JSON.stringify(r.output.confusion) !== JSON.stringify(measured.confusion) || JSON.stringify(r.output.metrics) !== JSON.stringify(measured.metrics)) throw new Error('Repair CSV measurements differ from the recorded investigation.');
    }
  }
  const context = {
    contextVersion: 1,
    investigationId: v.id, objective: v.objective, investigationStatus: v.status,
    selectedDataset: dataset,
    probabilityMapping: 'Repair CSV uses normalized labels 1/0; 1 corresponds to the selected dataset positiveLabel. Original evidence retains original labels.',
    sources: v.sources, datasets: v.datasets,
    diagnosis: v.diagnosis,
    hypotheses: v.hypotheses,
    evidence: v.evidence,
    experiments: v.experiments,
    priorRepairs: v.repairs, priorComparisons: v.comparisons,
    toolRecords: v.toolResults.map(r => ({ id: r.id, callId: r.callId, tool: r.tool, toolVersion: r.toolVersion, status: r.status, datasetIds: r.datasetIds, evidenceIds: r.evidenceIds, limitations: r.limitations })),
    limitations: ['Client-supplied canonical context is validated structurally, not authenticated as a historical server record.', 'Only the selected dataset is being optimized; other dataset findings must not be transferred to it.', 'Full tool outputs and raw rows are omitted from context; absence from this summary is not proof of absence.', 'Repairing an operating policy does not confirm a causal diagnosis or independent holdout reliability.'],
  };
  if (new TextEncoder().encode(JSON.stringify(context)).length > 64000) throw new Error('Diagnosis context exceeds the 64 KB limit. Use local repair or a smaller investigation.');
  return context;
}

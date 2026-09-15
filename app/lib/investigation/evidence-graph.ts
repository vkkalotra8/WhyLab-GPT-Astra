import { validateInvestigation } from './validation.ts';
import type { Investigation } from './types.ts';

export type GraphNode = { id: string; kind: string; title: string; status: string; record: unknown };
export type GraphEdge = { from: string; to: string; relationship: string; rationale: string };

/** A reference projection, never an inference of causality or confidence. */
export function buildEvidenceGraph(value: Investigation) {
  const v = validateInvestigation(value);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const add = (record: { id: string }, kind: string, title: string, status = '') => nodes.push({ id: record.id, kind, title, status, record });
  const edge = (from: string, to: string, relationship: string, rationale = '') => {
    if (!edges.some(e => e.from === from && e.to === to && e.relationship === relationship)) edges.push({ from, to, relationship, rationale });
  };
  v.sources.forEach(s => add(s, 'Source', s.name, s.kind));
  v.datasets.forEach(d => { add(d, 'Dataset', d.name, d.role); edge(d.sourceId, d.id, 'provides dataset'); });
  v.toolCalls.forEach(c => {
    add(c, 'Tool call', c.tool, `version ${c.toolVersion}`);
    const input = c.input as Record<string, unknown>;
    for (const key of ['datasetId', 'referenceDatasetId', 'comparisonDatasetId']) if (typeof input[key] === 'string') edge(input[key], c.id, key);
    const costs = 'costs' in c.input ? c.input.costs : null;
    if (costs) edge(costs.assumptionEvidenceId, c.id, 'supplies cost assumption');
  });
  v.toolResults.forEach(r => { add(r, 'Result', r.tool, r.status); edge(r.callId, r.id, 'produced result'); r.datasetIds.forEach(id => edge(id, r.id, 'measured dataset')); });
  v.evidence.forEach(e => {
    add(e, 'Observation', e.description, e.kind);
    const p = e.provenance;
    if (p.kind === 'source') { edge(p.sourceId, e.id, 'source of evidence'); if (p.datasetId) edge(p.datasetId, e.id, 'scopes evidence'); }
    else if (p.kind === 'tool_result') edge(p.resultId, e.id, 'generated evidence');
    else edge(p.experimentId, e.id, 'generated evidence');
  });
  v.hypotheses.forEach(h => { add(h, 'Hypothesis', h.statement, h.status); h.evidence.forEach(e => edge(e.evidenceId, h.id, e.relationship, e.rationale)); });
  v.experiments.forEach(e => {
    add(e, 'Experiment', e.prediction, `${e.status}${e.outcome ? ': ' + e.outcome : ''}`);
    edge(e.hypothesisId, e.id, 'tested by');
    e.callIds.forEach(id => { edge(e.id, id, 'executes test'); v.toolResults.filter(r => r.callId === id).forEach(r => edge(e.id, r.id, 'test result')); });
  });
  v.repairs.forEach(r => {
    add(r, 'Repair', r.rationale, r.verification); edge(r.hypothesisId, r.id, 'motivates repair');
    r.evidenceIds.forEach(id => edge(id, r.id, 'informs repair'));
    if (r.kind === 'operating_policy') { edge(r.datasetId, r.id, 'repair dataset'); if (r.policy.costs) edge(r.policy.costs.assumptionEvidenceId, r.id, 'supplies cost assumption'); }
  });
  v.comparisons.forEach(c => {
    add(c, 'Comparison', `${c.criterion.metric} ${c.criterion.operator} ${c.criterion.value}`, c.status);
    edge(c.repairId, c.id, 're-evaluated by'); edge(c.datasetId, c.id, 'comparison dataset');
    c.baselineEvidenceIds.forEach(id => edge(id, c.id, 'baseline evidence'));
    c.afterEvidenceIds.forEach(id => edge(id, c.id, 'after evidence'));
  });
  if (v.diagnosis) {
    const d = v.diagnosis; add(d, 'Diagnosis', d.summary, d.status);
    [...d.evidenceIds, ...d.experimentIds, ...d.repairIds, ...d.comparisonIds].forEach(id => edge(id, d.id, 'included in diagnosis'));
    d.hypothesisIds.forEach(id => edge(id, d.id, id === d.primaryHypothesisId ? 'primary hypothesis' : 'considered hypothesis'));
  }
  return { nodes, edges };
}

import { array, enumeration, object, text } from './schema.ts';
import { createId, evidenceIds, type Id } from './primitives.ts';
import { diagnosticToolCallSchema, diagnosticToolResultSchema, type DiagnosticToolCall, type DiagnosticToolResult, toolNames } from './tool-contracts.ts';
import { hypothesisSchema, type Evidence, type Hypothesis, type VerificationExperiment } from './types.ts';
import { profileEvaluationDataset } from './dataset-profiler.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { executeDiagnostic } from './tool-registry.ts';

export const INVESTIGATOR_LIMITS = Object.freeze({ rounds: 16, tools: 10, errors: 3, hypotheses: 5, durationMs: 120000, transcriptBytes: 1000000, responseBytes: 262144 });
export type InvestigatorProvider = (input: readonly unknown[], signal: AbortSignal) => Promise<unknown>;
export type InvestigatorRequest = { objective: string; datasets: readonly EvaluationDataset[]; consent: true; accuracyParadoxGap: number };
export type InvestigatorRun = {
  objective: string; createdAt: string; updatedAt: string;
  id: Id<'investigation'>; status: 'running' | 'completed' | 'stopped'; stopReason: string | null;
  toolCalls: DiagnosticToolCall[]; toolResults: DiagnosticToolResult[]; evidence: Evidence[];
  hypotheses: Hypothesis[]; experiments: VerificationExperiment[];
  datasets: EvaluationDataset['metadata'][]; sources: EvaluationDataset['source'][];
  artifacts: { resultId: Id<'result'>; details: unknown }[];
  events: { sequence: number; kind: string; entityId: string | null; code: string }[];
  completion: { reason: 'sufficient_evidence' | 'insufficient_evidence'; evidenceIds: Id<'evidence'>[]; missingEvidence: string[] } | null;
};
const proposal = object({ kind: enumeration(['accuracy_paradox', 'other']), statement: text, evidenceIds, missingEvidence: array(text, 0, 10) });
const completion = object({ reason: enumeration(['sufficient_evidence', 'insufficient_evidence']), evidenceIds, missingEvidence: array(text, 0, 10) });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object');
  return value as Record<string, unknown>;
}
/** Pure orchestration boundary. Production supplies the server provider; tests use scripted providers. */
export async function runInvestigator(request: InvestigatorRequest, provider: InvestigatorProvider, signal: AbortSignal, limits = INVESTIGATOR_LIMITS, onEvent?: (event: InvestigatorRun['events'][number]) => void): Promise<InvestigatorRun> {
  if (request.consent !== true) throw new Error('Explicit provider consent is required');
  text.parse(request.objective);
  const accuracyParadoxGap = request.accuracyParadoxGap;
  if (!Number.isFinite(request.accuracyParadoxGap) || request.accuracyParadoxGap <= 0 || request.accuracyParadoxGap > 100) throw new Error('Declare a positive accuracy-paradox gap up to 100 percentage points');
  for (const key of Object.keys(INVESTIGATOR_LIMITS) as (keyof typeof INVESTIGATOR_LIMITS)[]) if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > INVESTIGATOR_LIMITS[key]) throw new Error('Limits may only be reduced');
  limits = Object.freeze({ ...limits });
  if (!Array.isArray(request.datasets) || !request.datasets.length || request.datasets.length > 3 || request.datasets.reduce((n, d) => n + d.rows.length, 0) > 20000) throw new Error('Register 1-3 datasets with at most 20,000 total rows');
  // Snapshot before the first await: outside mutations cannot change measured evidence.
  const datasets = new Map(request.datasets.map(d => { const copy = structuredClone(d); profileEvaluationDataset(copy); return [copy.metadata.id, copy] as const; }));
  if (datasets.size !== request.datasets.length) throw new Error('Duplicate dataset IDs');
  const now = new Date().toISOString();
  const run: InvestigatorRun = { objective: request.objective, createdAt: now, updatedAt: now, id: createId('investigation'), status: 'running', stopReason: null, toolCalls: [], toolResults: [], evidence: [], hypotheses: [], experiments: [], events: [], completion: null, datasets: [...datasets.values()].map(d => d.metadata), sources: [...new Map([...datasets.values()].map(d => [d.source.id, d.source])).values()], artifacts: [] };
  const event = (kind: string, code: string, entityId: string | null = null) => { const item = { sequence: run.events.length, kind, code, entityId }; run.events.push(item); try { onEvent?.({ ...item }); } catch { /* Observers cannot alter execution. */ } };
  const stop = (code: string) => { run.updatedAt = new Date().toISOString(); run.status = 'stopped'; run.stopReason = code; event('stopped', code); return run; };
  const started = Date.now();
  const deadline = AbortSignal.timeout(limits.durationMs);
  const active = AbortSignal.any([signal, deadline]);
  const history: unknown[] = [{ role: 'user', content: JSON.stringify({ objective: request.objective, datasets: [...datasets.values()].map(d => d.metadata), accuracyParadoxGap: request.accuracyParadoxGap, limits }) }];
  const cache = new Map<string, unknown>();
  const callIds = new Set<string>();
  const accuracyHypotheses = new Set<string>();
  let errors = 0;
  const references = (ids: readonly string[]) => { if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !run.evidence.some(e => e.id === id))) throw new Error('Unknown evidence'); };
  for (let round = 0; round < limits.rounds; round++) {
    if (active.aborted || Date.now() - started >= limits.durationMs) return stop(signal.aborted ? 'cancelled' : 'deadline');
    if (new TextEncoder().encode(JSON.stringify(history)).length > limits.transcriptBytes) return stop('transcript_limit');
    let response: Record<string, unknown>;
    try {
      // Race also bounds a malfunctioning provider that ignores AbortSignal.
      const raw = await new Promise<unknown>((resolve, reject) => {
        const abort = () => reject(new Error('Aborted'));
        active.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => provider(structuredClone(history), active)).then(resolve, reject).finally(() => active.removeEventListener('abort', abort));
        if (active.aborted) abort();
      });
      if (active.aborted || Date.now() - started >= limits.durationMs) return stop(signal.aborted ? 'cancelled' : 'deadline');
      if (new TextEncoder().encode(JSON.stringify(raw)).length > limits.responseBytes) return stop('response_limit');
      response = record(raw);
      if (response.status !== 'completed' || !Array.isArray(response.output)) return stop('invalid_response');
    } catch { return stop(active.aborted ? (signal.aborted ? 'cancelled' : 'deadline') : 'provider_error'); }
    const output = response.output as unknown[];
    let call: Record<string, unknown>;
    try {
      const entries = output.map(record);
      if (entries.some(e => !['reasoning', 'function_call'].includes(String(e.type)))) return stop('unexpected_output');
      const calls = entries.filter(e => e.type === 'function_call');
      if (calls.length !== 1) return stop('expected_one_call');
      call = calls[0];
      if (typeof call.call_id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(call.call_id) || callIds.has(call.call_id) || typeof call.name !== 'string' || typeof call.arguments !== 'string' || call.arguments.length > 16000) return stop('invalid_call');
      callIds.add(call.call_id);
    } catch { return stop('invalid_call'); }
    history.push(...output);
    let feedback: unknown;
    try {
      const args: unknown = JSON.parse(call.arguments as string);
      const name = call.name as string;
      if (name === 'finish_investigation') {
        const done = completion.parse(args); references(done.evidenceIds);
        if (!run.toolResults.some(r => r.status === 'completed') || (done.reason === 'insufficient_evidence' && !done.missingEvidence.length)) throw new Error('Premature completion');
        run.updatedAt = new Date().toISOString(); run.completion = done; run.status = 'completed'; event('completed', done.reason); return run;
      }
      if (name === 'propose_hypothesis') {
        const proposed = proposal.parse(args); references(proposed.evidenceIds);
        if (run.hypotheses.length >= limits.hypotheses || run.hypotheses.some(h => h.statement.trim().toLowerCase() === proposed.statement.trim().toLowerCase())) throw new Error('Duplicate or excessive hypothesis');
        const statement = proposed.kind === 'accuracy_paradox' ? 'Class imbalance is making raw accuracy misleading.' : proposed.statement;
        if (run.hypotheses.some(h => h.statement === statement)) throw new Error('Duplicate hypothesis');
        const hypothesis = hypothesisSchema.parse({ id: createId('hypothesis'), statement, status: 'proposed', confidence: { kind: 'evidence_strength', level: 'unassessed', rationale: 'Model proposal; not a verified diagnosis.' }, evidence: proposed.evidenceIds.map(evidenceId => ({ evidenceId, relationship: 'supports', rationale: 'Proposed relevance; requires verification.' })), unresolvedQuestions: proposed.missingEvidence });
        if (proposed.kind === 'accuracy_paradox') accuracyHypotheses.add(hypothesis.id);
        run.hypotheses.push(hypothesis); feedback = { hypothesis }; event('hypothesis_registered', 'proposed', hypothesis.id);
      } else {
        if (!toolNames.includes(name as typeof toolNames[number])) throw new Error('Unsupported tool');
        const diagnostic = diagnosticToolCallSchema.parse({ id: createId('call'), investigationId: run.id, tool: name, toolVersion: 1, requestedAt: new Date().toISOString(), input: args });
        const input = diagnostic.input;
        if ('columns' in input && input.columns.length > 10 || 'featureColumns' in input && input.featureColumns.length > 10) throw new Error('Excessive columns');
        if (diagnostic.tool === 'run_counterfactual_test' && (!accuracyHypotheses.has(diagnostic.input.hypothesisId) || diagnostic.input.criterion.value !== accuracyParadoxGap)) throw new Error('Unknown hypothesis or changed criterion');
        // Canonicalize unordered selections; counterfactual seed is unused by exact weighting.
        const keyInput = structuredClone(input) as Record<string, unknown>;
        for (const key of ['columns', 'featureColumns', 'thresholds', 'assumptionEvidenceIds']) if (Array.isArray(keyInput[key])) keyInput[key] = [...keyInput[key]].sort();
        if (diagnostic.tool === 'run_counterfactual_test') delete keyInput.seed;
        const key = name + ':' + canonical(keyInput);
        if (cache.has(key)) { feedback = { cached: true, data: cache.get(key) }; errors++; event('duplicate_reused', 'cached'); }
        else {
          if (run.toolCalls.length >= limits.tools) return stop('tool_limit');
          const scope = 'datasetId' in input ? [input.datasetId] : [input.referenceDatasetId, input.comparisonDatasetId];
          if (scope.some(id => !datasets.has(id))) throw new Error('Unknown dataset');
          const columns = [...('columns' in input ? input.columns : []), ...('featureColumns' in input ? input.featureColumns : []), ...('targetColumn' in input && input.targetColumn !== null ? [input.targetColumn] : []), ...('predictionTimeColumn' in input && input.predictionTimeColumn !== null ? [input.predictionTimeColumn] : []), ...('outcomeTimeColumn' in input && input.outcomeTimeColumn !== null ? [input.outcomeTimeColumn] : [])];
          if (scope.some(id => columns.some(c => !datasets.get(id)!.metadata.columns.includes(c))) || 'positiveLabel' in input && datasets.get(scope[0])!.labels.positive !== input.positiveLabel || 'costs' in input && input.costs !== null || 'assumptionEvidenceIds' in input && input.assumptionEvidenceIds.length) throw new Error('Unregistered column, class mapping or assumption');
          run.toolCalls.push(diagnostic); event('tool_requested', name, diagnostic.id);
          let report: ReturnType<typeof executeDiagnostic>;
          try { report = executeDiagnostic(diagnostic, datasets); }
          catch {
            const datasetIds = 'datasetId' in input ? [input.datasetId] : [input.referenceDatasetId, input.comparisonDatasetId];
            const result = diagnosticToolResultSchema.parse({ id: createId('result'), callId: diagnostic.id, tool: diagnostic.tool, toolVersion: 1, completedAt: new Date().toISOString(), datasetIds, evidenceIds: [], limitations: [], status: 'error', error: { code: 'execution_rejected', message: 'The requested diagnostic is unsupported for this input or exceeded its constraints.', retryable: false } });
            report = { result, evidence: [], experiments: [], details: null };
            errors++;
          }
          run.toolResults.push(report.result); run.evidence.push(...report.evidence); run.experiments.push(...report.experiments);
          if (report.details !== null) run.artifacts.push({ resultId: report.result.id, details: report.details });
          if (active.aborted || Date.now() - started >= limits.durationMs) return stop(signal.aborted ? 'cancelled' : 'deadline');
          feedback = report; cache.set(key, report); event(report.result.status === 'completed' ? 'tool_completed' : 'tool_failed', name, report.result.id);
        }
      }
    } catch { feedback = { error: 'invalid_or_unsupported_operation', instruction: 'Use registered IDs, supported arguments and declared limits. Do not repeat this call.' }; errors++; event('operation_rejected', 'invalid_or_unsupported_operation'); }
    history.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(feedback) });
    if (errors >= limits.errors) return stop('error_limit');
  }
  return stop('round_limit');
}

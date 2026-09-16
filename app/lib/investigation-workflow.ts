import { trainingLogSchema } from './investigation/training-logs.ts';
﻿import { array, literal, number, object, schema, text } from './investigation/schema.ts';
import { validateFinalInvestigation } from './investigation/final-diagnosis.ts';
const csv = schema<string>((v) => { if (typeof v !== 'string' || !v.trim() || new TextEncoder().encode(v).length > 2000000) throw new Error('Each CSV must contain at most 2 MB of UTF-8 text.'); return v; });
const uploadSchema = object({
  objective: text, consent: literal(true), accuracyParadoxGap: number(0.001, 100),
  trainingLogs: array(trainingLogSchema, 0, 1),
  labels: object({ positive: text, negative: text }), files: array(object({ name: text, text: csv }), 1, 3),
});
export const investigationUploadSchema = schema(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return uploadSchema.parse(value);
  return uploadSchema.parse({ trainingLogs: [], ...value });
});
export const activityLabels: Record<string, string> = {
  profile_dataset: 'Dataset profile and prevalence measured', compute_classification_metrics: 'Classification metrics measured',
  threshold_sweep: 'Threshold sensitivity analyzed', check_calibration: 'Calibration measured', scan_feature_leakage: 'Leakage screening completed',
  run_drift_tests: 'Distribution comparison completed', slice_evaluation: 'Slice performance measured', run_counterfactual_test: 'Hypothesis tested',
};
export function activityMessage(kind: string, code: string): string | null {
  if (kind === 'tool_requested' && Object.hasOwn(activityLabels, code)) return `Diagnostic requested: ${code.replaceAll('_', ' ')}`;
  if (kind === 'tool_completed' && Object.hasOwn(activityLabels, code)) return activityLabels[code];
  const labels: Record<string,string> = { tool_failed: 'Diagnostic could not run on this input', hypothesis_registered: 'Evidence-linked hypothesis registered', duplicate_reused: 'Existing result reused', operation_rejected: 'Invalid operation rejected', completed: 'Investigation loop completed', stopped: 'Investigation stopped; retaining available evidence' };
  return Object.hasOwn(labels,kind)?labels[kind]:null;
}
export type WorkflowMessage = { type: 'progress'; message: string } | { type: 'error'; message: string } | { type: 'result'; investigation: ReturnType<typeof validateFinalInvestigation> };
export function parseWorkflowMessage(value: unknown): WorkflowMessage {
  if (!value || typeof value !== 'object') throw new Error('Invalid investigation stream.');
  if ('type' in value && value.type === 'result') return object({ type: literal('result'), investigation: schema(validateFinalInvestigation) }).parse(value);
  return object({ type: schema<'progress'|'error'>(v=>{if(v!=='progress'&&v!=='error')throw new Error('Invalid event');return v;}), message: text }).parse(value);
}
/** Incremental NDJSON reader handles split UTF-8 chunks and rejects truncated/oversized responses. */
export async function readInvestigationStream(response: Response, receive: (message: WorkflowMessage) => void) {
  if (!response.ok) { let message='Unable to start investigation.';try{const body=await response.json();if(typeof body.error==='string')message=body.error;}catch{}throw new Error(message); }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body) throw new Error('Unexpected investigation response.');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let pending='',bytes=0,terminal=false;
  const line=(text:string)=>{if(!text.trim())return;if(terminal)throw new Error('Unexpected event after completion.');const event=parseWorkflowMessage(JSON.parse(text));terminal=event.type!=='progress';receive(event);};
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8000000)throw new Error('Investigation response exceeds 8 MB.');pending+=decoder.decode(value,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){line(pending.slice(0,end));pending=pending.slice(end+1);}}pending+=decoder.decode();if(pending.trim())line(pending);if(!terminal)throw new Error('Investigation connection ended before a result.');}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}

import type { Evidence } from './evidence';
import type { Dataset, ContextAnswers } from './dataset';
import type { ExperimentPlan, ExperimentResult } from './experiments';
export type SavedAttempt = { plan: ExperimentPlan; result: ExperimentResult; notes: string; controlled: boolean };
export type Snapshot = { logs: string; analysis: string; tab: number; complete: boolean; evidence: Evidence | null; datasets: Partial<Record<'Training'|'Validation'|'Production',Dataset>>; target: string; task: string; experiments: Record<string,SavedAttempt[]>; answers: ContextAnswers };
export type SavedCase = { version: 1; id: string; name: string; notes: string; updatedAt: string; snapshot: Snapshot };
export const STORAGE_KEY='whylab.cases.v1';
export function emptySnapshot(): Snapshot { return {logs:'',analysis:'General diagnosis',tab:0,complete:false,evidence:null,datasets:{},target:'',task:'classification',experiments:{},answers:{}}; }
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const string=(v:unknown)=>typeof v==='string';
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const strings=(v:unknown)=>Array.isArray(v)&&v.every(string);
const fields=(v:unknown,keys:string[])=>object(v)&&keys.every(k=>string(v[k]));
function validSnapshot(v:unknown):v is Snapshot {
 if(!object(v)||!fields(v,['logs','analysis','target','task'])||![0,1,2].includes(v.tab as number)||typeof v.complete!=='boolean'||!['classification','regression'].includes(v.task as string))return false;
 if(!['General diagnosis','Data quality & distribution','Training & optimization','Evaluation & leakage'].includes(v.analysis as string))return false;
 if(!object(v.datasets)||!object(v.experiments)||!object(v.answers))return false;
 for(const [role,d] of Object.entries(v.datasets))if(!['Training','Validation','Production'].includes(role)||!object(d)||!string(d.name)||!strings(d.headers)||!(d.headers as string[]).length||(d.headers as string[]).length>100||(d.headers as string[]).some(h=>!h.trim())||new Set(d.headers as string[]).size!==(d.headers as string[]).length||!Array.isArray(d.rows)||!d.rows.length||d.rows.length>10000||!d.rows.every(r=>strings(r)&&r.length===(d.headers as string[]).length))return false;
 for(const [key,answer] of Object.entries(v.answers))if(!['sameRun','available','comparable'].includes(key)||!['','yes','no'].includes(answer as string))return false;
 for(const [key,attempts] of Object.entries(v.experiments)) {
  if(!/^[a-z][a-z-]*$/.test(key)||['constructor','prototype'].includes(key)||!Array.isArray(attempts)||attempts.length>1000)return false;
  for(const a of attempts)if(!object(a)||!fields(a.plan,['change','fixed','metric','expectation','threshold','reason'])||!object(a.result)||!['before','after','delta'].every(k=>finite((a.result as Record<string,unknown>)[k]))||!fields(a.result,['outcome','explanation'])||!['Consistent with hypothesis','Contradicts prediction','Inconclusive'].includes(a.result.outcome as string)||!string(a.notes)||typeof a.controlled!=='boolean')return false;
  for(const a of attempts){const {plan,result}=a;const threshold=Number(plan.threshold);if(!['Accuracy (%)','Recall (%)','Macro F1 (%)','Loss'].includes(plan.metric)||!['increase','decrease'].includes(plan.expectation)||!Number.isFinite(threshold)||threshold<=0||result.before<0||result.after<0)return false;if(plan.metric!=='Loss'&&(result.before>100||result.after>100||threshold>100))return false;const expected=result.after-result.before;if(Math.abs(result.delta-expected)>Number.EPSILON*Math.max(1,Math.abs(expected),Math.abs(result.before),Math.abs(result.after))*4)return false;}
 }
 const e=v.evidence;
 if(e!==null) {
  if(!object(e)||!fields(e,['source','format'])||!strings(e.warnings)||!Array.isArray(e.metrics)||!e.metrics.every(m=>fields(m,['label','value','source']))||!Array.isArray(e.findings)||!e.findings.every(f=>fields(f,['title','evidence','experiment','strength','category'])&&['Missing feature values','Repeated observations','Possible class imbalance','Possible distribution shift','Possible overfitting','Possible stalled learning','Possible unstable training'].includes(f.title))||!Array.isArray(e.history)||e.history.length>10000)return false;
  if(!e.history.every(p=>object(p)&&Number.isSafeInteger(p.epoch)&&Number(p.epoch)>=0&&object(p.metrics)&&Object.entries(p.metrics).every(([k,n])=>['Training loss','Validation loss','Training accuracy','Validation accuracy'].includes(k)&&finite(n)&&Number(n)>=0&&(!k.endsWith('accuracy')||Number(n)<=1))&&strings(p.sources)))return false;
  const history=e.history;
  if(history.some((p,i)=>i>0&&p.epoch<=history[i-1].epoch))return false;
 }
 return !(v.complete&&e===null);
}
export function parseCase(text:string): SavedCase {
 if(text.length>8_000_000)throw new Error('Case exceeds the 8 MB import limit.');
 let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('This is not valid case JSON.');}
 if(!object(value)||value.version!==1||!fields(value,['id','name','notes','updatedAt'])||!(value.name as string).trim()||(value.name as string).length>120||!Number.isFinite(Date.parse(value.updatedAt as string))||!validSnapshot(value.snapshot))throw new Error('Unsupported or malformed WhyLab case. Import a version 1 JSON export.');
 return value as unknown as SavedCase;
}
const escape=(s:string)=>s.replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
export function caseMarkdown(c:SavedCase, combined: {title:string;support:string[];conflicts:string[];missing:string[];experiment:string}[] = []):string {
 const s=c.snapshot;
 const lines=[`# ${escape(c.name)}`,`Updated: ${c.updatedAt}`,'','## Notes',escape(c.notes)||'No notes.','','## Evidence',s.evidence?`${escape(s.evidence.source)} (${escape(s.evidence.format)})`:'No completed evidence.'];
 for(const m of s.evidence?.metrics??[])lines.push(`- ${escape(m.label)}: ${escape(m.value)}`);
 lines.push('','## Hypotheses');
 for(const f of s.evidence?.findings??[])lines.push(`### ${escape(f.title)}`,escape(f.evidence),`Verification: ${escape(f.experiment)}`,'');
 lines.push('','## Combined diagnosis');for(const f of combined)lines.push('### '+escape(f.title),...f.support.map(p=>'- Evidence: '+escape(p)),...f.conflicts.map(p=>'- Conflicting context: '+escape(p)),...f.missing.map(p=>'- Missing: '+escape(p)),'Verification: '+escape(f.experiment),'');
 lines.push('','## Datasets');for(const [role,d] of Object.entries(s.datasets))lines.push(`- ${role}: ${escape(d.name)}, ${d.rows.length} rows, ${d.headers.length} columns`);
 lines.push('','## Verification history');
 for(const [hypothesis,attempts] of Object.entries(s.experiments))for(const [i,a] of attempts.entries())lines.push(`### ${escape(hypothesis)} / attempt ${i+1}`,`Metric: ${escape(a.plan.metric)}; baseline ${a.result.before}; result ${a.result.after}; change ${a.result.delta}.`,`Outcome: ${escape(a.result.outcome)}`,`Change: ${escape(a.plan.change)}`,`Controls: ${escape(a.plan.fixed)}`,`Notes: ${escape(a.notes)}`,'');
 lines.push('','Results are user-provided observations and heuristic interpretations, not confirmed causes. JSON exports contain the full saved workspace.');return lines.join('\n');
}

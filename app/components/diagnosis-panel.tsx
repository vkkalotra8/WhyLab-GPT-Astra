"use client";
import { useMemo } from 'react';
import { useCaseState } from './case-manager';
import ExperimentWorkflow from './experiment-workflow';
import ExplanationAssistant from './explanation-assistant';
import InteractiveLesson from './interactive-lesson';
import type { Evidence } from '../lib/evidence';
import { diagnose, type Dataset } from '../lib/dataset';
export default function DiagnosisPanel({ evidence, datasets, target, task }: { evidence: Evidence | null; datasets: Partial<Record<'Training'|'Validation'|'Production',Dataset>>; target: string; task: string }) {
  const [experiments,setExperiments]=useCaseState('experiments');
  const [answers,setAnswers]=useCaseState('answers');
  const findings=useMemo(()=>diagnose(evidence,datasets,target,task,answers),[evidence,datasets,target,task,answers]);
  return <section className="dataset-comparison diagnosis-panel" aria-labelledby="diagnosis-heading"><span className="eyebrow cyan">05 / COMBINED DIAGNOSIS</span><h2 id="diagnosis-heading">Build the case.</h2><p className="description">Combines the completed investigation with dataset evidence. Priority reflects review order, not probability or a confirmed cause. User answers are context, not independently verified evidence.</p>
    <div className="dataset-options">{([{key:'sameRun',label:'Do these datasets belong to the logged experiment?'},{key:'comparable',label:'Are preprocessing and metric definitions comparable?'},{key:'available',label:'Was the suspect feature available before prediction?'}] as const).filter(q => q.key === 'available' ? findings.some(f => f.id === 'leakage') : q.key === 'sameRun' ? Boolean(evidence && datasets.Training) : Boolean(evidence)).map(q=><label key={q.key}>{q.label}<select value={answers[q.key]??''} onChange={e=>setAnswers(a=>({...a,[q.key]:e.target.value}))}><option value="">Unknown / not checked</option><option value="yes">Yes</option><option value="no">No</option></select></label>)}</div>
    <p role="status" className="description">{findings.length} hypotheses supported by current evidence.</p>
    {!findings.length&&<p className="empty-findings">No supported hypothesis yet. Complete a log investigation or add a training dataset. Absence of a triggered rule does not establish model health.</p>}
    {findings.map((f,i)=><details key={f.id} className="diagnosis-item"><summary>{i+1}. {f.title}<span>Latest verification: {experiments[f.id]?.at(-1)?.result.outcome ?? "Not yet verified"}</span><span>Review priority: {['Limited','Low','Medium','High'][f.score]}</span></summary><p className="description">{f.rationale}</p><div className="hypothesis-detail"><div><h3>Supporting evidence</h3><ul>{f.support.map((s,j)=><li key={j}>{s}</li>)}</ul></div><div><h3>Conflicting evidence / context</h3><ul>{(f.conflicts.length?f.conflicts:['No conflicting evidence detected in the supplied inputs; this is not confirmation.']).map((s,j)=><li key={j}>{s}</li>)}</ul></div><div><h3>Missing evidence</h3><ul>{f.missing.map((s,j)=><li key={j}>{s}</li>)}</ul></div><div><h3>Next verification</h3><p>{f.experiment}</p><p>{f.question}</p></div></div><ExplanationAssistant diagnosis={f}/><ExperimentWorkflow diagnosisId={f.id} suggestion={f.experiment} records={experiments[f.id]??[]} onRecord={record=>setExperiments(previous=>({...previous,[f.id]:[...(previous[f.id]??[]),record]}))}/><InteractiveLesson diagnosisId={f.id} evidence={f.support[0]}/></details>)}
  </section>;
}

"use client";
import { useMemo } from 'react';
import { useCaseState } from './case-manager';
import ExperimentWorkflow from './experiment-workflow';
import ExplanationAssistant from './explanation-assistant';
import InteractiveLesson from './interactive-lesson';
import type { Evidence } from '../lib/evidence';
import { diagnose, type Dataset } from '../lib/dataset';
export default function DiagnosisPanel({ evidence, datasets, target, task, sharedToken, onSharedTokenChange }: { evidence: Evidence | null; datasets: Partial<Record<'Training'|'Validation'|'Production',Dataset>>; target: string; task: string; sharedToken?: string; onSharedTokenChange?: (token: string) => void }) {
  const [experiments,setExperiments]=useCaseState('experiments');
  const [answers,setAnswers]=useCaseState('answers');
  const findings=useMemo(()=>diagnose(evidence,datasets,target,task,answers),[evidence,datasets,target,task,answers]);
  const questions=useMemo(()=>([
    {key:'sameRun',label:'Do these datasets belong to the logged experiment?'},
    {key:'comparable',label:'Are preprocessing and metric definitions comparable?'},
    {key:'available',label:'Was the suspect feature available before prediction?'}
  ] as const).filter(q=>q.key==='available'?findings.some(f=>f.id==='leakage'):q.key==='sameRun'?Boolean(evidence&&datasets.Training):Boolean(evidence)),[findings,evidence,datasets]);
  return <section className="diagnosis-panel" aria-labelledby="diagnosis-heading"><span className="eyebrow cyan">COMBINED DIAGNOSIS</span><h2 id="diagnosis-heading">Build the case.</h2><p className="description">Combines the completed investigation with dataset evidence. Priority reflects review order, not probability or a confirmed cause. User answers are context, not independently verified evidence.</p>
    {questions.length>0&&<div className="dataset-options">{questions.map(q=><label key={q.key}><span className="option-label-text">{q.label}</span><select value={answers[q.key]??''} onChange={e=>setAnswers(a=>({...a,[q.key]:e.target.value}))}><option value="">Unknown / not checked</option><option value="yes">Yes</option><option value="no">No</option></select></label>)}</div>}
    <p role="status" className="hypothesis-count-status description">{findings.length} hypotheses supported by current evidence.</p>
    {!findings.length&&<p className="empty-findings">No supported hypothesis yet. Complete a log investigation or add a training dataset. Absence of a triggered rule does not establish model health.</p>}
    {findings.map((f,i)=><details key={f.id} className="diagnosis-item"><summary>{i+1}. {f.title}<span>Latest verification: {experiments[f.id]?.at(-1)?.result.outcome ?? "Not yet verified"}</span><span>Review priority: {['Limited','Low','Medium','High'][f.score]}</span></summary><p className="description">{f.rationale}</p><div className="hypothesis-detail"><div className="evidence-col evidence-support"><h3>Supporting evidence</h3><ul>{f.support.map((s,j)=><li key={j}>{s}</li>)}</ul></div><div className="evidence-col evidence-conflicts"><h3>Conflicting evidence / context</h3><ul>{(f.conflicts.length?f.conflicts:['No conflicting evidence detected in the supplied inputs; this is not confirmation.']).map((s,j)=><li key={j}>{s}</li>)}</ul></div><div className="evidence-col evidence-missing"><h3>Missing evidence</h3><ul>{f.missing.map((s,j)=><li key={j}>{s}</li>)}</ul></div><div className="evidence-col evidence-next"><h3>Next verification</h3><p className="next-experiment-step">{f.experiment}</p><p className="next-question-step">{f.question}</p></div></div><ExplanationAssistant diagnosis={f} sharedToken={sharedToken} onSharedTokenChange={onSharedTokenChange}/><ExperimentWorkflow diagnosisId={f.id} suggestion={f.experiment} records={experiments[f.id]??[]} onRecord={record=>setExperiments(previous=>({...previous,[f.id]:[...(previous[f.id]??[]),record]}))}/><InteractiveLesson diagnosisId={f.id} evidence={f.support[0]}/></details>)}
  </section>;
}

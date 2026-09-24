"use client";
import { useId, useState } from 'react';
import { compareExperiment, createPlan, type ExperimentPlan, type ExperimentResult } from '../lib/experiments';
export type RecordedExperiment = { plan: ExperimentPlan; result: ExperimentResult; notes: string; controlled: boolean };
export default function ExperimentWorkflow({ diagnosisId, suggestion, records, onRecord }: { diagnosisId: string; suggestion: string; records: RecordedExperiment[]; onRecord: (record: RecordedExperiment)=>void }) {
  const [plan,setPlan]=useState(()=>createPlan(diagnosisId,suggestion));
  const [before,setBefore]=useState(''),[after,setAfter]=useState(''),[notes,setNotes]=useState('');
  const [controlled,setControlled]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const id=useId();
  function update<K extends keyof ExperimentPlan>(key:K,value:ExperimentPlan[K]) {setPlan(p=>({...p,[key]:value}));setSaved(false);setError('');}
  function record(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError('');try{if(!plan.change.trim()||!plan.fixed.trim()||!notes.trim())throw new Error('Describe the intervention, fixed conditions, and observations before recording.');const result=compareExperiment(before,after,plan.metric,plan.expectation,plan.threshold,controlled);onRecord({plan:{...plan},result,notes,controlled});setSaved(true);}catch(cause){setError(cause instanceof Error?cause.message:'Unable to compare results.');}}
  return <details className="experiment-workflow">
    <summary>Verify this hypothesis</summary>
    <div className="experiment-workflow-content">
      <p className="description">Run this experiment in your own training environment, then record the measurements here. Define the prediction and threshold before running it. WhyLab does not execute model training.</p>
      
      <form onSubmit={record} onChange={()=>setSaved(false)}>
        <header className="experiment-group-header">
          <span className="eyebrow blue">GROUP A · DEFINE THE EXPERIMENT</span>
        </header>
        <div className="experiment-fields experiment-group-a">
          <label htmlFor={`${id}-change`}>
            <span>Change one factor</span>
            <textarea id={`${id}-change`} value={plan.change} onChange={e=>update('change',e.target.value)} rows={3} required/>
          </label>
          <label htmlFor={`${id}-fixed`}>
            <span>Hold constant</span>
            <textarea id={`${id}-fixed`} value={plan.fixed} onChange={e=>update('fixed',e.target.value)} rows={3} required/>
          </label>
        </div>

        <header className="experiment-group-header">
          <span className="eyebrow blue">GROUP B · DEFINE THE EXPECTED OUTCOME</span>
        </header>
        <div className="experiment-fields experiment-group-b">
          <label>
            <span>Measure</span>
            <select value={plan.metric} onChange={e=>{update('metric',e.target.value);setBefore('');setAfter('');update('threshold',e.target.value==='Loss'?'0.01':'1');}}>
              {['Accuracy (%)','Recall (%)','Macro F1 (%)','Loss'].map(m=><option key={m}>{m}</option>)}
            </select>
          </label>
          <label>
            <span>Predicted direction</span>
            <select value={plan.expectation} onChange={e=>update('expectation',e.target.value as ExperimentPlan['expectation'])}>
              <option value="increase">Increase</option>
              <option value="decrease">Decrease</option>
            </select>
          </label>
          <label>
            <span>Minimum meaningful change ({plan.metric==='Loss'?'loss units':'percentage points'})</span>
            <input type="number" step="any" min="0.000001" value={plan.threshold} onChange={e=>update('threshold',e.target.value)} required/>
          </label>
        </div>

        <p className="description experiment-reason">{plan.reason}</p>

        <header className="experiment-group-header">
          <span className="eyebrow blue">GROUP C · RECORD THE MEASUREMENTS</span>
        </header>
        <div className="experiment-fields experiment-group-c">
          <label>
            <span>Baseline result ({plan.metric})</span>
            <input type="number" min="0" max={plan.metric==='Loss'?undefined:100} step="any" value={before} onChange={e=>setBefore(e.target.value)} required/>
          </label>
          <label>
            <span>Experiment result ({plan.metric})</span>
            <input type="number" min="0" max={plan.metric==='Loss'?undefined:100} step="any" value={after} onChange={e=>setAfter(e.target.value)} required/>
          </label>
        </div>

        <header className="experiment-group-header">
          <span className="eyebrow blue">GROUP D · CONFIRM AND RECORD</span>
        </header>
        <label className="experiment-check">
          <input type="checkbox" checked={controlled} onChange={e=>setControlled(e.target.checked)}/>
          <span>I kept the stated controls and metric definitions consistent, except for the planned intervention.</span>
        </label>
        <label className="experiment-notes-field" htmlFor={`${id}-notes`}>
          <span>Observations / run identifiers</span>
          <textarea id={`${id}-notes`} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Record seeds, holdout identity, what changed, and limitations." rows={3} required/>
        </label>

        <p className="error" role="alert">{error}</p>
        <button className="new-button experiment-submit-btn" type="submit" disabled={saved}>{saved?'Result recorded':'Record and compare'}</button>
        <p role="status" className="description">{saved?'Hypothesis verification status updated. Edit a field to record another run.':'Results remain in this browser session and reset when investigation evidence changes.'}</p>
      </form>

      {records.length>0&&<div className="epoch-table verification-attempts-table">
        <table>
          <caption>Recorded verification attempts (oldest first)</caption>
          <thead>
            <tr>{['Run','Metric','Baseline','Result','Change','Interpretation','Plan and observations'].map(h=><th scope="col" key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {records.map((r,i)=><tr key={i}>
              <th scope="row">{i+1}</th>
              <td>{r.plan.metric}</td>
              <td>{r.result.before}</td>
              <td>{r.result.after}</td>
              <td>{r.result.delta>=0?'+':''}{Number(r.result.delta.toPrecision(6))} {r.plan.metric==='Loss'?'units':'pp'}</td>
              <td>{r.result.outcome}<p className="attempt-explanation">{r.result.explanation}</p></td>
              <td>
                <details>
                  <summary>View saved plan</summary>
                  <p>Change: {r.plan.change}</p>
                  <p>Controls: {r.plan.fixed}</p>
                  <p>Prediction: {r.plan.expectation}; threshold: {r.plan.threshold}</p>
                  <p>Controls confirmed: {r.controlled?'Yes':'No'}</p>
                  <p>{r.notes}</p>
                </details>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </div>
  </details>;
}

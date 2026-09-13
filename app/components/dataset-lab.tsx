"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCsv } from '../lib/evidence';
import { compareDatasets, profileDataset } from '../lib/dataset';
import { useCaseState } from './case-manager';
import DiagnosisPanel from './diagnosis-panel';
import type { Evidence } from '../lib/evidence';
const roles = ['Training', 'Validation', 'Production'] as const;
export default function DatasetLab({ evidence }: { evidence: Evidence | null }) {
  const [datasets,setDatasets]=useCaseState('datasets');
  const [target,setTarget]=useCaseState('target');
  const [task,setTask]=useCaseState('task');
  const [error,setError]=useState('');
  const [reading,setReading]=useState(false);
  const generation=useRef(0);
  const [revision,setRevision]=useState(0);
  const [previousEvidence,setPreviousEvidence]=useState(evidence);
  if(previousEvidence!==evidence){setPreviousEvidence(evidence);setRevision(r=>r+1);}
  useEffect(() => () => { generation.current++; }, []);
  const training=datasets.Training;
  const profiles=useMemo(()=>training ? profileDataset(training,target,task) : [],[training,target,task]);
  async function upload(role: typeof roles[number], file?: File) {
    if(!file)return;
    const request=++generation.current;setError('');setReading(true);
    try {
      if(!/\.csv$/i.test(file.name)||file.size>2_000_000)throw new Error('Choose a UTF-8 CSV no larger than 2 MB.');
      const text=await file.text();
      if(request!==generation.current)return;
      if(text.includes('\uFFFD')||text.includes('\0'))throw new Error('Export this file as UTF-8 text.');
      const [headers,...rows]=parseCsv(text.replace(/^\uFEFF/,''));
      if(headers.length>100||rows.length>10000)throw new Error('Use at most 100 columns and 10,000 rows for interactive profiling.');
      setRevision(r=>r+1);setDatasets(previous=>({...previous,[role]:{name:file.name,headers,rows}}));
      if(role==='Training')setTarget('');
    }catch(cause){if(request===generation.current)setError(cause instanceof Error?cause.message:'Unable to read CSV.');}
    finally{if(request===generation.current)setReading(false);}
  }
  return <section className="panel dataset-lab" aria-labelledby="dataset-heading">
    <div className="section-heading"><div><span className="eyebrow cyan">02 / DATASET INVESTIGATION</span><h2 id="dataset-heading">Look inside your data.</h2></div><button className="new-button" onClick={()=>{generation.current++;setReading(false);setRevision(r=>r+1);setDatasets({});setTarget('');setError('');}}>Clear datasets</button></div>
    <p className="description">Profile a training CSV, then add validation or production data to compare. All analysis stays in your browser. Up to 2 MB, 10,000 rows, and 100 columns per file.</p>
    <div className="dataset-uploads">{roles.map(role=><label key={role}>{role} CSV<input type="file" accept=".csv" disabled={reading} onChange={event=>{void upload(role,event.target.files?.[0]);event.target.value='';}}/><span>{datasets[role] ? `${datasets[role]!.name} / ${datasets[role]!.rows.length} rows` : 'No file selected'}</span>{datasets[role]&&<button disabled={reading} onClick={event=>{event.preventDefault();setDatasets(previous=>{const next={...previous};delete next[role];return next;});if(role==='Training')setTarget('');}}>Remove {role.toLowerCase()} data</button>}</label>)}</div>
    <p role="status" className="description">{reading?'Reading CSV...':''}</p><p role="alert" className="error">{error}</p>
    {training ? <><div className="dataset-options"><label>Task type<select value={task} onChange={e=>{setTask(e.target.value);setRevision(r=>r+1);}}><option value="classification">Classification</option><option value="regression">Regression</option></select></label><label>Target column<select value={target} onChange={e=>{setTarget(e.target.value);setRevision(r=>r+1);}}><option value="">Select a target (optional)</option>{training.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label></div>
    <p className="description">Types are inferred from nonmissing values. Numeric class codes are valid classification labels. Select a target to check balance and exact target copies.</p>
    <div className="epoch-table dataset-table"><table><caption>Training column profiles</caption><thead><tr>{['Column','Inferred type','Missing','Distinct','Distribution / numeric range','Review signals'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{profiles.map(p=><tr key={p.name}><th scope="row">{p.name}{p.name===target?' (target)':''}</th><td>{p.type}</td><td>{p.missing} ({(p.missing/training.rows.length*100).toFixed(1)}%)</td><td>{p.distinct}</td><td>{p.mean!==undefined&&<p>Min {p.min?.toPrecision(4)} / mean {p.mean.toPrecision(4)} / max {p.max?.toPrecision(4)}</p>}{(p.mean===undefined||(p.name===target&&task==='classification'))&&p.top.map(([value,count])=><div key={value} className="class-frequency"><span>{value}: {count}</span><meter min={0} max={training.rows.length-p.missing} value={count}>{count}</meter></div>)}</td><td>{p.warnings.length?p.warnings.join(' '):'No rule triggered; this is not a quality guarantee.'}</td></tr>)}</tbody></table></div>
    {roles.slice(1).map(role=>datasets[role]&&<section key={role} className="dataset-comparison"><h3>{role} compared with training</h3><ul>{compareDatasets(training,datasets[role]!,target,task).map((message,i)=><li key={i}>{message}</li>)}</ul></section>)}
    </>:<p className="description">Add a training CSV to begin profiling. Validation and production files are optional.</p>}
    <DiagnosisPanel key={revision} evidence={evidence} datasets={datasets} target={target} task={task}/>
  </section>;
}

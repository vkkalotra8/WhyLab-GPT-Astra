'use client';
import { ingestTrainingLog, trainingLogSchema } from '../lib/investigation/training-logs';
import TrainingLogPreview from './training-log-preview';
import RepairLab from './repair-lab';
import { ingestEvaluationCsv, type EvaluationDataset } from '../lib/investigation/evaluation-ingestion';
import ChallengeReview from './challenge-review';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
import EvidenceGraph from './evidence-graph';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readInvestigationStream } from '../lib/investigation-workflow';
import type { Investigation } from '../lib/investigation/types';
const sample='y_true,y_pred,y_probability,site\n'+Array.from({length:100},(_,i)=>`${i<90?0:1},0,0.1,${i%2?'A':'B'}`).join('\n');
export default function AstraInvestigation(){
  const [repairDatasets,setRepairDatasets]=useState<EvaluationDataset[]>([]),[repairDatasetId,setRepairDatasetId]=useState('');
  const [available,setAvailable]=useState<boolean|null>(null),[configError,setConfigError]=useState(false);
  const [trainingLog,setTrainingLog]=useState(''),[trainingLogName,setTrainingLogName]=useState('training-log.txt');
  const [accessToken,setAccessToken]=useState('');
  const [csv,setCsv]=useState(''),[files,setFiles]=useState<File[]>([]),[positive,setPositive]=useState('1'),[negative,setNegative]=useState('0');
  const [objective,setObjective]=useState('Investigate why classification accuracy may be misleading.'),[gap,setGap]=useState('10'),[consent,setConsent]=useState(false),[specialist,setSpecialist]=useState<'general'|'metrics'|'data_quality'|'shift'|'leakage'>('general'),[steering,setSteering]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[events,setEvents]=useState<string[]>([]),[result,setResult]=useState<Investigation|null>(null);
  const controller=useRef<AbortController|null>(null),generation=useRef(0),heading=useRef<HTMLHeadingElement>(null),fileInput=useRef<HTMLInputElement>(null);
  const cancelActive=useCallback(()=>{controller.current?.abort();generation.current++;},[]);
  useEffect(()=>{const c=new AbortController();fetch('/api/investigate',{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();const body=await r.json();if(typeof body.available!=='boolean')throw new Error();setAvailable(body.available);}).catch(()=>{if(!c.signal.aborted)setConfigError(true);});return()=>{c.abort();cancelActive();};},[cancelActive]);
  function clear(){controller.current?.abort();generation.current++;setBusy(false);setResult(null);setRepairDatasets([]);setRepairDatasetId('');setEvents([]);setNotice('');setConsent(false);}
  async function loadFlagship(){
    clear();setFiles([]);if(fileInput.current)fileInput.current.value='';setBusy(true);
    try{const response=await fetch('/fixtures/melanoma-synthetic.csv',{cache:'no-store'});if(!response.ok)throw new Error();setCsv(await response.text());setPositive('1');setNegative('0');setGap('10');setObjective('Investigate why the synthetic melanoma classifier\'s 92% accuracy hides malignant-case failures. Choose diagnostics, falsify competing explanations where the supplied evidence permits, and identify what remains unverified.');setTrainingLogName('training-log.txt');setTrainingLog('epoch=1 train_loss=0.80 val_loss=0.82\nepoch=2 train_loss=0.55 val_loss=0.61\nepoch=3 train_loss=0.34 val_loss=0.52\nepoch=4 train_loss=0.22 val_loss=0.58\nepoch=5 train_loss=0.14 val_loss=0.71');setNotice('Flagship evidence loaded for Astra. Review it, confirm consent, then start the live investigation.');}
    catch{setNotice('Flagship fixture could not be loaded. Retry or select the CSV manually.');}finally{setBusy(false);}
  }
  async function start(){
    if(!consent||!Number.isFinite(Number(gap))||Number(gap)<.001||Number(gap)>100){setNotice('Confirm consent and enter a gap between 0.001 and 100 percentage points.');return;}
    const id=++generation.current,c=new AbortController();controller.current=c;setBusy(true);setNotice('');setEvents([]);setResult(null);setRepairDatasets([]);setRepairDatasetId('');
    try{
      const selected=files.length?await Promise.all(files.map(async f=>{if(f.size>2000000||!f.name.toLowerCase().endsWith('.csv'))throw new Error('Choose CSV files up to 2 MB each.');return {name:f.name,text:await f.text()};})):[{name:'pasted-evaluation.csv',text:csv}];
      if(c.signal.aborted)return;
      if(!selected[0]?.text.trim())throw new Error('Choose evaluation CSV files or paste predictions.');
      const trainingLogs=trainingLog.trim()?[trainingLogSchema.parse({name:trainingLogName,text:trainingLog})]:[];
      for(const log of trainingLogs)ingestTrainingLog(log);
      const completed:Investigation[]=[];
      const response=await fetch('/api/investigate',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json','X-WhyLab-Access-Token':accessToken},body:JSON.stringify({objective,steering:steering.trim()||null,specialist,trainingLogs,files:selected,labels:{positive,negative},accuracyParadoxGap:Number(gap),consent:true})});
      await readInvestigationStream(response,event=>{if(generation.current!==id)return;if(event.type==='progress')setEvents(items=>[...items,event.message]);else if(event.type==='error')throw new Error(event.message);else completed.push(event.investigation);});
      const final=completed[0];
      if(generation.current===id&&final){
        // Bind only retained submission bytes to matching server-registered metadata.
        const bound:EvaluationDataset[]=[];
        for(const metadata of final.datasets){
          const matches=selected.filter(file=>file.name===metadata.name);
          if(matches.length!==1)continue;
          try {
            const parsed=ingestEvaluationCsv(matches[0].text,matches[0].name,{labels:{positive,negative},datasetId:metadata.id,sourceId:metadata.sourceId});
            if(JSON.stringify(parsed.metadata)!==JSON.stringify(metadata))continue;
            const source=final.sources.find(source=>source.id===metadata.sourceId);if(!source)continue;
            bound.push({...parsed,source});
          } catch { /* Diagnosis stays available when a dataset cannot safely be rebound. */ }
        }
        setRepairDatasets(bound);setRepairDatasetId(bound[0]?.metadata.id??'');setResult(final);setNotice(final.status==='failed'?'Investigation stopped. Available evidence is shown below.':final.diagnosis?.status==='inconclusive'?'Investigation is inconclusive. Review the missing evidence below.':'Investigation finished. Review the evidence and verification below.');requestAnimationFrame(()=>heading.current?.focus());}
    }catch(error){if(generation.current===id)setNotice(c.signal.aborted?'Investigation cancelled. No completed diagnosis was received.':error instanceof Error?error.message:'Investigation failed. Try again.');}
    finally{if(generation.current===id)setBusy(false);}
  }
  function download(){if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='whylab-investigation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="astra-lab panel" aria-labelledby="astra-heading" id="astra-lab">
    <div className="panel-heading"><div><span className="eyebrow cyan">AUTONOMOUS INVESTIGATION</span><h2 id="astra-heading">Investigate with Astra</h2></div><span className="local-note">{available?'AI CONFIGURED':configError?'STATUS UNAVAILABLE':available===false?'CONFIGURATION REQUIRED':'CHECKING CONNECTION'}</span></div>
    <p className="description">Give Astra evaluation predictions. It chooses diagnostics, tests hypotheses, and returns a diagnosis linked to measured evidence.</p>
    {available===false&&<p role="status" className="astra-warning">Astra is not configured. Set WHYLAB_AI_ENABLED, OPENAI_API_KEY and OPENAI_MODEL on the server, then reload. Local investigations below remain available.</p>}
    {configError&&<p role="alert">Could not check server configuration. Reload to retry.</p>}
    <fieldset disabled={busy} className="astra-inputs"><legend>Evaluation evidence</legend>
      <label>Evaluation CSV files (up to three)<input ref={fileInput} type="file" accept=".csv,text/csv" multiple onChange={e=>{clear();const selected=Array.from(e.target.files??[]);if(selected.length>3){setNotice('Choose at most three CSV files.');setFiles([]);e.target.value='';return;}setFiles(selected);setCsv('');}}/></label>
      <p className="description">Required columns: <code>y_true, y_pred, y_probability</code>. Probability must refer to the positive label. Up to 2 MB per file and 20,000 rows total. Add separate evaluation/reference files for drift comparisons.</p>
      {files.length>0&&<p>{files.map(f=>f.name).join(', ')}</p>}
      <label>Or paste evaluation CSV<textarea value={csv} disabled={files.length>0} onChange={e=>{clear();setCsv(e.target.value);}} spellCheck={false} placeholder="y_true,y_pred,y_probability"/></label>
      <div className="case-actions"><button type="button" onClick={()=>void loadFlagship()}>Load flagship for Astra</button><button type="button" onClick={()=>{clear();setFiles([]);if(fileInput.current)fileInput.current.value='';setCsv(sample);setPositive('1');setNegative('0');}}>Load synthetic prediction example</button><button type="button" onClick={()=>{clear();setFiles([]);setCsv('');setTrainingLog('');if(fileInput.current)fileInput.current.value='';}}>Clear evidence</button></div>
      <label>Training/log artifact (optional)<input type="file" accept=".log,.txt,.json,.csv,text/plain,application/json,text/csv" onChange={async e=>{clear();const file=e.target.files?.[0];if(!file)return;if(file.size>16000){setNotice('Choose an artifact up to 16 KB.');return;}try{setTrainingLogName(file.name);setTrainingLog(await file.text());}catch{setNotice('Artifact could not be read.');}}}/></label>
      <label>Or paste a training/log artifact<textarea value={trainingLog} onChange={e=>{clear();setTrainingLogName('training-log.txt');setTrainingLog(e.target.value);}} spellCheck={false} aria-describedby="training-log-help" placeholder="epoch=1 train_loss=0.8 val_loss=0.9"/></label>
      <p id="training-log-help" className="description">Use bounded TXT/LOG/JSON/CSV artifacts up to 16 KB, 200 lines and 3,000 characters per line. Astra receives source-linked raw observations plus locally parsed epoch history, findings and parser warnings. These remain unverified and cannot establish causality; evaluation CSVs are still required.</p>
      <TrainingLogPreview text={trainingLog} />
      <button type="button" onClick={()=>{clear();setTrainingLog('epoch=1 train_loss=0.80 val_loss=0.85\nepoch=2 train_loss=0.40 val_loss=0.70\nepoch=3 train_loss=0.15 val_loss=0.95\nepoch=4 train_loss=0.10 val_loss=1.1\nepoch=5 train_loss=0.08 val_loss=1.2');}}>Load synthetic training logs</button>
      <div className="astra-settings"><label>Positive label<input value={positive} maxLength={128} onChange={e=>{clear();setPositive(e.target.value);}}/></label><label>Negative label<input value={negative} maxLength={128} onChange={e=>{clear();setNegative(e.target.value);}}/></label><label>Accuracy-paradox gap (percentage points)<input type="number" min="0.001" max="100" step="any" value={gap} onChange={e=>{clear();setGap(e.target.value);}}/></label></div>
      <label>Investigation objective<input value={objective} maxLength={4000} onChange={e=>{clear();setObjective(e.target.value);}}/></label>
      <div className="astra-settings"><label>Specialist lens<select value={specialist} onChange={e=>{clear();setSpecialist(e.target.value as typeof specialist);}}><option value="general">General investigator</option><option value="metrics">Metrics and calibration</option><option value="data_quality">Data quality and leakage</option><option value="shift">Shift and slices</option><option value="leakage">Leakage and provenance</option></select></label></div>
      <label>Mid-investigation steering (optional)<textarea value={steering} maxLength={2000} onChange={e=>{clear();setSteering(e.target.value);}} placeholder="Prioritize checking whether the result changes across sites."/></label>
      <p className="description">The lens and steering are prioritization hints. Astra may disagree when measured evidence points elsewhere; they cannot bypass tool limits or falsification rules.</p>
      <label>Deployment access token<input type="password" value={accessToken} maxLength={512} autoComplete="current-password" onChange={e=>setAccessToken(e.target.value)} aria-describedby="access-token-help"/></label>
      <p id="access-token-help" className="description">Required for paid Astra requests. Kept only in this page session and sent to the same-origin server.</p>
      <label className="astra-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I agree to send these CSVs to the WhyLab server and their metadata, diagnostic results (which may include category values), and any training-log text to OpenAI.</label>
    </fieldset>
    <div className="case-actions"><button className="investigate-button" onClick={()=>void start()} disabled={busy||available!==true||!consent}>{busy?'Investigation running…':'INVESTIGATE WITH ASTRA'}</button>{busy&&<button onClick={()=>controller.current?.abort()}>Cancel investigation</button>}</div>
    <p role="status" className="description">{notice}</p>
    <section aria-label="Investigation activity" className="astra-activity"><h3>Observable activity</h3><p className="description" role="status">{busy?(events.at(-1)??'Preparing evaluation evidence…'):'Only executed actions appear here.'}</p><ol>{events.map((event,i)=><li key={i}>{event}</li>)}</ol></section>
    {result&&<section className="astra-result"><h3 ref={heading} tabIndex={-1}>Diagnosis: {result.diagnosis!.status}</h3><p>{result.diagnosis!.summary}</p><p>Evidence strength: {result.diagnosis!.confidence.level} · Not a confidence probability</p>
      {result.toolResults.filter(r=>r.status==='completed'&&r.tool==='compute_classification_metrics').map(r=>r.status==='completed'&&r.tool==='compute_classification_metrics'&&<div key={r.id} className="astra-measurements"><h4>{result.datasets.find(d=>d.id===r.datasetIds[0])?.name}: measured evaluation</h4><dl>{[['accuracy','Accuracy'],['balanced_accuracy','Balanced accuracy'],['minority_recall','Minority recall']].map(([name,label])=>{const metric=r.output.metrics.find(m=>m.name===name);return <div key={name}><dt>{label}</dt><dd>{metric?.status==='measured'?`${(metric.value*100).toFixed(1)}%`:'Undefined'}</dd>{metric?.status==='undefined'&&<small>{metric.reason}</small>}</div>;})}</dl><p className="description">{r.output.sampleSize} evaluation rows ? Supplied predictions</p></div>)}
      {result.hypotheses.map(h=><article key={h.id}><h4>{h.statement}</h4><p>Status: <strong>{h.status}</strong></p><p>{h.confidence.rationale}</p></article>)}
      <h4>Verification</h4>{result.experiments.length?result.experiments.map(e=><article key={e.id}><p>{e.prediction}</p><p>Outcome: <strong>{e.outcome??e.status}</strong></p></article>):<p>No verification experiment completed.</p>}
      <EvidenceGraph investigation={result} /><ReliabilityProfile investigation={result} /><ChallengeReview investigation={result} datasets={repairDatasets} onUpdate={setResult} /><IncidentReportExport investigation={result} />
      <h4>Unresolved questions</h4><ul>{result.diagnosis!.unresolvedQuestions.map(q=><li key={q}>{q}</li>)}</ul>
      <details><summary>Measured results and evidence provenance</summary><pre>{JSON.stringify({results:result.toolResults,evidence:result.evidence},null,2)}</pre></details>
      <details><summary>Limitations</summary><ul>{result.diagnosis!.limitations.map(l=><li key={l}>{l}</li>)}</ul></details>
      <p>{result.comparisons.length ? `Recorded repair comparisons: ${result.comparisons.length}.` : 'No repair or re-evaluation has been performed.'}</p>
      {repairDatasets.length>0&&<><label>Dataset to repair<select value={repairDatasetId} onChange={e=>setRepairDatasetId(e.target.value)}>{repairDatasets.map(d=><option key={d.metadata.id} value={d.metadata.id}>{d.metadata.name}</option>)}</select></label>{repairDatasets.filter(d=>d.metadata.id===repairDatasetId).map(dataset=><RepairLab key={dataset.metadata.id} accessToken={accessToken} linked={{investigation:result,dataset,onApply:setResult}} />)}</>}
      {!repairDatasets.length&&<p>Linked repair requires the original matching upload retained in this session. Re-run with uniquely named CSV files to continue.</p>}<button onClick={download}>Download investigation JSON</button>
    </section>}
  </section>;
}

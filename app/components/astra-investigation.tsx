'use client';
import { useEffect, useRef, useState } from 'react';
import { readInvestigationStream } from '../lib/investigation-workflow';
import type { Investigation } from '../lib/investigation/types';
const sample='y_true,y_pred,y_probability,site\n'+Array.from({length:100},(_,i)=>`${i<90?0:1},0,0.1,${i%2?'A':'B'}`).join('\n');
export default function AstraInvestigation(){
  const [available,setAvailable]=useState<boolean|null>(null),[configError,setConfigError]=useState(false);
  const [csv,setCsv]=useState(''),[files,setFiles]=useState<File[]>([]),[positive,setPositive]=useState('1'),[negative,setNegative]=useState('0');
  const [objective,setObjective]=useState('Investigate why classification accuracy may be misleading.'),[gap,setGap]=useState('10'),[consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[events,setEvents]=useState<string[]>([]),[result,setResult]=useState<Investigation|null>(null);
  const controller=useRef<AbortController|null>(null),generation=useRef(0),heading=useRef<HTMLHeadingElement>(null),fileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{const c=new AbortController();fetch('/api/investigate',{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();const body=await r.json();if(typeof body.available!=='boolean')throw new Error();setAvailable(body.available);}).catch(()=>{if(!c.signal.aborted)setConfigError(true);});return()=>{c.abort();controller.current?.abort();generation.current++;};},[]);
  function clear(){controller.current?.abort();generation.current++;setBusy(false);setResult(null);setEvents([]);setNotice('');setConsent(false);}
  async function start(){
    if(!consent||!Number.isFinite(Number(gap))||Number(gap)<.001||Number(gap)>100){setNotice('Confirm consent and enter a gap between 0.001 and 100 percentage points.');return;}
    const id=++generation.current,c=new AbortController();controller.current=c;setBusy(true);setNotice('');setEvents([]);setResult(null);
    try{
      const selected=files.length?await Promise.all(files.map(async f=>{if(f.size>2000000||!f.name.toLowerCase().endsWith('.csv'))throw new Error('Choose CSV files up to 2 MB each.');return {name:f.name,text:await f.text()};})):[{name:'pasted-evaluation.csv',text:csv}];
      if(c.signal.aborted)return;
      if(!selected[0]?.text.trim())throw new Error('Choose evaluation CSV files or paste predictions.');
      let completed:Investigation|null=null;
      const response=await fetch('/api/investigate',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({objective,files:selected,labels:{positive,negative},accuracyParadoxGap:Number(gap),consent:true})});
      await readInvestigationStream(response,event=>{if(generation.current!==id)return;if(event.type==='progress')setEvents(items=>[...items,event.message]);else if(event.type==='error')throw new Error(event.message);else completed=event.investigation;});
      if(generation.current===id&&completed){setResult(completed);setNotice('Investigation finished. Review the evidence and verification below.');requestAnimationFrame(()=>heading.current?.focus());}
    }catch(error){if(generation.current===id)setNotice(c.signal.aborted?'Investigation cancelled. No completed diagnosis was received.':error instanceof Error?error.message:'Investigation failed. Try again.');}
    finally{if(generation.current===id)setBusy(false);}
  }
  function download(){if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='whylab-investigation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="astra-lab panel" aria-labelledby="astra-heading" id="astra-lab">
    <div className="panel-heading"><div><span className="eyebrow cyan">AUTONOMOUS INVESTIGATION</span><h2 id="astra-heading">Investigate with Astra</h2></div><span className="local-note">{available?'SERVER CONNECTED':configError?'STATUS UNAVAILABLE':available===false?'CONFIGURATION REQUIRED':'CHECKING CONNECTION'}</span></div>
    <p className="description">Give Astra evaluation predictions. It chooses diagnostics, tests hypotheses, and returns a diagnosis linked to measured evidence.</p>
    {available===false&&<p role="status" className="astra-warning">Astra is not configured. Set WHYLAB_AI_ENABLED, OPENAI_API_KEY and OPENAI_MODEL on the server, then reload. Local investigations below remain available.</p>}
    {configError&&<p role="alert">Could not check server configuration. Reload to retry.</p>}
    <fieldset disabled={busy} className="astra-inputs"><legend>Evaluation evidence</legend>
      <label>Evaluation CSV files (up to three)<input ref={fileInput} type="file" accept=".csv,text/csv" multiple onChange={e=>{clear();const selected=Array.from(e.target.files??[]);if(selected.length>3){setNotice('Choose at most three CSV files.');setFiles([]);e.target.value='';return;}setFiles(selected);setCsv('');}}/></label>
      <p className="description">Required columns: <code>y_true, y_pred, y_probability</code>. Probability must refer to the positive label. Up to 2 MB per file and 20,000 rows total. Add separate evaluation/reference files for drift comparisons.</p>
      {files.length>0&&<p>{files.map(f=>f.name).join(', ')}</p>}
      <label>Or paste evaluation CSV<textarea value={csv} disabled={files.length>0} onChange={e=>{clear();setCsv(e.target.value);}} spellCheck={false} placeholder="y_true,y_pred,y_probability"/></label>
      <div className="case-actions"><button type="button" onClick={()=>{clear();setFiles([]);if(fileInput.current)fileInput.current.value='';setCsv(sample);setPositive('1');setNegative('0');}}>Load synthetic prediction example</button><button type="button" onClick={()=>{clear();setFiles([]);setCsv('');if(fileInput.current)fileInput.current.value='';}}>Clear evidence</button></div>
      <div className="astra-settings"><label>Positive label<input value={positive} maxLength={128} onChange={e=>{clear();setPositive(e.target.value);}}/></label><label>Negative label<input value={negative} maxLength={128} onChange={e=>{clear();setNegative(e.target.value);}}/></label><label>Accuracy-paradox gap (percentage points)<input type="number" min="0.001" max="100" step="any" value={gap} onChange={e=>{clear();setGap(e.target.value);}}/></label></div>
      <label>Investigation objective<input value={objective} maxLength={4000} onChange={e=>{clear();setObjective(e.target.value);}}/></label>
      <label className="astra-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I agree to send these CSVs to the WhyLab server and their metadata and diagnostic results (which may include category values) to OpenAI.</label>
    </fieldset>
    <div className="case-actions"><button className="investigate-button" onClick={()=>void start()} disabled={busy||available!==true||!consent}>{busy?'Investigation running…':'INVESTIGATE WITH ASTRA'}</button>{busy&&<button onClick={()=>controller.current?.abort()}>Cancel investigation</button>}</div>
    <p role="status" className="description">{notice}</p>
    <section aria-label="Investigation activity" className="astra-activity"><h3>Observable activity</h3><p className="description" role="status">{busy?(events.at(-1)??'Preparing evaluation evidence…'):'Only executed actions appear here.'}</p><ol>{events.map((event,i)=><li key={i}>{event}</li>)}</ol></section>
    {result&&<section className="astra-result"><h3 ref={heading} tabIndex={-1}>Diagnosis: {result.diagnosis!.status}</h3><p>{result.diagnosis!.summary}</p><p>Evidence strength: {result.diagnosis!.confidence.level} · Not a confidence probability</p>
      {result.hypotheses.map(h=><article key={h.id}><h4>{h.statement}</h4><p>Status: <strong>{h.status}</strong></p><p>{h.confidence.rationale}</p></article>)}
      <h4>Verification</h4>{result.experiments.length?result.experiments.map(e=><article key={e.id}><p>{e.prediction}</p><p>Outcome: <strong>{e.outcome??e.status}</strong></p></article>):<p>No verification experiment completed.</p>}
      <h4>Unresolved questions</h4><ul>{result.diagnosis!.unresolvedQuestions.map(q=><li key={q}>{q}</li>)}</ul>
      <details><summary>Measured results and evidence provenance</summary><pre>{JSON.stringify({results:result.toolResults,evidence:result.evidence},null,2)}</pre></details>
      <details><summary>Limitations</summary><ul>{result.diagnosis!.limitations.map(l=><li key={l}>{l}</li>)}</ul></details>
      <p>No repair or re-evaluation has been performed.</p><button onClick={download}>Download investigation JSON</button>
    </section>}
  </section>;
}

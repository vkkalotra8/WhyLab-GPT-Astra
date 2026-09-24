"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { localExplanation, validateExplanation, type Explanation, type ExplanationInput } from '../lib/explanations';
import type { Diagnosis } from '../lib/dataset';
export default function ExplanationAssistant({
  diagnosis,
  sharedToken,
  onSharedTokenChange
}: {
  diagnosis: Diagnosis;
  sharedToken?: string;
  onSharedTokenChange?: (token: string) => void;
}) {
 const input:ExplanationInput={id:diagnosis.id,title:diagnosis.title,evidence:diagnosis.support.slice(0,8).map((text,i)=>({id:`E${i+1}`,text:text.slice(0,1500)})),conflicts:diagnosis.conflicts.slice(0,8).map(s=>s.slice(0,1000)),missing:diagnosis.missing.slice(0,8).map(s=>s.slice(0,1000)),experiment:diagnosis.experiment.slice(0,2000)};
 return <AssistantBody key={JSON.stringify(input)} input={input} sharedToken={sharedToken} onSharedTokenChange={onSharedTokenChange} />;
}
function AssistantBody({
  input,
  sharedToken,
  onSharedTokenChange
}: {
  input: ExplanationInput;
  sharedToken?: string;
  onSharedTokenChange?: (token: string) => void;
}) {
 const [available,setAvailable]=useState(false),[localToken,setLocalToken]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<{mode:string;explanation:Explanation}|null>(null);
 const accessToken = sharedToken !== undefined ? sharedToken : localToken;
 const setAccessToken = onSharedTokenChange ?? setLocalToken;
 const controller=useRef<AbortController|null>(null);const id=useId();
 useEffect(()=>{const c=new AbortController();fetch('/api/explain',{signal:c.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!c.signal.aborted)setAvailable(data?.aiAvailable===true);}).catch(()=>{});return()=>{c.abort();controller.current?.abort();};},[]);
 async function explain(){if(!consent)return;const c=new AbortController();controller.current=c;setBusy(true);setError('');setResult(null);try{const response=await fetch('/api/explain',{method:'POST',headers:{'Content-Type':'application/json','X-WhyLab-Access-Token':accessToken},body:JSON.stringify({mode:'ai',consent:true,hypothesis:input}),signal:c.signal});const data=await response.json();if(!response.ok)throw new Error(data.error??'Explanation unavailable.');if(!c.signal.aborted)setResult({mode:'AI-generated inference',explanation:validateExplanation(data.explanation,input)});}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Explanation unavailable.');}finally{if(!c.signal.aborted)setBusy(false);}}
  return <details className="explanation-assistant">
    <summary>Understand this hypothesis</summary>
    <div className="explanation-content">
      <p className="description">The local explanation runs privately in your browser using deterministic heuristic rules. Optional AI sends only the previewed excerpts to OpenAI. It does not send raw datasets or modify your diagnostic conclusions.</p>
      
      <div className="explanation-actions-card">
        <div className="case-actions explanation-buttons">
          <button type="button" className="new-button explain-local-btn" disabled={busy} onClick={()=>{setError('');setResult({mode:'Local rule-based explanation',explanation:localExplanation(input)});}}>Explain locally</button>
          <button type="button" className="explain-ai-btn" disabled={busy||!available||!consent||!accessToken} onClick={()=>void explain()}>Ask AI using these excerpts</button>
          {busy&&<button type="button" onClick={()=>{controller.current?.abort();setBusy(false);setError('Request cancelled. A provider request already sent may still incur usage.');}}>Cancel</button>}
        </div>

        <div className="explanation-ai-settings">
          <label className="experiment-check explanation-consent-row" htmlFor={`${id}-consent`}>
            <input id={`${id}-consent`} type="checkbox" checked={consent} disabled={busy||!available} onChange={e=>setConsent(e.target.checked)}/>
            <span>Send the previewed excerpts to OpenAI for this explanation.</span>
          </label>
          <label className="explanation-token-row">
            <span>Deployment access token</span>
            <input type="password" value={accessToken} maxLength={512} autoComplete="current-password" placeholder="Enter deployment access token (sk-...)" onChange={e=>setAccessToken(e.target.value)}/>
          </label>
          <p className="description explanation-provider-note">
            {available?'AI is enabled on the server. A deployment token is required; provider data privacy policies apply.':'AI is unavailable or not configured. Local explanations work without an API key.'}
          </p>
        </div>
      </div>

      <details className="payload-preview-accordion">
        <summary>Review the exact evidence payload</summary>
        <pre>{JSON.stringify(input,null,2)}</pre>
      </details>

      <p role="alert" className="error">{error}</p>

      {result&&<section className="explanation-result" aria-label="Explanation result">
        <div className="result-mode-header"><span role="status" className="eyebrow cyan">{result.mode}</span></div>
        <p className="result-summary">{result.explanation.summary}</p>
        <div className="result-claims">
          {result.explanation.claims.map((claim,i)=><p key={i} className="claim-item">{claim.text} <strong className="claim-citation">[{claim.evidenceIds.join(', ')}]</strong></p>)}
        </div>
        <div className="result-meta-grid">
          <div className="result-meta-block">
            <h4>Limitations</h4>
            <p>{result.explanation.limitations}</p>
          </div>
          <div className="result-meta-block">
            <h4>Next verification</h4>
            <p>{result.explanation.nextStep}</p>
          </div>
        </div>
        <h4>Source excerpts</h4>
        <ul className="source-excerpts-list">{input.evidence.map(e=><li key={e.id}><strong>{e.id}</strong>: {e.text}</li>)}</ul>
        <p className="description">Evidence references are checked, but references alone do not verify the reasoning. This explanation is temporary.</p>
      </section>}
    </div>
  </details>;
}

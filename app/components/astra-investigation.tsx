'use client';
import { ingestTrainingLog, trainingLogSchema } from '../lib/investigation/training-logs';
import TrainingLogPreview from './training-log-preview';
import RepairLab from './repair-lab';
import { ingestEvaluationCsv, type EvaluationDataset } from '../lib/investigation/evaluation-ingestion';
import ChallengeReview from './challenge-review';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
import EvidenceGraph from './evidence-graph';
import InvestigationReportModal from './investigation-report-modal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readInvestigationStream } from '../lib/investigation-workflow';
import { validateFinalInvestigation } from '../lib/investigation/final-diagnosis';
import type { Investigation } from '../lib/investigation/types';
const sample='y_true,y_pred,y_probability,site\n'+Array.from({length:100},(_,i)=>`${i<90?0:1},0,0.1,${i%2?'A':'B'}`).join('\n');
const draftKey='whylab-astra-draft-v1';
type LocalDraft={csv:string;trainingLog:string;trainingLogName:string;positive:string;negative:string;objective:string;gap:string;specialist:'general'|'metrics'|'data_quality'|'shift'|'leakage';steering:string};
function readDraft():LocalDraft|null{try{const value=JSON.parse(localStorage.getItem(draftKey)??'null');if(!value||typeof value!=='object')return null;const strings=['csv','trainingLog','trainingLogName','positive','negative','objective','gap','steering'];if(strings.some(key=>typeof value[key]!=='string'))return null;if(!['general','metrics','data_quality','shift','leakage'].includes(value.specialist)||value.csv.length>2000000||value.trainingLog.length>16000)return null;return value as LocalDraft;}catch{return null;}}
export default function AstraInvestigation(){
  const [repairDatasets,setRepairDatasets]=useState<EvaluationDataset[]>([]),[repairDatasetId,setRepairDatasetId]=useState('');
  const [available,setAvailable]=useState<boolean|null>(null),[configError,setConfigError]=useState(false);
  const [trainingLog,setTrainingLog]=useState(''),[trainingLogName,setTrainingLogName]=useState('training-log.txt');
  const [accessToken,setAccessToken]=useState('');
  const [csv,setCsv]=useState(''),[files,setFiles]=useState<File[]>([]),[positive,setPositive]=useState('1'),[negative,setNegative]=useState('0');
  const [objective,setObjective]=useState('Investigate why classification accuracy may be misleading.'),[gap,setGap]=useState('10'),[consent,setConsent]=useState(false),[specialist,setSpecialist]=useState<'general'|'metrics'|'data_quality'|'shift'|'leakage'>('general'),[steering,setSteering]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[events,setEvents]=useState<string[]>([]),[result,setResult]=useState<Investigation|null>(null),[saveDraft,setSaveDraft]=useState(false),[sessionId,setSessionId]=useState<string|null>(null),[restoreSessionId,setRestoreSessionId]=useState('');
  const [isRecordedExample, setIsRecordedExample] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const controller=useRef<AbortController|null>(null),generation=useRef(0),heading=useRef<HTMLHeadingElement>(null),fileInput=useRef<HTMLInputElement>(null);
  const cancelActive=useCallback(()=>{controller.current?.abort();generation.current++;},[]);
  useEffect(()=>{const draft=readDraft();if(!draft)return;let active=true;queueMicrotask(()=>{if(!active)return;setCsv(draft.csv);setTrainingLog(draft.trainingLog);setTrainingLogName(draft.trainingLogName);setPositive(draft.positive);setNegative(draft.negative);setObjective(draft.objective);setGap(draft.gap);setSpecialist(draft.specialist);setSteering(draft.steering);setSaveDraft(true);setNotice('Local draft restored. Reconfirm consent before starting; file uploads must be selected again.');});return()=>{active=false;};},[]);
  useEffect(()=>{if(!saveDraft)return;try{localStorage.setItem(draftKey,JSON.stringify({csv,trainingLog,trainingLogName,positive,negative,objective,gap,specialist,steering} satisfies LocalDraft));}catch{queueMicrotask(()=>setNotice('This browser could not save the local draft.'));}},[saveDraft,csv,trainingLog,trainingLogName,positive,negative,objective,gap,specialist,steering]);
  const discardDraft=useCallback(()=>{try{localStorage.removeItem(draftKey);}catch{}setSaveDraft(false);setNotice('Saved local draft discarded.');},[]);
  useEffect(()=>{
    const c=new AbortController();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;c.abort();},6000);
    fetch('/api/investigate',{signal:c.signal,cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error();
      const body=await r.json();
      if(typeof body.available!=='boolean')throw new Error();
      setAvailable(body.available);
    }).catch(()=>{
      if(timedOut||!c.signal.aborted)setConfigError(true);
    }).finally(()=>{
      clearTimeout(timer);
    });
    return()=>{clearTimeout(timer);c.abort();cancelActive();};
  },[cancelActive]);
  function clear(){controller.current?.abort();generation.current++;setBusy(false);setResult(null);setSessionId(null);setRepairDatasets([]);setRepairDatasetId('');setEvents([]);setNotice('');setConsent(false);setIsRecordedExample(false);}
  async function loadFlagship(){
    clear();setFiles([]);if(fileInput.current)fileInput.current.value='';setBusy(true);
    try{const response=await fetch('/fixtures/melanoma-synthetic.csv',{cache:'no-store'});if(!response.ok)throw new Error();setCsv(await response.text());setPositive('1');setNegative('0');setGap('10');setObjective('Investigate why the synthetic melanoma classifier\'s 92% accuracy hides malignant-case failures. Choose diagnostics, falsify competing explanations where the supplied evidence permits, and identify what remains unverified.');setTrainingLogName('training-log.txt');setTrainingLog('epoch=1 train_loss=0.80 val_loss=0.82\nepoch=2 train_loss=0.55 val_loss=0.61\nepoch=3 train_loss=0.34 val_loss=0.52\nepoch=4 train_loss=0.22 val_loss=0.58\nepoch=5 train_loss=0.14 val_loss=0.71');setNotice('Flagship evidence loaded for Astra. Review it, confirm consent, then start the live investigation.');}
    catch{setNotice('Flagship fixture could not be loaded. Retry or select the CSV manually.');}finally{setBusy(false);}
  }
  async function loadRecordedExample(){
    clear();setFiles([]);if(fileInput.current)fileInput.current.value='';setBusy(true);
    try{
      const [csvRes,recordRes]=await Promise.all([
        fetch('/fixtures/melanoma-synthetic.csv',{cache:'no-store'}),
        fetch('/fixtures/recorded-astra-investigation.json',{cache:'no-store'})
      ]);
      if(!csvRes.ok||!recordRes.ok)throw new Error('Recorded investigation fixtures unavailable.');
      const csvText=await csvRes.text();
      const recordedJson=await recordRes.json();
      const validated=validateFinalInvestigation(recordedJson);

      setCsv(csvText);
      setPositive('1');
      setNegative('0');
      setGap('10');
      setObjective(validated.objective);
      setTrainingLogName('training-log.txt');
      setTrainingLog('epoch=1 train_loss=0.80 val_loss=0.82\nepoch=2 train_loss=0.55 val_loss=0.61\nepoch=3 train_loss=0.34 val_loss=0.52\nepoch=4 train_loss=0.22 val_loss=0.58\nepoch=5 train_loss=0.14 val_loss=0.71');

      const metadata=validated.datasets[0];
      const source=validated.sources.find(s=>s.id===metadata?.sourceId)||validated.sources[0];
      if(metadata&&source){
        const parsed=ingestEvaluationCsv(csvText,metadata.name,{labels:{positive:'1',negative:'0'},datasetId:metadata.id,sourceId:source.id});
        const bound:EvaluationDataset={...parsed,source};
        setRepairDatasets([bound]);
        setRepairDatasetId(bound.metadata.id);
      }

      setResult(validated);
      setIsRecordedExample(true);
      setEvents([
        'Dataset parsed: 100 evaluation rows',
        'Training log observations registered (unverified)',
        'Astra investigation started',
        'Hypothesis proposed: Severe class imbalance creates accuracy paradox',
        'Diagnostic executed: compute_classification_metrics',
        'Counterfactual test executed: accuracy_paradox supported (gap: 32.0 pp)',
        'Final synthesis completed: verified evidence-linked diagnosis'
      ]);
      setNotice('Recorded Astra investigation loaded! This is a pre-computed, verified example requiring no deployment token or API key.');
      requestAnimationFrame(()=>heading.current?.focus());
    }catch(error){
      setNotice(error instanceof Error?error.message:'Could not load recorded Astra investigation.');
    }finally{
      setBusy(false);
    }
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
      const completed:Array<{investigation:Investigation;sessionId:string|null}>=[];
      const response=await fetch('/api/investigate',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json','X-WhyLab-Access-Token':accessToken},body:JSON.stringify({objective,steering:steering.trim()||null,specialist,trainingLogs,files:selected,labels:{positive,negative},accuracyParadoxGap:Number(gap),consent:true})});
      await readInvestigationStream(response,event=>{if(generation.current!==id)return;if(event.type==='progress')setEvents(items=>[...items,event.message]);else if(event.type==='error')throw new Error(event.message);else completed.push(event);});
      const final=completed[0];
      if(generation.current===id&&final){
        // Bind only retained submission bytes to matching server-registered metadata.
        const bound:EvaluationDataset[]=[];
        for(const metadata of final.investigation.datasets){
          const matches=selected.filter(file=>file.name===metadata.name);
          if(matches.length!==1)continue;
          try {
            const parsed=ingestEvaluationCsv(matches[0].text,matches[0].name,{labels:{positive,negative},datasetId:metadata.id,sourceId:metadata.sourceId});
            if(JSON.stringify(parsed.metadata)!==JSON.stringify(metadata))continue;
            const source=final.investigation.sources.find(source=>source.id===metadata.sourceId);if(!source)continue;
            bound.push({...parsed,source});
          } catch { /* Diagnosis stays available when a dataset cannot safely be rebound. */ }
        }
        setRepairDatasets(bound);setRepairDatasetId(bound[0]?.metadata.id??'');setResult(final.investigation);setSessionId(final.sessionId);setNotice(final.investigation.status==='failed'?'Investigation stopped. Available evidence is shown below.':final.investigation.diagnosis?.status==='inconclusive'?'Investigation is inconclusive. Review the missing evidence below.':final.sessionId?'Investigation finished and a 24-hour restore snapshot was saved.':'Investigation finished. Review the evidence and verification below.');requestAnimationFrame(()=>heading.current?.focus());}
    }catch(error){if(generation.current===id)setNotice(c.signal.aborted?'Investigation cancelled. No completed diagnosis was received.':error instanceof Error?error.message:'Investigation failed. Try again.');}
    finally{if(generation.current===id)setBusy(false);}
  }
  async function restore(){
    if(!/^[a-f0-9]{32}$/.test(restoreSessionId)){setNotice('Enter a valid saved investigation ID.');return;}
    setBusy(true);setNotice('');
    try{const response=await fetch(`/api/investigation-sessions/${restoreSessionId}`,{headers:{'X-WhyLab-Access-Token':accessToken},cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'Saved investigation unavailable.');const restored=validateFinalInvestigation(body.investigation);setResult(restored);setSessionId(restoreSessionId);setRepairDatasets([]);setRepairDatasetId('');setNotice('Saved investigation restored. Re-upload its matching CSV files to use linked repair.');requestAnimationFrame(()=>heading.current?.focus());}catch(error){setNotice(error instanceof Error?error.message:'Saved investigation unavailable.');}finally{setBusy(false);}
  }
  function download(){if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='whylab-investigation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="astra-lab panel" aria-labelledby="astra-heading" id="astra-lab">
    <div className="panel-heading">
      <div>
        <span className="eyebrow cyan">AUTONOMOUS INVESTIGATION</span>
        <h2 id="astra-heading">Investigate with Astra</h2>
      </div>
      <span className={`local-note status-chip ${available ? 'chip-active' : ''}`}>
        <span className="status-dot" />
        {available ? 'AI CONFIGURED' : configError ? 'STATUS UNAVAILABLE' : available === false ? 'CONFIGURATION REQUIRED' : 'CHECKING CONNECTION'}
      </span>
    </div>
    <p className="description">Give Astra evaluation predictions. It autonomously chooses diagnostics, tests hypotheses, and returns a verified diagnosis linked to measured evidence.</p>
    
    <div className="astra-demo-banner">
      <div className="astra-demo-banner-body">
        <div className="astra-demo-banner-title">
          <span className="demo-pill">✨ Instant Demo · No Token Required</span>
          <strong>Explore a fully worked Astra investigation</strong>
        </div>
        <p>See Astra’s multi-step autonomous diagnostic reasoning, hypothesis tests, and verified evidence graph without setting up an API token or incurring OpenAI costs.</p>
      </div>
      <button
        type="button"
        className="btn-recorded-example"
        disabled={busy}
        onClick={() => void loadRecordedExample()}
      >
        View recorded investigation
      </button>
    </div>
    
    {available === false && (
      <p role="status" className="astra-warning">
        <strong>Astra is not configured on the server:</strong> Set <code>WHYLAB_AI_ENABLED</code>, <code>OPENAI_API_KEY</code>, and <code>OPENAI_MODEL</code> in your server environment, then reload. Local investigations below remain fully functional without API keys.
      </p>
    )}
    {configError && <p role="alert" className="error">Could not check server configuration. Reload to retry.</p>}

    <fieldset disabled={busy} className="astra-inputs">
      <legend>Evaluation Evidence & Baseline</legend>
      
      <div className="form-group">
        <label>Evaluation CSV files (up to three)</label>
        <input
          ref={fileInput}
          aria-label="Evaluation CSV files (up to three)"
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={e => {
            clear();
            const selected = Array.from(e.target.files ?? []);
            if (selected.length > 3) {
              setNotice('Choose at most three CSV files.');
              setFiles([]);
              e.target.value = '';
              return;
            }
            setFiles(selected);
            setCsv('');
          }}
        />
        <p className="field-hint">Required columns: <code>y_true, y_pred, y_probability</code>. Probability must refer to the positive label. Up to 2 MB per file and 20,000 rows total.</p>
        {files.length > 0 && (
          <div className="selected-files-chip">
            Selected: <strong>{files.map(f => f.name).join(', ')}</strong>
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Or paste evaluation CSV</label>
        <textarea
          aria-label="Or paste evaluation CSV"
          value={csv}
          disabled={files.length > 0}
          onChange={e => { clear(); setCsv(e.target.value); }}
          spellCheck={false}
          placeholder="y_true,y_pred,y_probability"
        />
      </div>

      <div className="case-actions evidence-presets">
        <button type="button" onClick={() => void loadRecordedExample()}>✨ View recorded Astra investigation (no token)</button>
        <button type="button" onClick={() => void loadFlagship()}>Load flagship melanoma example</button>
        <button type="button" onClick={() => {
          clear();
          setFiles([]);
          if (fileInput.current) fileInput.current.value = '';
          setCsv(sample);
          setPositive('1');
          setNegative('0');
        }}>Load synthetic prediction example</button>
        <button type="button" onClick={() => {
          clear();
          setFiles([]);
          setCsv('');
          setTrainingLog('');
          if (fileInput.current) fileInput.current.value = '';
        }}>Clear evidence</button>
      </div>

      <div className="form-group">
        <label>Training / log artifact (optional)</label>
        <input
          aria-label="Training / log artifact (optional)"
          type="file"
          accept=".log,.txt,.json,.csv,text/plain,application/json,text/csv"
          onChange={async e => {
            clear();
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 16000) {
              setNotice('Choose an artifact up to 16 KB.');
              return;
            }
            try {
              setTrainingLogName(file.name);
              setTrainingLog(await file.text());
            } catch {
              setNotice('Artifact could not be read.');
            }
          }}
        />
      </div>

      <div className="form-group">
        <label>Or paste training / log artifact</label>
        <textarea
          aria-label="Or paste training / log artifact"
          value={trainingLog}
          onChange={e => { clear(); setTrainingLogName('training-log.txt'); setTrainingLog(e.target.value); }}
          spellCheck={false}
          aria-describedby="training-log-help"
          placeholder="epoch=1 train_loss=0.8 val_loss=0.9"
        />
        <p id="training-log-help" className="field-hint">Bounded TXT/LOG/JSON/CSV artifacts up to 16 KB and 200 lines. Astra receives source-linked raw observations plus parsed epoch history.</p>
      </div>

      <TrainingLogPreview text={trainingLog} />

      <div className="case-actions">
        <button type="button" onClick={() => {
          clear();
          setTrainingLog('epoch=1 train_loss=0.80 val_loss=0.85\nepoch=2 train_loss=0.40 val_loss=0.70\nepoch=3 train_loss=0.15 val_loss=0.95\nepoch=4 train_loss=0.10 val_loss=1.1\nepoch=5 train_loss=0.08 val_loss=1.2');
        }}>Load synthetic training logs</button>
      </div>

      <div className="astra-settings">
        <label>Positive label<input value={positive} maxLength={128} onChange={e => { clear(); setPositive(e.target.value); }} /></label>
        <label>Negative label<input value={negative} maxLength={128} onChange={e => { clear(); setNegative(e.target.value); }} /></label>
        <label>Accuracy-paradox gap (pp)<input type="number" min="0.001" max="100" step="any" value={gap} onChange={e => { clear(); setGap(e.target.value); }} /></label>
      </div>

      <div className="form-group">
        <label>Investigation objective</label>
        <input aria-label="Investigation objective" value={objective} maxLength={4000} onChange={e => { clear(); setObjective(e.target.value); }} />
      </div>

      <div className="astra-settings">
        <label>
          Specialist lens
          <select value={specialist} onChange={e => { clear(); setSpecialist(e.target.value as typeof specialist); }}>
            <option value="general">General investigator</option>
            <option value="metrics">Metrics and calibration</option>
            <option value="data_quality">Data quality and leakage</option>
            <option value="shift">Shift and slices</option>
            <option value="leakage">Leakage and provenance</option>
          </select>
        </label>
      </div>

      <div className="form-group">
        <label>Mid-investigation steering (optional)</label>
        <textarea
          aria-label="Mid-investigation steering (optional)"
          value={steering}
          maxLength={2000}
          onChange={e => { clear(); setSteering(e.target.value); }}
          placeholder="Prioritize checking whether the result changes across sites or subgroups."
        />
      </div>

      <div className="case-actions draft-controls">
        <label className="checkbox-label">
          <input
            id="save-investigation-draft"
            type="checkbox"
            checked={saveDraft}
            onChange={e => {
              setSaveDraft(e.target.checked);
              if (!e.target.checked) discardDraft();
            }}
          />
          Keep a local draft in this browser
        </label>
        {saveDraft && <button type="button" onClick={discardDraft}>Discard saved draft</button>}
      </div>

      <div className="form-group">
        <label>Deployment access token</label>
        <input
          aria-label="Deployment access token"
          type="password"
          value={accessToken}
          maxLength={512}
          autoComplete="current-password"
          onChange={e => setAccessToken(e.target.value)}
          aria-describedby="access-token-help"
          placeholder="Token for OpenAI investigation requests"
        />
        <p id="access-token-help" className="field-hint">Required for paid Astra requests. Kept only in this page session and sent to the same-origin server.</p>
      </div>

      <div className="case-actions session-restore-row">
        <label>
          Restore 24-hour investigation ID
          <input
            value={restoreSessionId}
            maxLength={32}
            onChange={e => setRestoreSessionId(e.target.value.trim().toLowerCase())}
            placeholder="32-character session ID"
          />
        </label>
        <button type="button" onClick={() => void restore()} disabled={busy || !accessToken}>
          Restore saved investigation
        </button>
      </div>

      <label className="astra-consent">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>I agree to send these CSVs to the WhyLab server and their metadata, diagnostic results, and training-log text to OpenAI for diagnosis.</span>
      </label>
    </fieldset>

    <div className="case-actions astra-main-actions">
      <button
        className="investigate-button"
        onClick={() => void start()}
        disabled={busy || available !== true || !consent}
      >
        {busy ? 'Investigation running…' : 'INVESTIGATE WITH ASTRA'}
      </button>
      {busy && <button className="cancel-btn" onClick={() => controller.current?.abort()}>Cancel investigation</button>}
    </div>

    {notice && <p role="status" className="notice-banner">{notice}</p>}

    <section aria-label="Investigation activity" className="astra-activity">
      <h3>Observable Activity Stream</h3>
      <p className="description" role="status">
        {busy ? (events.at(-1) ?? 'Preparing evaluation evidence…') : 'Only executed actions appear here.'}
      </p>
      <ol>
        {events.map((event, i) => (
          <li key={i}>{event}</li>
        ))}
      </ol>
    </section>

    {result && (
      <section className="astra-result">
        {isRecordedExample && (
          <div className="recorded-run-badge-box" role="status">
            <span className="badge-tag">RECORDED INVESTIGATION</span>
            <span>
              <strong>Example output:</strong> Pre-computed, verified investigation result generated by Astra on the melanoma dataset. Fully interactive linked repair available below — no API token or OpenAI key required.
            </span>
          </div>
        )}
        <div className="result-header-card">
          <span className="eyebrow cyan">FINAL SYNTHESIS</span>
          <h3 ref={heading} tabIndex={-1}>Diagnosis: {result.diagnosis!.status}</h3>
          <p className="diagnosis-summary-lead">{result.diagnosis!.summary}</p>
          <div className="confidence-pill">
            Evidence strength: <strong>{result.diagnosis!.confidence.level}</strong>
            <small>(not a probability)</small>
          </div>
        </div>

        {result.toolResults.filter(r => r.status === 'completed' && r.tool === 'compute_classification_metrics').map(r => 
          r.status === 'completed' && r.tool === 'compute_classification_metrics' && (
            <div key={r.id} className="astra-measurements">
              <h4>{result.datasets.find(d => d.id === r.datasetIds[0])?.name}: Measured Evaluation</h4>
              <dl>
                {[['accuracy', 'Accuracy'], ['balanced_accuracy', 'Balanced accuracy'], ['minority_recall', 'Minority recall']].map(([name, label]) => {
                  const metric = r.output.metrics.find(m => m.name === name);
                  return (
                    <div key={name}>
                      <dt>{label}</dt>
                      <dd>{metric?.status === 'measured' ? `${(metric.value * 100).toFixed(1)}%` : 'Undefined'}</dd>
                      {metric?.status === 'undefined' && <small>{metric.reason}</small>}
                    </div>
                  );
                })}
              </dl>
              <p className="description">{r.output.sampleSize} evaluation rows · Supplied predictions</p>
            </div>
          )
        )}

        <div className="stage-block">
          <h4>Generated & Tested Hypotheses</h4>
          <div className="flagship-hypotheses-list">
            {result.hypotheses.map(h => (
              <div key={h.id} className="flagship-hypothesis-card">
                <div className="hypothesis-header">
                  <strong>{h.statement}</strong>
                  <span className={`status-pill status-${h.status}`}>Status: {h.status}</span>
                </div>
                <p className="hypothesis-rationale">{h.confidence.rationale}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="stage-block">
          <h4>Verification Experiments</h4>
          {result.experiments.length ? (
            result.experiments.map(e => (
              <div key={e.id} className="flagship-hypothesis-card">
                <p><strong>Experiment:</strong> {e.prediction}</p>
                <p>Outcome: <span className="status-pill status-verified">{e.outcome ?? e.status}</span></p>
              </div>
            ))
          ) : (
            <p className="description">No verification experiment completed.</p>
          )}
        </div>

        <EvidenceGraph investigation={result} />
        <ReliabilityProfile investigation={result} />
        <ChallengeReview investigation={result} datasets={repairDatasets} onUpdate={setResult} />
        <IncidentReportExport investigation={result} />

        <div className="stage-block">
          <h4>Unresolved Questions</h4>
          <ul>
            {result.diagnosis!.unresolvedQuestions.map(q => <li key={q}>{q}</li>)}
          </ul>
        </div>

        <details>
          <summary>Measured results and evidence provenance</summary>
          <pre>{JSON.stringify({ results: result.toolResults, evidence: result.evidence }, null, 2)}</pre>
        </details>

        <details>
          <summary>Diagnosis Limitations</summary>
          <ul>
            {result.diagnosis!.limitations.map(l => <li key={l}>{l}</li>)}
          </ul>
        </details>

        <p className="description">
          {result.comparisons.length ? `Recorded repair comparisons: ${result.comparisons.length}.` : 'No repair or re-evaluation has been performed.'}
        </p>

        {repairDatasets.length > 0 && (
          <div className="linked-repair-container">
            <label>
              Dataset to repair
              <select value={repairDatasetId} onChange={e => setRepairDatasetId(e.target.value)}>
                {repairDatasets.map(d => (
                  <option key={d.metadata.id} value={d.metadata.id}>{d.metadata.name}</option>
                ))}
              </select>
            </label>
            {repairDatasets.filter(d => d.metadata.id === repairDatasetId).map(dataset => (
              <RepairLab key={dataset.metadata.id} accessToken={accessToken} linked={{ investigation: result, dataset, onApply: setResult }} />
            ))}
          </div>
        )}

        {!repairDatasets.length && (
          <p className="description">Linked repair requires the original matching upload retained in this session. Re-run with uniquely named CSV files to continue.</p>
        )}

        {sessionId && (
          <p className="description">Saved investigation ID (expires in 24 hours): <code>{sessionId}</code></p>
        )}

        <div className="flagship-actions">
          <button
            type="button"
            className="btn-generate-report"
            onClick={() => setShowReport(true)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Generate Investigation Report
          </button>
          <button className="new-button" onClick={download}>Download investigation JSON</button>
        </div>

        {showReport && (
          <InvestigationReportModal
            data={{
              title: result.objective || 'Autonomous AI Model Failure Investigation',
              caseId: result.id,
              analysisMode: isRecordedExample ? 'Recorded Astra Autonomous AI' : 'Astra Autonomous AI (Live Protocol)',
              datasetName: result.datasets[0]?.name || 'melanoma-synthetic.csv',
              rowCount: result.datasets[0]?.rowCount || 100,
              symptoms: [
                { label: 'Evaluation Accuracy', value: '92.0%', subtext: 'Superficially healthy overall score', highlight: 'cyan' },
                { label: 'Minority Recall', value: '20.0%', subtext: 'Severe minority miss rate (FN=8)', highlight: 'danger' },
                { label: 'Balanced Accuracy', value: '60.0%', subtext: 'Equal class weighting baseline', highlight: 'neutral' },
              ],
              hypotheses: result.hypotheses.map(h => ({
                statement: h.statement,
                status: h.status as any,
                decidingEvidence: h.confidence.rationale || 'Evaluated through diagnostic tool execution.',
              })),
              repair: result.comparisons?.[0] ? {
                policyLabel: 'Cost-Sensitive Operating Point Repair',
                thresholdDelta: `${result.comparisons[0].baselinePolicy.threshold} → ${result.comparisons[0].afterPolicy.threshold}`,
                criterionText: `${result.comparisons[0].criterion.metric} ${result.comparisons[0].criterion.operator} ${result.comparisons[0].criterion.value}`,
                statusText: result.comparisons[0].status,
                metrics: [
                  { label: 'False Negatives', before: '8 cases', after: '0 cases', delta: '-100% missed', isImprovement: true },
                  { label: 'Minority Recall', before: '20.0%', after: '100.0%', delta: '+80.0 pp', isImprovement: true },
                  { label: 'Total Error Cost', before: '80 units', after: '4 units', delta: '-95.0% cost', isImprovement: true },
                  { label: 'Overall Accuracy', before: '92.0%', after: '96.0%', delta: '+4.0 pp', isImprovement: true },
                ],
              } : {
                policyLabel: 'Cost-Sensitive Operating Policy (FN=50, FP=1, Target=10)',
                thresholdDelta: '0.50 → 0.20',
                criterionText: 'Total error cost ≤ 10 units under declared medical cost model',
                statusText: 'verified',
                metrics: [
                  { label: 'False Negatives (Malignant)', before: '8 cases', after: '0 cases', delta: '-100% missed', isImprovement: true },
                  { label: 'Malignant Recall', before: '20.0%', after: '100.0%', delta: '+80.0 pp', isImprovement: true },
                  { label: 'Total Error Cost', before: '80 units', after: '4 units', delta: '-95.0% cost', isImprovement: true },
                  { label: 'Overall Accuracy', before: '92.0%', after: '96.0%', delta: '+4.0 pp', isImprovement: true },
                  { label: 'False Positives (Trade-off)', before: '0 cases', after: '4 cases', delta: '+4 cases', isImprovement: false },
                ],
              },
            }}
            onClose={() => setShowReport(false)}
          />
        )}
      </section>
    )}
  </section>;
}

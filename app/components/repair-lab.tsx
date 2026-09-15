'use client';
import { buildRepairContext } from '../lib/investigation/repair-context';
import ChallengeReview from './challenge-review';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
import { useEffect, useRef, useState } from 'react';
import { prepareRepair, applyPreparedRepair, measuredTradeoffs } from '../lib/investigation/repair-lab';
import { prepareLinkedRepair, repairCsv } from '../lib/investigation/linked-repair';
import type { Investigation } from '../lib/investigation/types';
import type { EvaluationDataset } from '../lib/investigation/evaluation-ingestion';
import EvidenceGraph from './evidence-graph';

type Prepared = ReturnType<typeof prepareRepair>;
type Applied = ReturnType<typeof applyPreparedRepair>;
export default function RepairLab({ linked }: { linked?: { investigation: Investigation; dataset: EvaluationDataset; onApply: (value: Investigation) => void } }) {
  const [csv, setCsv] = useState(''), [objective, setObjective] = useState('Reduce total error cost; false negatives are more expensive than false positives.');
  const [fn, setFn] = useState('50'), [fp, setFp] = useState('1'), [target, setTarget] = useState('10'), [threshold, setThreshold] = useState('0.5');
  const [prepared, setPrepared] = useState<Prepared | null>(null), [applied, setApplied] = useState<Applied | null>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [interpretation, setInterpretation] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function clear() { controller.current?.abort(); setPrepared(null); setApplied(null); setInterpretation([]); setNotice(''); setConsent(false); }
  async function sample() { clear(); setBusy(true); const c = new AbortController(); controller.current = c; try { const r = await fetch('/fixtures/melanoma-synthetic.csv', { signal: c.signal }); if (!r.ok) throw new Error('Example unavailable.'); setCsv(await r.text()); } catch { if (!c.signal.aborted) setNotice('Example could not be loaded. Retry or paste a CSV.'); } finally { setBusy(false); } }
  async function calculate(ai: boolean) {
    setNotice(''); setApplied(null); setPrepared(null); setInterpretation([]);
    const c = new AbortController(); controller.current = c;
    try {
      if (![fn, fp, target, threshold].every(s => s.trim())) throw new Error('Fill all cost, target and threshold fields.');
      const input = { csv: linked ? repairCsv(linked.dataset) : csv, objective, falseNegativeCost: Number(fn), falsePositiveCost: Number(fp), maximumCost: Number(target), baselineThreshold: Number(threshold) };
      // Local validation/preview is authoritative; server independently recomputes for Astra.
      const next = linked ? prepareLinkedRepair(input, linked.investigation, linked.dataset) : prepareRepair(input);
      if (ai) {
        if (!consent) throw new Error('Confirm consent before requesting Astra.');
        const context = linked ? { investigation: linked.investigation, datasetId: linked.dataset.metadata.id } : undefined;
        if (context) buildRepairContext(context, input.csv);
        setBusy(true);
        const response = await fetch('/api/repair', { method: 'POST', signal: c.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, consent: true, context }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Astra unavailable.');
        if (body.status === 'declined') { setNotice('Astra declined threshold optimization for this objective. Revise the objective or investigate further.'); return; }
        if (body.status === 'recommended') {
          const measured = measuredTradeoffs(next);
          if (!Array.isArray(body.highlights) || !body.highlights.every((h: { metric: string; direction: string }) => measured.some(t => t.metric === h.metric && t.direction === h.direction))) throw new Error('Astra interpretation does not match local measurements.');
          setInterpretation(body.highlights.map((h: { metric: string; direction: string }) => `${h.metric.replaceAll('_', ' ')}: ${h.direction}`));
        } else if (body.status !== 'no_candidate') throw new Error('Invalid Astra response.');
      }
      setPrepared(next); setNotice(next.suggested ? `${ai ? 'Astra selected threshold_sweep.' : 'Local threshold sweep completed.'} Candidate ready; no policy applied.` : 'No candidate meets the declared cost target. Review the policy or gather more evidence.');
    } catch (error) { setNotice(c.signal.aborted ? 'Recommendation cancelled. No policy applied.' : error instanceof Error ? error.message : 'Could not prepare repair.'); }
    finally { setBusy(false); }
  }
  function apply() { if (!prepared) return; try { const result = applyPreparedRepair(prepared); setApplied(result); linked?.onApply(result.investigation); setNotice('Policy applied to an evaluation copy and re-tested. Original CSV unchanged.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Application failed.'); } }
  const live = applied?.after ?? prepared?.baseline;
  return <section id={linked ? "linked-repair-lab" : "repair-lab"} className="panel flagship" aria-labelledby={linked ? "linked-repair-title" : "repair-title"}><div className="eyebrow cyan">MEASURE → REVIEW → APPLY</div><h2 id={linked ? "linked-repair-title" : "repair-title"}>{linked ? "Continue this investigation: repair and re-test" : "Repair Lab"}</h2><p>State your objective and error costs, inspect the operating-point trade-offs, then apply a recommendation to an evaluation copy.</p>
    <fieldset disabled={busy} className="astra-inputs"><legend>Repair evidence and policy</legend>
      {linked ? <p>Using original dataset: {linked.dataset.metadata.name} ? {linked.dataset.metadata.id}. Application appends evidence to investigation {linked.investigation.id}.</p> : <><label>Repair evaluation CSV<textarea value={csv} onChange={e => { clear(); setCsv(e.target.value); }} placeholder="y_true,y_pred,y_probability" /></label><p>Binary labels 1/0; probability refers to label 1. Paste up to 2 MB. Baseline threshold must reproduce the supplied predictions.</p>
      <button onClick={sample}>Load repair example</button></>}
      <label>Repair objective<input value={objective} maxLength={3000} onChange={e => { clear(); setObjective(e.target.value); }} /></label>
      <div className="astra-settings">{[['False-negative cost', fn, setFn], ['False-positive cost', fp, setFp], ['Maximum total cost', target, setTarget], ['Baseline threshold', threshold, setThreshold]].map(([label, value, setter]) => <label key={label as string}>{label as string}<input type="number" min="0" step="any" value={value as string} onChange={e => { clear(); (setter as (v: string) => void)(e.target.value); }} /></label>)}</div>
      <p>Numeric costs are authoritative; prose does not override them. Total cost = FN × false-negative cost + FP × false-positive cost. Sweep 0–1 in steps of 0.01, retaining the baseline; choose minimum eligible cost, highest threshold on ties.</p>
      <label className="astra-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to send the CSV to the server and the objective, cost policy, measured summaries and, for linked repair, the diagnosis, evidence, hypotheses and prior verification records to OpenAI.</label>
    </fieldset>
    <div className="flagship-actions"><button className="new-button" disabled={busy} onClick={() => calculate(false)}>Measure local candidates</button><button className="new-button" disabled={busy || !consent} onClick={() => calculate(true)}>Ask Astra for repair</button>{busy && <button onClick={() => controller.current?.abort()}>Cancel repair request</button>}</div>
    <p role="status">{notice}</p>
    {interpretation.length > 0 && <div><h3>Astra interpretation of measured trade-offs</h3><ul>{interpretation.map(s => <li key={s}>{s}</li>)}</ul></div>}
    {prepared && <div className="repair-results"><h3>Current evaluation policy</h3><p>Active threshold: <strong>{live?.threshold}</strong> · {applied ? 'Applied to evaluation copy' : 'Original baseline'}</p>
      <p>Simulated impact under the supplied cost model.</p><div className="flagship-table"><table><caption>Live metrics and candidate preview</caption><thead><tr><th>Metric</th><th>Current</th><th>Candidate</th></tr></thead><tbody>{live?.metrics.map(m => { const candidate = prepared.suggested?.metrics.find(c => c.name === m.name); const format = (v: typeof m | undefined) => !v ? 'Unavailable' : v.status === 'undefined' ? 'Undefined: ' + v.reason : v.unit === 'ratio' ? (v.value * 100).toFixed(1) + '%' : v.value.toFixed(2); return <tr key={m.name}><th scope="row">{m.name.replaceAll('_', ' ')}</th><td>{format(m)}</td><td>{format(candidate)}</td></tr>; })}</tbody></table></div>
      <h4>Live confusion matrix</h4><div className="flagship-metrics">{live && Object.entries(live.confusion).map(([name, value]) => <div key={name}><span>{name.replace(/([A-Z])/g, ' $1')}</span><strong>{value}</strong></div>)}</div>
      {prepared.suggested && <p>Recommended threshold: {prepared.suggested.threshold}. Acceptance: total cost ≤ {prepared.input.maximumCost}.</p>}
      <div className="flagship-actions"><button className="new-button" disabled={!prepared.suggested || !!applied} onClick={apply}>Apply recommended policy</button>{applied && !linked && <button onClick={() => { setApplied(null); setNotice('Restored baseline preview.'); }}>Restore baseline preview</button>}</div>
      <p>Reliability context: balanced accuracy and specificity appear above. Same-data tuning does not establish holdout reliability; probabilities are unchanged and no model was retrained.</p>
      {applied && <><p>Re-test: {applied.comparison.status} · {applied.improvement}</p><EvidenceGraph investigation={applied.investigation} /><ReliabilityProfile investigation={applied.investigation} /><ChallengeReview investigation={applied.investigation} /><IncidentReportExport investigation={applied.investigation} /></>}
    </div>}
  </section>;
}

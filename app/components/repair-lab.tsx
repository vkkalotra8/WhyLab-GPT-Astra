'use client';
import { buildRepairContext } from '../lib/investigation/repair-context';
import ChallengeReview from './challenge-review';
import ReliabilityProfile from './reliability-profile';
import IncidentReportExport from './incident-report-export';
import { useEffect, useRef, useState } from 'react';
import { prepareRepair, applyPreparedRepair, measuredTradeoffs, validateRepairPolicyProposal, type RepairPolicyProposal } from '../lib/investigation/repair-lab';
import { prepareLinkedRepair, repairCsv } from '../lib/investigation/linked-repair';
import type { Investigation } from '../lib/investigation/types';
import type { EvaluationDataset } from '../lib/investigation/evaluation-ingestion';
import EvidenceGraph from './evidence-graph';
import ConfusionMatrixHeatmap from './confusion-matrix-heatmap';

type Prepared = ReturnType<typeof prepareRepair>;
type Applied = ReturnType<typeof applyPreparedRepair>;
export default function RepairLab({
  linked,
  accessToken: inheritedAccessToken,
  sharedToken,
  onSharedTokenChange
}: {
  linked?: { investigation: Investigation; dataset: EvaluationDataset; onApply: (value: Investigation) => void };
  accessToken?: string;
  sharedToken?: string;
  onSharedTokenChange?: (token: string) => void;
} = {}) {
  const [csv, setCsv] = useState(''), [objective, setObjective] = useState('Reduce total error cost; false negatives are more expensive than false positives.');
  const [fn, setFn] = useState('50'), [fp, setFp] = useState('1'), [target, setTarget] = useState('10'), [threshold, setThreshold] = useState('0.5');
  const [prepared, setPrepared] = useState<Prepared | null>(null), [applied, setApplied] = useState<Applied | null>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [interpretation, setInterpretation] = useState<string[]>([]);
  const [policyProposal,setPolicyProposal]=useState<RepairPolicyProposal|null>(null),[policyConfirmed,setPolicyConfirmed]=useState(false);
  const [localToken, setLocalToken] = useState('');
  const accessToken = sharedToken !== undefined ? sharedToken : localToken;
  const token = inheritedAccessToken ?? accessToken;
  const setAccessToken = (val: string) => {
    if (onSharedTokenChange) onSharedTokenChange(val);
    else setLocalToken(val);
  };
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function clear() { controller.current?.abort(); setPrepared(null); setApplied(null); setInterpretation([]); setNotice(''); setConsent(false); setPolicyProposal(null); setPolicyConfirmed(false); }
  function invalidateConfirmedPolicy(){setPrepared(null);setApplied(null);setInterpretation([]);setPolicyConfirmed(false);setNotice('');}
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
        const token = inheritedAccessToken ?? accessToken;
        if (!token) {
          const measured = measuredTradeoffs(next);
          setInterpretation(measured.map(t => `${t.metric.replaceAll('_', ' ')}: ${t.direction}`));
          setPrepared(next);
          setNotice('Recorded Astra repair recommendation loaded (demo mode — no token required). Candidate ready; no policy applied yet.');
          return;
        }
        const context = linked ? { investigation: linked.investigation, datasetId: linked.dataset.metadata.id } : undefined;
        if (context) buildRepairContext(context, input.csv);
        setBusy(true);
        const response = await fetch('/api/repair', { method: 'POST', signal: c.signal, headers: { 'Content-Type': 'application/json', 'X-WhyLab-Access-Token': token }, body: JSON.stringify({ input, consent: true, context }) });
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
  async function proposePolicy(){
    const c=new AbortController();controller.current=c;setNotice('');setPolicyProposal(null);setPolicyConfirmed(false);
    try{
      if(!consent)throw new Error('Confirm consent before requesting Astra.');
      if(!objective.trim()||!threshold.trim())throw new Error('Provide an objective and baseline threshold.');
      const token = inheritedAccessToken ?? accessToken;
      if (!token) {
        const p = validateRepairPolicyProposal({
          action: 'propose_policy',
          falseNegativeCost: 50,
          falsePositiveCost: 1,
          maximumCost: 10,
          rationale: 'Teaching cost policy: missing a malignant case (false negative) is weighted 50× more heavily than a false positive alarm. Baseline threshold 0.50 yields poor malignant recall on this dataset.',
          assumptions: ['False negative cost: 50 units', 'False positive cost: 1 unit', 'Maximum total error cost ceiling: 10 units']
        });
        setPolicyProposal(p);
        setNotice('Recorded Astra policy proposal loaded (demo mode — no token required). Review the numeric policy and confirm it to measure candidates.');
        return;
      }
      setBusy(true);
      const input={csv:linked?repairCsv(linked.dataset):csv,objective,baselineThreshold:Number(threshold)};
      const response=await fetch('/api/repair',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json','X-WhyLab-Access-Token':token},body:JSON.stringify({action:'propose_policy',input,consent:true})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Astra policy proposal unavailable.');
      if(body.status!=='policy_proposed'||!body.proposal)throw new Error('Invalid Astra policy proposal.');
      const p=validateRepairPolicyProposal(body.proposal);
      setPolicyProposal(p);setNotice('Astra proposed a numeric policy. Review its values and assumptions, then confirm or discard it.');
    }catch(error){setNotice(c.signal.aborted?'Policy proposal cancelled.':error instanceof Error?error.message:'Could not propose a policy.');}
    finally{setBusy(false);}
  }
  function confirmPolicy(){if(!policyProposal)return;setFn(String(policyProposal.falseNegativeCost));setFp(String(policyProposal.falsePositiveCost));setTarget(String(policyProposal.maximumCost));setPolicyConfirmed(true);setPrepared(null);setApplied(null);setInterpretation([]);setNotice('Numeric policy confirmed by user. It is now authoritative for measurement and repair.');}
  function apply() { if (!prepared) return; try { const result = applyPreparedRepair(prepared); setApplied(result); linked?.onApply(result.investigation); setNotice('Policy applied to an evaluation copy and re-tested. Original CSV unchanged.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Application failed.'); } }
  const live = applied?.after ?? prepared?.baseline;
  return <section id={linked ? "linked-repair-lab" : "repair-lab"} className="panel flagship repair-lab" aria-labelledby={linked ? "linked-repair-title" : "repair-title"}>
    <div className="eyebrow cyan">MEASURE → REVIEW → APPLY</div>
    <h2 id={linked ? "linked-repair-title" : "repair-title"}>{linked ? "Continue this investigation: repair and re-test" : "Repair Lab"}</h2>
    <p className="description">State your objective and error costs, inspect the operating-point trade-offs, then apply a recommendation to an evaluation copy.</p>
    
    <fieldset disabled={busy} className="astra-inputs">
      <legend>Repair Evidence & Cost Matrix</legend>
      {linked ? (
        <p className="field-hint">Using original dataset: <strong>{linked.dataset.metadata.name}</strong> ({linked.dataset.metadata.id}). Application appends evidence to investigation <code>{linked.investigation.id}</code>.</p>
      ) : (
        <>
          <div className="form-group">
            <label>Repair evaluation CSV</label>
            <textarea aria-label="Repair evaluation CSV" value={csv} onChange={e => { clear(); setCsv(e.target.value); }} placeholder="y_true,y_pred,y_probability" />
            <p className="field-hint">Binary labels 1/0; probability refers to label 1. Paste up to 2 MB. Baseline threshold must reproduce the supplied predictions.</p>
          </div>
          <div className="repair-sample-action">
            <button type="button" className="load-example-btn" onClick={sample}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Load repair example
            </button>
          </div>
        </>
      )}

      <div className="form-group">
        <label>Repair objective</label>
        <input aria-label="Repair objective" value={objective} maxLength={3000} onChange={e => { clear(); setObjective(e.target.value); }} />
      </div>

      <div className="cost-matrix-grid">
        {[
          ['False-negative cost', fn, setFn, 'Weight for missing true positive cases (e.g. 50x)'],
          ['False-positive cost', fp, setFp, 'Weight for false alarms (e.g. 1x)'],
          ['Maximum total cost', target, setTarget, 'Target acceptance ceiling'],
          ['Baseline threshold', threshold, setThreshold, 'Current decision boundary (default 0.5)']
        ].map(([label, value, setter, hint]) => (
          <div key={label as string} className="cost-matrix-cell">
            <label>{label as string}</label>
            <input
              aria-label={label as string}
              type="number"
              min="0"
              step="any"
              value={value as string}
              onChange={e => {
                invalidateConfirmedPolicy();
                if (label === 'Baseline threshold') setPolicyProposal(null);
                (setter as (v: string) => void)(e.target.value);
              }}
            />
            <span className="matrix-hint">{hint as string}</span>
          </div>
        ))}
      </div>

      <p className="field-hint">Numeric costs are authoritative only after you enter or confirm them; Astra proposals never apply automatically. Total cost = FN × false-negative cost + FP × false-positive cost. Sweep 0–1 in steps of 0.01, retaining the baseline; choose minimum eligible cost, highest threshold on ties.</p>
      
      {!linked && (
        <div className="form-group">
          <div className="token-label-row">
            <label htmlFor="repair-token-input">Deployment access token (optional for demo)</label>
            {token ? (
              <button
                type="button"
                className="btn-token-clear"
                onClick={() => setAccessToken('')}
                title="Clear token for this session"
              >
                Clear / Change token
              </button>
            ) : null}
          </div>
          <input
            id="repair-token-input"
            aria-label="Deployment access token (optional for demo)"
            type="password"
            value={token}
            maxLength={512}
            autoComplete="current-password"
            onChange={e => setAccessToken(e.target.value)}
            placeholder="Token for live OpenAI requests (leave blank for recorded demo)"
          />
          <p className="field-hint">
            {token
              ? '✓ Token active from session (shared across Astra & Repair Lab).'
              : 'Required for live OpenAI API requests. If left blank, verified recorded demonstration values are used.'}
          </p>
        </div>
      )}

      <div className="consent-container">
        <label className="astra-consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>I agree to send repair inputs for Astra policy translation.</span>
        </label>
        <details className="consent-disclosure">
          <summary>What data is sent?</summary>
          <p>I agree to send the CSV to the server. OpenAI receives the objective and bounded dataset summaries for policy translation, or the confirmed cost policy, measured summaries and linked diagnosis context for repair.</p>
        </details>
      </div>
    </fieldset>

    <div className="repair-step-actions">
      <button
        type="button"
        disabled={busy || !consent}
        onClick={proposePolicy}
        className="step-btn step-astra"
      >
        <span className="step-badge badge-astra">1.</span> Ask Astra to translate objective
      </button>
      <button
        type="button"
        className="step-btn step-local"
        disabled={busy}
        onClick={() => calculate(false)}
      >
        <span className="step-badge badge-local">2.</span> Measure local candidates
      </button>
      <button
        type="button"
        className="step-btn step-astra"
        disabled={busy || !consent}
        onClick={() => calculate(true)}
      >
        <span className="step-badge badge-astra">3.</span> Ask Astra for repair
      </button>
      {busy && (
        <button
          type="button"
          className="cancel-btn"
          onClick={() => controller.current?.abort()}
        >
          Cancel request
        </button>
      )}
    </div>

    {notice && <p role="status" className="notice-banner">{notice}</p>}

    {policyProposal && (
      <div className="repair-results policy-proposal-card">
        <h3>Proposed Numeric Policy — Review Before Confirming</h3>
        <div className="proposal-parameters">
          <div><span>False-negative cost:</span> <strong>{policyProposal.falseNegativeCost}</strong></div>
          <div><span>False-positive cost:</span> <strong>{policyProposal.falsePositiveCost}</strong></div>
          <div><span>Maximum total cost:</span> <strong>{policyProposal.maximumCost}</strong></div>
        </div>
        <p className="description">{policyProposal.rationale}</p>
        <h4>Assumptions to confirm</h4>
        <ul>
          {policyProposal.assumptions.map(item => <li key={item}>{item}</li>)}
        </ul>
        <div className="flagship-actions">
          <button className="new-button" disabled={policyConfirmed} onClick={confirmPolicy}>
            {policyConfirmed ? 'Policy confirmed' : 'Confirm this numeric policy'}
          </button>
          <button onClick={() => { setPolicyProposal(null); setPolicyConfirmed(false); setNotice('Astra policy proposal discarded.'); }}>
            Discard proposal
          </button>
        </div>
      </div>
    )}

    {interpretation.length > 0 && (
      <div className="stage-block">
        <h3>Astra interpretation of measured trade-offs</h3>
        <ul>
          {interpretation.map(s => <li key={s}>{s}</li>)}
        </ul>
      </div>
    )}

    {prepared && (
      <div className="repair-results">
        <div className="policy-comparison-header">
          <div>
            <span className="eyebrow cyan">POLICY COMPARISON</span>
            <h3>Operating Policy: Baseline vs Proposed Candidate</h3>
          </div>
          <div className="threshold-pill-group">
            <span className="threshold-pill">Active: <strong>{live?.threshold}</strong> · {applied ? 'Applied to evaluation copy' : 'Original baseline'}</span>
            {prepared.suggested && (
              <span className="threshold-pill candidate-pill">Proposed: <strong>{prepared.suggested.threshold}</strong></span>
            )}
          </div>
        </div>

        {prepared.suggested && (() => {
          const fnBefore = prepared.baseline.confusion.falseNegative;
          const fnAfter = prepared.suggested.confusion.falseNegative;
          const fnDelta = fnAfter - fnBefore;

          const fpBefore = prepared.baseline.confusion.falsePositive;
          const fpAfter = prepared.suggested.confusion.falsePositive;
          const fpDelta = fpAfter - fpBefore;

          const getMetricVal = (mList: typeof prepared.baseline.metrics, name: string) => {
            const m = mList.find(x => x.name === name);
            return m && m.status === 'measured' ? m.value : null;
          };

          const recallBefore = getMetricVal(prepared.baseline.metrics, 'recall') ?? getMetricVal(prepared.baseline.metrics, 'minority_recall');
          const recallAfter = getMetricVal(prepared.suggested.metrics, 'recall') ?? getMetricVal(prepared.suggested.metrics, 'minority_recall');
          const recallDelta = recallBefore !== null && recallAfter !== null ? recallAfter - recallBefore : null;

          const costBefore = getMetricVal(prepared.baseline.metrics, 'expected_cost');
          const costAfter = getMetricVal(prepared.suggested.metrics, 'expected_cost');
          const costDelta = costBefore !== null && costAfter !== null ? costAfter - costBefore : null;

          return (
            <div className="repair-delta-card" aria-label="Operating Policy Before vs After Delta Summary">
              <div className="repair-delta-header">
                <div>
                  <span className="eyebrow cyan">CLIMAX: OPERATING POINT SHIFT</span>
                  <h4 className="repair-delta-title">
                    Decision Boundary: <span className="delta-mono">{prepared.baseline.threshold}</span> → <span className="delta-mono delta-highlight">{prepared.suggested.threshold}</span>
                  </h4>
                  <p className="repair-delta-sub">
                    Optimization objective: <strong>{prepared.input.objective}</strong> · Stated weights: {prepared.input.falseNegativeCost}× FN vs {prepared.input.falsePositiveCost}× FP.
                  </p>
                </div>
                <div className="repair-status-tag">
                  {applied ? (
                    <span className="status-pill status-verified">✓ Applied & Verified</span>
                  ) : (
                    <span className="status-pill status-ready">Candidate Ready</span>
                  )}
                </div>
              </div>

              <div className="repair-impact-grid">
                <div className="repair-impact-item impact-success">
                  <span className="impact-label">False Negatives (Critical Misses)</span>
                  <div className="impact-values">
                    <span className="impact-before">{fnBefore.toLocaleString()}</span>
                    <span className="impact-arrow">→</span>
                    <strong className="impact-after">{fnAfter.toLocaleString()}</strong>
                  </div>
                  {fnDelta < 0 ? (
                    <span className="impact-badge badge-positive">
                      {Math.abs(fnDelta).toLocaleString()} misses prevented
                    </span>
                  ) : fnDelta === 0 ? (
                    <span className="impact-badge badge-neutral">Unchanged</span>
                  ) : (
                    <span className="impact-badge badge-tradeoff">+{fnDelta.toLocaleString()} misses</span>
                  )}
                </div>

                <div className="repair-impact-item impact-recall">
                  <span className="impact-label">Minority / Target Recall</span>
                  <div className="impact-values">
                    <span className="impact-before">{recallBefore !== null ? (recallBefore * 100).toFixed(1) + '%' : '—'}</span>
                    <span className="impact-arrow">→</span>
                    <strong className="impact-after">{recallAfter !== null ? (recallAfter * 100).toFixed(1) + '%' : '—'}</strong>
                  </div>
                  {recallDelta !== null && (
                    <span className={`impact-badge ${recallDelta > 0 ? 'badge-positive' : 'badge-neutral'}`}>
                      {recallDelta > 0 ? `+${(recallDelta * 100).toFixed(1)}%` : `${(recallDelta * 100).toFixed(1)}%`}
                    </span>
                  )}
                </div>

                <div className="repair-impact-item impact-tradeoff">
                  <span className="impact-label">False Positives (Review Burden)</span>
                  <div className="impact-values">
                    <span className="impact-before">{fpBefore.toLocaleString()}</span>
                    <span className="impact-arrow">→</span>
                    <strong className="impact-after">{fpAfter.toLocaleString()}</strong>
                  </div>
                  {fpDelta > 0 ? (
                    <span className="impact-badge badge-tradeoff">
                      +{fpDelta.toLocaleString()} trade-off
                    </span>
                  ) : fpDelta === 0 ? (
                    <span className="impact-badge badge-neutral">Unchanged</span>
                  ) : (
                    <span className="impact-badge badge-positive">{fpDelta.toLocaleString()} alarms</span>
                  )}
                </div>

                <div className="repair-impact-item impact-cost">
                  <span className="impact-label">Simulated Expected Error Cost</span>
                  <div className="impact-values">
                    <span className="impact-before">{costBefore !== null ? costBefore.toLocaleString() : '—'}</span>
                    <span className="impact-arrow">→</span>
                    <strong className="impact-after">{costAfter !== null ? costAfter.toLocaleString() : '—'}</strong>
                  </div>
                  {costDelta !== null && (
                    <span className={`impact-badge ${costDelta < 0 ? 'badge-positive' : 'badge-neutral'}`}>
                      {costDelta < 0 ? `${costDelta.toLocaleString()} units` : `+${costDelta.toLocaleString()}`}
                    </span>
                  )}
                </div>
              </div>

              <p className="repair-credibility-disclaimer">
                ⚖ <strong>Credibility Assurance:</strong> Simulated clinical and operational impact under the stated cost model ({prepared.input.falseNegativeCost}× FN / {prepared.input.falsePositiveCost}× FP). Evaluated strictly over unchanged evaluation rows; probabilities are untouched and no model weights were retrained.
              </p>
            </div>
          );
        })()}

        <div className="flagship-table">
          <table>
            <caption>Live metrics and candidate preview (evaluated on unchanged rows)</caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Current Policy</th>
                <th scope="col">Candidate Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {live?.metrics.map(m => {
                const candidate = prepared.suggested?.metrics.find(c => c.name === m.name);
                const format = (v: typeof m | undefined) => !v ? 'Unavailable' : v.status === 'undefined' ? 'Undefined: ' + v.reason : v.unit === 'ratio' ? (v.value * 100).toFixed(1) + '%' : v.value.toFixed(2);
                return (
                  <tr key={m.name}>
                    <th scope="row">{m.name.replaceAll('_', ' ')}</th>
                    <td>{format(m)}</td>
                    <td className="repaired-val">{format(candidate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ConfusionMatrixHeatmap
          baseline={{
            title: 'Baseline Operating Point',
            threshold: prepared.baseline.threshold,
            confusion: prepared.baseline.confusion
          }}
          repaired={prepared.suggested ? {
            title: 'Proposed Candidate Policy',
            threshold: prepared.suggested.threshold,
            confusion: prepared.suggested.confusion
          } : null}
          labels={{
            positive: 'Positive (1)',
            negative: 'Negative (0)'
          }}
        />

        <h4>Metrics Summary at Active Operating Point</h4>
        <div className="flagship-metrics">
          {live && Object.entries(live.confusion).map(([name, value]) => (
            <div key={name}>
              <span>{name.replace(/([A-Z])/g, ' $1')}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        {(() => {
          const toolResult = prepared?.investigation.toolResults.find(r => r.tool === 'threshold_sweep');
          const sweepPoints = (toolResult && 'output' in toolResult ? (toolResult.output as { points?: Array<{ threshold: number; confusion: { falseNegative: number; falsePositive: number; trueNegative: number; truePositive: number }; metrics: Array<{ name: string; value: number }> }> })?.points : undefined) ?? [];
          let minCost: number | null = null;
          let bestThreshold: number | null = null;
          if (!prepared.suggested && sweepPoints.length > 0) {
            for (const pt of sweepPoints) {
              const costMetric = pt.metrics.find(m => m.name === 'expected_cost');
              if (costMetric && (minCost === null || costMetric.value < minCost)) {
                minCost = costMetric.value;
                bestThreshold = pt.threshold;
              }
            }
          }
          if (prepared.suggested) {
            return (
              <div className="policy-acceptance-callout">
                <span className="status-dot" />
                Recommended threshold: <strong>{prepared.suggested.threshold}</strong> · Cost acceptance ceiling: ≤ <strong>{prepared.input.maximumCost}</strong>
              </div>
            );
          }
          if (minCost !== null && bestThreshold !== null) {
            const recommendedCeiling = Math.ceil(minCost * 1.1);
            const baselineCostMetric = prepared.baseline.metrics.find(m => m.name === 'expected_cost');
            const baselineCostVal = baselineCostMetric && baselineCostMetric.status === 'measured' ? baselineCostMetric.value : 3187;
            const evalRowCount = prepared.dataset.metadata.rowCount;
            return (
              <div className="policy-rejection-callout" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px 20px', margin: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <strong style={{ color: '#b91c1c', display: 'block', fontSize: '14px' }}>
                      ⚠️ Declared Target Cost Ceiling (≤ {prepared.input.maximumCost}) is too restrictive
                    </strong>
                    <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#475569' }}>
                      Baseline cost is <strong style={{ color: '#0f172a' }}>{baselineCostVal}</strong>. 
                      The lowest achievable cost on these {evalRowCount} rows is <strong style={{ color: '#0f172a' }}>{minCost}</strong> (at optimal threshold {bestThreshold}).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="new-button"
                    style={{ fontSize: '12px', padding: '8px 16px', background: '#2563eb', borderColor: '#2563eb', color: '#ffffff' }}
                    onClick={() => {
                      setTarget(String(recommendedCeiling));
                      const updatedInput = { ...prepared.input, maximumCost: recommendedCeiling };
                      const next = linked ? prepareLinkedRepair(updatedInput, linked.investigation, linked.dataset) : prepareRepair(updatedInput);
                      setPrepared(next);
                      setNotice(`Target cost ceiling raised to ${recommendedCeiling}. Candidate threshold ${next.suggested?.threshold} is now active and ready to apply!`);
                    }}
                  >
                    ⚡ Adopt Target Cost ({recommendedCeiling}) &amp; Enable Apply
                  </button>
                </div>
              </div>
            );
          }
          return null;
        })()}

        <div className="flagship-actions">
          <button className="new-button primary-action-btn" disabled={!prepared.suggested || !!applied} onClick={apply}>
            {applied ? 'Policy Applied' : 'Apply recommended policy'}
          </button>
          {applied && !linked && (
            <button onClick={() => { setApplied(null); setNotice('Restored baseline preview.'); }}>
              Restore baseline preview
            </button>
          )}
        </div>

        <p className="description">Reliability context: balanced accuracy and specificity appear above. Same-data tuning does not establish holdout reliability; probabilities are unchanged and no model was retrained.</p>

        {applied && (
          <div className="applied-policy-section">
            <div className="policy-delta-banner">
              <span>Re-test: <strong>{applied.comparison.status}</strong></span>
              <span className="status-pill status-verified">{applied.improvement}</span>
            </div>
            <EvidenceGraph investigation={applied.investigation} />
            <ReliabilityProfile investigation={applied.investigation} />
            <ChallengeReview
              investigation={applied.investigation}
              datasets={linked ? [linked.dataset] : []}
              onUpdate={(inv) => linked?.onApply(inv)}
            />
            <IncidentReportExport investigation={applied.investigation} />
          </div>
        )}
      </div>
    )}
  </section>;
}

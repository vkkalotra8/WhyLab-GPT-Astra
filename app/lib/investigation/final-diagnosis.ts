import { createId } from './primitives.ts';
import { validateInvestigation } from './validation.ts';
import type { Investigation, Hypothesis, VerificationExperiment } from './types.ts';
import type { InvestigatorRun } from './investigator.ts';
import { fail } from './schema.ts';
import { evaluateDiagnosticFalsification } from './diagnostic-falsification.ts';

const accuracyStatement = 'Class imbalance is making raw accuracy misleading.';
const alternativeStatement = 'An alternative explanation proposed during investigation remains unverified.';
const summaryFor = (status: string) => status === 'failed' ? 'Investigation stopped before a final conclusion. Available diagnostic evidence is retained.' : status === 'completed' ? 'A recorded hypothesis prediction is supported by a validated verification experiment on the supplied evaluation data.' : 'The available evidence does not establish a supported final explanation. Review the recorded hypothesis outcomes and unresolved questions.';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Final-boundary validation adds verified outcome/provenance requirements to the canonical graph. */
export function validateFinalInvestigation(value: unknown): Investigation {
  const v = validateInvestigation(value);
  if (!v.diagnosis || !['completed', 'failed'].includes(v.status)) fail('$', 'expected a terminal investigation with a diagnosis');
  if (v.diagnosis.summary !== summaryFor(v.diagnosis.status)) fail(v.diagnosis.id, 'final summary must use evidence-derived application wording');
  for (const h of v.hypotheses) {
    if (![accuracyStatement, alternativeStatement].includes(h.statement)) fail(h.id, 'unverified model prose cannot become a final finding');
    if (!h.evidence.length) fail(h.id, 'every final hypothesis must reference evidence');
    if (h.status === 'confirmed') fail(h.id, 'descriptive diagnostics cannot establish confirmed causality');
  }
  for (const experiment of v.experiments) {
    if (experiment.status !== 'completed') continue;
    if (experiment.callIds.length !== 1) fail(experiment.id, 'verification requires one matching counterfactual call');
    const call = v.toolCalls.find(c => c.id === experiment.callIds[0]);
    const result = v.toolResults.find(r => r.callId === experiment.callIds[0]);
    if(experiment.method.startsWith('diagnostic_falsification_v1:')) {
      if(!call||!result||result.status!=='completed'||result.tool==='run_counterfactual_test')fail(experiment.id,'diagnostic falsification lacks its completed diagnostic result');
      const assessment=evaluateDiagnosticFalsification(result,{hypothesisId:experiment.hypothesisId,resultId:result.id,prediction:experiment.prediction,criterion:experiment.criterion});
      if(assessment.outcome!==experiment.outcome)fail(experiment.id,'diagnostic falsification outcome disagrees with its measured criterion');
      if(experiment.seed!==null)fail(experiment.id,'diagnostic falsification is deterministic and requires a null seed');
      if(experiment.method!==`diagnostic_falsification_v1:${result.tool}:${result.id}`)fail(experiment.id,'diagnostic falsification method does not identify its result');
      for(const eid of experiment.evidenceIds){const evidence=v.evidence.find(e=>e.id===eid)!;const expected=assessment.measurement?[assessment.measurement]:[];if(evidence.kind!=='measurement'||evidence.provenance.kind!=='experiment'||evidence.provenance.experimentId!==experiment.id||!equal(evidence.measurements,expected))fail(eid,'diagnostic falsification evidence differs from its measured result');}
      continue;
    }
    if (!call || call.tool !== 'run_counterfactual_test' || !result || result.status !== 'completed' || result.tool !== 'run_counterfactual_test') fail(experiment.id, 'verification lacks a completed counterfactual result');
    if (call.input.hypothesisId !== experiment.hypothesisId || result.output.hypothesisId !== experiment.hypothesisId || !equal(call.input.criterion, experiment.criterion) || call.input.seed !== experiment.seed || result.output.outcome !== experiment.outcome || !equal(result.output.evidenceIds, experiment.evidenceIds)) fail(experiment.id, 'experiment differs from executed call/result');
    if (experiment.criterion.metric !== 'accuracy_paradox_gap' || experiment.criterion.operator !== 'at_least' || experiment.criterion.unit !== 'percentage_points' || experiment.criterion.value <= 0 || experiment.criterion.value > 100) fail(experiment.id, 'unsupported verification criterion');
    if (v.hypotheses.find(h => h.id === experiment.hypothesisId)?.statement !== accuracyStatement) fail(experiment.id, 'counterfactual verifies only the accuracy-paradox prediction');
    const metric = (name: string) => result.output.comparison.find(m => m.name === name);
    const balanced = metric('accuracy_minus_balanced_accuracy'), minority = metric('accuracy_minus_minority_recall'), gap = metric('accuracy_paradox_gap');
    if (!balanced || !minority || !gap || [balanced, minority, gap].some(m => m.unit !== 'percentage_points')) fail(experiment.id, 'verification is missing its measured gap definitions');
    const baseline = (name: string) => result.output.baseline.find(m => m.name === name);
    const accuracy = baseline('accuracy'), ba = baseline('balanced_accuracy'), mr = baseline('minority_recall');
    if (!accuracy || !ba || !mr || [accuracy, ba, mr].some(m => m.unit !== 'ratio')) fail(experiment.id, 'baseline must retain the original ratio metric definitions');
    for (const [component, reference] of [[balanced, ba], [minority, mr]] as const) {
      if (accuracy?.status === 'measured' && reference?.status === 'measured') {
        if (component.status !== 'measured' || component.value !== (accuracy.value - reference.value) * 100) fail(experiment.id, 'gap differs from recorded baseline metrics');
      } else if (component.status !== 'undefined') fail(experiment.id, 'missing baseline cannot produce a measured gap');
    }
    const evaluable = balanced.status === 'measured' && minority.status === 'measured';
    if (evaluable && (gap.status !== 'measured' || gap.value !== Math.min(balanced.value, minority.value))) fail(experiment.id, 'joint gap differs from observed components');
    if (!evaluable && gap.status !== 'undefined') fail(experiment.id, 'undefined components cannot establish a joint gap');
    const outcome = !evaluable ? 'inconclusive' : Math.min(balanced.value, minority.value) >= experiment.criterion.value ? 'supports' : Math.max(balanced.value, minority.value) >= experiment.criterion.value ? 'weakens' : 'rejects';
    if (experiment.outcome !== outcome) fail(experiment.id, 'verification outcome disagrees with its numerical rule');
    for (const eid of experiment.evidenceIds) {
      const evidence = v.evidence.find(e => e.id === eid)!;
      if (evidence.kind !== 'measurement' || evidence.provenance.kind !== 'experiment' || evidence.provenance.experimentId !== experiment.id || !equal(evidence.measurements, result.output.comparison)) fail(eid, 'verification evidence must copy the executed comparison measurements');
    }
  }
  for (const h of v.hypotheses) {
    const verified = v.experiments.filter(e => e.hypothesisId === h.id && e.status === 'completed');
    const expected = reconciledStatus(verified);
    if (h.status !== expected) fail(h.id, 'hypothesis status disagrees with verification');
  }
  const primary = v.hypotheses.find(h => h.id === v.diagnosis!.primaryHypothesisId);
  if (v.diagnosis.primaryHypothesisId !== null && primary?.status !== 'supported') fail(v.diagnosis.id, 'primary hypothesis must have supporting verification');
  if (v.diagnosis.status === 'completed' && !primary) fail(v.diagnosis.id, 'completed diagnosis requires a supported primary hypothesis');
  return v;
}

function reconciledStatus(experiments: readonly VerificationExperiment[]): Hypothesis['status'] {
  const outcomes = new Set(experiments.filter(e => e.status === 'completed').map(e => e.outcome));
  if (outcomes.size !== 1) return 'proposed';
  switch ([...outcomes][0]) {
    case 'supports': return 'supported';
    case 'weakens': return 'weakened';
    case 'rejects': return 'rejected';
    default: return 'proposed';
  }
}

/** Application-authored final claims; no model-generated numerical prose is promoted to findings. */
export function buildFinalInvestigation(run: InvestigatorRun): Investigation {
  if (!['completed', 'stopped'].includes(run.status)) fail('$', 'cannot finalize an active run');
  const base = validateInvestigation({
    schemaVersion: 1, id: run.id, objective: run.objective, status: 'running', createdAt: run.createdAt, updatedAt: run.updatedAt,
    sources: run.sources, datasets: run.datasets, evidence: run.evidence, toolCalls: run.toolCalls, toolResults: run.toolResults,
    hypotheses: run.hypotheses, experiments: run.experiments, repairs: [], comparisons: [], events: [], diagnosis: null,
  });
  if (run.status === 'completed' && (!run.completion || !run.completion.evidenceIds.length || run.completion.evidenceIds.some(id => !base.evidence.some(e => e.id === id)))) fail('$', 'completion requires registered evidence');
  const hypotheses = base.hypotheses.map(h => {
    if (!h.evidence.length) fail(h.id, 'every hypothesis needs evidence');
    const experiments = base.experiments.filter(e => e.hypothesisId === h.id && e.status === 'completed');
    const status = reconciledStatus(experiments);
    const links = new Map(h.evidence.map(e => [e.evidenceId, { ...e }]));
    for (const experiment of experiments) {
      if (experiment.outcome === 'inconclusive') continue;
      for (const evidenceId of experiment.evidenceIds) links.set(evidenceId, { evidenceId, relationship: experiment.outcome!, rationale: 'Relationship follows the executed falsification rule on this evaluation dataset.' });
    }
    const unresolvedQuestions = status === 'proposed' ? ['The proposed explanation remains unresolved by consistent verification.'] : ['Does this finding generalize to an independent evaluation dataset?'];
    return { ...h, statement: h.statement === accuracyStatement ? accuracyStatement : alternativeStatement, status, evidence: [...links.values()], confidence: { kind: 'evidence_strength' as const, level: status === 'proposed' ? 'unassessed' as const : 'limited' as const, rationale: 'Descriptive verification on supplied data; not calibrated probability or confirmed causality.' }, unresolvedQuestions };
  });
  const primary = run.status === 'completed' && run.completion?.reason === 'sufficient_evidence' ? hypotheses.find(h => h.status === 'supported') : undefined;
  const status = run.status === 'stopped' ? 'failed' : run.completion?.reason === 'sufficient_evidence' && primary ? 'completed' : 'inconclusive';
  const limitations = [...new Set([
    'Numerical findings are retained in validated tool outputs and experiment measurement evidence; no model-authored numerical summary is accepted.',
    'Verification tests a dataset-specific prediction against a declared numerical criterion, not causality. No hypothesis is automatically confirmed.',
    'Untested model proposals are preserved in the run audit; their prose is not promoted to final findings.',
    'No repair candidates or before/after verification have been generated at this milestone.',
    ...(run.status === 'stopped' ? ['Investigation stopped before explicit completion; partial evidence is retained.'] : []),
    ...base.toolResults.flatMap(r => r.limitations), ...base.experiments.flatMap(e => e.limitations),
  ])];
  const diagnosis = {
    id: createId('diagnosis'), investigationId: base.id, status,
    summary: summaryFor(status),
    evidenceIds: base.evidence.map(e => e.id), hypothesisIds: hypotheses.map(h => h.id), primaryHypothesisId: primary?.id ?? null,
    confidence: { kind: 'evidence_strength', level: status === 'completed' ? 'limited' : 'unassessed', rationale: 'Evidence strength reflects recorded verification only; it is not a probability of correctness.' },
    experimentIds: base.experiments.map(e => e.id), repairIds: [], comparisonIds: [],
    unresolvedQuestions: [...new Set(hypotheses.flatMap(h => h.unresolvedQuestions).concat(status === 'completed' ? [] : ['Additional evidence or verification is required before selecting a final explanation.']))], limitations,
  };
  return validateFinalInvestigation({ ...base, status: run.status === 'stopped' ? 'failed' : 'completed', hypotheses, diagnosis });
}

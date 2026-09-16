import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDiagnosticFalsification } from '../app/lib/investigation/diagnostic-falsification.ts';

const base = output => ({id:'result_test',callId:'call_test',tool:'run_drift_tests',toolVersion:1,completedAt:'2026-09-16T00:00:00.000Z',datasetIds:['dataset_a','dataset_b'],evidenceIds:['evidence_test'],limitations:[],status:'completed',output});
const comparison = statistic => ({comparisons:[{feature:'age',method:'ks',referenceSize:10,comparisonSize:10,statistic,limitations:[]}]});
const request = patch => ({hypothesisId:'hypothesis_shift',resultId:'result_test',prediction:'Age distribution shifted materially.',criterion:{metric:'ks_statistic',operator:'at_least',value:.2,unit:'unitless'},...patch});

test('broader falsification supports and rejects declared drift predictions deterministically',()=>{
  const measured=value=>({name:'ks_statistic',status:'measured',value,unit:'unitless',sampleSize:20});
  assert.equal(evaluateDiagnosticFalsification(base(comparison(measured(.4))),request()).outcome,'supports');
  assert.equal(evaluateDiagnosticFalsification(base(comparison(measured(.1))),request()).outcome,'rejects');
});

test('missing, undefined and ambiguous measurements remain inconclusive',()=>{
  const undefinedMetric={name:'ks_statistic',status:'undefined',reason:'Too few values',unit:'unitless',sampleSize:0};
  assert.equal(evaluateDiagnosticFalsification(base(comparison(undefinedMetric)),request()).outcome,'inconclusive');
  assert.equal(evaluateDiagnosticFalsification(base(comparison({name:'other',status:'measured',value:.5,unit:'unitless',sampleSize:20})),request()).outcome,'inconclusive');
  const duplicated={comparisons:[comparison({name:'ks_statistic',status:'measured',value:.4,unit:'unitless',sampleSize:20}).comparisons[0],comparison({name:'ks_statistic',status:'measured',value:.5,unit:'unitless',sampleSize:20}).comparisons[0]]};
  assert.equal(evaluateDiagnosticFalsification(base(duplicated),request()).outcome,'inconclusive');
});

test('falsification rejects mismatched result references and units',()=>{
  const result=base(comparison({name:'ks_statistic',status:'measured',value:.4,unit:'unitless',sampleSize:20}));
  assert.throws(()=>evaluateDiagnosticFalsification(result,request({resultId:'result_other'})));
  assert.equal(evaluateDiagnosticFalsification(result,request({criterion:{metric:'ks_statistic',operator:'at_least',value:.2,unit:'ratio'}})).outcome,'inconclusive');
});

const stat = (name, value) => ({ feature: name, method: name === 'psi' ? 'psi' : 'ks', referenceSize: 10, comparisonSize: 10, statistic: { name, status: 'measured', value, unit: 'unitless', sampleSize: 20 }, limitations: [] });
const pair = (ks, psi) => ({ comparisons: [stat('ks_statistic', ks), stat('psi', psi)] });
const both = { kind: 'all_of', criteria: [{ metric: 'ks_statistic', operator: 'at_least', value: .2, unit: 'unitless' }, { metric: 'psi', operator: 'at_least', value: .1, unit: 'unitless' }] };
const composite = patch => request({ criterion: both, ...patch });

test('a conjunctive prediction separates full support, partial support and rejection', () => {
  assert.equal(evaluateDiagnosticFalsification(base(pair(.4, .5)), composite()).outcome, 'supports');
  const weakened = evaluateDiagnosticFalsification(base(pair(.4, .05)), composite());
  assert.equal(weakened.outcome, 'weakens');
  assert.match(weakened.rationale, /1 of 2 declared criteria hold/);
  assert.equal(evaluateDiagnosticFalsification(base(pair(.1, .05)), composite()).outcome, 'rejects');
});

test('a conjunctive prediction retains every matched measurement in declaration order', () => {
  const assessment = evaluateDiagnosticFalsification(base(pair(.4, .05)), composite());
  assert.deepEqual(assessment.measurements.map(m => [m.name, m.value]), [['ks_statistic', .4], ['psi', .05]]);
});

test('one unevaluable component makes the whole conjunction inconclusive, never a partial pass', () => {
  const undefinedPsi = { comparisons: [stat('ks_statistic', .4), { ...stat('psi', 0), statistic: { name: 'psi', status: 'undefined', reason: 'Too few values', unit: 'unitless', sampleSize: 0 } }] };
  const assessment = evaluateDiagnosticFalsification(base(undefinedPsi), composite());
  assert.equal(assessment.outcome, 'inconclusive');
  assert.deepEqual(assessment.measurements.map(m => m.name), ['ks_statistic', 'psi']);
  const absent = { comparisons: [stat('ks_statistic', .4)] };
  assert.equal(evaluateDiagnosticFalsification(base(absent), composite()).outcome, 'inconclusive');
});

test('conjunctive criteria reject duplicate metrics and out-of-range component counts', () => {
  const duplicate = { kind: 'all_of', criteria: [both.criteria[0], { ...both.criteria[0] }] };
  assert.throws(() => evaluateDiagnosticFalsification(base(pair(.4, .5)), composite({ criterion: duplicate })));
  assert.throws(() => evaluateDiagnosticFalsification(base(pair(.4, .5)), composite({ criterion: { kind: 'all_of', criteria: [both.criteria[0]] } })));
  const five = Array.from({ length: 5 }, (_, i) => ({ metric: `m${i}`, operator: 'at_least', value: 0, unit: 'unitless' }));
  assert.throws(() => evaluateDiagnosticFalsification(base(pair(.4, .5)), composite({ criterion: { kind: 'all_of', criteria: five } })));
});

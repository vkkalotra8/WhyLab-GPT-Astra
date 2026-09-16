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

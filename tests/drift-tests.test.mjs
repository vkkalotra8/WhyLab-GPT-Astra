import test from 'node:test';
import assert from 'node:assert/strict';
import {ingestEvaluationCsv} from '../app/lib/investigation/evaluation-ingestion.ts';
import {runDriftTests} from '../app/lib/investigation/drift-tests.ts';
const data=values=>ingestEvaluationCsv('y_true,y_pred,y_probability,feature_x\n'+values.map(v=>'0,0,.1,'+(v??'')).join('\n'),'x.csv');
const run=(a,b,method='ks',bins=null)=>runDriftTests(a,b,{referenceDatasetId:a.metadata.id,comparisonDatasetId:b.metadata.id,columns:['feature_x'],method,bins});
const stat=r=>r.output.comparisons[0].statistic;
test('identical empirical distributions have zero KS and Wasserstein despite unequal sample counts',()=>{for(const method of ['ks','wasserstein'])assert.equal(stat(run(data([0,1]),data([0,0,1,1]),method)).value,0);});
test('hand-verifiable shifted and unequal-size distributions',()=>{assert.equal(stat(run(data([0,1]),data([2,3]))).value,1);assert.equal(stat(run(data([0,1]),data([2,3]),'wasserstein')).value,2);assert.equal(stat(run(data([0]),data([0,2]),'wasserstein')).value,1);assert.equal(stat(run(data([0]),data([0,2]))).value,.5);});
test('tied empirical CDF jumps are processed together and input is unchanged',()=>{const a=data([1,1,0]),b=data([0,1,1]),before=structuredClone(a);assert.equal(stat(run(a,b)).value,0);assert.deepEqual(a,before);});
test('PSI retains unseen categories and matches a hand-computed smoothed result',()=>{const r=run(data(['a','a','b']),data(['a','b','b']),'psi',2);const expected=2*(.625-.375)*Math.log(.625/.375);assert.ok(Math.abs(stat(r).value-expected)<1e-12);const unseen=run(data(['a','a']),data(['b','b']),'psi',2);assert.ok(stat(unseen).value>0);assert.deepEqual(unseen.psiConfiguration[0].categories,['a','b']);});
test('numeric PSI derives cuts from reference and retains out-of-range observations',()=>{const r=run(data([0,2]),data([-100,100]),'psi',2);assert.equal(stat(r).value,0);assert.deepEqual(r.psiConfiguration[0].cutPoints,[1]);assert.equal(r.output.comparisons[0].comparisonSize,2);});
test('constant numeric reference makes PSI explicitly undefined',()=>{const r=run(data([1,1]),data([2,2]),'psi',2);assert.equal(stat(r).status,'undefined');assert.match(stat(r).reason,/constant/);});
test('missingness is counted and categorical KS is unsupported rather than coerced',()=>{const r=run(data([null,1]),data([null,2]));assert.equal(r.output.comparisons[0].referenceSize,1);assert.match(r.output.comparisons[0].limitations[0],/1 reference and 1 comparison/);assert.equal(stat(run(data([null]),data([1]))).status,'undefined');assert.equal(stat(run(data(['text']),data(['other']))).status,'undefined');});
test('distinct matching dataset IDs, shared columns and explicit PSI bins are required',()=>{const a=data([1]),b=data([2]);assert.throws(()=>run(a,a));assert.throws(()=>run(a,b,'psi'));assert.throws(()=>runDriftTests(a,b,{referenceDatasetId:a.metadata.id,comparisonDatasetId:b.metadata.id,columns:['missing'],method:'ks',bins:null}));});
test('numeric range overflow returns undefined instead of Infinity',()=>{assert.equal(stat(run(data([-1e308]),data([1e308]),'wasserstein')).status,'undefined');});
test('reports preserve method units and deterministic serialization',()=>{const a=data([0,1]),b=data([2,3]),r=run(a,b,'wasserstein');assert.equal(stat(r).unit,'feature_units');assert.deepEqual(run(a,b,'wasserstein'),r);assert.deepEqual(JSON.parse(JSON.stringify(r)),r);});

test('probability drift rejects incompatible positive class mappings',()=>{const a=data([1]),b=data([2]);b.labels={positive:'0',negative:'1'};b.metadata.positiveLabel='0';assert.throws(()=>runDriftTests(a,b,{referenceDatasetId:a.metadata.id,comparisonDatasetId:b.metadata.id,columns:['y_probability'],method:'ks',bins:null}),/class mappings/);});

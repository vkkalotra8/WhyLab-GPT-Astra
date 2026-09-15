import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {investigateMelanoma} from '../app/lib/investigation/flagship-melanoma.ts';
import {parseInvestigation,serializeInvestigation} from '../app/lib/investigation/validation.ts';
const csv=readFileSync(new URL('../public/fixtures/melanoma-synthetic.csv',import.meta.url),'utf8');
const metric=(point,name)=>point.metrics.find(m=>m.name===name).value;
test('flagship fixture measures the accuracy paradox and a fully linked verified repair',()=>{
 const r=investigateMelanoma(csv);assert.equal(r.sampleSize,100);assert.equal(metric(r.baseline,'accuracy'),.92);assert.equal(metric(r.baseline,'recall'),.2);
 assert.equal(r.counter.outcome,'supports');assert.equal(r.investigation.hypotheses[0].status,'confirmed');assert.equal(r.investigation.diagnosis.primaryHypothesisId,'hypothesis_paradox');
 assert.equal(r.comparison.status,'passed');assert.equal(r.comparison.afterPolicy.threshold,.2);assert.equal(metric(r.after,'recall'),1);assert.equal(metric(r.after,'expected_cost'),4);assert.equal(metric(r.baseline,'expected_cost'),80);
 assert.equal(r.after.confusion.falsePositive,4);assert.equal(r.baseline.confusion.falsePositive,0);assert.equal(metric(r.after,'precision'),10/14);
 assert.deepEqual(parseInvestigation(serializeInvestigation(r.investigation)),r.investigation);
 assert.equal(r.investigation.diagnosis.comparisonIds[0],r.comparison.id);
});
test('flagship replay has identical measured results with independent comparison evidence',()=>{const a=investigateMelanoma(csv),b=investigateMelanoma(csv);assert.deepEqual(a.baseline,b.baseline);assert.deepEqual(a.after,b.after);assert.deepEqual(a.counter,b.counter);assert.notEqual(a.comparison.id,b.comparison.id);assert.notDeepEqual(a.comparison.baselineEvidenceIds,a.comparison.afterEvidenceIds);});
test('alternative explanations remain unassessed rather than falsely rejected',()=>{const r=investigateMelanoma(csv);for(const h of r.investigation.hypotheses.slice(1)){assert.equal(h.status,'proposed');assert.equal(h.confidence.level,'unassessed');assert.ok(h.unresolvedQuestions.length);}});
test('changed fixture changes measurements rather than forcing the flagship story',()=>{const changed=csv.replaceAll('1,0,0.4','1,1,0.8');const r=investigateMelanoma(changed);assert.equal(metric(r.baseline,'recall'),.9);assert.equal(r.counter.outcome,'rejects');assert.equal(r.investigation.diagnosis.primaryHypothesisId,null);assert.equal(r.investigation.diagnosis.status,'inconclusive');});
test('invalid fixture and baseline-policy mismatch fail explicitly',()=>{assert.throws(()=>investigateMelanoma('bad,csv\n1,2'));assert.throws(()=>investigateMelanoma(csv.replace('0,0,0.1','0,1,0.1')),/baseline/i);});

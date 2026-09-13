import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExplanationInput,validateExplanation,localExplanation,createBudget} from '../app/lib/explanations.ts';
const input={id:'shift',title:'Possible shift',evidence:[{id:'E1',text:'Validation 94%, production 62%'}],conflicts:['Preprocessing unknown'],missing:['Labeled holdout'],experiment:'Compare sources.'};
test('local explanation retains conflicting context and source references',()=>{const e=localExplanation(validateExplanationInput(input));assert.equal(e.claims[0].evidenceIds[0],'E1');assert.match(e.limitations,/Preprocessing unknown/);assert.deepEqual(validateExplanation(e,input),e);});
test('input rejects missing evidence, duplicate IDs and oversized excerpts',()=>{for(const evidence of [[],[{id:'E1',text:'a'},{id:'E1',text:'b'}],[{id:'E1',text:'x'.repeat(1501)}]])assert.throws(()=>validateExplanationInput({...input,evidence}));});
test('output rejects hallucinated references and uncited claims',()=>{for(const evidenceIds of [['E9'],[]])assert.throws(()=>validateExplanation({...localExplanation(input),claims:[{text:'claim',evidenceIds}]},input));});
test('malformed or refused output is not treated as explanation',()=>{assert.throws(()=>validateExplanation({refusal:'no'},input));assert.throws(()=>validateExplanation(null,input));});
test('budget enforces concurrency, minute and day limits with idempotent release',()=>{const b=createBudget(2,3,1);const release=b.acquire(0);assert.ok(release);assert.equal(b.acquire(0),null);release();release();const second=b.acquire(0);assert.ok(second);second();assert.equal(b.acquire(0),null);const third=b.acquire(60000);assert.ok(third);third();assert.equal(b.acquire(120000),null);assert.ok(b.acquire(86400000));});

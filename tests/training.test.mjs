import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvidence } from '../app/lib/evidence.ts';
const losses = values => analyzeEvidence(values.map((v,i)=>`epoch=${i+1} train_loss=${v}`).join('\n'));
test('loss divergence grounds overfitting in specific epochs',()=>{
 const e=analyzeEvidence([1,2,3,4,5].map(n=>`[epoch ${n}/5] train_loss=${1-n*.1} val_loss=${.4+n*.1}`).join('\n'));
 assert.equal(e.history.length,5);assert.match(e.findings.find(f=>f.title==='Possible overfitting').evidence,/epochs 1-5/);
});
test('healthy loss improvement and zero loss do not trigger patterns',()=>{
 assert.equal(losses([.8,.7,.6,.5,.4]).findings.length,0); assert.equal(losses([0,0,0,0,0]).findings.length,0);
});
test('plateaus and oscillations are distinguished',()=>{
 assert.equal(losses([.5,.501,.5,.501,.5]).findings[0].title,'Possible stalled learning');
 assert.equal(losses([.3,.8,.3,.8,.3]).findings[0].title,'Possible unstable training');
});
test('CSV and JSON epoch records align metrics',()=>{
 const csv=analyzeEvidence('epoch,train_loss,val_loss\n1,0.8,0.9\n2,0.6,0.8','metrics.csv');
 assert.equal(csv.history[1].metrics['Validation loss'],.8);
 for(const data of [[{epoch:1,train_loss:.8},{epoch:2,train_loss:.6}],{history:[{epoch:1,training:{loss:.8}},{epoch:2,training:{loss:.6}}]}]) {
  const e=analyzeEvidence(JSON.stringify(data),'metrics.json');assert.equal(e.history.length,2);assert.equal(e.history[1].metrics['Training loss'],.6);
 }
});
test('missing epochs and metrics cannot manufacture trends',()=>{
 const e=analyzeEvidence('epoch=1 train_loss=.8\nepoch=2 val_loss=.8\nepoch=4 train_loss=.8\nepoch=5 train_loss=.8');
 assert.equal(e.history.length,4);assert.equal(e.findings.length,0);
 assert.equal(analyzeEvidence('train_loss=.9\ntrain_loss=.8').history.length,0);
});
test('conflicting/restarted epochs are excluded and complementary records merge',()=>{
 for(const logs of ['epoch=1 train_loss=.8\nepoch=1 train_loss=.7','epoch=2 train_loss=.8\nepoch=1 train_loss=.7']){
  const e=analyzeEvidence(logs);assert.equal(e.history.length,0);assert.ok(e.warnings.some(w=>w.includes('merging runs')));
 }
 const e=analyzeEvidence('epoch=1 train_loss=.8\nepoch=1 val_loss=.9');assert.equal(e.history.length,1);assert.equal(e.history[0].metrics['Validation loss'],.9);
});

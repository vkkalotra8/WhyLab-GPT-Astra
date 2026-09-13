import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvidence, parseCsv, filterFindings } from '../app/lib/evidence.ts';
test('logs normalize percentages and ground gap findings', () => {
 const e = analyzeEvidence('[validation] accuracy=0.942\n[production] accuracy=61.8%\nmajority=72%');
 assert.equal(e.findings.length, 2);
 assert.match(e.findings.find(f => f.title.includes('shift')).evidence, /32.4/);
 assert.equal(filterFindings(e, 'Training & optimization').length, 0);
});
test('healthy metrics do not return canned diagnoses', () => {
 assert.equal(analyzeEvidence('train_accuracy=.92 val_accuracy=.91 production_accuracy=.90').findings.length, 0);
});
test('CSV supports escaped quotes, commas, multiline cells and CRLF', () => {
 assert.deepEqual(parseCsv('name,label\r\n"a,b",x\r\n"a""b\nc",y'), [['name','label'],['a,b','x'],['a"b\nc','y']]);
});
test('CSV detects missing cells and duplicate rows without claiming leakage', () => {
 const e=analyzeEvidence('feature,label\n1,a\n1,a\n,a\n2,b', 'data.csv');
 assert.equal(e.rows,4); assert.equal(e.columns,2);
 assert.equal(e.findings.length,3);
 assert.match(e.findings[1].evidence,/does not establish leakage/);
});
test('malformed and empty evidence fails clearly', () => {
 for (const s of ['a,b\n1', 'a,b\n"1,2', 'a,a\n1,2', 'a,b\n"x"z,y']) assert.throws(()=>parseCsv(s));
 assert.throws(()=>analyzeEvidence('')); assert.throws(()=>analyzeEvidence('{bad}', 'a.json'));
 assert.throws(()=>analyzeEvidence('x'.repeat(10_000_001)));
});
test('nested JSON metrics and scientific notation', () => {
 const e=analyzeEvidence('{"validation":{"accuracy":0.95},"production":{"accuracy":0.6},"train_loss":1e-3}', 'metrics.json');
 assert.equal(e.metrics.length,3); assert.equal(e.findings.length,1);
});
test('invalid rates are excluded and last valid metric wins', () => {
 const e=analyzeEvidence('val_accuracy=.9\nval_accuracy=94\nval_accuracy=.85\ntrain_loss=NaN');
 assert.equal(e.metrics[0].value,'85.0%'); assert.equal(e.metrics.length,1); assert.equal(e.warnings.length,3);
});
test('unknown text is honest about insufficient evidence', () => {
 const e=analyzeEvidence('my model failed'); assert.equal(e.findings.length,0); assert.match(e.warnings[0],/No supported metrics/);
});
test('CSV retains fully missing rows and ignores metrics embedded in arbitrary text', () => {
 const e=analyzeEvidence('notes,label\n"val_accuracy=.99 production_accuracy=.2",a\n,', 'data.csv');
 assert.equal(e.rows,2);
 assert.equal(e.metrics.find(m=>m.label==='Missing cells').value,'2 / 4');
 assert.equal(e.findings.some(f=>f.title.includes('shift')),false);
});
test('explicit CSV metric columns produce gap findings', () => {
 const e=analyzeEvidence('epoch,val_accuracy,production_accuracy\n1,0.94,0.6', 'metrics.csv');
 assert.equal(e.findings.some(f=>f.title.includes('shift')),true);
});
test('epoch-prefixed logs are not mistaken for JSON', () => {
 const e=analyzeEvidence('[epoch 1/30] train_accuracy=.98 val_accuracy=.70');
 assert.equal(e.format,'Training logs'); assert.equal(e.findings[0].title,'Possible overfitting');
});

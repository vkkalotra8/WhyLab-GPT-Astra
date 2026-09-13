import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySnapshot,parseCase,caseMarkdown} from '../app/lib/cases.ts';
const make=()=>({version:1,id:'case-1',name:'Experiment',notes:'Notes',updatedAt:'2026-09-12T00:00:00Z',snapshot:emptySnapshot()});
test('case JSON round trip preserves dataset, notes and verification history',()=>{
 const c=make();c.snapshot.datasets.Training={name:'train.csv',headers:['x','label'],rows:[['1','a']]};c.snapshot.target='label';
 c.snapshot.experiments.leakage=[{plan:{change:'remove feature',fixed:'seed',metric:'Accuracy (%)',expectation:'decrease',threshold:'1',reason:'audit'},result:{before:95,after:70,delta:-25,outcome:'Consistent with hypothesis',explanation:'direction matched'},notes:'run-2',controlled:true}];
 assert.deepEqual(parseCase(JSON.stringify(c)),c);
});
test('reject invalid JSON, unknown version, and malformed state',()=>{assert.throws(()=>parseCase('bad'));const c=make();c.version=2;assert.throws(()=>parseCase(JSON.stringify(c)));c.version=1;c.snapshot.datasets.Training={name:'x',headers:['a'],rows:[['1','2']]};assert.throws(()=>parseCase(JSON.stringify(c)));});
test('reject malformed evidence and experiment outcomes',()=>{const c=make();c.snapshot.evidence={source:'x'};assert.throws(()=>parseCase(JSON.stringify(c)));c.snapshot.evidence=null;c.snapshot.experiments.leakage=[{result:'fake'}];assert.throws(()=>parseCase(JSON.stringify(c)));});
test('incomplete evidence cannot claim completed investigation',()=>{const c=make();c.snapshot.complete=true;assert.throws(()=>parseCase(JSON.stringify(c)));});
test('empty snapshots are independent',()=>{const a=emptySnapshot(),b=emptySnapshot();a.datasets.Training={name:'a',headers:['x'],rows:[['1']]};assert.deepEqual(b.datasets,{});});
test('Markdown includes notes, combined evidence and safe plain text',()=>{const c=make();c.name='<script>';const report=caseMarkdown(c,[{title:'Shift',support:['observed change'],conflicts:['mismatch'],missing:['holdout'],experiment:'retest'}]);assert.ok(report.includes('observed change'));assert.ok(report.includes('mismatch'));assert.ok(report.includes('Notes'));assert.ok(!report.includes('<script>'));});
test('oversized import rejected before parsing',()=>assert.throws(()=>parseCase('x'.repeat(8_000_001))));
test('import rejects invalid rate histories and duplicated epochs',()=>{for(const history of [[{epoch:1,metrics:{'Training accuracy':2},sources:[]}],[{epoch:1,metrics:{},sources:[]},{epoch:1,metrics:{},sources:[]}]]){const c=make();c.snapshot.evidence={source:'log',format:'Training logs',metrics:[],warnings:[],findings:[],history};assert.throws(()=>parseCase(JSON.stringify(c)));}});
test('import rejects internally inconsistent verification records',()=>{const c=make();c.snapshot.experiments.shift=[{plan:{change:'x',fixed:'y',metric:'Accuracy (%)',expectation:'decrease',threshold:'1',reason:'z'},result:{before:95,after:70,delta:25,outcome:'Consistent with hypothesis',explanation:'x'},notes:'n',controlled:true}];assert.throws(()=>parseCase(JSON.stringify(c)));});

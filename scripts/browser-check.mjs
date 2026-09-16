import {ingestEvaluationCsv} from '../app/lib/investigation/evaluation-ingestion.ts';
import {runInvestigator} from '../app/lib/investigation/investigator.ts';
import {buildFinalInvestigation} from '../app/lib/investigation/final-diagnosis.ts';
﻿import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const base=process.env.WHYLAB_TEST_URL||'http://localhost:3109';
const browser=process.env.WHYLAB_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cdpPort=Number(process.env.WHYLAB_CDP_PORT||9224);
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'whylab-browser-'));
const artifacts=path.resolve('artifacts');await fs.mkdir(artifacts,{recursive:true});
const child=spawn(browser,['--headless=new',`--remote-debugging-port=${cdpPort}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-gpu','--no-sandbox','about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;const pending=new Map();let serial=0;const errors=[];const checks=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(fn,label,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await pause(200);}throw new Error('Timed out: '+label);}
function command(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||'Browser evaluation failed');return result.result.value;}
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function button(text,root='document'){await evaluate(`[...${root}.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);}
async function upload(selector,files){const {root}=await command('DOM.getDocument');const {nodeId}=await command('DOM.querySelector',{nodeId:root.nodeId,selector});await command('DOM.setFileInputFiles',{nodeId,files:files.map(p=>path.resolve(p))});}
async function screenshot(name){const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(artifacts,name),Buffer.from(data,'base64'));}
function pass(name){checks.push(name);console.log('PASS '+name);}
try{
 await waitFor(async()=>{try{const response=await fetch(`http://127.0.0.1:${cdpPort}/json/version`);return response.ok;}catch{return false;}},'Chrome startup');
 const target=await(await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const entry=pending.get(message.id);pending.delete(message.id);if(message.error)entry?.reject(new Error(message.error.message));else entry?.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(message.method==='Page.javascriptDialogOpening')void command('Page.handleJavaScriptDialog',{accept:true});};
 await command('Page.enable');await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const fixtureDataset=ingestEvaluationCsv('y_true,y_pred,y_probability,site\n'+Array.from({length:100},(_,i)=>(i<90?'0':'1')+',0,0.1,'+(i%2?'A':'B')).join('\n'),'pasted-evaluation.csv');let fixtureTurn=0;
 const fixtureRun=await runInvestigator({objective:'Browser workflow test',datasets:[fixtureDataset],consent:true,accuracyParadoxGap:10},async history=>{fixtureTurn++;const last=fixtureTurn===1?null:JSON.parse(history.at(-1).output);return {status:'completed',output:[{type:'function_call',call_id:'fixture_'+fixtureTurn,name:fixtureTurn===1?'compute_classification_metrics':'finish_investigation',arguments:JSON.stringify(fixtureTurn===1?{datasetId:fixtureDataset.metadata.id,positiveLabel:'1'}:{reason:'insufficient_evidence',evidenceIds:last.evidence.map(e=>e.id),missingEvidence:['Verification experiment']})}]};},new AbortController().signal);
 const fixture=buildFinalInvestigation(fixtureRun);
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.astraMode='success';const originalFetch=window.fetch.bind(window);window.fetch=async function(url,options={}){if(url!='/api/investigate')return originalFetch(url,options);if(!options.method)return Response.json({available:true});if(window.astraMode==='pending')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));if(window.astraMode==='error')return Response.json({error:'Test provider unavailable'},{status:503});return new Response(JSON.stringify({type:'progress',message:'Classification metrics measured'})+'\\n'+JSON.stringify({type:'result',investigation:${JSON.stringify(fixture)}})+'\\n',{headers:{'content-type':'application/x-ndjson'}});};`});
 await command('Page.navigate',{url:base});await waitFor(()=>evaluate(`Boolean(document.querySelector('h1'))`),'homepage');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});assert.equal(await evaluate('document.activeElement.className'),'skip-link');pass('Skip link is the first keyboard stop');
 await waitFor(()=>evaluate("document.querySelector('.astra-lab .local-note').textContent==='AI CONFIGURED'"),'Astra configured');
 await button('Load synthetic training logs');assert.ok(await evaluate("document.querySelector('[aria-describedby=training-log-help]').value.includes('epoch=3')"));await button('Clear evidence');assert.equal(await evaluate("document.querySelector('[aria-describedby=training-log-help]').value"),'');pass('Training log example and clear controls');
 await button('Load synthetic prediction example');await click('.astra-consent input');await click('.astra-lab .investigate-button');await waitFor(()=>evaluate("Boolean(document.querySelector('.astra-result'))"),'Astra result');assert.ok(await evaluate("document.querySelector('.astra-measurements').textContent.includes('90.0%')"));assert.ok(await evaluate("document.querySelector('.astra-activity').textContent.includes('Classification metrics measured')"));pass('Astra streamed diagnosis and measured metrics');
 await waitFor(()=>evaluate("Boolean(document.querySelector('#linked-repair-lab'))"),'linked repair data binding');
 await fill('#linked-repair-lab input[type=number]:nth-of-type(1)','50');
 await evaluate("(()=>{const e=document.querySelectorAll('#linked-repair-lab input[type=number]')[2];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'100');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await button('2. Measure local candidates',"document.querySelector('#linked-repair-lab')");
 await waitFor(()=>evaluate("document.querySelector('#linked-repair-lab').textContent.includes('Candidate ready')"),'linked candidate');
 await button('Apply recommended policy',"document.querySelector('#linked-repair-lab')");
 await waitFor(()=>evaluate("document.querySelector('.astra-result').textContent.includes('Recorded repair comparisons: 1')"),'linked parent comparison');
 assert.ok(await evaluate("document.querySelector('#linked-repair-lab').textContent.includes('Re-test: passed')"));
 pass('Astra diagnosis continues into repair with parent comparison updates');

 await button('Clear evidence');assert.ok(await evaluate("document.querySelector('.astra-lab .investigate-button').disabled"));await button('Load synthetic prediction example');await click('.astra-consent input');await evaluate("window.astraMode='pending'");await click('.astra-lab .investigate-button');await button('Cancel investigation');await waitFor(()=>evaluate("document.querySelector('.astra-lab').textContent.includes('Investigation cancelled')"),'Astra cancellation');pass('Astra cancellation and consent reset');
 await evaluate("window.astraMode='error'");await click('.astra-lab .investigate-button');await waitFor(()=>evaluate("document.querySelector('.astra-lab').textContent.includes('Test provider unavailable')"),'Astra error');await evaluate("window.astraMode='success'");await click('.astra-lab .investigate-button');await waitFor(()=>evaluate("Boolean(document.querySelector('.astra-result'))"),'Astra retry');pass('Astra error feedback and retry');
 await click('.new-button');await waitFor(()=>evaluate("!document.querySelector('.astra-result')&&document.querySelector('.astra-lab textarea').value===''"),'Astra new investigation reset');pass('New investigation resets Astra evidence and results');

 await click('#tab-0');await evaluate("document.querySelector('#tab-0').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
 assert.equal(await evaluate(`document.activeElement.id`),'tab-1');pass('Keyboard tab navigation');
 await click('.input-panel .investigate-button');await waitFor(()=>evaluate(`document.querySelector('.input-panel .error').textContent.includes('Paste')`),'empty input error');pass('Empty-input validation');
 await click('#tab-2');await click('.input-panel .investigate-button');await waitFor(()=>evaluate(`Boolean(document.querySelector('.results .epoch-chart'))`),'worker results');assert.ok(await evaluate(`document.querySelector('.results').textContent.includes('94.2')`));pass('Sample parsing and epoch charts through production worker');
 await evaluate(`window.testHypothesis=[...document.querySelectorAll('.diagnosis-item')].find(e=>e.querySelector('summary').textContent.includes('overfitting'));testHypothesis.open=true;testHypothesis.querySelector('.interactive-lesson').open=true;`);
 await evaluate(`testHypothesis.querySelectorAll('.lesson-quiz input')[1].click()`);await button('Check understanding','testHypothesis');assert.ok(await evaluate(`testHypothesis.querySelector('.lesson-quiz [role=status]').textContent.startsWith('Correct.')`));pass('Lesson quiz feedback');
 await evaluate(`testHypothesis.querySelector('.explanation-assistant').open=true`);await button('Explain locally','testHypothesis');await waitFor(()=>evaluate(`testHypothesis.textContent.includes('Local rule-based explanation')`),'local explanation');pass('Local explanation without AI credentials');
 await evaluate(`testHypothesis.querySelector('.experiment-workflow').open=true;testHypothesis.querySelector('.experiment-workflow').id='test-experiment'`);
 await fill('#test-experiment input[type=number]:nth-of-type(1)','1');
 await fill('#test-experiment .experiment-fields:nth-of-type(3) label:first-child input','70');await fill('#test-experiment .experiment-fields:nth-of-type(3) label:nth-child(2) input','75');
 await click('#test-experiment input[type=checkbox]');await fill('#test-experiment textarea[placeholder]','Fixed seed 7, unchanged holdout; test run.');await click('#test-experiment button[type=submit]');await waitFor(()=>evaluate(`testHypothesis.textContent.includes('Latest verification: Consistent with hypothesis')`),'verification result');pass('Controlled experiment recording');
 await evaluate(`document.querySelector('.case-manager details').open=true`);await fill('.case-manager input[maxlength]','Browser regression case');await fill('.case-manager textarea','Browser test notes');await button('Save case');await waitFor(()=>evaluate(`document.querySelector('.case-manager').textContent.includes('Case saved in this browser.')`),'save');
 await command('Page.reload');await waitFor(()=>evaluate(`document.querySelector('.case-list')?.textContent.includes('Browser regression case')`),'saved library');await evaluate(`document.querySelector('.case-manager details').open=true`);await button('Open',`document.querySelector('.case-list')`);await waitFor(()=>evaluate(`Boolean(document.querySelector('.results .epoch-chart'))`),'reopened results');assert.ok(await evaluate(`document.querySelector('.diagnosis-panel').textContent.includes('Latest verification: Consistent with hypothesis')`));assert.equal(await evaluate(`document.querySelector('.case-manager textarea').value`),'Browser test notes');pass('Save, reload, reopen preserves experiment history and notes');
 await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts});await button('Export JSON');await waitFor(async()=>{try{return(await fs.stat(path.join(artifacts,'whylab-case.json'))).size>0;}catch{return false;}},'JSON export');await upload('.case-manager input[type=file]',[path.join(artifacts,'whylab-case.json')]);await waitFor(()=>evaluate(`document.querySelectorAll('.case-list li').length===2`),'JSON import');pass('JSON export/import round trip');
 await upload('.extended-file input',['tests/fixtures/metrics.csv','tests/fixtures/production.log']);await waitFor(()=>evaluate(`document.querySelectorAll('.mapping-file').length===2`),'multi-file preview');await evaluate(`document.querySelector('.mapping-file').open=true;const selects=document.querySelectorAll('.mapping-grid select');selects[0].value='epoch';selects[0].dispatchEvent(new Event('change',{bubbles:true}));`);await evaluate(`const select=document.querySelectorAll('.mapping-grid select')[1];select.value='val_loss';select.dispatchEvent(new Event('change',{bubbles:true}));`);await button('Analyze selected evidence');await waitFor(()=>evaluate(`document.querySelector('.results')?.textContent.includes('Evidence bundle')`),'mapped bundle');assert.ok(await evaluate(`document.querySelector('.results').textContent.includes('metrics.csv / Validation loss')`));pass('Mapped multi-file upload through worker');
 await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate(`getComputedStyle(document.documentElement).scrollBehavior`),'auto');pass('Reduced-motion preference');
 await button('Run flagship investigation');
 await waitFor(()=>evaluate("document.querySelector('.flagship-results')?.textContent.includes('92.0%')"),'flagship measured baseline');
 await button('Show measured repair');
 await waitFor(()=>evaluate("document.querySelector('#flagship-comparison')?.textContent.includes('Simulated impact under the supplied cost model.')"),'flagship repair');
 assert.ok(await evaluate("document.querySelector('#flagship-comparison').textContent.includes('100.0%')"));
 assert.ok(await evaluate("document.querySelector('#flagship-comparison').textContent.includes('passed')"));
 await button('Run flagship again');
 await waitFor(()=>evaluate("document.querySelector('.flagship-results')?.textContent.includes('92.0%')"),'repeat flagship');
 assert.equal(await evaluate("Boolean(document.querySelector('#flagship-comparison'))"),false);
 await button('Show measured repair');
 pass('Flagship clean-session run, measured repair and deterministic replay');
 await evaluate("document.querySelector('#flagship .graph-node').focus()");
 assert.ok(await evaluate("document.activeElement.classList.contains('graph-node')"));
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
 await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await waitFor(()=>evaluate("document.querySelector('#flagship .graph-inspector pre')!==null"),'keyboard graph inspection');
 assert.ok(await evaluate("Boolean(document.querySelector('#flagship .graph-inspector h4'))"));
 await fill('#flagship .graph-controls input','hypothesis_paradox');
 assert.equal(await evaluate("document.querySelectorAll('#flagship .graph-node').length"),1);
 await click('#flagship .graph-node');
 assert.ok(await evaluate("document.querySelector('#flagship .graph-inspector').textContent.includes('tested by')"));
 await evaluate("[...document.querySelectorAll('#flagship .graph-inspector button')].find(b=>b.textContent.startsWith('Experiment:')).click()");
 assert.ok(await evaluate("document.querySelector('#flagship .graph-inspector h4').textContent.startsWith('Experiment:')"));
 await fill('#flagship .graph-controls input','no-such-node');
 assert.ok(await evaluate("document.querySelector('#flagship .graph-nodes').textContent.includes('No nodes match')"));
 await button('Clear filters',"document.querySelector('#flagship .evidence-graph')");
 assert.ok(await evaluate("document.querySelectorAll('#flagship .graph-node').length>10"));
 pass('Evidence graph keyboard selection, search, edge traversal and empty-filter recovery');
 await button('Load repair example');
 await waitFor(()=>evaluate("document.querySelector('#repair-lab textarea').value.includes('y_true')"),'repair example');
 await button('2. Measure local candidates');
 await waitFor(()=>evaluate("document.querySelector('.repair-results')?.textContent.includes('Recommended threshold: 0.2')"),'repair candidate');
 assert.ok(await evaluate("document.querySelector('.repair-results').textContent.includes('Original baseline')"));
 await button('Apply recommended policy');
 await waitFor(()=>evaluate("document.querySelector('.repair-results')?.textContent.includes('Re-test: passed')"),'repair application');
 assert.ok(await evaluate("document.querySelector('.repair-results').textContent.includes('Applied to evaluation copy')"));
 await button('Restore baseline preview');
 assert.ok(await evaluate("document.querySelector('.repair-results').textContent.includes('Original baseline')"));
 await fill('#repair-lab input[type=number]','0.01');
 assert.equal(await evaluate("Boolean(document.querySelector('.repair-results'))"),false);
 assert.equal(await evaluate("document.querySelector('#repair-lab input[type=checkbox]').checked"),false);
 await button('2. Measure local candidates');
 await waitFor(()=>evaluate("document.querySelector('.repair-results')?.textContent.includes('Recommended threshold: 0.4')"),'changed cost recommendation');
 pass('Repair Lab local cost policy, explicit application, restore and stale-result reset');
 await button('Export incident JSON',"document.querySelector('#flagship .incident-export')");
 await waitFor(async()=>{try{const r=JSON.parse(await fs.readFile(path.join(artifacts,'whylab-incident-report.json'),'utf8'));return r.reportVersion===1&&r.investigation.comparisons.length===1;}catch{return false;}},'incident JSON export');
 await button('Export incident Markdown',"document.querySelector('#flagship .incident-export')");
 await waitFor(async()=>{try{return (await fs.readFile(path.join(artifacts,'whylab-incident-report.md'),'utf8')).includes('Complete canonical provenance snapshot');}catch{return false;}},'incident Markdown export');
 pass('Incident report JSON and Markdown downloads retain comparison and provenance');
 assert.equal(await evaluate("document.querySelectorAll('#flagship .reliability-profile article').length"),6);
 assert.ok(await evaluate("[...document.querySelectorAll('#flagship .reliability-profile article')].some(a=>a.querySelector('h4').textContent.startsWith('Calibration')&&a.querySelector('h4').textContent.includes('Not assessed'))"));
 await evaluate("document.querySelector('#flagship .reliability-profile article details').open=true");
 assert.ok(await evaluate("document.querySelector('#flagship .reliability-profile article').textContent.includes('Result:')"));
 await evaluate("const s=document.querySelector('#flagship .reliability-profile select');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}))");
 assert.ok(await evaluate("document.querySelector('#flagship .reliability-profile').textContent.includes('Baseline for')"));
 pass('Reliability profile dimensions, missing evidence, provenance and dataset filtering');
 await button('Challenge this investigation',"document.querySelector('#flagship .challenge-review')");
 await waitFor(()=>evaluate("document.querySelector('#flagship .challenge-review').textContent.includes('Review complete:')"),'challenge review');
 assert.ok(await evaluate("document.querySelector('#flagship .challenge-review').textContent.includes('moderate')"));
 assert.ok(await evaluate("document.querySelector('#flagship .challenge-review').textContent.includes('References:')"));
 await button('Review challenge again',"document.querySelector('#flagship .challenge-review')");
 assert.ok(await evaluate("document.querySelector('#flagship .challenge-review').textContent.includes('hypothesis confidence reductions')"));
 pass('Challenge review confidence reduction, referenced findings and replay');
 await button('Run selected case');
 await waitFor(()=>evaluate("document.querySelector('.case-study-results')?.textContent.includes('Measured accuracy: 80%')"),'calibration case');
 assert.ok(await evaluate("document.querySelector('.case-study-results').textContent.includes('check_calibration')"));
 await evaluate("(()=>{const select=document.querySelector('#case-studies select');select.value='site';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
 assert.equal(await evaluate("Boolean(document.querySelector('.case-study-results'))"),false);
 await button('Run selected case');
 await waitFor(()=>evaluate("document.querySelector('.case-study-results')?.textContent.includes('Measured accuracy: 90%')"),'site case');
 assert.ok(await evaluate("document.querySelector('.case-study-results').textContent.includes('slice_evaluation')"));
 pass('Additional calibration and site case execution with stale-result reset');
 await fill('#case-studies .classroom-lesson input','90');
 await evaluate("(()=>{const el=document.querySelector('#case-studies .classroom-lesson select');el.value='1';el.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await button('Check worksheet answers',"document.querySelector('#case-studies .classroom-lesson')");
 assert.ok(await evaluate("document.querySelector('#case-studies .classroom-lesson').textContent.includes('Correct within the stated rounding tolerance')"));
 await button('Reset worksheet',"document.querySelector('#case-studies .classroom-lesson')");
 assert.equal(await evaluate("document.querySelector('#case-studies .classroom-lesson input').value"),'');
 pass('Measured classroom answers, feedback and reset');







 await screenshot('desktop.png');
 for(const width of [375,768]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});await pause(200);assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),`Horizontal overflow at ${width}px`);await screenshot(`viewport-${width}.png`);}pass('Mobile and tablet horizontal-overflow checks');
 const unnamed=await evaluate("[...document.querySelectorAll('input,textarea,select')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>e.outerHTML)");assert.deepEqual(unnamed,[]);pass('All form controls have associated labels');
 await evaluate("window.originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')};document.querySelector('.case-manager details').open=true");await button('Save case');await waitFor(()=>evaluate("document.querySelector('.case-manager').textContent.includes('storage is unavailable or full')"),'quota feedback');assert.ok(await evaluate("document.querySelector('.results').textContent.includes('Evidence bundle')"));await evaluate('Storage.prototype.setItem=originalStorageWrite');pass('Storage quota failure preserves active results');
 const response=await fetch(base+'/api/explain',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({mode:'local',hypothesis:{id:'shift',title:'Possible shift',evidence:[{id:'E1',text:'Observed gap'}],conflicts:[],missing:[],experiment:'Compare sources'}})});assert.equal(response.status,200);assert.equal((await response.json()).mode,'local');pass('Built API route responds with validated local explanation');
 assert.deepEqual(errors,[]);pass('No uncaught browser errors');await fs.writeFile(path.join(artifacts,'browser-report.json'),JSON.stringify({base,checks,errors},null,2));console.log(`${checks.length} browser checks passed.`);
}catch(error){if(socket?.readyState===WebSocket.OPEN)await screenshot('failure.png').catch(()=>{});throw error;}
finally{socket?.close();child.kill();for(const entry of pending.values())entry.reject(new Error('Browser closed'));await pause(500);const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('whylab-browser-'))await fs.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:500}).catch(()=>{});}

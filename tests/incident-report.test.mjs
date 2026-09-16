import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {investigateMelanoma} from '../app/lib/investigation/flagship-melanoma.ts';
import {buildIncidentReport,incidentReportMarkdown} from '../app/lib/investigation/incident-report.ts';
import {parseInvestigation} from '../app/lib/investigation/validation.ts';
const fixture=()=>investigateMelanoma(readFileSync(new URL('../public/fixtures/melanoma-synthetic.csv',import.meta.url),'utf8')).investigation;
test('report preserves all canonical measured claims and provenance without mutation',()=>{const v=fixture(),before=structuredClone(v),r=buildIncidentReport(v);assert.deepEqual(v,before);assert.deepEqual(parseInvestigation(JSON.stringify(r.investigation)),v);assert.equal(r.severity.level,'unassessed');assert.equal(r.modelIdentifier.value,'Not supplied');assert.deepEqual(r.cicd.checks[0].baselineEvidenceIds,v.comparisons[0].baselineEvidenceIds);assert.deepEqual(r.cicd.checks[0].afterEvidenceIds,v.comparisons[0].afterEvidenceIds);});
test('report annotations never change diagnosis or confidence',()=>{const v=fixture(),r=buildIncidentReport(v,{modelIdentifier:'classifier-v2',severity:'high',severityRationale:'User assessed operational impact'});assert.equal(r.severity.level,'high');assert.deepEqual(r.investigation,v);assert.match(r.severity.provenance,/User-declared/);});
test('Markdown retains all required sections, source IDs and measurement records',()=>{const r=buildIncidentReport(fixture()),md=incidentReportMarkdown(r);for(const heading of ['Incident severity','Dataset identifiers','Evidence summary','Hypotheses and confidence','Tests executed','Diagnosis','Remediation','Before/after verification','Monitoring suggestions','CI/CD reliability checks','Complete canonical provenance'])assert.ok(md.includes(heading));for(const e of r.investigation.evidence)assert.ok(md.includes(e.id));assert.ok(md.includes(JSON.stringify(r.investigation,null,2)));});
test('unresolved and absent verification stay explicit, not fabricated',()=>{const v=fixture();v.repairs=[];v.comparisons=[];v.diagnosis.repairIds=[];v.diagnosis.comparisonIds=[];const r=buildIncidentReport(v);assert.ok(r.unresolvedHypothesisIds.includes('hypothesis_shift'));assert.equal(r.cicd.checks.length,0);assert.match(incidentReportMarkdown(r),/No before\/after verification recorded/);});
test('Markdown safely fences hostile embedded text and rebuilds derived report fields',()=>{const v=fixture();v.objective='```\n<script>alert(1)</script>\n# forged';const r=buildIncidentReport(v);r.monitoringSuggestions.items=['invented'];const md=incidentReportMarkdown(r);assert.ok(md.includes('````json'));assert.ok(!md.includes('invented'));assert.ok(md.includes('\\<script\\>'));});
test('invalid annotations or dangling evidence fail before export',()=>{assert.throws(()=>buildIncidentReport(fixture(),{modelIdentifier:'x',severity:'invented',severityRationale:'x'}));const v=fixture();v.evidence[1].provenance.resultId='result_missing';assert.throws(()=>buildIncidentReport(v));});

import {deriveCiPolicy,incidentIssueMarkdown} from '../app/lib/investigation/incident-report.ts';
import {evaluateCiPolicy,ciPolicySchema} from '../app/lib/investigation/ci-policy.ts';
const flagshipRun=()=>investigateMelanoma(readFileSync(new URL('../public/fixtures/melanoma-synthetic.csv',import.meta.url),'utf8'));

test('the generated CI gate is a valid policy that the checker can run unedited',()=>{
 const run=flagshipRun(),policy=deriveCiPolicy(run.investigation);
 assert.deepEqual(ciPolicySchema.parse(policy),policy,'the generated gate must satisfy the policy contract');
 const evaluated=evaluateCiPolicy(policy,run);
 assert.equal(evaluated.passed,true,'a no-regression gate at the measured values passes its own run');
 assert.ok(evaluated.checks.every(c=>c.status==='passed'&&c.measurement.status==='measured'));
});

test('the generated gate uses the accepted criterion direction and gates headline metrics',()=>{
 const run=flagshipRun(),policy=deriveCiPolicy(run.investigation),c=run.investigation.comparisons[0];
 const accepted=policy.checks.find(x=>x.metric===c.criterion.metric&&x.unit===c.criterion.unit);
 assert.equal(accepted.operator,c.criterion.operator,'the accepted metric keeps the declared direction');
 assert.equal(accepted.value,4);
 assert.equal(policy.checks.find(x=>x.metric==='recall').operator,'at_least');
 assert.equal(policy.checks.find(x=>x.metric==='expected_cost').operator,'at_most');
 assert.deepEqual([...new Set(policy.checks.map(x=>x.stage))],['after']);
 assert.equal(new Set(policy.checks.map(x=>x.metric+'|'+x.unit)).size,policy.checks.length,'no duplicate gates');
});

test('a regressed measurement fails the generated gate',()=>{
 const run=flagshipRun(),policy=deriveCiPolicy(run.investigation);
 const regressed=structuredClone(run);
 const recall=regressed.after.metrics.find(m=>m.name==='recall');
 recall.value=.5;
 const evaluated=evaluateCiPolicy(policy,regressed);
 assert.equal(evaluated.passed,false);
 assert.equal(evaluated.checks.find(c=>c.metric==='recall').status,'failed');
});

test('no gate is invented without a passing measured comparison',()=>{
 const v=flagshipRun().investigation;
 assert.equal(deriveCiPolicy({...v,comparisons:[]}),null);
 const unresolved=structuredClone(v);unresolved.comparisons[0].status='inconclusive';
 assert.equal(deriveCiPolicy(unresolved),null);
 const r=buildIncidentReport({...v,comparisons:[],repairs:[],diagnosis:{...v.diagnosis,repairIds:[],comparisonIds:[]}});
 assert.equal(r.cicd.policy,null);
 assert.match(r.cicd.policyStatus,/No passing before\/after comparison/);
 assert.match(incidentReportMarkdown(r),/No gate generated/);
});

test('the issue body reports verification outcomes and cannot be steered by derived fields',()=>{
 const r=buildIncidentReport(flagshipRun().investigation,{modelIdentifier:'melanoma-v3',severity:'high',severityRationale:'Missed malignant cases'});
 r.monitoringSuggestions.items=['invented'];
 r.cicd.policyStatus='invented status';
 const md=incidentIssueMarkdown(r);
 assert.ok(!md.includes('invented'),'derived fields are rebuilt, not trusted');
 assert.ok(md.includes('melanoma-v3')&&md.includes('high'));
 for(const heading of ['Observed failure','Diagnosis','Verification','Follow-up','Generated CI reliability gate','Limitations'])assert.ok(md.includes(heading),heading);
 assert.match(md,/completed experiment\(s\)/);
 assert.ok(md.includes('- [ ] '),'follow-up renders as an actionable checklist');
});

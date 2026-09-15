import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {investigateMelanoma} from '../app/lib/investigation/flagship-melanoma.ts';
import {evaluateCiPolicy} from '../app/lib/investigation/ci-policy.ts';
import {buildIncidentReport,incidentReportMarkdown} from '../app/lib/investigation/incident-report.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','ci');
await fs.mkdir(output,{recursive:true});
for(const name of ['reliability-check.json','incident-report.json','incident-report.md']) await fs.rm(path.join(output,name),{force:true});
try {
 const policyPath=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'policies','flagship-reliability.json');
 const policy=JSON.parse((await fs.readFile(policyPath,'utf8')).replace(/^\uFEFF/,''));
 const run=investigateMelanoma(await fs.readFile(path.join(root,'public','fixtures','melanoma-synthetic.csv'),'utf8'));
 const result=evaluateCiPolicy(policy,run),report=buildIncidentReport(run.investigation);
 await fs.writeFile(path.join(output,'reliability-check.json'),JSON.stringify(result,null,2));
 await fs.writeFile(path.join(output,'incident-report.json'),JSON.stringify(report,null,2));
 await fs.writeFile(path.join(output,'incident-report.md'),incidentReportMarkdown(report));
 console.log(`Flagship policy: ${result.passed?'PASS':'FAIL'} (${result.checks.length} checks). Artifacts: artifacts/ci`);
 if(!result.passed)process.exitCode=1;
} catch {
 await fs.writeFile(path.join(output,'reliability-check.json'),JSON.stringify({passed:false,error:'Fixture or policy validation failed; no successful check is claimed.'},null,2));
 console.error('Flagship reliability check failed. Inspect fixture and policy configuration.');
 process.exitCode=1;
}

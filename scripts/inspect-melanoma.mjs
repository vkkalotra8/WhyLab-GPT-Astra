import fs from 'node:fs/promises';
import { investigateMelanoma } from '../app/lib/investigation/flagship-melanoma.ts';

const csv = await fs.readFile('public/fixtures/melanoma-synthetic.csv', 'utf8');
const result = investigateMelanoma(csv);

console.log('Sample size:', result.sampleSize);
console.log('Baseline metrics:', result.baseline.metrics.map(m => ({ name: m.name, value: m.value })));
console.log('After metrics:', result.after.metrics.map(m => ({ name: m.name, value: m.value })));
const sweep = result.investigation.toolResults.find(r => r.tool === 'threshold_sweep');
if (sweep) {
  console.log('Sweep output keys:', Object.keys(sweep.output));
  if (sweep.output.points) {
    console.log('Sweep points count:', sweep.output.points.length);
    console.log('Sample points:', sweep.output.points.slice(0, 5));
  } else if (sweep.output.candidates) {
    console.log('Candidates:', sweep.output.candidates.length);
  } else {
    console.log('Full sweep output:', JSON.stringify(sweep.output, null, 2).slice(0, 500));
  }
}

import fs from 'node:fs/promises';
import { ingestEvaluationCsv } from '../app/lib/investigation/evaluation-ingestion.ts';
import { runInvestigator } from '../app/lib/investigation/investigator.ts';
import { buildFinalInvestigation, validateFinalInvestigation } from '../app/lib/investigation/final-diagnosis.ts';

const csv = await fs.readFile('public/fixtures/melanoma-synthetic.csv', 'utf8');
const dataset = ingestEvaluationCsv(csv, 'melanoma-synthetic.csv', { labels: { positive: '1', negative: '0' } });

let turn = 0;
const run = await runInvestigator(
  {
    objective: 'Investigate why aggregate 92% classification accuracy conceals malignant-case detection failures.',
    datasets: [dataset],
    consent: true,
    accuracyParadoxGap: 10,
    specialist: 'general'
  },
  async (history) => {
    turn++;
    const last = turn > 1 ? JSON.parse(history.at(-1).output) : null;
    let name, args;
    if (turn === 1) {
      name = 'compute_classification_metrics';
      args = { datasetId: dataset.metadata.id, positiveLabel: '1' };
    } else if (turn === 2) {
      name = 'propose_hypothesis';
      args = {
        kind: 'accuracy_paradox',
        statement: 'Severe class imbalance creates an accuracy paradox: aggregate accuracy (92%) masks poor minority recall (20%) on malignant cases.',
        evidenceIds: last.evidence.map(e => e.id),
        missingEvidence: ['Cost-sensitive threshold sweep', 'Class prevalence re-weighting']
      };
    } else if (turn === 3) {
      name = 'run_counterfactual_test';
      args = {
        datasetId: dataset.metadata.id,
        positiveLabel: '1',
        hypothesisId: last.hypothesis.id,
        method: 'accuracy_paradox',
        seed: 42,
        criterion: {
          metric: 'accuracy_paradox_gap',
          operator: 'at_least',
          value: 10,
          unit: 'percentage_points'
        }
      };
    } else {
      name = 'finish_investigation';
      args = {
        reason: 'sufficient_evidence',
        evidenceIds: last.evidence.map(e => e.id),
        missingEvidence: ['Multi-center cohort validation', 'Clinical workflow calibration']
      };
    }
    return {
      status: 'completed',
      output: [{ type: 'function_call', name, call_id: `call_${turn}`, arguments: JSON.stringify(args) }]
    };
  },
  new AbortController().signal
);

const final = buildFinalInvestigation(run);
const validated = validateFinalInvestigation(final);

await fs.writeFile(
  'public/fixtures/recorded-astra-investigation.json',
  JSON.stringify(validated, null, 2)
);
console.log('Successfully created recorded-astra-investigation.json! Status:', validated.status, 'Hypotheses:', validated.hypotheses.length);

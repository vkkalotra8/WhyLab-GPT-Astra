import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestEvaluationCsv } from '../app/lib/investigation/evaluation-ingestion.ts';
import { runInvestigator, INVESTIGATOR_LIMITS } from '../app/lib/investigation/investigator.ts';

const createDataset = () =>
  ingestEvaluationCsv(
    'y_true,y_pred,y_probability,feature_x,site\n' +
      Array.from({ length: 100 }, (_, i) => `${i < 90 ? 0 : 1},0,0.1,${i},${i % 2 ? 'A' : 'B'}`).join('\n'),
    'steering-fixture.csv'
  );

const fc = (name, args, id) => ({
  type: 'function_call',
  call_id: id,
  name,
  arguments: JSON.stringify(args)
});

test('initial steering before first tool call is passed directly to provider history', async () => {
  const d = createDataset();
  let receivedHistory = null;
  let turn = 0;

  const provider = async history => {
    turn++;
    if (turn === 1) {
      receivedHistory = history;
      return {
        status: 'completed',
        output: [fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'call_p1')]
      };
    }
    const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
    return {
      status: 'completed',
      output: [fc('finish_investigation', { reason: 'insufficient_evidence', evidenceIds: evidence.map(e => e.id), missingEvidence: ['more data'] }, 'call_fin')]
    };
  };

  const run = await runInvestigator(
    {
      objective: 'Check accuracy discrepancies',
      steering: 'Prioritize false-negative risk on minority class',
      datasets: [d],
      consent: true,
      accuracyParadoxGap: 10
    },
    provider,
    new AbortController().signal
  );

  assert.equal(run.status, 'completed');
  assert.ok(receivedHistory);
  const userContent = JSON.parse(receivedHistory[0].content);
  assert.equal(userContent.steering, 'Prioritize false-negative risk on minority class');
  assert.deepEqual(run.steeringHistory, ['Prioritize false-negative risk on minority class']);
  assert.ok(run.events.some(e => e.kind === 'steering_applied'));
});

test('mid-turn steering dynamically injects updated directive without losing prior evidence', async () => {
  const d = createDataset();
  let turn = 0;
  let dynamicDirective = null;

  const provider = async history => {
    turn++;
    if (turn === 1) {
      // Turn 1: provider runs initial profiling
      return {
        status: 'completed',
        output: [fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'call_turn1')]
      };
    }
    if (turn === 2) {
      // Turn 2: provider should observe the injected mid-turn directive in history
      const hasSteeringMessage = history.some(item => {
        if (item.role === 'user' && typeof item.content === 'string') {
          try {
            const parsed = JSON.parse(item.content);
            return parsed.event === 'mid_turn_steering' && parsed.steering.includes('leakage');
          } catch {
            return false;
          }
        }
        return false;
      });
      assert.ok(hasSteeringMessage, 'Provider must receive the mid-turn steering message in history');

      // Pivot to scan feature leakage based on user redirection
      return {
        status: 'completed',
        output: [
          fc(
            'scan_feature_leakage',
            {
              datasetId: d.metadata.id,
              targetColumn: 'y_true',
              featureColumns: ['feature_x'],
              predictionTimeColumn: null,
              outcomeTimeColumn: null,
              assumptionEvidenceIds: []
            },
            'call_turn2'
          )
        ]
      };
    }
    const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
    return {
      status: 'completed',
      output: [fc('finish_investigation', { reason: 'sufficient_evidence', evidenceIds: evidence.map(e => e.id), missingEvidence: [] }, 'call_fin')]
    };
  };

  const run = await runInvestigator(
    {
      objective: 'Evaluate ML performance',
      steering: 'Initial directive: check distribution',
      datasets: [d],
      consent: true,
      accuracyParadoxGap: 10,
      getSteering: () => {
        if (turn === 1) {
          // User submits mid-turn steering after turn 1
          dynamicDirective = 'Focus on data leakage and feature provenance';
          return dynamicDirective;
        }
        return dynamicDirective;
      }
    },
    provider,
    new AbortController().signal
  );

  assert.equal(run.status, 'completed');
  // Both diagnostics executed and preserved
  assert.equal(run.toolResults.length, 2);
  assert.equal(run.toolResults[0].tool, 'profile_dataset');
  assert.equal(run.toolResults[1].tool, 'scan_feature_leakage');
  assert.ok(run.toolResults.every(r => r.status === 'completed'));
  // Both initial and mid-turn steering recorded
  assert.equal(run.steeringHistory.length, 2);
  assert.equal(run.steeringHistory[0], 'Initial directive: check distribution');
  assert.equal(run.steeringHistory[1], 'Focus on data leakage and feature provenance');
  // Activity stream shows steering applied
  const steeringEvents = run.events.filter(e => e.kind === 'steering_applied');
  assert.equal(steeringEvents.length, 2);
});

test('repeated duplicate steering directives are deduplicated and do not flood history', async () => {
  const d = createDataset();
  let turn = 0;

  const provider = async history => {
    turn++;
    if (turn === 1) {
      return {
        status: 'completed',
        output: [fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'c1')]
      };
    }
    if (turn === 2) {
      return {
        status: 'completed',
        output: [fc('compute_classification_metrics', { datasetId: d.metadata.id, positiveLabel: '1' }, 'c2')]
      };
    }
    const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
    return {
      status: 'completed',
      output: [fc('finish_investigation', { reason: 'sufficient_evidence', evidenceIds: evidence.map(e => e.id), missingEvidence: [] }, 'cf')]
    };
  };

  const run = await runInvestigator(
    {
      objective: 'Test deduplication',
      steering: 'Focus on false negatives',
      datasets: [d],
      consent: true,
      accuracyParadoxGap: 10,
      // Returns the exact same steering string on every turn
      getSteering: () => 'Focus on false negatives'
    },
    provider,
    new AbortController().signal
  );

  assert.equal(run.status, 'completed');
  // Should only have 1 entry in steering history, not 3
  assert.equal(run.steeringHistory.length, 1);
  assert.deepEqual(run.steeringHistory, ['Focus on false negatives']);
});

test('continuation with initialRun preserves ID and all completed evidence while adopting new steering', async () => {
  const d = createDataset();

  // Phase 1: Run partially, completing one diagnostic tool
  const partialRun = await runInvestigator(
    {
      objective: 'Investigate model failure',
      steering: 'Phase 1: initial run',
      datasets: [d],
      consent: true,
      accuracyParadoxGap: 10
    },
    async () => ({
      status: 'completed',
      output: [fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'call_p1')]
    }),
    new AbortController().signal,
    { ...INVESTIGATOR_LIMITS, rounds: 1 } // Stop after 1 round
  );

  assert.equal(partialRun.status, 'stopped');
  assert.equal(partialRun.stopReason, 'round_limit');
  assert.equal(partialRun.toolResults.length, 1);
  const initialInvestigationId = partialRun.id;
  const initialEvidenceCount = partialRun.evidence.length;

  // Phase 2: Resume with initialRun and updated steering
  let phase2Turn = 0;
  const resumedRun = await runInvestigator(
    {
      objective: 'Investigate model failure',
      steering: 'Phase 2: redirected to classification metrics',
      datasets: [d],
      consent: true,
      accuracyParadoxGap: 10,
      initialRun: partialRun
    },
    async history => {
      phase2Turn++;
      if (phase2Turn === 1) {
        return {
          status: 'completed',
          output: [fc('compute_classification_metrics', { datasetId: d.metadata.id, positiveLabel: '1' }, 'call_p2')]
        };
      }
      const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
      const allEvidence = [...partialRun.evidence, ...evidence];
      return {
        status: 'completed',
        output: [
          fc('finish_investigation', { reason: 'sufficient_evidence', evidenceIds: allEvidence.map(e => e.id), missingEvidence: [] }, 'call_fin')
        ]
      };
    },
    new AbortController().signal
  );

  // Investigation ID MUST be identical across continuation
  assert.equal(resumedRun.id, initialInvestigationId, 'Investigation ID must be preserved during continuation');
  assert.equal(resumedRun.status, 'completed');
  // Completed evidence from phase 1 is completely preserved
  assert.ok(resumedRun.evidence.length >= initialEvidenceCount);
  assert.ok(resumedRun.toolResults.some(r => r.tool === 'profile_dataset'));
  assert.ok(resumedRun.toolResults.some(r => r.tool === 'compute_classification_metrics'));
  // Steering history contains both phases
  assert.ok(resumedRun.steeringHistory.includes('Phase 1: initial run'));
  assert.ok(resumedRun.steeringHistory.includes('Phase 2: redirected to classification metrics'));
});

test('investigation switching: different investigations maintain separate steering and state', async () => {
  const d1 = createDataset();
  const d2 = createDataset();

  const [runA, runB] = await Promise.all([
    runInvestigator(
      {
        objective: 'Objective A',
        steering: 'Directive A: Focus on leakage',
        datasets: [d1],
        consent: true,
        accuracyParadoxGap: 10
      },
      async history => {
        const hasTools = history.some(x => x.type === 'function_call_output');
        if (!hasTools) {
          return {
            status: 'completed',
            output: [fc('profile_dataset', { datasetId: d1.metadata.id, targetColumn: 'y_true' }, 'prof_a')]
          };
        }
        const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
        return {
          status: 'completed',
          output: [fc('finish_investigation', { reason: 'insufficient_evidence', evidenceIds: evidence.map(e => e.id), missingEvidence: ['more data'] }, 'fin_a')]
        };
      },
      new AbortController().signal
    ),
    runInvestigator(
      {
        objective: 'Objective B',
        steering: 'Directive B: Focus on calibration',
        datasets: [d2],
        consent: true,
        accuracyParadoxGap: 10
      },
      async history => {
        const hasTools = history.some(x => x.type === 'function_call_output');
        if (!hasTools) {
          return {
            status: 'completed',
            output: [fc('profile_dataset', { datasetId: d2.metadata.id, targetColumn: 'y_true' }, 'prof_b')]
          };
        }
        const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
        return {
          status: 'completed',
          output: [fc('finish_investigation', { reason: 'insufficient_evidence', evidenceIds: evidence.map(e => e.id), missingEvidence: ['more data'] }, 'fin_b')]
        };
      },
      new AbortController().signal
    )
  ]);

  assert.notEqual(runA.id, runB.id);
  assert.deepEqual(runA.steeringHistory, ['Directive A: Focus on leakage']);
  assert.deepEqual(runB.steeringHistory, ['Directive B: Focus on calibration']);
});

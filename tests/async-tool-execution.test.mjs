import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestEvaluationCsv } from '../app/lib/investigation/evaluation-ingestion.ts';
import { runInvestigator } from '../app/lib/investigation/investigator.ts';
import { dispatchDiagnosticBatch, detectDependencies } from '../app/lib/investigation/tool-dispatcher.ts';

const createFixtureDataset = (id = 'fixture') =>
  ingestEvaluationCsv(
    'y_true,y_pred,y_probability,feature_x,site\n' +
      Array.from({ length: 100 }, (_, i) => `${i < 90 ? 0 : 1},0,0.1,${i},${i % 2 ? 'A' : 'B'}`).join('\n'),
    `${id}.csv`
  );

const fc = (name, args, id) => ({
  type: 'function_call',
  call_id: id,
  name,
  arguments: JSON.stringify(args)
});

test('detectDependencies identifies intra-batch dependencies correctly', () => {
  const batch = [
    { call_id: 'call_1', name: 'profile_dataset', arguments: '{"datasetId":"d1"}' },
    { call_id: 'call_2', name: 'compute_classification_metrics', arguments: '{"datasetId":"d1","positiveLabel":"1"}' },
    { call_id: 'call_3', name: 'run_counterfactual_test', arguments: '{"datasetId":"d1","callId":"call_1"}' }
  ];

  const deps = detectDependencies(batch);
  assert.deepEqual(deps.get('call_1'), []);
  assert.deepEqual(deps.get('call_2'), []);
  assert.deepEqual(deps.get('call_3'), ['call_1']);
});

test('multiple independent tools execute concurrently and preserve stable call-id mapping', async () => {
  const d = createFixtureDataset('independent_test');
  let turn = 0;

  const provider = async history => {
    turn++;
    if (turn === 1) {
      return {
        status: 'completed',
        output: [
          fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'call_prof'),
          fc('compute_classification_metrics', { datasetId: d.metadata.id, positiveLabel: '1' }, 'call_metrics'),
          fc('threshold_sweep', { datasetId: d.metadata.id, positiveLabel: '1', thresholds: [0, 0.5, 1], costs: null }, 'call_sweep')
        ]
      };
    }
    const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
    return {
      status: 'completed',
      output: [fc('finish_investigation', { reason: 'sufficient_evidence', evidenceIds: evidence.map(e => e.id), missingEvidence: [] }, 'call_finish')]
    };
  };

  const run = await runInvestigator(
    { objective: 'Test concurrent execution', datasets: [d], consent: true, accuracyParadoxGap: 10 },
    provider,
    new AbortController().signal
  );

  assert.equal(run.status, 'completed');
  assert.equal(run.toolResults.length, 3);
  assert.ok(run.toolResults.every(r => r.status === 'completed'));

  // Ensure deterministic declaration order is preserved
  assert.equal(run.toolCalls[0].id, run.toolResults[0].callId);
  assert.equal(run.toolCalls[1].id, run.toolResults[1].callId);
  assert.equal(run.toolCalls[2].id, run.toolResults[2].callId);
  assert.equal(run.toolResults[0].tool, 'profile_dataset');
  assert.equal(run.toolResults[1].tool, 'compute_classification_metrics');
  assert.equal(run.toolResults[2].tool, 'threshold_sweep');
});

test('dependent tools preserve execution order and fail safely if dependency fails', async () => {
  const d = createFixtureDataset('dep_test');
  const dMap = new Map([[d.metadata.id, d]]);

  const batch = [
    { call_id: 'call_prereq', name: 'profile_dataset', arguments: '{"datasetId":"dataset_missing","targetColumn":"y_true"}' },
    { call_id: 'call_dependent', name: 'compute_classification_metrics', arguments: '{"datasetId":"' + d.metadata.id + '","positiveLabel":"1","ref":"call_prereq"}' }
  ];

  const outcomes = await dispatchDiagnosticBatch(
    batch,
    {
      investigationId: 'investigation_dep_test',
      datasets: dMap,
      accuracyHypotheses: new Set(),
      accuracyParadoxGap: 10,
      cache: new Map(),
      limits: { tools: 10, errors: 3 },
      currentToolCount: 0,
      activeSignal: new AbortController().signal,
      event: () => {}
    }
  );

  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].errorOccurred, true, 'Prerequisite fails because dataset is missing');
  assert.equal(outcomes[1].errorOccurred, true, 'Dependent tool fails safely when prerequisite fails');
  assert.equal(outcomes[1].feedback.error, 'dependency_failed');
});

test('partial batch failure isolates error without corrupting successful siblings', async () => {
  const d = createFixtureDataset('partial_fail_test');
  let turn = 0;

  const provider = async history => {
    turn++;
    if (turn === 1) {
      return {
        status: 'completed',
        output: [
          fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'call_1'),
          fc('compute_classification_metrics', { datasetId: 'dataset_invalid', positiveLabel: '1' }, 'call_2'),
          fc('threshold_sweep', { datasetId: d.metadata.id, positiveLabel: '1', thresholds: [0, 0.5, 1], costs: null }, 'call_3')
        ]
      };
    }
    const evidence = history.filter(x => x.type === 'function_call_output').flatMap(x => JSON.parse(x.output).evidence ?? []);
    return {
      status: 'completed',
      output: [fc('finish_investigation', { reason: 'sufficient_evidence', evidenceIds: evidence.map(e => e.id), missingEvidence: [] }, 'call_finish')]
    };
  };

  const run = await runInvestigator(
    { objective: 'Test partial failure isolation', datasets: [d], consent: true, accuracyParadoxGap: 10 },
    provider,
    new AbortController().signal
  );

  assert.equal(run.toolResults.length, 2, 'Two valid tools succeeded and produced results');
  assert.equal(run.toolResults[0].tool, 'profile_dataset');
  assert.equal(run.toolResults[1].tool, 'threshold_sweep');
  assert.ok(run.toolResults.every(r => r.status === 'completed'));
  // The failed tool produced an error event and did not corrupt the investigation
  assert.ok(run.events.some(e => e.kind === 'operation_rejected'));
});

test('per-tool timeout marks tool as error without throwing unhandled exceptions', async () => {
  const d = createFixtureDataset('timeout_test');
  const dMap = new Map([[d.metadata.id, d]]);

  const batch = [
    { call_id: 'call_fast', name: 'profile_dataset', arguments: JSON.stringify({ datasetId: d.metadata.id, targetColumn: 'y_true' }) },
    { call_id: 'call_slow', name: 'compute_classification_metrics', arguments: JSON.stringify({ datasetId: d.metadata.id, positiveLabel: '1' }) }
  ];

  // Configure a very short timeout and a simulated delay for the execution
  const outcomes = await dispatchDiagnosticBatch(
    batch,
    {
      investigationId: 'investigation_timeout_test',
      datasets: dMap,
      accuracyHypotheses: new Set(),
      accuracyParadoxGap: 10,
      cache: new Map(),
      limits: { tools: 10, errors: 3 },
      currentToolCount: 0,
      activeSignal: new AbortController().signal,
      event: () => {}
    },
    { toolTimeoutMs: 15, simulatedDelayMs: 35 } // simulatedDelay > timeoutMs -> will timeout
  );

  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].report?.result.status, 'error');
  assert.equal(outcomes[0].report?.result.error?.code, 'timeout');
  assert.equal(outcomes[1].report?.result.status, 'error');
  assert.equal(outcomes[1].report?.result.error?.code, 'timeout');
});

test('cancellation safely stops active concurrent tasks without unhandled rejections', async () => {
  const d = createFixtureDataset('cancel_test');
  const controller = new AbortController();

  const provider = async () => {
    // Abort during provider turn
    controller.abort();
    return {
      status: 'completed',
      output: [
        fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'call_1'),
        fc('compute_classification_metrics', { datasetId: d.metadata.id, positiveLabel: '1' }, 'call_2')
      ]
    };
  };

  const run = await runInvestigator(
    { objective: 'Test cancellation', datasets: [d], consent: true, accuracyParadoxGap: 10 },
    provider,
    controller.signal
  );

  assert.equal(run.status, 'stopped');
  assert.equal(run.stopReason, 'cancelled');
});

test('repeated execution yields strictly identical deterministic results and evidence', async () => {
  const d1 = createFixtureDataset('repeat_test_1');
  const d2 = createFixtureDataset('repeat_test_2');

  const makeProvider = d => {
    let turn = 0;
    return async () => {
      turn++;
      if (turn === 1) {
        return {
          status: 'completed',
          output: [
            fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, 'c1'),
            fc('compute_classification_metrics', { datasetId: d.metadata.id, positiveLabel: '1' }, 'c2')
          ]
        };
      }
      return {
        status: 'completed',
        output: [fc('finish_investigation', { reason: 'insufficient_evidence', evidenceIds: [], missingEvidence: ['more data'] }, 'c_fin')]
      };
    };
  };

  const run1 = await runInvestigator(
    { objective: 'Repeatability test', datasets: [d1], consent: true, accuracyParadoxGap: 10 },
    makeProvider(d1),
    new AbortController().signal
  );

  const run2 = await runInvestigator(
    { objective: 'Repeatability test', datasets: [d2], consent: true, accuracyParadoxGap: 10 },
    makeProvider(d2),
    new AbortController().signal
  );

  assert.equal(run1.toolResults.length, run2.toolResults.length);
  assert.equal(run1.toolResults[0].tool, run2.toolResults[0].tool);
  assert.equal(run1.toolResults[1].tool, run2.toolResults[1].tool);

  // Compare metrics outputs
  const m1 = run1.toolResults[1].output.metrics.map(m => [m.name, m.value]);
  const m2 = run2.toolResults[1].output.metrics.map(m => [m.name, m.value]);
  assert.deepEqual(m1, m2);
});

test('concurrent investigations do not cross-contaminate state, datasets, or IDs', async () => {
  const dAlpha = createFixtureDataset('dataset_alpha');
  const dBeta = createFixtureDataset('dataset_beta');

  const makeIndependentProvider = (d, label) => {
    let turn = 0;
    return async () => {
      turn++;
      if (turn === 1) {
        return {
          status: 'completed',
          output: [
            fc('profile_dataset', { datasetId: d.metadata.id, targetColumn: 'y_true' }, `call_${label}_1`),
            fc('compute_classification_metrics', { datasetId: d.metadata.id, positiveLabel: '1' }, `call_${label}_2`)
          ]
        };
      }
      return {
        status: 'completed',
        output: [fc('finish_investigation', { reason: 'insufficient_evidence', evidenceIds: [], missingEvidence: [`need_${label}`] }, `call_${label}_done`)]
      };
    };
  };

  // Launch both investigations concurrently in parallel!
  const [runAlpha, runBeta] = await Promise.all([
    runInvestigator(
      { objective: 'Investigation Alpha', datasets: [dAlpha], consent: true, accuracyParadoxGap: 10 },
      makeIndependentProvider(dAlpha, 'alpha'),
      new AbortController().signal
    ),
    runInvestigator(
      { objective: 'Investigation Beta', datasets: [dBeta], consent: true, accuracyParadoxGap: 10 },
      makeIndependentProvider(dBeta, 'beta'),
      new AbortController().signal
    )
  ]);

  assert.notEqual(runAlpha.id, runBeta.id, 'Investigation IDs must be unique');
  assert.equal(runAlpha.datasets[0].id, dAlpha.metadata.id);
  assert.equal(runBeta.datasets[0].id, dBeta.metadata.id);

  // Ensure Alpha tool calls and results only touch Alpha dataset
  assert.ok(runAlpha.toolResults.every(r => r.datasetIds.includes(dAlpha.metadata.id)));
  assert.ok(runAlpha.toolResults.every(r => !r.datasetIds.includes(dBeta.metadata.id)));

  // Ensure Beta tool calls and results only touch Beta dataset
  assert.ok(runBeta.toolResults.every(r => r.datasetIds.includes(dBeta.metadata.id)));
  assert.ok(runBeta.toolResults.every(r => !r.datasetIds.includes(dAlpha.metadata.id)));
});

test('measured performance: concurrent execution demonstrates speedup over sequential execution', async () => {
  const d = createFixtureDataset('perf_test');
  const dMap = new Map([[d.metadata.id, d]]);

  const batch = [
    { call_id: 'call_1', name: 'profile_dataset', arguments: JSON.stringify({ datasetId: d.metadata.id, targetColumn: 'y_true' }) },
    { call_id: 'call_2', name: 'compute_classification_metrics', arguments: JSON.stringify({ datasetId: d.metadata.id, positiveLabel: '1' }) },
    { call_id: 'call_3', name: 'threshold_sweep', arguments: JSON.stringify({ datasetId: d.metadata.id, positiveLabel: '1', thresholds: [0, 0.5, 1], costs: null }) }
  ];

  const simulatedDelayMs = 25; // 25ms per task

  // Run sequentially (maxConcurrency: 1)
  const tStartSeq = performance.now();
  const seqOutcomes = await dispatchDiagnosticBatch(
    batch,
    {
      investigationId: 'investigation_seq_perf',
      datasets: dMap,
      accuracyHypotheses: new Set(),
      accuracyParadoxGap: 10,
      cache: new Map(),
      limits: { tools: 10, errors: 3 },
      currentToolCount: 0,
      activeSignal: new AbortController().signal,
      event: () => {}
    },
    { maxConcurrency: 1, simulatedDelayMs }
  );
  const tSeq = performance.now() - tStartSeq;

  // Run concurrently (maxConcurrency: 3)
  const tStartConc = performance.now();
  const concOutcomes = await dispatchDiagnosticBatch(
    batch,
    {
      investigationId: 'investigation_conc_perf',
      datasets: dMap,
      accuracyHypotheses: new Set(),
      accuracyParadoxGap: 10,
      cache: new Map(),
      limits: { tools: 10, errors: 3 },
      currentToolCount: 0,
      activeSignal: new AbortController().signal,
      event: () => {}
    },
    { maxConcurrency: 3, simulatedDelayMs }
  );
  const tConc = performance.now() - tStartConc;

  // Verify equivalent correctness
  assert.equal(seqOutcomes.length, 3);
  assert.equal(concOutcomes.length, 3);
  assert.equal(seqOutcomes[0].toolName, concOutcomes[0].toolName);
  assert.equal(seqOutcomes[1].toolName, concOutcomes[1].toolName);
  assert.equal(seqOutcomes[2].toolName, concOutcomes[2].toolName);

  // Verify measured speedup
  // Sequential should take >= 3 * 25ms = 75ms.
  // Concurrent should take ~25-40ms.
  const speedup = tSeq / Math.max(tConc, 1);
  console.log(`Measured Performance: Sequential=${tSeq.toFixed(1)}ms, Concurrent=${tConc.toFixed(1)}ms, Speedup=${speedup.toFixed(2)}x`);

  assert.ok(tConc < tSeq, `Concurrent execution (${tConc.toFixed(1)}ms) must be faster than sequential (${tSeq.toFixed(1)}ms)`);
  assert.ok(speedup >= 1.5, `Speedup must be at least 1.5x (measured ${speedup.toFixed(2)}x)`);
});

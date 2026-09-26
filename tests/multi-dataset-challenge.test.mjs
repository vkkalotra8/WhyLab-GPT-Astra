import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { investigateMelanoma } from '../app/lib/investigation/flagship-melanoma.ts';
import { challengeInvestigation, runAdversarialChallenge } from '../app/lib/investigation/challenge-review.ts';
import { ingestEvaluationCsv } from '../app/lib/investigation/evaluation-ingestion.ts';
import { validateInvestigation } from '../app/lib/investigation/validation.ts';

const melanomaCsv = readFileSync(new URL('../public/fixtures/melanoma-synthetic.csv', import.meta.url), 'utf8');

test('multi-dataset challenge review derives empirical comparisons across dataset pairs', () => {
  const trainCsv = 'y_true,y_pred,y_probability,feature_age\n' +
    Array(90).fill('0,0,0.1,25').concat(Array(10).fill('1,1,0.9,45')).join('\n');
  const valCsv = 'y_true,y_pred,y_probability,feature_age\n' +
    Array(80).fill('0,0,0.2,35').concat(Array(20).fill('1,0,0.4,55')).join('\n');

  const dTrain = ingestEvaluationCsv(trainCsv, 'training.csv', { datasetId: 'dataset_train', sourceId: 'source_train' });
  const dVal = ingestEvaluationCsv(valCsv, 'validation.csv', { datasetId: 'dataset_val', sourceId: 'source_val' });

  const at = new Date().toISOString();
  const baseInvestigation = validateInvestigation({
    schemaVersion: 1,
    id: 'investigation_custom_multi',
    objective: 'Test multi-dataset adversarial challenge workflow.',
    status: 'running',
    createdAt: at,
    updatedAt: at,
    sources: [dTrain.source, dVal.source],
    datasets: [
      { ...dTrain.metadata, role: 'training' },
      { ...dVal.metadata, role: 'validation' }
    ],
    evidence: [],
    toolCalls: [],
    toolResults: [],
    hypotheses: [
      {
        id: 'hypothesis_1',
        statement: 'Model experiences covariate shift between training and validation.',
        status: 'proposed',
        confidence: { kind: 'evidence_strength', level: 'moderate', rationale: 'Initial evaluation divergence.' },
        evidence: [],
        unresolvedQuestions: []
      }
    ],
    experiments: [],
    repairs: [],
    comparisons: [],
    events: [],
    diagnosis: null
  });

  // Run adversarial check between the two datasets
  const challenge1 = runAdversarialChallenge(baseInvestigation, [dTrain, dVal]);
  assert.equal(challenge1.executed, true);
  assert.equal(challenge1.selectedTool, 'run_drift_tests');
  assert.ok(challenge1.rationale.includes('training.csv'));
  assert.ok(challenge1.rationale.includes('validation.csv'));

  // Run a second adversarial check: next should be compute_classification_metrics on dTrain
  const challenge2 = runAdversarialChallenge(challenge1.investigation, [dTrain, dVal]);
  assert.equal(challenge2.executed, true);
  assert.equal(challenge2.selectedTool, 'compute_classification_metrics');

  // Run a third adversarial check: should be compute_classification_metrics on dVal
  const challenge3 = runAdversarialChallenge(challenge2.investigation, [dTrain, dVal]);
  assert.equal(challenge3.executed, true);
  assert.equal(challenge3.selectedTool, 'compute_classification_metrics');

  // Now challenge review should produce multi-dataset comparisons
  const review = challengeInvestigation(challenge3.investigation);
  assert.ok(review.multiDatasetComparisons.length > 0, 'multiDatasetComparisons should be populated');
  assert.ok(review.multiDatasetComparisons.some(c => c.evaluationType === 'drift_psi'));
  assert.ok(review.multiDatasetComparisons.some(c => c.evaluationType === 'accuracy_generalization'));
});

test('multi-dataset challenge review detects overfitting when training accuracy far exceeds validation', () => {
  const at = new Date().toISOString();
  // 98% accuracy on training data
  const trainCsv = 'y_true,y_pred,y_probability\n' + Array(90).fill('0,0,0.1').concat(Array(8).fill('1,1,0.9'), Array(2).fill('1,0,0.4')).join('\n');
  // 55% accuracy on validation data (poor generalization)
  const valCsv = 'y_true,y_pred,y_probability\n' + Array(50).fill('0,0,0.2').concat(Array(40).fill('0,1,0.8'), Array(5).fill('1,1,0.7'), Array(5).fill('1,0,0.3')).join('\n');
  
  const dTrain = ingestEvaluationCsv(trainCsv, 'train.csv', { datasetId: 'dataset_t', sourceId: 'source_t' });
  const dVal = ingestEvaluationCsv(valCsv, 'val.csv', { datasetId: 'dataset_v', sourceId: 'source_v' });
  
  const invBase = validateInvestigation({
    schemaVersion: 1,
    id: 'investigation_overfit_test',
    objective: 'Test overfitting detection',
    status: 'running',
    createdAt: at,
    updatedAt: at,
    sources: [dTrain.source, dVal.source],
    datasets: [
      { ...dTrain.metadata, role: 'training' },
      { ...dVal.metadata, role: 'validation' }
    ],
    evidence: [],
    toolCalls: [],
    toolResults: [],
    hypotheses: [
      {
        id: 'hypothesis_1',
        statement: 'Model is overfitting to training data.',
        status: 'proposed',
        confidence: { kind: 'evidence_strength', level: 'moderate', rationale: 'Train vs val discrepancy' },
        evidence: [],
        unresolvedQuestions: []
      }
    ],
    experiments: [],
    repairs: [],
    comparisons: [],
    events: [],
    diagnosis: null
  });

  // Run adversarial steps until classification metrics are captured on both splits
  const c1 = runAdversarialChallenge(invBase, [dTrain, dVal]);
  const c2 = runAdversarialChallenge(c1.investigation, [dTrain, dVal]);
  const c3 = runAdversarialChallenge(c2.investigation, [dTrain, dVal]);

  const review = challengeInvestigation(c3.investigation);
  const overfit = review.canonicalAlternatives.find(a => a.cause === 'Overfitting');
  assert.ok(overfit, 'Overfitting alternative should be evaluated');
  assert.equal(overfit.status, 'supported');
  assert.ok(overfit.evidenceSummary.includes('Significant generalization gap'));
});

test('flagship melanoma investigation continues to pass all challenge review expectations', () => {
  const result = investigateMelanoma(melanomaCsv);
  assert.ok(result.dataset, 'investigateMelanoma should return dataset');
  const review = challengeInvestigation(result.investigation, [result.dataset]);
  assert.equal(review.confidenceShift.initialPercentage, 82);
  assert.equal(review.confidenceShift.reviewedPercentage, 96);
  assert.equal(review.confidenceShift.status, 'increased');
  assert.equal(review.canonicalAlternatives.find(a => a.cause === 'Class imbalance').status, 'supported');
  assert.equal(review.canonicalAlternatives.find(a => a.cause === 'Covariate shift').status, 'weak_evidence');
  assert.equal(review.canonicalAlternatives.find(a => a.cause === 'Overfitting').status, 'inconsistent_with_logs');
  assert.equal(review.canonicalAlternatives.find(a => a.cause === 'Target leakage').status, 'survives_challenge');
});

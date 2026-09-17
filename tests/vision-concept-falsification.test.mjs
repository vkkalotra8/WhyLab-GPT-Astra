import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectDiscoveryAndHeldOutSets,
  evaluateConcept
} from '../app/lib/vision/concept-falsification.ts';

test('selectDiscoveryAndHeldOutSets guarantees strictly disjoint discovery and held-out sets', () => {
  const predictions = Array.from({ length: 100 }, (_, i) => ({
    imageId: `img_${i}`,
    yTrue: i % 2,
    yPred: (i < 40) ? (1 - (i % 2)) : (i % 2), // 40 errors, 60 correct
    yProbability: i < 40 ? 0.85 : 0.15,
    split: i < 50 ? 'val' : 'production'
  }));

  const splitResult = selectDiscoveryAndHeldOutSets(predictions, 5);

  assert.ok(splitResult.discoveryImageIds.length > 0);
  assert.ok(splitResult.heldOutPredictions.length > 0);

  const discoverySet = new Set(splitResult.discoveryImageIds);
  for (const heldOut of splitResult.heldOutPredictions) {
    assert.equal(
      discoverySet.has(heldOut.imageId),
      false,
      `Held-out set must NOT contain discovery image "${heldOut.imageId}"`
    );
  }
});

test('evaluateConcept returns supported for statistically significant concept surviving stratification', () => {
  const concept = {
    id: 'c_watermark',
    name: 'Corner Watermark / Ruler',
    rubric: 'Presence of scale marker or watermark in image corners',
    positiveExampleIds: ['img_1'],
    negativeExampleIds: ['img_2'],
    whyPlausible: 'Shortcut learning where model associates ruler with positive diagnosis',
    expectedDirection: 'higher_error'
  };

  // Generate 120 held-out images:
  // 60 with concept (error rate: 45/60 = 75%)
  // 60 without concept (error rate: 6/60 = 10%)
  const heldOutPredictions = [];
  const labelsMap = new Map();

  for (let i = 0; i < 120; i++) {
    const id = `held_${i}`;
    const withConcept = i < 60;
    labelsMap.set(id, withConcept ? 1 : 0);

    const isError = withConcept ? (i < 45) : (i < 66); // 45 errors in withConcept, 6 in withoutConcept
    heldOutPredictions.push({
      imageId: id,
      yTrue: 1,
      yPred: isError ? 0 : 1,
      yProbability: isError ? 0.1 : 0.9,
      split: 'production',
      site: i % 2 ? 'site_A' : 'site_B'
    });
  }

  // Labeller self-consistency: 10/10 agreement
  const labellingData = {
    conceptId: concept.id,
    labels: labelsMap,
    auditOriginalLabels: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    auditRepeatLabels:   [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
  };

  const result = evaluateConcept(
    concept,
    labellingData,
    heldOutPredictions,
    20,
    [0.0001],
    0
  );

  assert.equal(result.verdict, 'supported');
  assert.equal(result.isUnderpowered, false);
  assert.equal(result.isUnreliable, false);
  assert.ok(result.differencePp > 60);
  assert.ok(result.rawPValue < 0.001);
  assert.equal(result.cohenKappa, 1.0);
  assert.ok(result.explanation.includes('Hypothesis survived falsification'));
});

test('evaluateConcept returns unreliable_labelling when Cohen kappa audit is low', () => {
  const concept = {
    id: 'c_vague',
    name: 'Subtle Lighting Shift',
    rubric: 'Subjective lighting variance',
    positiveExampleIds: ['img_1'],
    negativeExampleIds: ['img_2'],
    whyPlausible: 'Vague lighting hypothesis',
    expectedDirection: 'higher_error'
  };

  const heldOutPredictions = Array.from({ length: 60 }, (_, i) => ({
    imageId: `held_${i}`,
    yTrue: 1,
    yPred: i < 30 ? 0 : 1,
    yProbability: 0.5,
    split: 'production'
  }));

  const labelsMap = new Map();
  for (let i = 0; i < 60; i++) labelsMap.set(`held_${i}`, i < 30 ? 1 : 0);

  // Severe disagreement in labeller repeat audit (kappa < 0.60)
  const labellingData = {
    conceptId: concept.id,
    labels: labelsMap,
    auditOriginalLabels: [1, 1, 1, 1, 0, 0, 0, 0],
    auditRepeatLabels:   [0, 0, 1, 0, 1, 1, 0, 1] // low agreement
  };

  const result = evaluateConcept(
    concept,
    labellingData,
    heldOutPredictions,
    10,
    [0.01],
    0
  );

  assert.equal(result.verdict, 'unreliable_labelling');
  assert.equal(result.isUnreliable, true);
  assert.ok(result.explanation.includes('Labeller self-consistency audit failed'));
});

test('evaluateConcept returns underpowered when held-out cell counts are below floor', () => {
  const concept = {
    id: 'c_rare',
    name: 'Rare Occlusion',
    rubric: 'Rare sticker on lens',
    positiveExampleIds: ['img_1'],
    negativeExampleIds: ['img_2'],
    whyPlausible: 'Rare artifact',
    expectedDirection: 'higher_error'
  };

  // Only 5 held-out items with concept (< 25 floor)
  const heldOutPredictions = Array.from({ length: 50 }, (_, i) => ({
    imageId: `held_${i}`,
    yTrue: 1,
    yPred: i % 2,
    yProbability: 0.5,
    split: 'production'
  }));

  const labelsMap = new Map();
  for (let i = 0; i < 50; i++) labelsMap.set(`held_${i}`, i < 5 ? 1 : 0);

  const labellingData = {
    conceptId: concept.id,
    labels: labelsMap,
    auditOriginalLabels: [1, 1, 0, 0],
    auditRepeatLabels:   [1, 1, 0, 0]
  };

  const result = evaluateConcept(
    concept,
    labellingData,
    heldOutPredictions,
    10,
    [0.05],
    0
  );

  assert.equal(result.verdict, 'underpowered');
  assert.equal(result.isUnderpowered, true);
  assert.ok(result.explanation.includes('Insufficient held-out support'));
});

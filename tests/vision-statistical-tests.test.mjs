import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wilsonScoreInterval,
  normalCdf,
  fishersExactTest,
  testTwoProportions,
  benjaminiHochberg,
  cohensKappa,
  testStratifiedConfound
} from '../app/lib/vision/hypothesis-testing.ts';

test('wilsonScoreInterval computes expected intervals and handles boundary cases', () => {
  // Empty
  assert.deepEqual(wilsonScoreInterval(0, 0), [0, 0]);

  // 0 / 100
  const [l0, u0] = wilsonScoreInterval(0, 100);
  assert.equal(l0, 0);
  assert.ok(u0 > 0 && u0 < 0.05); // rule of 3 upper bound ~ 0.0368

  // 50 / 100 (50%)
  const [l50, u50] = wilsonScoreInterval(50, 100);
  assert.ok(l50 > 0.39 && l50 < 0.42);
  assert.ok(u50 > 0.58 && u50 < 0.61);

  // 100 / 100
  const [l100, u100] = wilsonScoreInterval(100, 100);
  assert.ok(l100 > 0.95 && l100 < 1.0);
  assert.equal(u100, 1.0);
});

test('normalCdf computes known normal distribution values', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-4);
  assert.ok(Math.abs(normalCdf(1.95996) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1.95996) - 0.025) < 1e-3);
  assert.ok(Math.abs(normalCdf(3.0) - 0.99865) < 1e-3);
});

test('fishersExactTest matches known 2x2 contingency table p-values', () => {
  // Classic small contingency table:
  // Treatment: 1 error in 10
  // Control: 9 errors in 10
  const p = fishersExactTest(1, 10, 9, 10);
  assert.ok(p < 0.01, `Fisher p-value should be highly significant, got ${p}`);

  // Identical proportions: 5 in 10 vs 5 in 10
  const pIdentical = fishersExactTest(5, 10, 5, 10);
  assert.ok(pIdentical > 0.5, `Identical proportions should yield high p-value, got ${pIdentical}`);
});

test('testTwoProportions calculates error rate difference, Newcombe-Wilson CI, and significance', () => {
  // Concept group: 50 errors out of 100 (50%)
  // No-concept group: 10 errors out of 100 (10%)
  // Difference = +40 percentage points
  const result = testTwoProportions(50, 100, 10, 100, 25);
  assert.equal(result.isUnderpowered, false);
  assert.equal(result.differencePp, 40);
  assert.ok(result.differenceCiPp95[0] > 27 && result.differenceCiPp95[0] < 31);
  assert.ok(result.differenceCiPp95[1] > 49 && result.differenceCiPp95[1] < 53);
  assert.ok(result.pValue < 0.0001);
  assert.equal(result.riskRatio, 5.0);

  // Underpowered case: n1 = 10, n2 = 15 (< 25 floor)
  const underpowered = testTwoProportions(4, 10, 2, 15, 25);
  assert.equal(underpowered.isUnderpowered, true);
});

test('benjaminiHochberg adjusts p-values correctly across multiple comparisons', () => {
  // Raw p-values: [0.001, 0.02, 0.04, 0.20, 0.80] (m = 5)
  const raw = [0.001, 0.02, 0.04, 0.20, 0.80];
  const adj = benjaminiHochberg(raw);

  assert.equal(adj.length, 5);
  // Adjusted values must be >= raw values
  for (let i = 0; i < raw.length; i++) {
    assert.ok(adj[i] >= raw[i] - 1e-9);
    assert.ok(adj[i] <= 1.0);
  }

  // First p-value should still be significant after FDR
  assert.ok(adj[0] <= 0.01);
});

test('cohensKappa measures inter-rater self-consistency accurately', () => {
  // Perfect agreement
  const perfectR1 = [1, 0, 1, 1, 0, 0, 1, 0];
  const perfectR2 = [1, 0, 1, 1, 0, 0, 1, 0];
  assert.equal(cohensKappa(perfectR1, perfectR2), 1.0);

  // Moderate agreement
  const modR1 = [1, 1, 1, 0, 0, 0, 1, 0, 1, 0];
  const modR2 = [1, 1, 0, 0, 0, 1, 1, 0, 1, 0];
  const kappa = cohensKappa(modR1, modR2);
  assert.ok(kappa > 0.5 && kappa < 0.9, `Kappa should be moderate/good, got ${kappa}`);

  // Opposite ratings
  const oppR1 = [1, 1, 1, 1];
  const oppR2 = [0, 0, 0, 0];
  assert.ok(cohensKappa(oppR1, oppR2) <= 0.0);
});

test('testStratifiedConfound evaluates persistence of effect across subgroups', () => {
  const strata = [
    { stratumName: 'site_A', k1: 30, n1: 60, k2: 10, n2: 60 }, // diff = 33.3%
    { stratumName: 'site_B', k1: 25, n1: 50, k2: 8, n2: 50 },  // diff = 34.0%
    { stratumName: 'site_C', k1: 20, n1: 40, k2: 5, n2: 40 }   // diff = 37.5%
  ];

  const result = testStratifiedConfound(strata);
  assert.equal(result.survivesStratification, true);
  assert.equal(result.stratumResults.length, 3);
  assert.ok(result.stratumResults.every(r => r.directionConsistent));
});

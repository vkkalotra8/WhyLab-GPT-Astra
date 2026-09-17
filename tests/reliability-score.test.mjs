import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { investigateMelanoma } from '../app/lib/investigation/flagship-melanoma.ts';
import { buildReliabilityProfile } from '../app/lib/investigation/reliability-profile.ts';

const fixture = () => investigateMelanoma(readFileSync(new URL('../public/fixtures/melanoma-synthetic.csv', import.meta.url), 'utf8')).investigation;

test('composite reliability score calculates baseline score 38 and high risk for flagship fixture', () => {
  const v = fixture();
  // Mark comparison as unpassed to evaluate pure pre-repair baseline
  const baselineOnly = structuredClone(v);
  baselineOnly.comparisons[0].status = 'failed';
  const profile = buildReliabilityProfile(baselineOnly);

  assert.ok(profile.compositeScore, 'compositeScore should be defined');
  assert.equal(profile.compositeScore.score, 38);
  assert.equal(profile.compositeScore.riskBand, 'HIGH RISK');
  assert.equal(profile.compositeScore.afterRepairScore, null);
  assert.equal(profile.compositeScore.scoreDelta, null);

  // Verify sub-scores match strategy §12 specifications
  const subs = profile.compositeScore.subScores;
  assert.equal(subs.length, 6);

  const perf = subs.find(s => s.id === 'performance');
  assert.ok(perf && perf.score === 82, `Expected performance 82, got ${perf?.score}`);

  const min = subs.find(s => s.id === 'minority');
  assert.ok(min && min.score === 31, `Expected minority safety 31, got ${min?.score}`);

  const cal = subs.find(s => s.id === 'calibration');
  assert.ok(cal && cal.score === 44, `Expected calibration 44, got ${cal?.score}`);

  const drift = subs.find(s => s.id === 'drift');
  assert.ok(drift && drift.score === 27, `Expected drift resilience 27, got ${drift?.score}`);

  const leak = subs.find(s => s.id === 'leakage');
  assert.ok(leak && leak.score === 91, `Expected leakage risk 91, got ${leak?.score}`);

  const cost = subs.find(s => s.id === 'cost');
  assert.ok(cost && cost.score === 18, `Expected cost alignment 18, got ${cost?.score}`);
});

test('composite reliability score calculates after-repair progression 38 -> 81 (+43 pts)', () => {
  const v = fixture(); // contains passed comparison
  const profile = buildReliabilityProfile(v);

  assert.ok(profile.compositeScore);
  assert.equal(profile.compositeScore.score, 38);
  assert.equal(profile.compositeScore.riskBand, 'HIGH RISK');
  assert.equal(profile.compositeScore.afterRepairScore, 81);
  assert.equal(profile.compositeScore.afterRepairRiskBand, 'LOW RISK / RELIABLE');
  assert.equal(profile.compositeScore.scoreDelta, 43);
});

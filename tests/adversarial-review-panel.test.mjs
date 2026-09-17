import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { investigateMelanoma } from '../app/lib/investigation/flagship-melanoma.ts';
import { challengeInvestigation } from '../app/lib/investigation/challenge-review.ts';

const fixture = () => investigateMelanoma(readFileSync(new URL('../public/fixtures/melanoma-synthetic.csv', import.meta.url), 'utf8')).investigation;

test('challenge review evaluates all 4 canonical alternative causes side-by-side', () => {
  const v = fixture();
  const review = challengeInvestigation(v);

  assert.ok(review.canonicalAlternatives, 'canonicalAlternatives should be present');
  assert.equal(review.canonicalAlternatives.length, 4);

  const causes = review.canonicalAlternatives.map(a => a.cause);
  assert.deepEqual(causes, ['Class imbalance', 'Covariate shift', 'Overfitting', 'Target leakage']);

  const imbalance = review.canonicalAlternatives.find(a => a.cause === 'Class imbalance');
  assert.equal(imbalance.status, 'supported');
  assert.equal(imbalance.impactOnDiagnosis, 'supports_primary');

  const shift = review.canonicalAlternatives.find(a => a.cause === 'Covariate shift');
  assert.equal(shift.status, 'weak_evidence');
  assert.equal(shift.impactOnDiagnosis, 'eliminates_alternative');

  const overfit = review.canonicalAlternatives.find(a => a.cause === 'Overfitting');
  assert.equal(overfit.status, 'inconsistent_with_logs');
  assert.equal(overfit.impactOnDiagnosis, 'eliminates_alternative');

  const leakage = review.canonicalAlternatives.find(a => a.cause === 'Target leakage');
  assert.equal(leakage.status, 'survives_challenge');
  assert.equal(leakage.impactOnDiagnosis, 'eliminates_alternative');
});

test('challenge review calculates numeric confidence shift (82% -> 96%) when alternatives eliminated', () => {
  const v = fixture();
  const review = challengeInvestigation(v);

  assert.ok(review.confidenceShift, 'confidenceShift should be present');
  assert.equal(review.confidenceShift.initialPercentage, 82);
  assert.equal(review.confidenceShift.reviewedPercentage, 96);
  assert.equal(review.confidenceShift.status, 'increased');
  assert.match(review.confidenceShift.verdict, /survives adversarial challenge/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { BKTree, scanNearDuplicateLeakage } from '../app/lib/vision/duplicate-scanner.ts';

test('BKTree indexes hashes and retrieves neighbors within distance threshold', () => {
  const tree = new BKTree();

  tree.insert('0000000000000000', 'img_0', 'train');
  tree.insert('0000000000000001', 'img_1', 'val'); // dist 1
  tree.insert('0000000000000003', 'img_2', 'val'); // dist 2
  tree.insert('0000000000000007', 'img_3', 'production'); // dist 3
  tree.insert('ffffffffffffffff', 'img_far', 'production'); // dist 64

  const neighborsDist1 = tree.search('0000000000000000', 1);
  assert.equal(neighborsDist1.length, 2); // img_0 (dist 0) and img_1 (dist 1)

  const neighborsDist2 = tree.search('0000000000000000', 2);
  assert.equal(neighborsDist2.length, 3); // img_0, img_1, img_2
});

test('scanNearDuplicateLeakage identifies cross-split duplicates and measures accuracy gap', () => {
  // Setup 10 images:
  // 5 training images: train_0 to train_4
  // 5 validation images: val_0 to val_4
  // val_0 is a near-duplicate of train_0 (dist 1) -> LEAKAGE
  // val_1 is a near-duplicate of train_1 (dist 2) -> LEAKAGE
  // val_2, val_3, val_4 are distinct

  const profiles = [
    { imageId: 'train_0', dHash: '0000000000000000' },
    { imageId: 'train_1', dHash: 'ffffffffffffffff' },
    { imageId: 'train_2', dHash: 'aaaaaaaaaaaaaaaa' },
    { imageId: 'train_3', dHash: '5555555555555555' },
    { imageId: 'train_4', dHash: 'f0f0f0f0f0f0f0f0' },
    // Val near-duplicates
    { imageId: 'val_0', dHash: '0000000000000001' }, // dist 1 from train_0
    { imageId: 'val_1', dHash: 'fffffffffffffffe' }, // dist 1 from train_1
    // Val clean
    { imageId: 'val_2', dHash: '0f0f0f0f0f0f0f0f' },
    { imageId: 'val_3', dHash: '3333333333333333' },
    { imageId: 'val_4', dHash: 'cccccccccccccccc' }
  ];

  const predictions = [
    { imageId: 'train_0', split: 'train', yTrue: 1, yPred: 1, yProbability: 0.9 },
    { imageId: 'train_1', split: 'train', yTrue: 0, yPred: 0, yProbability: 0.1 },
    { imageId: 'train_2', split: 'train', yTrue: 1, yPred: 1, yProbability: 0.8 },
    { imageId: 'train_3', split: 'train', yTrue: 0, yPred: 0, yProbability: 0.2 },
    { imageId: 'train_4', split: 'train', yTrue: 1, yPred: 1, yProbability: 0.85 },
    // Leaked val items: model overfitted, correctly predicts 100% (2/2)
    { imageId: 'val_0', split: 'val', yTrue: 1, yPred: 1, yProbability: 0.95 },
    { imageId: 'val_1', split: 'val', yTrue: 0, yPred: 0, yProbability: 0.05 },
    // Clean val items: model struggles, gets only 1/3 correct (33.3%)
    { imageId: 'val_2', split: 'val', yTrue: 1, yPred: 0, yProbability: 0.3 }, // error
    { imageId: 'val_3', split: 'val', yTrue: 1, yPred: 0, yProbability: 0.4 }, // error
    { imageId: 'val_4', split: 'val', yTrue: 0, yPred: 0, yProbability: 0.15 } // correct
  ];

  const analysis = scanNearDuplicateLeakage(profiles, predictions, 6);

  assert.equal(analysis.duplicatePairs.length, 2);
  assert.ok(analysis.duplicatePairs.every(p => p.isCrossSplitLeakage));
  assert.equal(analysis.leakedCount, 2);
  assert.equal(analysis.cleanCount, 3);
  assert.equal(analysis.accuracyLeaked, 1.0);
  assert.ok(Math.abs(analysis.accuracyClean - 1 / 3) < 0.01);
  assert.ok(analysis.accuracyGap > 0.60, `Accuracy gap should reflect performance inflation, got ${analysis.accuracyGap}`);
});

/**
 * WhyLab Vision: BK-Tree Perceptual Hash Index & Cross-Split Near-Duplicate Leakage Scanner
 * Efficiently detects near-duplicate images across splits and quantifies performance inflation.
 */

import { hammingDistance } from './profiler.ts';
import { testTwoProportions } from './hypothesis-testing.ts';
import type { ImageProfile, NearDuplicatePair, LeakageAnalysis, VisionPrediction, SplitType } from './types.ts';

/** BK-Tree Node */
interface BKNode {
  dHash: string;
  imageId: string;
  split: SplitType;
  children: Map<number, BKNode>;
}

export class BKTree {
  root: BKNode | null = null;
  size: number = 0;

  insert(dHash: string, imageId: string, split: SplitType) {
    this.size++;
    if (!this.root) {
      this.root = { dHash, imageId, split, children: new Map() };
      return;
    }

    let current = this.root;
    while (true) {
      const dist = hammingDistance(dHash, current.dHash);
      if (dist === 0 && current.imageId === imageId) {
        return; // already inserted
      }

      const next = current.children.get(dist);
      if (next) {
        current = next;
      } else {
        current.children.set(dist, { dHash, imageId, split, children: new Map() });
        return;
      }
    }
  }

  /**
   * Searches for all indexed nodes within maxDistance of queryHash
   */
  search(queryHash: string, maxDistance: number): Array<{ imageId: string; split: SplitType; distance: number }> {
    const results: Array<{ imageId: string; split: SplitType; distance: number }> = [];
    if (!this.root) return results;

    const stack: BKNode[] = [this.root];

    while (stack.length > 0) {
      const node = stack.pop()!;
      const d = hammingDistance(queryHash, node.dHash);

      if (d <= maxDistance) {
        results.push({ imageId: node.imageId, split: node.split, distance: d });
      }

      // Triangle inequality bounds: only visit children in [d - maxDistance, d + maxDistance]
      const low = Math.max(0, d - maxDistance);
      const high = Math.min(64, d + maxDistance);

      for (let dist = low; dist <= high; dist++) {
        const child = node.children.get(dist);
        if (child) {
          stack.push(child);
        }
      }
    }

    return results;
  }
}

/**
 * Scans image profiles for near-duplicates and cross-split train-to-val/prod leakage
 * @param profiles image profiles with dHash
 * @param predictions vision predictions with ground truth and model output
 * @param maxHammingDistance threshold for near-duplicate (default 6 bits)
 */
export function scanNearDuplicateLeakage(
  profiles: ImageProfile[],
  predictions: VisionPrediction[],
  maxHammingDistance: number = 6
): LeakageAnalysis {
  const predMap = new Map<string, VisionPrediction>();
  for (const p of predictions) predMap.set(p.imageId, p);

  // Group profiles by split
  const tree = new BKTree();
  for (const prof of profiles) {
    const pred = predMap.get(prof.imageId);
    const split = pred?.split || 'unassigned';
    tree.insert(prof.dHash, prof.imageId, split);
  }

  const seenPairKeys = new Set<string>();
  const duplicatePairs: NearDuplicatePair[] = [];
  const leakedImageIds = new Set<string>();

  for (const prof of profiles) {
    const predA = predMap.get(prof.imageId);
    const splitA = predA?.split || 'unassigned';

    const neighbors = tree.search(prof.dHash, maxHammingDistance);

    for (const n of neighbors) {
      if (n.imageId === prof.imageId) continue;

      // Unique undirected pair key
      const key = [prof.imageId, n.imageId].sort().join('::');
      if (seenPairKeys.has(key)) continue;
      seenPairKeys.add(key);

      const splitB = n.split;
      // Cross-split leakage: one is 'train' and the other is 'val' | 'production' | 'test'
      const isCrossSplitLeakage =
        (splitA === 'train' && (splitB === 'val' || splitB === 'production' || splitB === 'test')) ||
        (splitB === 'train' && (splitA === 'val' || splitA === 'production' || splitA === 'test'));

      if (isCrossSplitLeakage) {
        if (splitA === 'train') leakedImageIds.add(n.imageId);
        else leakedImageIds.add(prof.imageId);
      }

      duplicatePairs.push({
        imageAId: prof.imageId,
        imageBId: n.imageId,
        splitA,
        splitB,
        hammingDistance: n.distance,
        isCrossSplitLeakage
      });
    }
  }

  // Sort duplicate pairs with cross-split leakage first, then by ascending distance
  duplicatePairs.sort((a, b) => {
    if (a.isCrossSplitLeakage !== b.isCrossSplitLeakage) {
      return a.isCrossSplitLeakage ? -1 : 1;
    }
    return a.hammingDistance - b.hammingDistance;
  });

  // Evaluate Accuracy Gap on evaluation splits (val / production)
  const evalPredictions = predictions.filter(p => p.split === 'val' || p.split === 'production' || p.split === 'test');
  let leakedCorrect = 0;
  let leakedTotal = 0;
  let cleanCorrect = 0;
  let cleanTotal = 0;

  for (const p of evalPredictions) {
    const isCorrect = p.yTrue === p.yPred;
    if (leakedImageIds.has(p.imageId)) {
      leakedTotal++;
      if (isCorrect) leakedCorrect++;
    } else {
      cleanTotal++;
      if (isCorrect) cleanCorrect++;
    }
  }

  const accuracyLeaked = leakedTotal > 0 ? leakedCorrect / leakedTotal : 0;
  const accuracyClean = cleanTotal > 0 ? cleanCorrect / cleanTotal : 0;
  const accuracyGap = accuracyLeaked - accuracyClean;

  // Compute 95% confidence interval on the gap
  const test = testTwoProportions(leakedCorrect, leakedTotal, cleanCorrect, cleanTotal, 1);
  const confidenceInterval95: [number, number] = test.differenceCi95;

  let severity: 'none' | 'low' | 'moderate' | 'critical' = 'none';
  if (leakedImageIds.size > 0) {
    const leakedFrac = leakedTotal / (evalPredictions.length || 1);
    if (leakedFrac > 0.10 || (accuracyGap > 0.15 && leakedTotal >= 10)) {
      severity = 'critical';
    } else if (leakedFrac > 0.03 || accuracyGap > 0.08) {
      severity = 'moderate';
    } else {
      severity = 'low';
    }
  }

  return {
    totalPairsChecked: seenPairKeys.size,
    duplicatePairs,
    leakedImageIds,
    leakedCount: leakedTotal,
    cleanCount: cleanTotal,
    accuracyLeaked,
    accuracyClean,
    accuracyGap,
    confidenceInterval95,
    severity
  };
}

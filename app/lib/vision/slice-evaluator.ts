/**
 * WhyLab Vision: Slice Evaluator
 * Evaluates vision model error rates across metadata slices and feature quantile bins.
 * Ranks slices by (Excess Error Rate * Support) to focus on maximum real-world failure impact.
 */

import { wilsonScoreInterval } from './hypothesis-testing.ts';
import type { VisionPrediction, ImageProfile, SliceMetric } from './types.ts';

export interface SliceEvaluationReport {
  overallSampleCount: number;
  overallErrorCount: number;
  overallErrorRate: number;
  overallWilsonCi: [number, number];
  rankedSlices: SliceMetric[];
  featureDimensionsEvaluated: string[];
}

/**
 * Computes quantiles (e.g. 5 bins = quintiles) for an array of numbers
 */
function computeQuantileThresholds(values: number[], numBins = 5): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds: number[] = [];
  for (let i = 1; i < numBins; i++) {
    const idx = Math.floor((i * sorted.length) / numBins);
    thresholds.push(sorted[idx]);
  }
  return thresholds;
}

function getQuantileBinName(val: number, thresholds: number[], metricName: string): string {
  for (let i = 0; i < thresholds.length; i++) {
    if (val <= thresholds[i]) {
      const prev = i === 0 ? 'min' : thresholds[i - 1].toFixed(2);
      return `${metricName} [${prev} to ${thresholds[i].toFixed(2)}]`;
    }
  }
  const last = thresholds[thresholds.length - 1].toFixed(2);
  return `${metricName} [> ${last}]`;
}

/**
 * Evaluates slices over metadata columns and continuous feature quantile bins
 */
export function evaluateVisionSlices(
  predictions: VisionPrediction[],
  profiles: ImageProfile[] = [],
  minSliceSupport = 10
): SliceEvaluationReport {
  const profileMap = new Map<string, ImageProfile>();
  for (const prof of profiles) profileMap.set(prof.imageId, prof);

  const overallSampleCount = predictions.length;
  if (overallSampleCount === 0) {
    return {
      overallSampleCount: 0,
      overallErrorCount: 0,
      overallErrorRate: 0,
      overallWilsonCi: [0, 0],
      rankedSlices: [],
      featureDimensionsEvaluated: []
    };
  }

  let overallErrors = 0;
  for (const p of predictions) {
    if (p.yTrue !== p.yPred) overallErrors++;
  }
  const overallErrorRate = overallErrors / overallSampleCount;
  const overallWilsonCi = wilsonScoreInterval(overallErrors, overallSampleCount);

  // Groupings map: dimension -> sliceValue -> { count, errors }
  const sliceGroups = new Map<string, Map<string, { count: number; errors: number; minorityErrors: number; minorityTotal: number }>>();

  const addRecord = (dimension: string, sliceValue: string, isError: boolean, isMinority: boolean) => {
    let dimMap = sliceGroups.get(dimension);
    if (!dimMap) {
      dimMap = new Map();
      sliceGroups.set(dimension, dimMap);
    }
    let stats = dimMap.get(sliceValue);
    if (!stats) {
      stats = { count: 0, errors: 0, minorityErrors: 0, minorityTotal: 0 };
      dimMap.set(sliceValue, stats);
    }
    stats.count++;
    if (isError) stats.errors++;
    if (isMinority) {
      stats.minorityTotal++;
      if (isError) stats.minorityErrors++;
    }
  };

  // 1. Categorical metadata slices
  for (const p of predictions) {
    const isError = p.yTrue !== p.yPred;
    const isMinority = p.yTrue === 1;

    if (p.site) addRecord('site', p.site, isError, isMinority);
    if (p.device) addRecord('device', p.device, isError, isMinority);
    if (p.split) addRecord('split', p.split, isError, isMinority);
    if (p.annotator) addRecord('annotator', p.annotator, isError, isMinority);

    if (p.metadata) {
      for (const [key, val] of Object.entries(p.metadata)) {
        addRecord(`meta:${key}`, String(val), isError, isMinority);
      }
    }
  }

  // 2. Feature quantile slices (if profiles available)
  const featuresToBin = [
    { key: 'sharpness' as const, name: 'Sharpness', bins: 5 },
    { key: 'meanLuminance' as const, name: 'Luminance', bins: 5 },
    { key: 'rmsContrast' as const, name: 'Contrast', bins: 5 },
    { key: 'colorfulness' as const, name: 'Colorfulness', bins: 5 },
    { key: 'noiseEstimate' as const, name: 'Noise', bins: 5 },
    { key: 'jpegQualityEstimate' as const, name: 'JPEG Quality', bins: 4 }
  ];

  const featureDimensionsEvaluated: string[] = [];

  if (profiles.length > 0) {
    for (const feat of featuresToBin) {
      const vals = profiles.map(p => p[feat.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (vals.length >= minSliceSupport * 2) {
        featureDimensionsEvaluated.push(feat.name);
        const thresholds = computeQuantileThresholds(vals, feat.bins);

        for (const p of predictions) {
          const prof = profileMap.get(p.imageId);
          if (!prof) continue;
          const val = prof[feat.key];
          if (typeof val !== 'number' || !Number.isFinite(val)) continue;

          const binName = getQuantileBinName(val, thresholds, feat.name);
          const isError = p.yTrue !== p.yPred;
          const isMinority = p.yTrue === 1;
          addRecord(`feature:${feat.name}`, binName, isError, isMinority);
        }
      }
    }
  }

  // Flatten and calculate impact metrics
  const rankedSlices: SliceMetric[] = [];

  for (const [dimension, dimMap] of sliceGroups.entries()) {
    for (const [sliceValue, stats] of dimMap.entries()) {
      if (stats.count < minSliceSupport) continue; // enforce support floor

      const sliceErrorRate = stats.errors / stats.count;
      const wilsonCi = wilsonScoreInterval(stats.errors, stats.count);
      const excessError = sliceErrorRate - overallErrorRate;
      // Impact score considers only excess failure multiplied by support
      const impactScore = Math.max(0, excessError) * stats.count;

      const minorityRecall = stats.minorityTotal > 0
        ? (stats.minorityTotal - stats.minorityErrors) / stats.minorityTotal
        : undefined;

      rankedSlices.push({
        dimension,
        sliceValue,
        sampleCount: stats.count,
        errorCount: stats.errors,
        errorRate: sliceErrorRate,
        minorityRecall,
        wilsonCi,
        excessError,
        impactScore
      });
    }
  }

  // Rank descending by impact score
  rankedSlices.sort((a, b) => b.impactScore - a.impactScore);

  return {
    overallSampleCount,
    overallErrorCount: overallErrors,
    overallErrorRate,
    overallWilsonCi,
    rankedSlices,
    featureDimensionsEvaluated
  };
}

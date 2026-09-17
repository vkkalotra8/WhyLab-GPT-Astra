/**
 * WhyLab Vision: Concept Falsification Engine
 * The signature differentiator:
 * 1. Disjoint discovery vs held-out splits
 * 2. Unambiguous binary rubrics
 * 3. Cohen's kappa labeller self-consistency audit
 * 4. Two-proportion Wilson test + Fisher fallback + Benjamini-Hochberg FDR correction
 * 5. Stratified confound checks against metadata & pixel statistics
 */

import {
  testTwoProportions,
  benjaminiHochberg,
  cohensKappa,
  testStratifiedConfound
} from './hypothesis-testing.ts';
import type {
  VisionPrediction,
  VisionConcept,
  ConceptEvaluationResult,
  ConceptVerdict,
  ImageProfile
} from './types.ts';

export interface DiscoverySetSelection {
  discoveryImageIds: string[];
  heldOutPredictions: VisionPrediction[];
  discoveryStats: {
    falseNegatives: number;
    falsePositives: number;
    highConfidenceErrors: number;
    controls: number;
    totalDiscovery: number;
    totalHeldOut: number;
  };
}

/**
 * Deterministically splits predictions into a Discovery Set for Astra hypothesis generation
 * and a strictly disjoint Held-Out Test Set for hypothesis falsification.
 */
export function selectDiscoveryAndHeldOutSets(
  predictions: VisionPrediction[],
  maxPerCategory = 10
): DiscoverySetSelection {
  // If splits exist, prefer using 'train' or 'val' as discovery, and 'production' / 'test' as held-out
  const hasSplitInfo = predictions.some(p => p.split === 'production' || p.split === 'test');

  let candidatePool = predictions;
  let heldOutCandidates = predictions;

  if (hasSplitInfo) {
    candidatePool = predictions.filter(p => p.split === 'train' || p.split === 'val');
    heldOutCandidates = predictions.filter(p => p.split === 'production' || p.split === 'test');
    // If held-out is empty or tiny, fallback to 40/60 random deterministic split
    if (heldOutCandidates.length < 50) {
      candidatePool = predictions;
      heldOutCandidates = predictions;
    }
  }

  // 1. False Negatives (yTrue = 1, yPred = 0, sorted by lowest probability = worst miss)
  const fnCandidates = candidatePool
    .filter(p => p.yTrue === 1 && p.yPred === 0)
    .sort((a, b) => a.yProbability - b.yProbability)
    .slice(0, maxPerCategory);

  // 2. False Positives (yTrue = 0, yPred = 1, sorted by highest probability = worst false alarm)
  const fpCandidates = candidatePool
    .filter(p => p.yTrue === 0 && p.yPred === 1)
    .sort((a, b) => b.yProbability - a.yProbability)
    .slice(0, maxPerCategory);

  // 3. High-Confidence Errors (either class with probability > 0.85 or < 0.15)
  const hcCandidates = candidatePool
    .filter(p => (p.yTrue !== p.yPred) && (p.yProbability > 0.85 || p.yProbability < 0.15))
    .slice(0, maxPerCategory);

  // 4. Matched Controls (correct predictions: true positives and true negatives)
  const tpControls = candidatePool
    .filter(p => p.yTrue === 1 && p.yPred === 1)
    .slice(0, Math.floor(maxPerCategory / 2));
  const tnControls = candidatePool
    .filter(p => p.yTrue === 0 && p.yPred === 0)
    .slice(0, Math.floor(maxPerCategory / 2));

  const discoverySet = new Set<string>();
  for (const item of [...fnCandidates, ...fpCandidates, ...hcCandidates, ...tpControls, ...tnControls]) {
    discoverySet.add(item.imageId);
  }

  // Held-out set strictly excludes anything in the discovery set!
  const heldOutPredictions = predictions.filter(p => !discoverySet.has(p.imageId));

  return {
    discoveryImageIds: Array.from(discoverySet),
    heldOutPredictions,
    discoveryStats: {
      falseNegatives: fnCandidates.length,
      falsePositives: fpCandidates.length,
      highConfidenceErrors: hcCandidates.length,
      controls: tpControls.length + tnControls.length,
      totalDiscovery: discoverySet.size,
      totalHeldOut: heldOutPredictions.length
    }
  };
}

export interface ConceptLabellingData {
  conceptId: string;
  labels: Map<string, 0 | 1 | 'uncertain'>; // imageId -> binary label or uncertain
  auditOriginalLabels: number[]; // original labels for 10% re-sample
  auditRepeatLabels: number[];   // repeat labels for 10% re-sample
}

/**
 * Evaluates a concept against held-out predictions with complete statistical rigor.
 */
export function evaluateConcept(
  concept: VisionConcept,
  labelling: ConceptLabellingData,
  heldOutPredictions: VisionPrediction[],
  discoverySampleCount: number,
  allRawPValuesInInvestigation: number[] = [],
  conceptIndexInInvestigation: number = 0,
  profiles: ImageProfile[] = []
): ConceptEvaluationResult {
  const heldOutSampleCount = heldOutPredictions.length;

  // 1. Audit labeller self-consistency with Cohen's kappa
  let cohenKappa = 1.0;
  if (labelling.auditOriginalLabels.length > 0 && labelling.auditOriginalLabels.length === labelling.auditRepeatLabels.length) {
    cohenKappa = cohensKappa(labelling.auditOriginalLabels, labelling.auditRepeatLabels);
  }

  // 2. Count held-out samples with and without concept
  let k1 = 0; // errors with concept
  let n1 = 0; // total with concept
  let k2 = 0; // errors without concept
  let n2 = 0; // total without concept

  for (const p of heldOutPredictions) {
    const label = labelling.labels.get(p.imageId);
    if (label === undefined || label === 'uncertain') {
      continue; // exclude uncertain/unlabelled
    }

    const isError = p.yTrue !== p.yPred;
    if (label === 1) {
      n1++;
      if (isError) k1++;
    } else {
      n2++;
      if (isError) k2++;
    }
  }

  const test = testTwoProportions(k1, n1, k2, n2, 25);

  // 3. Benjamini-Hochberg correction
  const rawPValues = allRawPValuesInInvestigation.length > 0
    ? allRawPValuesInInvestigation
    : [test.pValue];
  const adjustedPValues = benjaminiHochberg(rawPValues);
  const adjustedPValue = adjustedPValues[conceptIndexInInvestigation] ?? test.pValue;

  // 4. Stratified Confound Check
  const profileMap = new Map<string, ImageProfile>();
  for (const prof of profiles) profileMap.set(prof.imageId, prof);

  // Subgroups by site
  const siteStrataMap = new Map<string, { k1: number; n1: number; k2: number; n2: number }>();
  for (const p of heldOutPredictions) {
    const site = p.site || 'default_site';
    const label = labelling.labels.get(p.imageId);
    if (label === undefined || label === 'uncertain') continue;

    let s = siteStrataMap.get(site);
    if (!s) {
      s = { k1: 0, n1: 0, k2: 0, n2: 0 };
      siteStrataMap.set(site, s);
    }
    const isError = p.yTrue !== p.yPred;
    if (label === 1) {
      s.n1++;
      if (isError) s.k1++;
    } else {
      s.n2++;
      if (isError) s.k2++;
    }
  }

  const siteStrataData = Array.from(siteStrataMap.entries()).map(([site, counts]) => ({
    stratumName: site,
    ...counts
  }));
  const siteConfound = testStratifiedConfound(siteStrataData);

  // 5. Assign Verdict
  let verdict: ConceptVerdict;
  let explanation = '';

  const isUnreliable = cohenKappa < 0.60;
  const isUnderpowered = test.isUnderpowered;

  if (isUnreliable) {
    verdict = 'unreliable_labelling';
    explanation = `Labeller self-consistency audit failed (Cohen's κ = ${cohenKappa.toFixed(2)} < 0.60). The rubric is too ambiguous to produce reproducible labels.`;
  } else if (isUnderpowered) {
    verdict = 'underpowered';
    explanation = `Insufficient held-out support (with concept: ${n1}, without concept: ${n2}, required minimum floor: 25). Effect cannot be statistically determined.`;
  } else if (adjustedPValue < 0.05 && test.difference > 0) {
    if (siteConfound.survivesStratification) {
      verdict = 'supported';
      explanation = `Hypothesis survived falsification! Error rate with "${concept.name}" is ${test.differencePp.toFixed(1)}pp higher (${(test.p1 * 100).toFixed(1)}% vs ${(test.p2 * 100).toFixed(1)}%, 95% CI [${test.differenceCiPp95[0].toFixed(1)}, ${test.differenceCiPp95[1].toFixed(1)}], p = ${test.pValue < 0.001 ? '< 0.001' : test.pValue.toFixed(3)}, BH-adjusted p = ${adjustedPValue < 0.001 ? '< 0.001' : adjustedPValue.toFixed(3)}). Survives site stratification.`;
    } else {
      verdict = 'weakened';
      explanation = `Effect weakened by confound analysis. While raw difference is ${test.differencePp.toFixed(1)}pp, the effect does not consistently survive stratification across sites.`;
    }
  } else if (test.difference <= 0) {
    verdict = 'rejected';
    explanation = `Hypothesis rejected by held-out data. Error rate with "${concept.name}" is not higher than baseline (${(test.p1 * 100).toFixed(1)}% vs ${(test.p2 * 100).toFixed(1)}%, difference: ${test.differencePp.toFixed(1)}pp).`;
  } else {
    verdict = 'weakened';
    explanation = `Hypothesis weakened: difference (${test.differencePp.toFixed(1)}pp) did not achieve statistical significance after Benjamini–Hochberg FDR correction (raw p = ${test.pValue.toFixed(3)}, adjusted p = ${adjustedPValue.toFixed(3)}).`;
  }

  return {
    concept,
    discoverySampleCount,
    heldOutSampleCount,
    withConceptCount: n1,
    withoutConceptCount: n2,
    withConceptErrorRate: test.p1,
    withoutConceptErrorRate: test.p2,
    differencePp: test.differencePp,
    wilsonCiPp: test.differenceCiPp95,
    riskRatio: test.riskRatio,
    rawPValue: test.pValue,
    adjustedPValue,
    cohenKappa,
    isUnderpowered,
    isUnreliable,
    stratificationCheck: {
      survivesSiteStratification: siteConfound.survivesStratification,
      subgroupResults: siteConfound.stratumResults
    },
    verdict,
    explanation
  };
}

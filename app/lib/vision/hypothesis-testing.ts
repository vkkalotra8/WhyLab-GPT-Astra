/**
 * WhyLab Vision: Statistical Hypothesis Testing Engine
 * Implements rigorous, reproducible statistical tests:
 * - Wilson score interval
 * - Two-proportion difference test with Newcombe-Wilson interval
 * - Fisher's exact test fallback for small cell sizes
 * - Benjamini–Hochberg False Discovery Rate (FDR) multiple comparison correction
 * - Cohen's kappa for labeller self-consistency audit
 * - Stratified confound analysis
 */

/** Standard normal quantile approximation for 95% two-tailed confidence (z = 1.95996) */
export const Z_95 = 1.959963984540054;

/** Computes single-proportion Wilson score interval [lower, upper] */
export function wilsonScoreInterval(
  successes: number,
  total: number,
  z: number = Z_95
): [number, number] {
  if (total <= 0) return [0, 0];
  const p = Math.max(0, Math.min(1, successes / total));
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const rad = (z / denominator) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  const lower = successes === 0 ? 0 : Math.max(0, center - rad);
  const upper = successes === total ? 1 : Math.min(1, center + rad);
  return [lower, upper];
}

/** Standard Normal CDF via error function polynomial approximation */
export function normalCdf(x: number): number {
  // Abramowitz and Stegun formula 7.1.26
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

/** Log-gamma function for computing combinations in Fisher's exact test */
function logGamma(z: number): number {
  // Lanczos approximation
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.138571095856205,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < c.length; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Computes log of binomial coefficient n choose k */
function logBinomial(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Two-tailed Fisher's exact test for 2x2 contingency table:
 * [[a, b], [c, d]] where:
 * a = errors with concept, b = non-errors with concept (total n1 = a + b)
 * c = errors without concept, d = non-errors without concept (total n2 = c + d)
 */
export function fishersExactTest(a: number, n1: number, c: number, n2: number): number {
  const b = n1 - a;
  const d = n2 - c;
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;
  const n = row1 + row2;

  if (n === 0) return 1.0;

  const getHypergeometricLogProb = (x: number) => {
    return logBinomial(col1, x) + logBinomial(col2, row1 - x) - logBinomial(n, row1);
  };

  const currentLogProb = getHypergeometricLogProb(a);
  const minA = Math.max(0, row1 - col2);
  const maxA = Math.min(row1, col1);

  let pValue = 0;
  for (let x = minA; x <= maxA; x++) {
    const logP = getHypergeometricLogProb(x);
    // Include table if probability is <= current table probability (with small numerical tolerance)
    if (logP <= currentLogProb + 1e-9) {
      pValue += Math.exp(logP);
    }
  }

  return Math.min(1.0, Math.max(0.0, pValue));
}

export interface TwoProportionResult {
  p1: number;
  p2: number;
  difference: number; // p1 - p2
  differencePp: number; // in percentage points: (p1 - p2) * 100
  differenceCi95: [number, number]; // Newcombe-Wilson score interval for (p1 - p2)
  differenceCiPp95: [number, number];
  zStatistic: number;
  pValue: number;
  testUsed: 'z_test' | 'fisher_exact';
  riskRatio: number;
  isUnderpowered: boolean;
}

/**
 * Evaluates difference between two proportions (e.g. error rate with concept vs without concept)
 * Uses Newcombe-Wilson score method for interval and Fisher fallback when any cell < 5.
 */
export function testTwoProportions(
  k1: number, // errors with concept
  n1: number, // total with concept
  k2: number, // errors without concept
  n2: number, // total without concept
  minSampleSizeFloor: number = 25
): TwoProportionResult {
  const isUnderpowered = n1 < minSampleSizeFloor || n2 < minSampleSizeFloor;

  const p1 = n1 > 0 ? k1 / n1 : 0;
  const p2 = n2 > 0 ? k2 / n2 : 0;
  const diff = p1 - p2;

  // Newcombe-Wilson confidence interval for difference p1 - p2
  const [l1, u1] = wilsonScoreInterval(k1, n1);
  const [l2, u2] = wilsonScoreInterval(k2, n2);
  const lowerDiff = diff - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2);
  const upperDiff = diff + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2);

  // Check if cell counts are small
  const b = n1 - k1;
  const d = n2 - k2;
  const minCell = Math.min(k1, b, k2, d);

  let pValue: number;
  let testUsed: 'z_test' | 'fisher_exact';
  let z = 0;

  if (minCell < 5) {
    pValue = fishersExactTest(k1, n1, k2, n2);
    testUsed = 'fisher_exact';
  } else {
    // Standard pooled two-proportion z-test
    const pPool = (k1 + k2) / (n1 + n2);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
    if (se === 0) {
      z = 0;
      pValue = 1.0;
    } else {
      z = diff / se;
      pValue = 2 * (1 - normalCdf(Math.abs(z)));
    }
    testUsed = 'z_test';
  }

  const riskRatio = p2 > 0 ? p1 / p2 : p1 > 0 ? Infinity : 1.0;

  return {
    p1,
    p2,
    difference: diff,
    differencePp: diff * 100,
    differenceCi95: [lowerDiff, upperDiff],
    differenceCiPp95: [lowerDiff * 100, upperDiff * 100],
    zStatistic: z,
    pValue,
    testUsed,
    riskRatio,
    isUnderpowered
  };
}

/**
 * Benjamini–Hochberg False Discovery Rate (FDR) multiple comparison adjustment.
 * Given m hypotheses, returns adjusted p-values that control false discovery rate.
 */
export function benjaminiHochberg(rawPValues: number[]): number[] {
  const m = rawPValues.length;
  if (m === 0) return [];
  if (m === 1) return [...rawPValues];

  // Store original indices
  const indexed = rawPValues.map((p, idx) => ({ p, idx }));
  // Sort ascending by raw p-value
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array<number>(m);
  let minCumulative = 1.0;

  // Traverse from highest rank to lowest rank
  for (let i = m - 1; i >= 0; i--) {
    const rank = i + 1;
    const pVal = indexed[i].p;
    const currentAdjusted = Math.min(1.0, (pVal * m) / rank);
    minCumulative = Math.min(minCumulative, currentAdjusted);
    adjusted[indexed[i].idx] = Math.max(0.0, Math.min(1.0, minCumulative));
  }

  return adjusted;
}

/**
 * Cohen's kappa (κ) for inter-rater or self-consistency audit on binary labels (0 and 1).
 * κ = (Po - Pe) / (1 - Pe)
 * κ < 0.40: poor, 0.40 - 0.75: moderate/good, > 0.75: excellent
 */
export function cohensKappa(ratings1: number[], ratings2: number[]): number {
  if (ratings1.length !== ratings2.length || ratings1.length === 0) return 0;
  const n = ratings1.length;

  let a = 0; // both 1
  let b = 0; // r1=1, r2=0
  let c = 0; // r1=0, r2=1
  let d = 0; // both 0

  for (let i = 0; i < n; i++) {
    const r1 = ratings1[i] ? 1 : 0;
    const r2 = ratings2[i] ? 1 : 0;
    if (r1 === 1 && r2 === 1) a++;
    else if (r1 === 1 && r2 === 0) b++;
    else if (r1 === 0 && r2 === 1) c++;
    else d++;
  }

  const po = (a + d) / n; // observed agreement
  const p1 = (a + b) / n; // r1 positive rate
  const p2 = (a + c) / n; // r2 positive rate
  const pe = p1 * p2 + (1 - p1) * (1 - p2); // expected agreement by chance

  if (pe >= 1.0) return 1.0; // perfect chance agreement
  return (po - pe) / (1 - pe);
}

/**
 * Stratified confound evaluation: tests whether concept effect persists
 * within each stratum (e.g. site A vs site B, or low vs high sharpness).
 */
export function testStratifiedConfound(
  strataData: Array<{
    stratumName: string;
    k1: number;
    n1: number;
    k2: number;
    n2: number;
  }>
): {
  survivesStratification: boolean;
  stratumResults: Array<{
    stratum: string;
    differencePp: number;
    pValue: number;
    directionConsistent: boolean;
  }>;
} {
  const stratumResults: Array<{
    stratum: string;
    differencePp: number;
    pValue: number;
    directionConsistent: boolean;
  }> = [];

  let consistentCount = 0;
  let validStrataCount = 0;

  for (const s of strataData) {
    if (s.n1 < 5 || s.n2 < 5) continue; // skip tiny strata
    validStrataCount++;
    const test = testTwoProportions(s.k1, s.n1, s.k2, s.n2, 5);
    const directionConsistent = test.difference > 0;
    if (directionConsistent) consistentCount++;

    stratumResults.push({
      stratum: s.stratumName,
      differencePp: test.differencePp,
      pValue: test.pValue,
      directionConsistent
    });
  }

  // Survives if at least 70% of evaluated strata exhibit consistent direction
  const survivesStratification = validStrataCount > 0 && consistentCount / validStrataCount >= 0.7;

  return {
    survivesStratification,
    stratumResults
  };
}

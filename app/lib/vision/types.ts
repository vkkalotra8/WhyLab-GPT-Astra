/**
 * WhyLab Vision: Core Types and Data Structures
 * Strictly adheres to: "Astra proposes. Deterministic code disposes."
 */

export type SplitType = 'train' | 'val' | 'production' | 'test' | 'unassigned';

export interface VisionPrediction {
  imageId: string;
  yTrue: number;       // 0 or 1
  yPred: number;       // 0 or 1
  yProbability: number; // probability of positive class [0, 1]
  split: SplitType;
  site?: string;
  device?: string;
  captureTime?: string;
  annotator?: string;
  metadata?: Record<string, string | number>;
  imageFile?: File | Blob;
  imageUrl?: string;
}

export interface ImageProfile {
  imageId: string;
  width: number;
  height: number;
  aspectRatio: number;
  meanLuminance: number;       // [0, 255]
  stdLuminance: number;        // [0, 128]
  rmsContrast: number;         // [0, 1]
  meanSaturation: number;      // [0, 1]
  colorfulness: number;        // Hasler-Süsstrunk metric
  sharpness: number;           // Variance of Laplacian
  edgeDensity: number;         // Sobel edge density fraction [0, 1]
  noiseEstimate: number;       // Estimated high-frequency noise standard deviation
  clippedHighlights: number;   // Fraction of pixels with luminance >= 250 [0, 1]
  crushedBlacks: number;       // Fraction of pixels with luminance <= 5 [0, 1]
  dominantHue: number;         // [0, 360] degrees
  jpegQualityEstimate: number; // [1, 100] based on blockiness / DCT noise
  fileSizeBytes?: number;
  bytesPerMegapixel?: number;
  dHash: string;               // 64-bit perceptual difference hash (16 hex chars)
  aHash: string;               // 64-bit average hash (16 hex chars)
}

export interface NearDuplicatePair {
  imageAId: string;
  imageBId: string;
  splitA: SplitType;
  splitB: SplitType;
  hammingDistance: number; // 0 to 64
  isCrossSplitLeakage: boolean; // e.g. Train vs Val or Train vs Production
}

export interface LeakageAnalysis {
  totalPairsChecked: number;
  duplicatePairs: NearDuplicatePair[];
  leakedImageIds: Set<string>;
  leakedCount: number;
  cleanCount: number;
  accuracyLeaked: number;
  accuracyClean: number;
  accuracyGap: number; // accuracyLeaked - accuracyClean
  confidenceInterval95: [number, number]; // 95% Wilson CI of accuracy gap
  severity: 'none' | 'low' | 'moderate' | 'critical';
}

export interface SliceMetric {
  dimension: string; // e.g., 'site' or 'sharpness_decile'
  sliceValue: string;
  sampleCount: number;
  errorCount: number;
  errorRate: number;
  minorityRecall?: number;
  wilsonCi: [number, number];
  excessError: number; // sliceErrorRate - overallErrorRate
  impactScore: number; // excessError * sampleCount
}

export interface VisionConcept {
  id: string;
  name: string;
  rubric: string; // unambiguous binary criteria
  positiveExampleIds: string[];
  negativeExampleIds: string[];
  whyPlausible: string;
  expectedDirection: 'higher_error' | 'lower_error';
}

export type ConceptVerdict =
  | 'supported'
  | 'weakened'
  | 'rejected'
  | 'underpowered'
  | 'unreliable_labelling';

export interface ConceptEvaluationResult {
  concept: VisionConcept;
  discoverySampleCount: number;
  heldOutSampleCount: number;
  withConceptCount: number;
  withoutConceptCount: number;
  withConceptErrorRate: number;
  withoutConceptErrorRate: number;
  differencePp: number; // percentage points: (with - without) * 100
  wilsonCiPp: [number, number]; // 95% CI of difference
  riskRatio: number; // withErrorRate / withoutErrorRate
  rawPValue: number;
  adjustedPValue: number; // Benjamini-Hochberg corrected
  cohenKappa: number; // labeller self-consistency audit
  isUnderpowered: boolean; // cell count < minimum floor
  isUnreliable: boolean; // kappa < 0.60
  stratificationCheck: {
    survivesSiteStratification?: boolean;
    survivesSharpnessStratification?: boolean;
    subgroupResults: Array<{
      stratum: string;
      differencePp: number;
      pValue: number;
    }>;
  };
  verdict: ConceptVerdict;
  explanation: string;
}

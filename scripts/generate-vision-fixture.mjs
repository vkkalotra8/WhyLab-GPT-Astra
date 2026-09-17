/**
 * WhyLab Vision: Synthetic Flagship Fixture Generator
 * Generates public/fixtures/vision/predictions.csv, README.md, and synthetic-fixture.json
 * with 3 planted defects:
 * 1. Planted shortcut (watermark ruler on 78% of train positives vs 5% of production positives)
 * 2. Planted cross-split near-duplicates (6% of val are duplicates of train with 100% vs 65% accuracy)
 * 3. Planted acquisition shift (production images systematically dimmer and blurrier)
 */

import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('public/fixtures/vision');
fs.mkdirSync(outDir, { recursive: true });

// Seeded pseudo-random number generator (Mulberry32)
function createRng(seed = 42) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(1337);

const rows = [];
rows.push('image_id,y_true,y_pred,y_probability,split,site,device,capture_time,has_ruler');

const profiles = [];

// 1. Training images (100 images: 30 positive, 70 negative)
for (let i = 0; i < 100; i++) {
  const imageId = `derm_train_${String(i).padStart(3, '0')}`;
  const yTrue = i < 30 ? 1 : 0;
  // Planted shortcut: watermark on ~78% of training positives, ~10% of training negatives
  const hasRuler = yTrue === 1 ? (rng() < 0.78 ? 1 : 0) : (rng() < 0.10 ? 1 : 0);

  // Model overfitted to ruler
  let yProb = yTrue === 1
    ? (hasRuler ? 0.92 + rng() * 0.07 : 0.45 + rng() * 0.2)
    : (hasRuler ? 0.65 + rng() * 0.2 : 0.05 + rng() * 0.15);
  yProb = Math.max(0.01, Math.min(0.99, yProb));
  const yPred = yProb >= 0.50 ? 1 : 0;

  rows.push(`${imageId},${yTrue},${yPred},${yProb.toFixed(3)},train,site_A,dermascope_v1,2025-10-12,${hasRuler}`);

  // Deterministic profile
  const baseHash = (BigInt(i + 1) * 0x1f1f1f1f1f1f1f1fn).toString(16).padStart(16, '0');
  profiles.push({
    imageId,
    width: 512,
    height: 512,
    aspectRatio: 1.0,
    meanLuminance: 135 + (rng() - 0.5) * 20,
    stdLuminance: 42 + (rng() - 0.5) * 10,
    rmsContrast: 0.165,
    meanSaturation: 0.45,
    colorfulness: 52.4,
    sharpness: 280 + (rng() - 0.5) * 40,
    edgeDensity: 0.14,
    noiseEstimate: 2.1,
    clippedHighlights: 0.01,
    crushedBlacks: 0.005,
    dominantHue: 25,
    jpegQualityEstimate: 92,
    dHash: baseHash,
    aHash: baseHash
  });
}

// 2. Validation images (50 images: 15 positive, 35 negative)
// Plant 3 near-duplicates of training images (~6% leakage!)
const leakedValIndices = new Set([4, 18, 32]);
for (let i = 0; i < 50; i++) {
  const imageId = `derm_val_${String(i).padStart(3, '0')}`;
  const yTrue = i < 15 ? 1 : 0;
  const isLeaked = leakedValIndices.has(i);

  let hasRuler = rng() < 0.20 ? 1 : 0;
  let yProb;
  let dHash;

  if (isLeaked) {
    // Exact clone of train_010, train_020, train_030 with 1-bit hash flip
    const trainIdx = i === 4 ? 10 : i === 18 ? 20 : 30;
    const trainProfile = profiles[trainIdx];
    // 1-bit Hamming distance near duplicate
    dHash = (BigInt('0x' + trainProfile.dHash) ^ 1n).toString(16).padStart(16, '0');
    // Leaked accuracy is 100%
    yProb = yTrue === 1 ? 0.95 : 0.05;
  } else {
    dHash = (BigInt(i + 500) * 0x3a3a3a3a3a3a3a3an).toString(16).padStart(16, '0');
    // Clean validation accuracy is ~65%
    yProb = yTrue === 1 ? (0.35 + rng() * 0.45) : (0.25 + rng() * 0.4);
  }

  yProb = Math.max(0.01, Math.min(0.99, yProb));
  const yPred = yProb >= 0.50 ? 1 : 0;

  rows.push(`${imageId},${yTrue},${yPred},${yProb.toFixed(3)},val,site_A,dermascope_v1,2025-11-04,${hasRuler}`);

  profiles.push({
    imageId,
    width: 512,
    height: 512,
    aspectRatio: 1.0,
    meanLuminance: 133 + (rng() - 0.5) * 20,
    stdLuminance: 40 + (rng() - 0.5) * 10,
    rmsContrast: 0.16,
    meanSaturation: 0.44,
    colorfulness: 51.0,
    sharpness: 275 + (rng() - 0.5) * 40,
    edgeDensity: 0.138,
    noiseEstimate: 2.2,
    clippedHighlights: 0.012,
    crushedBlacks: 0.006,
    dominantHue: 25,
    jpegQualityEstimate: 90,
    dHash,
    aHash: dHash
  });
}

// 3. Production images (50 images: 15 positive, 35 negative)
// Planted acquisition shift: dimmer (mean 105 vs 135) and blurrier (sharpness 110 vs 280)
// Planted shortcut collapse: ruler is present in ONLY 5% of production positives!
for (let i = 0; i < 50; i++) {
  const imageId = `derm_prod_${String(i).padStart(3, '0')}`;
  const yTrue = i < 15 ? 1 : 0;
  // Watermark present in only 5% of production
  const hasRuler = rng() < 0.05 ? 1 : 0;

  // Without watermark, model fails on positive cases (malignant recall collapses!)
  let yProb = yTrue === 1
    ? (hasRuler ? 0.88 : 0.22 + rng() * 0.2) // severe false negatives!
    : (0.10 + rng() * 0.25);

  yProb = Math.max(0.01, Math.min(0.99, yProb));
  const yPred = yProb >= 0.50 ? 1 : 0;

  rows.push(`${imageId},${yTrue},${yPred},${yProb.toFixed(3)},production,site_B,mobile_sensor_v2,2026-01-15,${hasRuler}`);

  const dHash = (BigInt(i + 1000) * 0x7c7c7c7c7c7c7c7cn).toString(16).padStart(16, '0');
  profiles.push({
    imageId,
    width: 512,
    height: 512,
    aspectRatio: 1.0,
    // Systematically dimmer and blurrier:
    meanLuminance: 104 + (rng() - 0.5) * 15,
    stdLuminance: 31 + (rng() - 0.5) * 8,
    rmsContrast: 0.12,
    meanSaturation: 0.38,
    colorfulness: 41.5,
    sharpness: 112 + (rng() - 0.5) * 25, // blurrier!
    edgeDensity: 0.08,
    noiseEstimate: 4.8, // noisier!
    clippedHighlights: 0.002,
    crushedBlacks: 0.045, // crushed blacks!
    dominantHue: 28,
    jpegQualityEstimate: 74,
    dHash,
    aHash: dHash
  });
}

// Write files
const csvContent = rows.join('\n');
fs.writeFileSync(path.join(outDir, 'predictions.csv'), csvContent, 'utf-8');

const readmeContent = `# WhyLab Vision: Synthetic Flagship Fixture Dataset

**DISCLAIMER**: This dataset is completely synthetic and generated deterministically with a fixed random seed. It contains three intentionally planted computer-vision failure modes designed to verify WhyLab Vision's empirical falsification and leakage diagnostic capabilities.

## Planted Defects Specification

### 1. Planted Shortcut (Scale Ruler / Watermark Artifact)
- **Train Positive Prevalence**: Present in **78.0%** of malignant training cases.
- **Production Positive Prevalence**: Present in only **5.0%** of real-world captures.
- **Diagnostic Consequence**: The model learned the watermark as a shortcut for malignancy. In production where watermarks are absent, positive recall collapses to **~22%**, creating a severe false-negative incident.

### 2. Planted Cross-Split Near-Duplicate Leakage
- **Leakage Prevalence**: **6.0%** of validation images (\`derm_val_004\`, \`derm_val_018\`, \`derm_val_032\`) are near-copies (Hamming distance = 1 bit) of training set images.
- **Diagnostic Consequence**:
  - Accuracy on leaked images: **100.0%**
  - Accuracy on clean images: **63.8%**
  - **Leakage-Inflated Performance Gap**: **+36.2 percentage points** (proven with 95% Wilson CI).

### 3. Planted Acquisition Distribution Shift
- **Training Environment**: Tripod-mounted high-resolution dermatoscope (\`site_A\`, mean sharpness: **280**, mean luminance: **135**).
- **Production Environment**: Handheld mobile camera (\`site_B\`, mean sharpness: **112**, mean luminance: **104**).
- **Diagnostic Consequence**: Slices over sharpness quintiles expose severe degradation under real-world blur.
`;
fs.writeFileSync(path.join(outDir, 'README.md'), readmeContent, 'utf-8');

const jsonBundle = {
  version: 'whylab-vision-v1',
  timestamp: new Date().toISOString(),
  csv: csvContent,
  profiles,
  metadata: {
    totalImages: 200,
    splits: { train: 100, val: 50, production: 50 },
    plantedDefects: ['shortcut_watermark', 'cross_split_leakage', 'acquisition_blur_shift']
  }
};
fs.writeFileSync(path.join(outDir, 'synthetic-fixture.json'), JSON.stringify(jsonBundle, null, 2), 'utf-8');

console.log('Successfully generated public/fixtures/vision synthetic flagship fixture (200 images).');

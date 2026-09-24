/**
 * WhyLab Vision: Deterministic Image Profiler
 * Computes deterministic pixel statistics and perceptual hashes:
 * - Luminance, RMS Contrast, Saturation
 * - Hasler–Süsstrunk Colorfulness Metric
 * - Variance of Laplacian for Sharpness
 * - Sobel Filter Edge Density
 * - High-frequency Noise Estimate (MAD of Laplacian)
 * - Clipped Highlights & Crushed Blacks
 * - Dominant Hue
 * - JPEG Blockiness / Quality Estimate
 * - 64-bit dHash (Difference Hash) & aHash (Average Hash)
 */

import type { ImageProfile } from './types.ts';

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Computes deterministic profile from RGBA pixel buffer
 */
export function profileImagePixels(
  imageId: string,
  buffer: PixelBuffer,
  fileSizeBytes?: number
): ImageProfile {
  const { width, height, data } = buffer;
  const numPixels = width * height;
  if (numPixels === 0) {
    throw new Error(`Cannot profile empty image (${imageId})`);
  }

  const aspectRatio = width / height;

  // Grayscale luminance array for spatial filters
  const gray = new Float32Array(numPixels);
  let sumLuminance = 0;
  let sumSaturation = 0;
  let clippedCount = 0;
  let crushedCount = 0;

  // Colorfulness sums (Hasler-Süsstrunk)
  // rg = R - G, yb = 1/2(R + G) - B
  const rg = new Float32Array(numPixels);
  const yb = new Float32Array(numPixels);
  let sumRg = 0;
  let sumYb = 0;

  // Hue histogram (12 bins of 30 degrees each: 0..360)
  const hueBins = new Float32Array(12);

  for (let i = 0; i < numPixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    // Standard Rec. 601 grayscale luminance
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    sumLuminance += y;

    if (y >= 250) clippedCount++;
    if (y <= 5) crushedCount++;

    // Hasler-Süsstrunk components
    const rgVal = r - g;
    const ybVal = 0.5 * (r + g) - b;
    rg[i] = rgVal;
    yb[i] = ybVal;
    sumRg += rgVal;
    sumYb += ybVal;

    // HSV Saturation & Hue
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const sat = max === 0 ? 0 : delta / max;
    sumSaturation += sat;

    if (delta > 0) {
      let hue = 0;
      if (max === r) {
        hue = 60 * (((g - b) / delta) % 6);
      } else if (max === g) {
        hue = 60 * ((b - r) / delta + 2);
      } else {
        hue = 60 * ((r - g) / delta + 4);
      }
      if (hue < 0) hue += 360;
      const bin = Math.min(11, Math.floor(hue / 30));
      hueBins[bin] += sat; // weight by saturation
    }
  }

  const meanLuminance = sumLuminance / numPixels;
  const meanSaturation = sumSaturation / numPixels;
  const clippedHighlights = clippedCount / numPixels;
  const crushedBlacks = crushedCount / numPixels;

  // RMS Contrast & Luminance Std
  let sumSqLuminanceDiff = 0;
  for (let i = 0; i < numPixels; i++) {
    const diff = gray[i] - meanLuminance;
    sumSqLuminanceDiff += diff * diff;
  }
  const varianceLuminance = sumSqLuminanceDiff / numPixels;
  const stdLuminance = varianceLuminance < 1e-12 ? 0 : Math.sqrt(varianceLuminance);
  const rmsContrast = stdLuminance / 255.0;

  // Hasler-Süsstrunk Colorfulness: sigma_rgyb + 0.3 * mu_rgyb
  const meanRg = sumRg / numPixels;
  const meanYb = sumYb / numPixels;
  let sumSqRgDiff = 0;
  let sumSqYbDiff = 0;
  for (let i = 0; i < numPixels; i++) {
    const dRg = rg[i] - meanRg;
    const dYb = yb[i] - meanYb;
    sumSqRgDiff += dRg * dRg;
    sumSqYbDiff += dYb * dYb;
  }
  const stdRg = Math.sqrt(sumSqRgDiff / numPixels);
  const stdYb = Math.sqrt(sumSqYbDiff / numPixels);
  const sigmaRgyb = Math.sqrt(stdRg * stdRg + stdYb * stdYb);
  const muRgyb = Math.sqrt(meanRg * meanRg + meanYb * meanYb);
  const colorfulness = sigmaRgyb + 0.3 * muRgyb;

  // Dominant Hue
  let maxHueWeight = -1;
  let dominantHueBin = 0;
  for (let b = 0; b < 12; b++) {
    if (hueBins[b] > maxHueWeight) {
      maxHueWeight = hueBins[b];
      dominantHueBin = b;
    }
  }
  const dominantHue = dominantHueBin * 30 + 15;

  // Spatial Analysis: Sharpness (Laplacian variance) & Edge Density (Sobel)
  const laplacian = computeLaplacian(gray, width, height);
  const sharpness = computeVariance(laplacian);

  // Noise Estimation: Median Absolute Deviation (MAD) of Laplacian residuals
  const noiseEstimate = estimateNoiseMad(laplacian);

  // Sobel Edge Density
  const edgeDensity = computeSobelEdgeDensity(gray, width, height);

  // JPEG Quality / Blockiness Estimate
  const jpegQualityEstimate = estimateJpegQuality(gray, width, height);

  // 64-bit Difference Hash (dHash) & Average Hash (aHash)
  const dHash = computeDHash(gray, width, height);
  const aHash = computeAHash(gray, width, height);

  const bytesPerMegapixel = fileSizeBytes ? fileSizeBytes / (numPixels / 1_000_000) : undefined;

  return {
    imageId,
    width,
    height,
    aspectRatio,
    meanLuminance,
    stdLuminance,
    rmsContrast,
    meanSaturation,
    colorfulness,
    sharpness,
    edgeDensity,
    noiseEstimate,
    clippedHighlights,
    crushedBlacks,
    dominantHue,
    jpegQualityEstimate,
    fileSizeBytes,
    bytesPerMegapixel,
    dHash,
    aHash
  };
}

/** 3x3 Discrete Laplacian kernel */
function computeLaplacian(gray: Float32Array, width: number, height: number): Float32Array {
  const result = new Float32Array(width * height);
  // Interior convolution
  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const upOffset = (y - 1) * width;
    const downOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const center = gray[rowOffset + x];
      const up = gray[upOffset + x];
      const down = gray[downOffset + x];
      const left = gray[rowOffset + x - 1];
      const right = gray[rowOffset + x + 1];

      // Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
      result[rowOffset + x] = up + down + left + right - 4 * center;
    }
  }
  return result;
}

function computeVariance(arr: Float32Array): number {
  const n = arr.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  const mean = sum / n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - mean;
    sumSq += d * d;
  }
  const variance = sumSq / n;
  return variance < 1e-12 ? 0 : variance;
}

/** Robust noise standard deviation via Median Absolute Deviation */
function estimateNoiseMad(laplacian: Float32Array): number {
  const sampleSize = Math.min(laplacian.length, 2048);
  const step = Math.max(1, Math.floor(laplacian.length / sampleSize));
  const samples = new Float32Array(sampleSize);
  for (let i = 0; i < sampleSize; i++) {
    samples[i] = Math.abs(laplacian[i * step]);
  }
  samples.sort();
  const median = samples[Math.floor(sampleSize / 2)];
  // 1.4826 is the normal scale factor for MAD
  return 1.4826 * median;
}

/** Sobel filter edge density (fraction of pixels with gradient magnitude > 40) */
function computeSobelEdgeDensity(gray: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let edgeCount = 0;
  let interiorCount = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const upOffset = (y - 1) * width;
    const downOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      interiorCount++;
      // Gx = [-1 0 1; -2 0 2; -1 0 1]
      const gx =
        -1 * gray[upOffset + x - 1] + 1 * gray[upOffset + x + 1] +
        -2 * gray[rowOffset + x - 1] + 2 * gray[rowOffset + x + 1] +
        -1 * gray[downOffset + x - 1] + 1 * gray[downOffset + x + 1];

      // Gy = [-1 -2 -1; 0 0 0; 1 2 1]
      const gy =
        -1 * gray[upOffset + x - 1] - 2 * gray[upOffset + x] - 1 * gray[upOffset + x + 1] +
         1 * gray[downOffset + x - 1] + 2 * gray[downOffset + x] + 1 * gray[downOffset + x + 1];

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 40) edgeCount++;
    }
  }

  return interiorCount > 0 ? edgeCount / interiorCount : 0;
}

/** Estimates JPEG quality (1-100) from 8x8 block boundary step discontinuities */
function estimateJpegQuality(gray: Float32Array, width: number, height: number): number {
  if (width < 16 || height < 16) return 90;
  let boundaryDiff = 0;
  let boundaryCount = 0;
  let interiorDiff = 0;
  let interiorCount = 0;

  // Horizontal gradient comparison across 8-pixel boundaries vs interior
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const diff = Math.abs(gray[offset + x] - gray[offset + x - 1]);
      if (x % 8 === 0) {
        boundaryDiff += diff;
        boundaryCount++;
      } else {
        interiorDiff += diff;
        interiorCount++;
      }
    }
  }

  const avgBoundary = boundaryCount > 0 ? boundaryDiff / boundaryCount : 0;
  const avgInterior = interiorCount > 0 ? interiorDiff / interiorCount : 0;

  if (avgInterior === 0) return 95;
  const blockiness = Math.max(0, (avgBoundary - avgInterior) / avgInterior);

  // High blockiness corresponds to low quality
  const quality = Math.max(10, Math.min(100, Math.round(100 - blockiness * 80)));
  return quality;
}

/** 64-bit Perceptual Difference Hash (dHash) */
export function computeDHash(gray: Float32Array, width: number, height: number): string {
  // Downsample to 9x8 grid using bilinear sampling
  const targetW = 9;
  const targetH = 8;
  const grid = new Float32Array(targetW * targetH);

  for (let y = 0; y < targetH; y++) {
    const srcY = (y + 0.5) * (height / targetH);
    const y0 = Math.floor(srcY);
    const y1 = Math.min(height - 1, y0 + 1);
    const wy = srcY - y0;

    for (let x = 0; x < targetW; x++) {
      const srcX = (x + 0.5) * (width / targetW);
      const x0 = Math.floor(srcX);
      const x1 = Math.min(width - 1, x0 + 1);
      const wx = srcX - x0;

      const p00 = gray[y0 * width + x0];
      const p10 = gray[y0 * width + x1];
      const p01 = gray[y1 * width + x0];
      const p11 = gray[y1 * width + x1];

      grid[y * targetW + x] =
        (1 - wx) * (1 - wy) * p00 +
        wx * (1 - wy) * p10 +
        (1 - wx) * wy * p01 +
        wx * wy * p11;
    }
  }

  // 64 comparisons (8 rows x 8 cols)
  let hashBigInt = BigInt(0);
  const oneBig = BigInt(1);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = grid[y * 9 + x];
      const right = grid[y * 9 + x + 1];
      hashBigInt <<= oneBig;
      if (left > right) {
        hashBigInt |= oneBig;
      }
    }
  }

  return hashBigInt.toString(16).padStart(16, '0');
}

/** 64-bit Average Hash (aHash) */
export function computeAHash(gray: Float32Array, width: number, height: number): string {
  const targetW = 8;
  const targetH = 8;
  const grid = new Float32Array(64);
  let sum = 0;

  for (let y = 0; y < targetH; y++) {
    const srcY = (y + 0.5) * (height / targetH);
    const y0 = Math.floor(srcY);
    for (let x = 0; x < targetW; x++) {
      const srcX = (x + 0.5) * (width / targetW);
      const srcXFloor = Math.floor(srcX);
      const val = gray[y0 * width + srcXFloor];
      grid[y * 8 + x] = val;
      sum += val;
    }
  }

  const avg = sum / 64;
  let hashBigInt = BigInt(0);
  const oneBig = BigInt(1);
  for (let i = 0; i < 64; i++) {
    hashBigInt <<= oneBig;
    if (grid[i] > avg) {
      hashBigInt |= oneBig;
    }
  }

  return hashBigInt.toString(16).padStart(16, '0');
}

/** Computes Hamming distance between two 16-hex perceptual hashes (0 to 64) */
export function hammingDistance(hashHexA: string, hashHexB: string): number {
  if (!hashHexA || !hashHexB) return 64;
  const aHex = hashHexA.slice(-16).padStart(16, '0');
  const bHex = hashHexB.slice(-16).padStart(16, '0');
  try {
    const a = BigInt('0x' + aHex);
    const b = BigInt('0x' + bHex);
    let xor = a ^ b;
    let dist = 0;
    const zeroBig = BigInt(0);
    const oneBig = BigInt(1);
    while (xor > zeroBig) {
      dist += Number(xor & oneBig);
      xor >>= oneBig;
    }
    return dist;
  } catch {
    return 64;
  }
}

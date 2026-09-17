/**
 * WhyLab Vision: Vision Evidence Ingestion Layer
 * Ingests predictions CSV, matches image files, enforces limits, and supports metadata-only mode.
 */

import { parseCsv } from '../evidence.ts';
import type { VisionPrediction, SplitType } from './types.ts';

export interface VisionIngestionAudit {
  totalRows: number;
  validRows: number;
  matchedImagesCount: number;
  unmatchedFilesCount: number;
  missingImagesCount: number;
  isMetadataOnly: boolean;
  unmatchedFileNames: string[];
  missingImageIds: string[];
  splitDistribution: Record<SplitType, number>;
  unavailableDiagnostics: string[];
  warnings: string[];
}

export interface VisionIngestionResult {
  predictions: VisionPrediction[];
  audit: VisionIngestionAudit;
}

const ACCEPTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg']);

/** Extracts filename stem without extension */
export function getFileStem(filename: string): string {
  const parts = filename.split('/').pop()?.split('\\').pop() ?? filename;
  const dotIndex = parts.lastIndexOf('.');
  return dotIndex > 0 ? parts.slice(0, dotIndex) : parts;
}

/**
 * Parses vision predictions CSV text and binds uploaded image files
 */
export function ingestVisionDataset(
  csvText: string,
  imageFiles: File[] | Blob[] = [],
  fileNames: string[] = []
): VisionIngestionResult {
  if (!csvText || !csvText.trim()) {
    throw new Error('Predictions CSV is empty. Upload a CSV with image_id, y_true, y_pred, y_probability.');
  }

  const rawRows = parseCsv(csvText.replace(/^\uFEFF/, '').trim());
  if (rawRows.length < 2) {
    throw new Error('Predictions CSV must contain a header row and at least one data row.');
  }

  const headers = rawRows[0].map(h => h.trim().toLowerCase());
  const dataRows = rawRows.slice(1);

  if (dataRows.length > 20000) {
    throw new Error('WhyLab Vision supports up to 20,000 evaluation rows.');
  }

  // Column resolution
  const findCol = (...aliases: string[]) => {
    return headers.findIndex(h => aliases.includes(h));
  };

  const idIdx = findCol('image_id', 'id', 'filename', 'image', 'file');
  const trueIdx = findCol('y_true', 'label', 'target', 'ground_truth', 'actual');
  const predIdx = findCol('y_pred', 'prediction', 'pred', 'predicted');
  const probIdx = findCol('y_probability', 'prob', 'probability', 'score', 'conf', 'confidence');
  const splitIdx = findCol('split', 'subset', 'dataset_split');
  const siteIdx = findCol('site', 'hospital', 'location', 'center');
  const deviceIdx = findCol('device', 'camera', 'scanner', 'sensor');
  const timeIdx = findCol('capture_time', 'timestamp', 'time', 'date');
  const annotatorIdx = findCol('annotator', 'reviewer', 'reader');

  if (idIdx === -1) throw new Error('Missing required column: "image_id"');
  if (trueIdx === -1) throw new Error('Missing required column: "y_true"');
  if (predIdx === -1) throw new Error('Missing required column: "y_pred"');
  if (probIdx === -1) throw new Error('Missing required column: "y_probability"');

  // Index supplied image files by stem
  const imageMap = new Map<string, { file: File | Blob; name: string }>();
  const unmatchedFileNames: string[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const name = fileNames[i] || (file instanceof File ? file.name : `image_${i}`);
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_IMAGE_EXTENSIONS.has(ext)) {
      continue;
    }
    const stem = getFileStem(name);
    imageMap.set(stem.toLowerCase(), { file, name });
  }

  const predictions: VisionPrediction[] = [];
  const warnings: string[] = [];
  const missingImageIds: string[] = [];
  const splitCounts: Record<SplitType, number> = {
    train: 0,
    val: 0,
    production: 0,
    test: 0,
    unassigned: 0
  };

  const seenIds = new Set<string>();

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (row.length <= Math.max(idIdx, trueIdx, predIdx, probIdx)) continue;

    const imageId = row[idIdx]?.trim();
    if (!imageId) continue;

    if (seenIds.has(imageId)) {
      warnings.push(`Duplicate image_id "${imageId}" at line ${r + 2}. Skipping subsequent duplicate.`);
      continue;
    }
    seenIds.add(imageId);

    // Parse binary ground truth
    const rawTrue = row[trueIdx]?.trim();
    const yTrue = rawTrue === '1' || rawTrue?.toLowerCase() === 'true' || rawTrue?.toLowerCase() === 'positive' ? 1 : 0;

    // Parse binary prediction
    const rawPred = row[predIdx]?.trim();
    const yPred = rawPred === '1' || rawPred?.toLowerCase() === 'true' || rawPred?.toLowerCase() === 'positive' ? 1 : 0;

    // Parse probability
    const rawProb = Number.parseFloat(row[probIdx]?.trim() ?? '0');
    if (Number.isNaN(rawProb) || rawProb < 0 || rawProb > 1) {
      warnings.push(`Invalid probability "${row[probIdx]}" for image "${imageId}". Clamped to [0, 1].`);
    }
    const yProbability = Math.max(0, Math.min(1, Number.isNaN(rawProb) ? 0.5 : rawProb));

    // Parse split
    let split: SplitType = 'unassigned';
    if (splitIdx !== -1 && row[splitIdx]) {
      const s = row[splitIdx].trim().toLowerCase();
      if (s.includes('train')) split = 'train';
      else if (s.includes('val') || s.includes('valid')) split = 'val';
      else if (s.includes('prod')) split = 'production';
      else if (s.includes('test')) split = 'test';
    }
    splitCounts[split]++;

    // Match image file
    const matched = imageMap.get(imageId.toLowerCase()) || imageMap.get(getFileStem(imageId).toLowerCase());
    let imageFile: File | Blob | undefined;
    if (matched) {
      imageFile = matched.file;
    } else if (imageFiles.length > 0) {
      missingImageIds.push(imageId);
    }

    // Capture extra columns in metadata
    const metadata: Record<string, string | number> = {};
    for (let c = 0; c < headers.length; c++) {
      if (![idIdx, trueIdx, predIdx, probIdx, splitIdx, siteIdx, deviceIdx, timeIdx, annotatorIdx].includes(c)) {
        const val = row[c]?.trim();
        if (val) metadata[headers[c]] = Number.isNaN(Number(val)) ? val : Number(val);
      }
    }

    predictions.push({
      imageId,
      yTrue,
      yPred,
      yProbability,
      split,
      site: siteIdx !== -1 ? row[siteIdx]?.trim() : undefined,
      device: deviceIdx !== -1 ? row[deviceIdx]?.trim() : undefined,
      captureTime: timeIdx !== -1 ? row[timeIdx]?.trim() : undefined,
      annotator: annotatorIdx !== -1 ? row[annotatorIdx]?.trim() : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      imageFile
    });
  }

  // Check unmatched image files
  const predIdSet = new Set(predictions.map(p => p.imageId.toLowerCase()));
  for (const [stem, item] of imageMap.entries()) {
    if (!predIdSet.has(stem)) {
      unmatchedFileNames.push(item.name);
    }
  }

  const isMetadataOnly = imageFiles.length === 0;
  const unavailableDiagnostics: string[] = [];
  if (isMetadataOnly) {
    unavailableDiagnostics.push(
      'Local pixel statistics (sharpness, colorfulness, contrast, noise)',
      'Perceptual dHash/aHash calculation',
      'Cross-split near-duplicate visual leakage scan',
      'Counterfactual canvas robustness sweep',
      'Multimodal Astra concept discovery set sampling'
    );
  }

  const audit: VisionIngestionAudit = {
    totalRows: dataRows.length,
    validRows: predictions.length,
    matchedImagesCount: predictions.filter(p => Boolean(p.imageFile)).length,
    unmatchedFilesCount: unmatchedFileNames.length,
    missingImagesCount: missingImageIds.length,
    isMetadataOnly,
    unmatchedFileNames: unmatchedFileNames.slice(0, 50),
    missingImageIds: missingImageIds.slice(0, 50),
    splitDistribution: splitCounts,
    unavailableDiagnostics,
    warnings: warnings.slice(0, 20)
  };

  return { predictions, audit };
}

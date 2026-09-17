/**
 * WhyLab Vision: Profiler Client
 * Manages client-side image decoding and worker profiling with progress streaming.
 */

import { profileImagePixels } from './profiler.ts';
import type { ImageProfile, VisionPrediction } from './types.ts';

export interface ProfilerProgress {
  processed: number;
  total: number;
  currentImageId: string;
  percent: number;
}

/**
 * Extracts raw pixel data from ImageBitmap or HTMLImageElement
 */
async function extractPixels(
  fileOrBlob: Blob
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  // Use createImageBitmap if supported (browser)
  if (typeof createImageBitmap !== 'undefined') {
    const bitmap = await createImageBitmap(fileOrBlob);
    const width = bitmap.width;
    const height = bitmap.height;

    // Use OffscreenCanvas if available, otherwise document canvas
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Could not create 2D canvas context');
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    bitmap.close();
    return { width, height, data: imgData.data };
  }

  throw new Error('Image decoding requires createImageBitmap or browser canvas.');
}

/**
 * Profiles an array of vision predictions with attached image files.
 * Streams progress and keeps the UI responsive.
 */
export async function profilePredictionsBatch(
  predictions: VisionPrediction[],
  onProgress?: (progress: ProfilerProgress) => void,
  maxConcurrency = 4
): Promise<ImageProfile[]> {
  const itemsToProfile = predictions.filter(p => Boolean(p.imageFile));
  const total = itemsToProfile.length;
  if (total === 0) return [];

  const profiles: ImageProfile[] = [];
  let completed = 0;

  // Process in small batches with microtask yielding to prevent main thread starvation
  for (let i = 0; i < total; i += maxConcurrency) {
    const chunk = itemsToProfile.slice(i, i + maxConcurrency);

    const chunkResults = await Promise.all(
      chunk.map(async item => {
        try {
          const pixels = await extractPixels(item.imageFile!);
          const prof = profileImagePixels(
            item.imageId,
            pixels,
            item.imageFile?.size
          );
          completed++;
          if (onProgress) {
            onProgress({
              processed: completed,
              total,
              currentImageId: item.imageId,
              percent: Math.round((completed / total) * 100)
            });
          }
          return prof;
        } catch {
          // Graceful fallback for unreadable image
          completed++;
          return null;
        }
      })
    );

    for (const res of chunkResults) {
      if (res) profiles.push(res);
    }

    // Yield to browser event loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return profiles;
}

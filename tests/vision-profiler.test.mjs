import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileImagePixels,
  computeDHash,
  computeAHash,
  hammingDistance
} from '../app/lib/vision/profiler.ts';

test('profileImagePixels calculates flat image statistics correctly', () => {
  const width = 32;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  // Fill with uniform gray: RGB(128, 128, 128)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 128;
    data[i * 4 + 3] = 255;
  }

  const profile = profileImagePixels('test_flat', { width, height, data });

  assert.equal(profile.width, 32);
  assert.equal(profile.height, 32);
  assert.equal(profile.aspectRatio, 1.0);
  assert.ok(Math.abs(profile.meanLuminance - 128) < 1.0);
  assert.equal(profile.rmsContrast, 0);
  assert.equal(profile.sharpness, 0);
  assert.equal(profile.colorfulness, 0);
  assert.equal(profile.clippedHighlights, 0);
  assert.equal(profile.crushedBlacks, 0);
  assert.equal(profile.dHash.length, 16);
  assert.equal(profile.aHash.length, 16);
});

test('profileImagePixels measures high sharpness and edge density on step edge image', () => {
  const width = 32;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  // Left half black, right half white
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const val = x < 16 ? 0 : 255;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const profile = profileImagePixels('test_edge', { width, height, data });

  assert.ok(profile.sharpness > 100, `Sharpness should be high, got ${profile.sharpness}`);
  assert.ok(profile.rmsContrast > 0.4, `Contrast should be high, got ${profile.rmsContrast}`);
  assert.ok(profile.edgeDensity > 0.02, `Edge density should detect vertical step edge, got ${profile.edgeDensity}`);
});

test('dHash and aHash produce deterministic 16-hex hashes and compute accurate Hamming distance', () => {
  const gray = new Float32Array(64).fill(128);
  const dh = computeDHash(gray, 8, 8);
  const ah = computeAHash(gray, 8, 8);
  assert.equal(typeof dh, 'string');
  assert.equal(typeof ah, 'string');
  assert.equal(dh.length, 16);
  assert.equal(ah.length, 16);

  const hex1 = '0000ffff0000ffff';
  const hex2 = '0000ffff0000ffff';
  const hexInverted = 'ffff0000ffff0000';

  assert.equal(hammingDistance(hex1, hex2), 0);
  assert.equal(hammingDistance(hex1, hexInverted), 64);

  // 1 bit difference: '0000ffff0000fffe'
  const hex1BitDiff = '0000ffff0000fffe';
  assert.equal(hammingDistance(hex1, hex1BitDiff), 1);
});

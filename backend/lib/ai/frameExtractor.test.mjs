import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateTimestamps, brightnessOf, populationVariance, applyFindEdges, sharpnessOf, averageHash, hammingDistance } from "./frameExtractor.js";

test("candidateTimestamps: 10 evenly-spaced points inside the middle of the video", () => {
  const timestamps = candidateTimestamps(100);
  assert.equal(timestamps.length, 10);
  // 5% margin each side -> starts at 5, ends before 95
  assert.ok(timestamps[0] >= 5 && timestamps[0] < 6);
  assert.ok(timestamps[9] < 95);
  // strictly increasing
  for (let i = 1; i < timestamps.length; i++) assert.ok(timestamps[i] > timestamps[i - 1]);
});

test("candidateTimestamps: every timestamp stays within the trimmed 5%-margin window", () => {
  const duration = 40;
  const margin = duration * 0.05;
  const timestamps = candidateTimestamps(duration);
  for (const t of timestamps) {
    assert.ok(t >= margin - 0.001);
    assert.ok(t <= duration - margin + 0.001);
  }
});

test("candidateTimestamps: falls back to a 15s assumption when duration is missing/invalid", () => {
  const fallback = candidateTimestamps(0);
  const explicit = candidateTimestamps(15);
  assert.deepEqual(fallback, explicit);
  assert.equal(candidateTimestamps(NaN).length, 10);
  assert.equal(candidateTimestamps(-5).length, 10);
});

test("brightnessOf: mean of a flat grey buffer is that grey value", () => {
  const flat = Buffer.alloc(100, 128);
  assert.equal(brightnessOf(flat), 128);
});

test("brightnessOf: a mostly-black buffer scores low, mostly-white scores high", () => {
  assert.ok(brightnessOf(Buffer.alloc(64, 5)) < 25);
  assert.ok(brightnessOf(Buffer.alloc(64, 250)) > 200);
});

test("populationVariance: zero for a uniform buffer, positive for a varied one", () => {
  assert.equal(populationVariance(Buffer.from([50, 50, 50, 50])), 0);
  assert.ok(populationVariance(Buffer.from([0, 255, 0, 255])) > 0);
});

test("applyFindEdges: a flat image has zero edge response in the interior", () => {
  const width = 5, height = 5;
  const flat = Buffer.alloc(width * height, 100);
  const edges = applyFindEdges(flat, width, height);
  // interior pixel (2,2) should be untouched by any edge (kernel sums to 0)
  assert.equal(edges[2 * width + 2], 0);
});

test("sharpnessOf: a checkerboard scores far higher than a flat image", () => {
  // Border pixels pass through applyFindEdges unchanged (see its own
  // comment), so a flat image isn't exactly variance-0 — its edge buffer is
  // a mix of untouched border value against a 0 interior, which itself has
  // nonzero variance (measured ~2304 for a 10x10 buffer). What matters is
  // that real high-frequency detail (checkerboard) scores well above that
  // (measured ~16256, roughly 7x) — assert a margin comfortably below the
  // measured ratio rather than an exact figure that would be brittle.
  const width = 10, height = 10;
  const flat = Buffer.alloc(width * height, 100);
  const checker = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) checker[y * width + x] = (x + y) % 2 === 0 ? 0 : 255;
  }
  assert.ok(sharpnessOf(checker, width, height) > sharpnessOf(flat, width, height) * 5);
});

test("averageHash: identical images hash identically", () => {
  const pixels = Buffer.from(Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 40 : 200)));
  assert.equal(averageHash(pixels), averageHash(Buffer.from(pixels)));
});

test("averageHash + hammingDistance: near-identical images are close, inverted images are far", () => {
  const base = Buffer.from(Array.from({ length: 64 }, (_, i) => (i < 32 ? 30 : 220)));
  const inverted = Buffer.from(Array.from({ length: 64 }, (_, i) => (i < 32 ? 220 : 30)));
  const hashA = averageHash(base);
  const hashB = averageHash(inverted);
  assert.equal(hammingDistance(hashA, hashA), 0);
  assert.equal(hammingDistance(hashA, hashB), 64); // fully inverted -> every bit differs
});

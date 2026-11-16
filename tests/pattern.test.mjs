import test from 'node:test';
import assert from 'node:assert/strict';

import * as pattern from '../dist/core/pattern.js';

const CREAM = '#f5efe3';
const ROSE = '#bf6373';
const GREEN = '#79836a';
const solid = (width = 4, height = 4, color = CREAM) =>
  Array.from({ length: height }, () => Array(width).fill(color));

test('createGrid fills independent rows and validates dimensions and colors', () => {
  assert.equal(typeof pattern.createGrid, 'function');
  const grid = pattern.createGrid(6, 4);
  assert.deepEqual(grid, solid(6, 4));
  grid[0][0] = ROSE;
  assert.equal(grid[1][0], CREAM);
  assert.equal(pattern.createGrid(4, 4, '#ABCDEF')[0][0], '#abcdef');
  for (const [w, h] of [[3, 4], [4, 3], [201, 4], [4, 241], [4.5, 4], [NaN, 4]]) {
    assert.throws(() => pattern.createGrid(w, h), RangeError);
  }
  assert.throws(() => pattern.createGrid(4, 4, 'red'), TypeError);
});

test('resizeGrid preserves top-left stitches and fills only added cells', () => {
  assert.equal(typeof pattern.resizeGrid, 'function');
  const original = solid(4, 5);
  original[0][0] = ROSE;
  original[4][3] = GREEN;
  const larger = pattern.resizeGrid(original, 6, 6, GREEN);
  assert.equal(larger[0][0], ROSE);
  assert.equal(larger[3][3], CREAM);
  assert.equal(larger[5][5], GREEN);
  assert.equal(larger[4][3], GREEN);
  larger[0][0] = GREEN;
  assert.equal(original[0][0], ROSE);
  assert.deepEqual(pattern.resizeGrid(original, 4, 4), original.slice(0, 4));
});

test('floodFill fills only the four-connected region and keeps the source unchanged', () => {
  assert.equal(typeof pattern.floodFill, 'function');
  const original = solid();
  original[0][1] = GREEN;
  original[1][0] = GREEN;
  const filled = pattern.floodFill(original, 0, 0, ROSE);
  assert.equal(filled[0][0], ROSE);
  assert.equal(filled[1][1], CREAM, 'diagonal cells are not connected');
  assert.deepEqual(original, [[CREAM, GREEN, CREAM, CREAM], [GREEN, CREAM, CREAM, CREAM], ...solid(4, 2)]);
  assert.deepEqual(pattern.floodFill(original, -1, 0, ROSE), original);
  const sameColor = pattern.floodFill(original, 0, 0, CREAM);
  assert.deepEqual(sameColor, original);
  assert.notEqual(sameColor[0], original[0]);
});

test('floodFill handles a maximum-size connected area without recursive stack overflow', () => {
  const original = solid(200, 240);
  const filled = pattern.floodFill(original, 199, 239, ROSE);
  assert.deepEqual(pattern.colorCounts(filled), [{ color: ROSE, count: 48000 }]);
  assert.equal(original[239][199], CREAM);
});

test('drawLine covers continuous steep and reverse strokes including endpoints', () => {
  assert.equal(typeof pattern.drawLine, 'function');
  const original = solid(8, 8);
  const line = pattern.drawLine(original, 1, 1, 3, 6, ROSE);
  assert.equal(line[1][1], ROSE);
  assert.equal(line[6][3], ROSE);
  assert.equal(line.flat().filter(c => c === ROSE).length, 6);
  for (let y = 1; y <= 6; y++) assert.equal(line[y].filter(c => c === ROSE).length, 1);
  assert.deepEqual(pattern.drawLine(original, 3, 6, 1, 1, ROSE), line);
  assert.deepEqual(original, solid(8, 8));
});

test('drawLine mirrors about the vertical center and clips outside strokes', () => {
  const mirrored = pattern.drawLine(solid(7, 6), 1, 1, 2, 4, ROSE, true);
  for (const row of mirrored) assert.deepEqual(row, [...row].reverse());
  const clipped = pattern.drawLine(solid(), -1000000000, 2, 1000000000, 2, GREEN);
  assert.deepEqual(clipped[2], Array(4).fill(GREEN));
  assert.equal(clipped.flat().filter(c => c === GREEN).length, 4);
  assert.deepEqual(pattern.drawLine(solid(), -5, -5, -1, -1, ROSE), solid());
  assert.throws(() => pattern.drawLine(solid(), NaN, 0, 1, 1, ROSE), TypeError);
});

test('flipGrid reverses the chosen direction without changing the original', () => {
  assert.equal(typeof pattern.flipGrid, 'function');
  const original = solid();
  original[0][0] = ROSE;
  original[1][2] = GREEN;
  const horizontal = pattern.flipGrid(original);
  assert.equal(horizontal[0][3], ROSE);
  assert.equal(horizontal[1][1], GREEN);
  const vertical = pattern.flipGrid(original, 'vertical');
  assert.equal(vertical[3][0], ROSE);
  assert.equal(vertical[2][2], GREEN);
  assert.deepEqual(pattern.flipGrid(horizontal), original);
  assert.throws(() => pattern.flipGrid(original, 'diagonal'), RangeError);
});

test('quantizePixels preserves exact colors within the limit and composites alpha', () => {
  assert.equal(typeof pattern.quantizePixels, 'function');
  const rgba = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) rgba.set([255, 0, 0, 255], i * 4);
  rgba.set([0, 0, 255, 0], 0);
  rgba.set([0, 0, 0, 128], 4);
  const result = pattern.quantizePixels(rgba, 4, 4, 6, '#ffffff');
  assert.equal(result.grid[0][0], '#ffffff');
  assert.equal(result.grid[0][1], '#7f7f7f');
  assert.equal(result.grid[0][2], '#ff0000');
  assert.deepEqual(new Set(result.palette), new Set(['#ffffff', '#7f7f7f', '#ff0000']));
  assert.equal(result.palette[0], '#ff0000');
});

test('quantizePixels makes a deterministic bounded palette for a gradient', () => {
  const rgba = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) rgba.set([i * 4, 255 - i * 4, (i % 8) * 32, 255], i * 4);
  const first = pattern.quantizePixels(rgba, 8, 8, 4);
  assert.deepEqual(first, pattern.quantizePixels(rgba, 8, 8, 4));
  assert.ok(first.palette.length <= 4);
  assert.ok(first.palette.length > 1);
  assert.ok(first.grid.flat().every(color => first.palette.includes(color)));
  assert.equal(first.grid.length, 8);
  assert.equal(first.grid[0].length, 8);
  assert.equal(pattern.quantizePixels(rgba, 8, 8, 1).palette.length, 1);
  assert.throws(() => pattern.quantizePixels(rgba, 4, 4), RangeError);
  assert.throws(() => pattern.quantizePixels(rgba, 8, 8, 0), RangeError);
});

test('quantizePixels weights frequent colors when reducing to one shade', () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) rgba.set([0, 0, 0, 255], i * 4);
  rgba.set([255, 255, 255, 255], 0);
  const before = rgba.slice();
  assert.deepEqual(pattern.quantizePixels(rgba, 4, 4, 1).palette, ['#101010']);
  assert.deepEqual(rgba, before);
});

test('generateMotif creates repeatable patterns at requested dimensions', () => {
  assert.equal(typeof pattern.generateMotif, 'function');
  const tulip = pattern.generateMotif();
  assert.equal(tulip.length, 40);
  assert.equal(tulip[0].length, 32);
  assert.deepEqual(tulip, pattern.generateMotif());
  assert.deepEqual(new Set(tulip.flat()), new Set([CREAM, ROSE, GREEN, '#824859']));
  const creamCount = tulip.flat().filter(color => color === CREAM).length;
  assert.ok(creamCount > 640 && creamCount < 1100, 'motifs leave balanced breathing room');
  for (const style of ['tulip', 'nordic', 'diamond', 'blank']) {
    assert.equal(pattern.validateGrid(pattern.generateMotif(37, 45, style)), true);
  }
  assert.deepEqual(pattern.generateMotif(4, 4, 'blank'), solid());
  assert.throws(() => pattern.generateMotif(32, 40, 'unknown'), RangeError);
});

test('colorCounts merges case variants and orders by count then color', () => {
  assert.equal(typeof pattern.colorCounts, 'function');
  const grid = solid();
  grid[0][0] = '#BF6373';
  grid[0][1] = ROSE;
  grid[0][2] = GREEN;
  assert.deepEqual(pattern.colorCounts(grid), [
    { color: CREAM, count: 13 }, { color: ROSE, count: 2 }, { color: GREEN, count: 1 },
  ]);
});

test('validateGrid rejects malformed, ragged, oversized and unsupported-color input', () => {
  assert.equal(typeof pattern.validateGrid, 'function');
  assert.equal(pattern.validateGrid(solid()), true);
  assert.equal(pattern.validateGrid(solid(200, 240)), true);
  for (const bad of [null, [], solid(3, 4), solid(4, 3), solid(201, 4), solid(4, 241), [[], [], [], []]]) {
    assert.equal(pattern.validateGrid(bad), false);
  }
  const ragged = solid();
  ragged[2].pop();
  assert.equal(pattern.validateGrid(ragged), false);
  const wrongColor = solid();
  wrongColor[0][0] = '#fff';
  assert.equal(pattern.validateGrid(wrongColor), false);
  assert.throws(() => pattern.floodFill(ragged, 0, 0, ROSE), TypeError);
});

test('validateGrid rejects holes in either rows or cells', () => {
  const missingRow = solid();
  delete missingRow[1];
  assert.equal(pattern.validateGrid(missingRow), false);
  const missingCell = solid();
  delete missingCell[1][1];
  assert.equal(pattern.validateGrid(missingCell), false);
});

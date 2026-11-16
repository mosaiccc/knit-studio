import test from 'node:test';
import assert from 'node:assert/strict';

import * as editing from '../dist/core/chart-editing.js';

const CREAM = '#f5efe3';
const ROSE = '#bf6373';
const OLIVE = '#79836a';
const solid = (width, height) => Array.from({ length: height }, () => Array(width).fill(CREAM));
const chart = grid => ({ grid, mask: grid.map(row => row.map(color => color !== null)), width: grid[0].length, height: grid.length, rowCounts: [{ row: 1, count: 3 }] });

test('paintChartLine paints through separated cloth while preserving null cutouts and input', () => {
  assert.equal(typeof editing.paintChartLine, 'function');
  const original = [[CREAM, null, CREAM, CREAM], [null, CREAM, CREAM, null]];
  const result = editing.paintChartLine(original, 0, 0, 3, 0, ROSE);
  assert.deepEqual(result[0], [ROSE, null, ROSE, ROSE]);
  assert.deepEqual(original[0], [CREAM, null, CREAM, CREAM]);
  assert.notEqual(result[1], original[1]);
});

test('paintChartLine mirrors each point independently without filling mirrored cutouts', () => {
  const original = [[CREAM, CREAM, CREAM, null], [null, CREAM, CREAM, CREAM]];
  const result = editing.paintChartLine(original, 0, 0, 0, 1, ROSE, true);
  assert.deepEqual(result, [[ROSE, CREAM, CREAM, null], [null, CREAM, CREAM, ROSE]]);
});

test('paintChartLine supports one-cell charts, reverse steep strokes, and distant clipping', () => {
  assert.deepEqual(editing.paintChartLine([[CREAM]], 0, 0, 0, 0, '#ABCDEF'), [['#abcdef']]);
  const grid = solid(3, 7);
  const forward = editing.paintChartLine(grid, 0, 0, 2, 6, ROSE);
  assert.deepEqual(editing.paintChartLine(grid, 2, 6, 0, 0, ROSE), forward);
  assert.equal(forward.flat().filter(color => color === ROSE).length, 7);
  assert.deepEqual(editing.paintChartLine([[CREAM, null, CREAM]], -1e9, 0, 1e9, 0, ROSE), [[ROSE, null, ROSE]]);
  assert.deepEqual(editing.paintChartLine(grid, -5, -5, -1, -1, ROSE), grid);
});

test('fillChartRegion stays within a four-connected same-color region and skips cutouts', () => {
  assert.equal(typeof editing.fillChartRegion, 'function');
  const original = [[CREAM, null, CREAM], [CREAM, OLIVE, CREAM], [null, CREAM, CREAM]];
  const result = editing.fillChartRegion(original, 0, 0, ROSE);
  assert.deepEqual(result, [[ROSE, null, CREAM], [ROSE, OLIVE, CREAM], [null, CREAM, CREAM]]);
  assert.deepEqual(editing.fillChartRegion(original, 1, 0, ROSE), original);
  assert.deepEqual(editing.fillChartRegion(original, -1, 0, ROSE), original);
  assert.deepEqual(editing.fillChartRegion(original, 0, 0, CREAM), original);
  assert.equal(original[0][0], CREAM);
});

test('fillChartRegion fills a 400 by 600 chart without recursive overflow', () => {
  const result = editing.fillChartRegion(solid(400, 600), 399, 599, ROSE);
  assert.equal(result.flat().filter(color => color === ROSE).length, 240000);
});

test('applyChartEdits anchors stitch numbers at the right and row numbers at the bottom', () => {
  assert.equal(typeof editing.applyChartEdits, 'function');
  const source = chart([[null, CREAM, CREAM], [CREAM, CREAM, CREAM]]);
  const result = editing.applyChartEdits(source, { '1:1': ROSE, '2:2': OLIVE, '2:3': ROSE, '3:1': ROSE });
  assert.deepEqual(result.grid, [[null, OLIVE, CREAM], [CREAM, CREAM, ROSE]]);
  assert.notEqual(result, source);
  assert.equal(result.mask, source.mask);
  assert.equal(result.rowCounts, source.rowCounts);
  assert.deepEqual(source.grid, [[null, CREAM, CREAM], [CREAM, CREAM, CREAM]]);
  assert.deepEqual(editing.applyChartEdits(source).grid, source.grid);
});

test('captureChartEdits roundtrips only changed stitches and removes restored visible entries', () => {
  assert.equal(typeof editing.captureChartEdits, 'function');
  const base = chart([[null, CREAM, CREAM], [CREAM, CREAM, CREAM]]);
  const painted = [[null, OLIVE, CREAM], [CREAM, CREAM, ROSE]];
  const previous = { '1:2': ROSE, '1:1': '#BF6373' };
  const captured = editing.captureChartEdits(base, painted, previous);
  assert.deepEqual(captured, { '1:1': ROSE, '2:2': OLIVE });
  assert.deepEqual(editing.applyChartEdits(base, captured).grid, painted);
  assert.equal(previous['1:2'], ROSE);
  assert.deepEqual(editing.captureChartEdits(chart([['#ABCDEF']]), [['#abcdef']]), {});
});

test('captureChartEdits keeps dormant edits outside dimensions and inside temporary cutouts', () => {
  const small = chart([[null, CREAM], [CREAM, CREAM]]);
  const previous = { '2:2': OLIVE, '3:4': ROSE, '1:1': OLIVE };
  const captured = editing.captureChartEdits(small, [[null, CREAM], [CREAM, ROSE]], previous);
  assert.deepEqual(captured, { '2:2': OLIVE, '3:4': ROSE, '1:1': ROSE });
  const expanded = editing.applyChartEdits(chart(solid(4, 3)), captured);
  assert.equal(expanded.grid[0][0], ROSE, 'dormant row 3 stitch 4 returns after expansion');
  assert.equal(expanded.grid[1][2], OLIVE, 'temporary cutout edit returns at its stable stitch number');
  assert.equal(expanded.grid[2][3], ROSE);
});

test('chart operations reject invalid dimensions, holes, colors, coordinates and edits', () => {
  const sparse = solid(2, 2);
  delete sparse[1][1];
  for (const grid of [[], [[]], [[CREAM], [CREAM, CREAM]], sparse, solid(401, 1), solid(1, 601)]) {
    assert.throws(() => editing.paintChartLine(grid, 0, 0, 0, 0, ROSE));
  }
  assert.throws(() => editing.paintChartLine([[CREAM]], NaN, 0, 0, 0, ROSE));
  assert.throws(() => editing.fillChartRegion([[CREAM]], 0, 0, 'red'));
  for (const edits of [null, [], { '0:1': ROSE }, { '1:0': ROSE }, { '601:1': ROSE }, { '1:401': ROSE }, { '01:1': ROSE }, { '1:1': 'red' }]) {
    assert.throws(() => editing.applyChartEdits(chart([[CREAM]]), edits));
  }
  assert.throws(() => editing.captureChartEdits(chart([[CREAM]]), [[null]]));
  assert.throws(() => editing.captureChartEdits(chart([[null]]), [[CREAM]]));
  assert.throws(() => editing.captureChartEdits(chart([[CREAM]]), [[CREAM, CREAM]]));
});

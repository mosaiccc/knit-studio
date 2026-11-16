import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid } from '../dist/core/pattern.js';
import { createGarmentChart } from '../dist/core/garments.js';

import * as placements from '../dist/core/placements.js';

const CREAM = '#f5efe3';
const ROSE = '#bf6373';
const OLIVE = '#79836a';
const DARK = '#824859';
const BLUE = '#657f93';
function tile(overrides = {}) {
  const grid = createGrid(4, 4);
  grid[0][0] = ROSE; grid[0][3] = OLIVE;
  grid[3][0] = DARK; grid[3][3] = BLUE;
  return { id: 'placement-1', garmentId: 'rectangle', motifId: 'motif-1', name: '四角花样', grid, palette: [CREAM, ROSE, OLIVE, DARK, BLUE], row: 1, stitch: 1, transparentBackground: false, flipX: false, flipY: false, ...overrides };
}
function chart(width = 6, height = 7, fill = OLIVE) {
  const grid = Array.from({ length: height }, () => Array(width).fill(fill));
  return { width, height, grid, mask: grid.map(row => row.map(Boolean)), rowCounts: [{ row: 1, count: width }] };
}
function project(overrides = {}) {
  return { version: 1, name: '摆放测试', grid: createGrid(4, 4, ROSE), palette: [CREAM, ROSE], garmentId: 'rectangle', measurements: { width: 6, height: 7 }, gauge: { stitches: 10, rows: 10 }, placement: 'repeat', ...overrides };
}

test('places a snapshot using its bottom-right numbered row and stitch', () => {
  assert.equal(typeof placements.composePlacementChart, 'function');
  const source = chart();
  const result = placements.composePlacementChart(source, [tile({ row: 2, stitch: 2 })], 'rectangle');
  assert.equal(result.grid[2][1], ROSE);
  assert.equal(result.grid[2][4], OLIVE);
  assert.equal(result.grid[5][1], DARK);
  assert.equal(result.grid[5][4], BLUE);
  assert.equal(result.grid[1][1], OLIVE);
  assert.equal(result.grid[6][4], OLIVE);
  assert.equal(result.mask, source.mask);
  assert.equal(result.rowCounts, source.rowCounts);
  assert.equal(source.grid[2][1], OLIVE);
});

test('horizontal and vertical flips change tile orientation without changing its anchor', () => {
  for (const [flipX, flipY, expected] of [[true, false, [OLIVE, ROSE, BLUE, DARK]], [false, true, [DARK, BLUE, ROSE, OLIVE]], [true, true, [BLUE, DARK, OLIVE, ROSE]]]) {
    const result = placements.composePlacementChart(chart(4, 4), [tile({ flipX, flipY })], 'rectangle');
    assert.deepEqual([result.grid[0][0], result.grid[0][3], result.grid[3][0], result.grid[3][3]], expected);
  }
});

test('clips off-chart tile cells and preserves garment cutouts', () => {
  const source = chart();
  source.grid[1][1] = null;
  source.mask[1][1] = false;
  const result = placements.composePlacementChart(source, [tile({ row: 6, stitch: 5 })], 'rectangle');
  assert.equal(result.grid[0][1], CREAM);
  assert.equal(result.grid[1][0], CREAM);
  assert.equal(result.grid[1][1], null);
  assert.equal(result.grid[2][1], OLIVE);
  assert.deepEqual(placements.composePlacementChart(source, [tile({ row: 600, stitch: 400 })], 'rectangle').grid, source.grid);
});

test('later active-garment placements cover earlier placements', () => {
  const lower = tile({ grid: createGrid(4, 4, ROSE) });
  const upper = tile({ id: 'placement-2', grid: createGrid(4, 4, BLUE), row: 2, stitch: 2 });
  const other = tile({ id: 'placement-3', garmentId: 'sleeve', grid: createGrid(4, 4, DARK) });
  const result = placements.composePlacementChart(chart(), [lower, upper, other], 'rectangle');
  assert.equal(result.grid[3][2], BLUE);
  assert.equal(result.grid[6][5], ROSE);
  assert.equal(result.grid[0][0], OLIVE);
});

test('transparentBackground skips the snapshot first palette color case-insensitively', () => {
  const source = chart(4, 4, BLUE);
  const snapshot = tile({ transparentBackground: true, palette: ['#F5EFE3', ROSE, OLIVE, DARK, BLUE] });
  const result = placements.composePlacementChart(source, [snapshot], 'rectangle');
  assert.equal(result.grid[1][1], BLUE);
  assert.equal(result.grid[0][0], ROSE);
  assert.equal(result.grid[3][0], DARK);
  assert.equal(placements.composePlacementChart(source, [tile()], 'rectangle').grid[1][1], CREAM);
});

test('composition returns independent grids and never transforms the placement snapshot', () => {
  const source = chart();
  const snapshot = tile({ flipX: true });
  const before = structuredClone(snapshot);
  const result = placements.composePlacementChart(source, [snapshot], 'rectangle');
  assert.deepEqual(snapshot, before);
  result.grid[3][2] = '#000000';
  assert.deepEqual(snapshot, before);
  assert.equal(source.grid[3][2], OLIVE);
});

test('legacy composition preserves existing repeat and center behavior and optional extra placements', () => {
  assert.equal(typeof placements.createBaseChart, 'function');
  for (const placement of ['repeat', 'center']) {
    const data = project({ placement });
    const expected = createGarmentChart(data.garmentId, data.measurements, data.gauge, data.grid, placement);
    assert.deepEqual(placements.createBaseChart(data), expected);
  }
  const result = placements.createBaseChart(project({ arrangement: 'legacy', motifPlacements: [tile()] }));
  assert.equal(result.grid[0][0], ROSE);
  assert.equal(result.grid[6][5], BLUE);
});

test('custom arrangements use fixed fabric color before motifs and hand edits apply last', () => {
  assert.equal(typeof placements.composeProjectChart, 'function');
  const data = project({ arrangement: 'custom', fabricColor: DARK, motifPlacements: [tile()], chartEdits: { rectangle: { '1:1': ROSE } } });
  const base = placements.createBaseChart(data);
  assert.equal(base.grid[0][0], DARK);
  assert.equal(base.grid[6][5], BLUE);
  const composed = placements.composeProjectChart(data);
  assert.equal(composed.grid[6][5], ROSE);
  assert.equal(composed.grid[0][0], DARK);
  data.palette = [BLUE];
  assert.equal(placements.createBaseChart(data).grid[0][0], DARK);
  assert.equal(placements.createBaseChart(project({ arrangement: 'custom' })).grid[0][0], CREAM);
});

test('composition validates snapshot metadata, flags and coordinates', () => {
  for (const overrides of [{ row: 0 }, { row: 601 }, { stitch: 401 }, { stitch: 1.5 }, { flipX: 'yes' }, { transparentBackground: null }, { garmentId: 'missing' }, { grid: [[ROSE]] }, { palette: [] }, { id: '' }, { motifId: null }, { name: '' }]) {
    assert.throws(() => placements.composePlacementChart(chart(), [tile(overrides)], 'rectangle'));
  }
  for (const input of [null, {}, Array(1), [tile(), tile()], Array.from({ length: 101 }, (_, i) => tile({ id: `p-${i}` }))]) {
    assert.throws(() => placements.composePlacementChart(chart(), input, 'rectangle'));
  }
  assert.throws(() => placements.createBaseChart(project({ arrangement: 'unknown' })));
  assert.throws(() => placements.createBaseChart(project({ arrangement: 'custom', fabricColor: 'red' })));
});

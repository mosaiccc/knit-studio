import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleMotifGrid,
  calculateMotifSize,
  resizeMotifDimensions,
  dimensionsFromCentimeters,
} from '../dist/core/motif-sizing.js';

const uniqueGrid = (width, height) => Array.from({length: height}, (_, y) =>
  Array.from({length: width}, (_, x) => `#${(y * width + x).toString(16).padStart(6, '0')}`));
const gauge = {stitches: 22, rows: 30};

test('scaling doubles every original cell and keeps all four motif edges', () => {
  const source = uniqueGrid(4, 5);
  const actual = scaleMotifGrid(source, 8, 10);
  assert.equal(actual.length, 10);
  assert.equal(actual[0].length, 8);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 8; x++) {
      assert.equal(actual[y][x], source[Math.floor(y / 2)][Math.floor(x / 2)]);
    }
  }
  assert.equal(actual[0][7], source[0][3]);
  assert.equal(actual[9][0], source[4][0]);
  assert.equal(actual[9][7], source[4][3]);
});

test('shrinking samples cell centers across the entire motif without blending colors', () => {
  const source = uniqueGrid(8, 8);
  const actual = scaleMotifGrid(source, 4, 4);
  assert.deepEqual(actual, [1, 3, 5, 7].map(y => [1, 3, 5, 7].map(x => source[y][x])));
  const sourceColors = new Set(source.flat());
  assert.ok(actual.flat().every(color => sourceColors.has(color)));
});

test('fractional resizing maps both axes independently with nearest-neighbor sampling', () => {
  const source = uniqueGrid(4, 4);
  assert.deepEqual(scaleMotifGrid(source, 7, 5),
    [0, 1, 2, 2, 3].map(y => [0, 0, 1, 2, 2, 3, 3].map(x => source[y][x])));
});

test('scaling leaves its input unchanged and creates independent normalized rows', () => {
  const source = uniqueGrid(4, 4);
  source[0][0] = '#ABCDEF';
  const snapshot = structuredClone(source);
  for (const [width, height] of [[4, 4], [8, 8]]) {
    const actual = scaleMotifGrid(source, width, height);
    assert.notEqual(actual, source);
    assert.equal(new Set(actual).size, height);
    assert.ok(actual.every(row => !source.includes(row)));
    assert.equal(actual[0][0], '#abcdef');
    actual[0][0] = '#ffffff';
    assert.notEqual(actual[1][0], '#ffffff');
    assert.deepEqual(source, snapshot);
  }
});

test('scaling accepts boundary sizes and rejects invalid or sparse source grids', () => {
  assert.equal(scaleMotifGrid(uniqueGrid(4, 4), 200, 240).length, 240);
  assert.equal(scaleMotifGrid(uniqueGrid(200, 240), 4, 4)[0].length, 4);
  const sparse = uniqueGrid(4, 4);
  delete sparse[1][1];
  for (const invalid of [null, [], uniqueGrid(3, 4), [['#000000']], sparse,
    [['red', '#000000', '#000000', '#000000'], ...uniqueGrid(4, 3)]]) {
    assert.throws(() => scaleMotifGrid(invalid, 4, 4), TypeError);
  }
});

test('physical size uses different stitch and row gauges without display rounding', () => {
  assert.deepEqual(calculateMotifSize(48, 43, gauge), {
    widthCm: 480 / 22,
    heightCm: 430 / 30,
  });
  assert.deepEqual(calculateMotifSize(96, 86, gauge), {
    widthCm: 2 * 480 / 22,
    heightCm: 2 * 430 / 30,
  });
  assert.deepEqual(calculateMotifSize(4, 4, {stitches: 0.1, rows: 100}), {
    widthCm: 400,
    heightCm: 0.4,
  });
});

test('locked changes derive width or height from the original motif proportions', () => {
  assert.deepEqual(resizeMotifDimensions(48, 43, 'width', 96), {width: 96, height: 86});
  assert.deepEqual(resizeMotifDimensions(48, 43, 'height', 86), {width: 96, height: 86});
  assert.deepEqual(resizeMotifDimensions(48, 43, 'width', 60), {width: 60, height: 54});
  assert.deepEqual(resizeMotifDimensions(48, 43, 'height', 54), {width: 60, height: 54});
  for (const width of [7, 8, 9, 14, 25, 100, 200]) {
    const result = resizeMotifDimensions(7, 4, 'width', width);
    assert.ok(Math.abs(result.height - width * 4 / 7) <= 0.5);
  }
  for (const height of [4, 5, 7, 20, 100]) {
    const result = resizeMotifDimensions(7, 4, 'height', height);
    assert.ok(Math.abs(result.width - height * 7 / 4) <= 0.5);
  }
});

test('repeated edits against a fixed original ratio do not accumulate rounding drift', () => {
  assert.deepEqual([8, 14, 7, 21].map(width =>
    resizeMotifDimensions(7, 4, 'width', width).height), [5, 8, 4, 12]);
});

test('unlocked resizing keeps the other original dimension', () => {
  assert.deepEqual(resizeMotifDimensions(48, 43, 'width', 100, false), {width: 100, height: 43});
  assert.deepEqual(resizeMotifDimensions(48, 43, 'height', 100, false), {width: 48, height: 100});
});

test('centimeter edits round to whole stitches or rows using the corresponding gauge', () => {
  assert.deepEqual(dimensionsFromCentimeters(48, 43, 'width', 30, gauge), {width: 66, height: 59});
  assert.deepEqual(dimensionsFromCentimeters(48, 43, 'height', 20, gauge), {width: 67, height: 60});
  assert.deepEqual(dimensionsFromCentimeters(48, 43, 'width', 30, gauge, false), {width: 66, height: 43});
  assert.deepEqual(dimensionsFromCentimeters(48, 43, 'height', 20, gauge, false), {width: 48, height: 60});
  assert.deepEqual(dimensionsFromCentimeters(20, 20, 'width', 10.25, {stitches: 20, rows: 30}),
    {width: 21, height: 21});
  const size = calculateMotifSize(48, 43, gauge);
  assert.deepEqual(dimensionsFromCentimeters(48, 43, 'width', size.widthCm, gauge), {width: 48, height: 43});
  assert.deepEqual(dimensionsFromCentimeters(48, 43, 'height', size.heightCm, gauge), {width: 48, height: 43});
});

test('dimensions reject invalid numbers and limits consistently', () => {
  for (const [width, height] of [[3, 4], [4, 3], [201, 4], [4, 241], [4.1, 4],
    [4, 4.1], [NaN, 4], [4, Infinity], ['4', 4], [null, 4]]) {
    assert.throws(() => scaleMotifGrid(uniqueGrid(4, 4), width, height), RangeError);
    assert.throws(() => calculateMotifSize(width, height, gauge), RangeError);
    assert.throws(() => resizeMotifDimensions(width, height, 'width', 10), RangeError);
  }
  for (const value of [0, 3, 201, 4.5, NaN, Infinity, '10', null]) {
    assert.throws(() => resizeMotifDimensions(48, 43, 'width', value), RangeError);
  }
  assert.throws(() => resizeMotifDimensions(48, 43, 'height', 241), RangeError);
});

test('locked resizing throws clear errors instead of clamping and distorting proportions', () => {
  for (const args of [[4, 240, 'width', 200], [200, 4, 'height', 240],
    [200, 4, 'width', 4], [4, 240, 'height', 4]]) {
    assert.throws(() => resizeMotifDimensions(...args), error =>
      error instanceof RangeError && /[\u4e00-\u9fff]/.test(error.message));
  }
  assert.deepEqual(resizeMotifDimensions(4, 4, 'width', 200), {width: 200, height: 200});
  assert.deepEqual(resizeMotifDimensions(4, 4, 'height', 240, false), {width: 4, height: 240});
});

test('invalid gauge, axis, lock option, and centimeter values are rejected', () => {
  for (const invalid of [null, undefined, {}, {stitches: 22}, {stitches: 0, rows: 30},
    {stitches: 22, rows: -1}, {stitches: 0.09, rows: 30}, {stitches: 101, rows: 30},
    {stitches: 22, rows: 100.1}, {stitches: NaN, rows: 30}, {stitches: 22, rows: Infinity},
    {stitches: '22', rows: 30}]) {
    assert.throws(() => calculateMotifSize(48, 43, invalid));
    assert.throws(() => dimensionsFromCentimeters(48, 43, 'width', 20, invalid));
  }
  for (const axis of ['other', '', null, undefined]) {
    assert.throws(() => resizeMotifDimensions(48, 43, axis, 50), RangeError);
    assert.throws(() => dimensionsFromCentimeters(48, 43, axis, 20, gauge), RangeError);
  }
  for (const lock of [null, 0, 1, 'true']) {
    assert.throws(() => resizeMotifDimensions(48, 43, 'width', 50, lock), TypeError);
  }
  for (const cm of [0, -1, NaN, Infinity, '20', null, 0.01, 10000]) {
    assert.throws(() => dimensionsFromCentimeters(48, 43, 'width', cm, gauge), RangeError);
  }
});

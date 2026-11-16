import test from 'node:test';
import assert from 'node:assert/strict';
import { convertImagePixels as convert } from '../dist/core/image-import.js';
const image = (width, height, color) => {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set(color, i * 4);
  return rgba;
};
const rgb = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
const luminance = color => rgb(color).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);

test('image import retains a small dark sheep face among many green shades with six colors', () => {
  const width = 32, height = 40, rgba = image(width, height, [0, 0, 0, 255]);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const shade = (x + y) % 20;
    let color = [45 + shade * 2, 105 + shade * 2, 46 + shade, 255];
    if (x >= 11 && x < 22 && y >= 17 && y < 25) color = [230 + shade % 12, 230 + shade % 12, 210 + shade % 12, 255];
    if (x >= 22 && x < 24 && y >= 19 && y < 22) color = [15, 16, 14, 255];
    rgba.set(color, (y * width + x) * 4);
  }
  const before = rgba.slice();
  const result = convert(rgba, width, height, { width, height, maxColors: 6 });
  assert.ok(luminance(result.grid[19][22]) < 30, 'a small dark face must not become dark green');
  assert.ok(luminance(result.grid[20][15]) > 210, 'wool remains light');
  assert.ok(result.palette.length <= 6);
  assert.deepEqual(rgba, before);
  assert.deepEqual(convert(rgba, width, height, { width, height, maxColors: 6 }), result);
});

test('downsampling keeps a supported dark detail without spreading isolated dark noise', () => {
  const rgba = image(16, 16, [75, 140, 60, 255]);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) rgba.set([10, 10, 10, 255], (y * 16 + x) * 4);
  rgba.set([10, 10, 10, 255], (1 * 16 + 5) * 4);
  const options = { width: 4, height: 4, maxColors: 3 };
  const result = convert(rgba, 16, 16, options);
  assert.equal(result.grid[0][0], '#0a0a0a', 'four source pixels covering a quarter of a stitch remain visible');
  assert.equal(result.grid[0][1], '#4b8c3c', 'one dark noisy pixel must not take over a stitch');
  assert.equal(convert(rgba, 16, 16, { ...options, preserveDetails: false }).grid[0][0], '#4b8c3c');
});

test('transparent and partially transparent pixels composite against the specified background', () => {
  const rgba = image(4, 4, [90, 150, 70, 255]);
  rgba.set([0, 0, 0, 0], 0);
  rgba.set([0, 0, 0, 128], 4);
  const result = convert(rgba, 4, 4, { width: 4, height: 4, maxColors: 6, background: '#ffffff' });
  assert.equal(result.grid[0][0], '#ffffff');
  assert.equal(result.grid[0][1], '#7f7f7f');
  assert.deepEqual(new Set(result.palette), new Set(['#ffffff', '#7f7f7f', '#5a9646']));
});

test('single-color conversion uses the source area mean and all-transparent images stay background-colored', () => {
  const rgba = image(4, 4, [0, 0, 0, 255]);
  rgba.set([255, 255, 255, 255], 0);
  assert.deepEqual(convert(rgba, 4, 4, { width: 4, height: 4, maxColors: 1 }).palette, ['#101010']);
  assert.deepEqual(convert(image(3, 2, [0, 0, 0, 0]), 3, 2, { width: 8, height: 8, background: '#AABBCC' }).palette, ['#aabbcc']);
});

test('noninteger resize ratios and enlargement return only real palette colors without inventing black', () => {
  const rgba = image(7, 5, [70, 130, 60, 255]);
  for (let y = 0; y < 5; y++) for (let x = 4; x < 7; x++) rgba.set([240, 235, 210, 255], (y * 7 + x) * 4);
  for (const [width, height] of [[4, 4], [17, 11]]) {
    const result = convert(rgba, 7, 5, { width, height, maxColors: 6 });
    assert.equal(result.grid.length, height);
    assert.ok(result.grid.every(row => row.length === width));
    assert.deepEqual(new Set(result.palette), new Set(['#46823c', '#f0ebd2']));
    assert.ok(result.grid.flat().every(color => result.palette.includes(color)));
  }
});

test('returned palettes contain only used colors and conversion validates bounded input', () => {
  const rgba = image(16, 16, [70, 130, 60, 255]);
  rgba.set([0, 0, 0, 255], 0);
  const options = { width: 4, height: 4, maxColors: 6 };
  const result = convert(rgba, 16, 16, options);
  assert.deepEqual(result.palette, ['#46823c']);
  for (const overrides of [{ width: 3 }, { height: 241 }, { width: 4.5 }, { maxColors: 0 }, { maxColors: 33 }, { background: 'black' }, { preserveDetails: 'yes' }]) {
    assert.throws(() => convert(rgba, 16, 16, { ...options, ...overrides }));
  }
  assert.throws(() => convert([], 16, 16, options));
  assert.throws(() => convert(rgba, 0, 16, options));
  assert.throws(() => convert(rgba, 15, 16, options));
  assert.throws(() => convert(new Uint8Array(1), 1025, 1024, options));
});

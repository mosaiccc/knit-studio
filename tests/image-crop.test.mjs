import test from 'node:test';
import assert from 'node:assert/strict';

const crop = await import('../dist/core/image-crop.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const close = (actual, expected) => {
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-10, `${key}: ${actual[key]} != ${expected[key]}`);
};

test('normalizeCrop defaults to the whole image and clips all edges without mutating input', () => {
  assert.equal(typeof crop.normalizeCrop, 'function');
  assert.deepEqual(crop.normalizeCrop(), { x: 0, y: 0, width: 1, height: 1 });
  const initial = { x: -.2, y: .8, width: .5, height: .4 };
  close(crop.normalizeCrop(initial), { x: 0, y: .8, width: .3, height: .2 });
  assert.equal(initial.x, -.2);
  close(crop.normalizeCrop({ x: .7, y: .8, width: -.4, height: -.5 }), { x: .3, y: .3, width: .4, height: .5 });
});

test('minimum crop size holds at boundaries and invalid coordinates are rejected', () => {
  assert.equal(typeof crop.normalizeCrop, 'function');
  close(crop.normalizeCrop({ x: 2, y: 2, width: 0, height: 0 }, .01, .02), { x: .99, y: .98, width: .01, height: .02 });
  assert.throws(() => crop.normalizeCrop({ x: NaN, y: 0, width: 1, height: 1 }), /finite|有限/);
  assert.throws(() => crop.normalizeCrop(null, 0), RangeError);
});

test('cropFromPoints accepts reverse drags and clips pointer coordinates to the image', () => {
  assert.equal(typeof crop.cropFromPoints, 'function');
  close(crop.cropFromPoints({ x: .8, y: .9 }, { x: .2, y: .3 }), { x: .2, y: .3, width: .6, height: .6 });
  close(crop.cropFromPoints({ x: -.3, y: -.2 }, { x: .2, y: 2 }), { x: 0, y: 0, width: .2, height: 1 });
  close(crop.cropFromPoints({ x: 1, y: 1 }, { x: 1, y: 1 }, .01, .02), { x: .99, y: .98, width: .01, height: .02 });
});

test('moveCrop clamps translation while preserving selection dimensions', () => {
  assert.equal(typeof crop.moveCrop, 'function');
  const original = { x: .2, y: .3, width: .4, height: .5 };
  close(crop.moveCrop(original, .8, -.9), { x: .6, y: 0, width: .4, height: .5 });
  assert.deepEqual(original, { x: .2, y: .3, width: .4, height: .5 });
});

test('resizeCrop keeps the opposite edge anchored for all eight handles', () => {
  assert.equal(typeof crop.resizeCrop, 'function');
  const original = { x: .2, y: .3, width: .4, height: .5 };
  close(crop.resizeCrop(original, 'nw', { x: .1, y: .2 }), { x: .1, y: .2, width: .5, height: .6 });
  close(crop.resizeCrop(original, 'se', { x: .9, y: .9 }), { x: .2, y: .3, width: .7, height: .6 });
  close(crop.resizeCrop(original, 'e', { x: .9, y: 0 }), { x: .2, y: .3, width: .7, height: .5 });
  close(crop.resizeCrop(original, 'n', { x: 0, y: .1 }), { x: .2, y: .1, width: .4, height: .7 });
  for (const handle of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    const result = crop.resizeCrop(original, handle, { x: .4, y: .4 });
    assert.ok(result.width > 0 && result.height > 0 && result.x >= 0 && result.y >= 0);
  }
  assert.throws(() => crop.resizeCrop(original, 'bad', { x: .4, y: .4 }), RangeError);
});

test('resizing cannot invert or shrink a selection below one source pixel', () => {
  assert.equal(typeof crop.resizeCrop, 'function');
  close(crop.resizeCrop({ x: .2, y: .3, width: .4, height: .5 }, 'nw', { x: 1, y: 1 }, .01, .02), { x: .59, y: .78, width: .01, height: .02 });
  close(crop.resizeCrop({ x: .2, y: .3, width: .4, height: .5 }, 'se', { x: -1, y: -1 }, .01, .02), { x: .2, y: .3, width: .01, height: .02 });
});

test('cropToPixels rounds image boundaries and always returns a bounded nonempty rectangle', () => {
  assert.equal(typeof crop.cropToPixels, 'function');
  assert.deepEqual(crop.cropToPixels({ x: .2, y: .25, width: .4, height: .5 }, 100, 200), { x: 20, y: 50, width: 40, height: 100 });
  assert.deepEqual(crop.cropToPixels(null, 101, 99), { x: 0, y: 0, width: 101, height: 99 });
  assert.deepEqual(crop.cropToPixels({ x: 1, y: 1, width: 0, height: 0 }, 101, 99), { x: 100, y: 98, width: 1, height: 1 });
  assert.deepEqual(crop.cropToPixels({ x: .001, y: .001, width: .001, height: .001 }, 1, 1), { x: 0, y: 0, width: 1, height: 1 });
  for (const width of [0, -1, 2.5, Infinity]) assert.throws(() => crop.cropToPixels(null, width, 20), RangeError);
});

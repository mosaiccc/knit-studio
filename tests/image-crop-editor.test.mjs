import test from 'node:test';
import assert from 'node:assert/strict';

const crop = await import('../dist/image-crop-editor.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const initial = { x: .2, y: .3, width: .4, height: .5 };
const close = (actual, expected) => {
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-10, `${key}: ${actual[key]} != ${expected[key]}`);
};
function setup(tool = 'select', original = initial) {
  assert.equal(typeof crop.bindCropEditor, 'function');
  let value = structuredClone(original), currentTool = tool, captured = null, focused = null;
  const handlers = new Map(), attributes = new Map(), commits = [], changes = [], errors = [];
  const target = dataset => ({ dataset, focus() { focused = this; }, closest(selector) { return Object.keys(dataset).some(key => selector.includes(key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`))) ? this : null; } });
  const surface = target({ cropSurface: '' }), selection = target({ cropSelection: '' }), handle = key => target({ cropHandle: key });
  const svg = {
    contains: () => true, focus: () => { focused = svg; },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, next) => attributes.set(name, next), removeAttribute: name => attributes.delete(name),
    getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }),
    setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id,
    releasePointerCapture: () => { captured = null; },
    addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: type => handlers.delete(type),
  };
  const binding = crop.bindCropEditor(svg, { width: 100, height: 200, getCrop: () => value, getTool: () => currentTool,
    onChange: next => { value = next; changes.push(next); }, onCommit: next => commits.push(next), onError: error => errors.push(error) });
  function fire(type, x = .2, y = .3, extra = {}) {
    let stopped = false;
    handlers.get(type)?.({ target: surface, button: 0, isPrimary: true, pointerId: 1, clientX: x * 100, clientY: y * 200,
      preventDefault() { stopped = true; }, stopPropagation() {}, ...extra });
    return stopped;
  }
  return { binding, fire, surface, selection, handle, svg, handlers, commits, changes, errors,
    value: () => value, captured: () => captured, focused: () => focused, setTool: next => { currentTool = next; } };
}

test('crop overlay includes the outside shade, selection and eight accessible resizing handles', () => {
  assert.equal(typeof crop.renderCropOverlay, 'function');
  const html = crop.renderCropOverlay(initial, { width: 100, height: 200 });
  assert.match(html, /data-crop-surface/); assert.match(html, /data-crop-selection/);
  assert.equal((html.match(/data-crop-handle=/g) || []).length, 8);
  assert.match(html, /fill-rule="evenodd"/); assert.match(html, /aria-label="调整选区左上角"/);
  assert.match(html, /tabindex="0"/);
});

test('drag selection uses release coordinates and emits exactly one final commit', () => {
  const h = setup(); h.fire('pointerdown', .8, .9); h.fire('pointermove', .5, .5); h.fire('pointerup', .1, .2);
  close(h.value(), { x: .1, y: .2, width: .7, height: .7 });
  assert.equal(h.commits.length, 1); assert.equal(h.captured(), null);
  h.fire('lostpointercapture'); assert.equal(h.commits.length, 1);
});

test('the default select tool redraws even when starting inside the prior selection', () => {
  const h = setup(); h.fire('pointerdown', .3, .4, { target: h.selection }); h.fire('pointerup', .5, .7);
  close(h.value(), { x: .3, y: .4, width: .2, height: .3 });
});

test('move tool preserves dimensions, clips movement, and starts a new selection outside the old one', () => {
  const h = setup('move'); h.fire('pointerdown', .4, .5, { target: h.selection }); h.fire('pointerup', 1.8, -1);
  close(h.value(), { x: .6, y: 0, width: .4, height: .5 });
  h.fire('pointerdown', .1, .7); h.fire('pointerup', .3, .9);
  close(h.value(), { x: .1, y: .7, width: .2, height: .2 });
});

test('resize handles take priority in either tool and clamp beyond image bounds', () => {
  for (const tool of ['select', 'move']) {
    const h = setup(tool); h.fire('pointerdown', .6, .8, { target: h.handle('se') }); h.fire('pointerup', 2, 2);
    close(h.value(), { x: .2, y: .3, width: .8, height: .7 });
    assert.equal(h.commits.length, 1);
  }
});

test('clicking without a drag leaves the prior crop intact and does not commit', () => {
  const h = setup(); h.fire('pointerdown', .5, .6); h.fire('pointerup', .5, .6);
  assert.deepEqual(h.value(), initial); assert.equal(h.commits.length, 0);
});

test('Escape, pointer cancellation and destroy restore the pre-drag crop', () => {
  for (const method of ['escape', 'pointercancel', 'cancelPending', 'destroy']) {
    const h = setup(); h.fire('pointerdown', .1, .1); h.fire('pointermove', .4, .5);
    if (method === 'escape') h.fire('keydown', 0, 0, { key: 'Escape' });
    else if (method === 'pointercancel') h.fire(method);
    else h.binding[method]();
    assert.deepEqual(h.value(), initial); assert.equal(h.commits.length, 0); assert.equal(h.captured(), null);
    if (method === 'destroy') assert.equal(h.handlers.size, 0);
  }
});

test('unrelated pointers and clicks outside the image cannot interfere with an active selection', () => {
  const h = setup(); assert.equal(h.fire('pointerdown', -1, -1), false);
  h.fire('pointerdown', .1, .2); h.fire('pointerup', .9, .9, { pointerId: 2 });
  h.fire('pointercancel', .1, .1, { pointerId: 2 }); assert.equal(h.captured(), 1);
  h.fire('pointerup', .5, .7); close(h.value(), { x: .1, y: .2, width: .4, height: .5 });
});

test('arrow keys move the selection or resize a focused handle in source pixel steps', () => {
  const h = setup(); h.fire('keydown', 0, 0, { target: h.selection, key: 'ArrowRight' });
  close(h.value(), { x: .21, y: .3, width: .4, height: .5 });
  h.fire('keydown', 0, 0, { target: h.handle('n'), key: 'ArrowDown', shiftKey: true });
  close(h.value(), { x: .21, y: .35, width: .4, height: .45 });
  assert.equal(h.commits.length, 2);
});

test('clicking a resize handle focuses it so subsequent arrow keys resize instead of moving the crop', () => {
  const h = setup(), handle = h.handle('se');
  h.fire('pointerdown', .6, .8, { target: handle }); h.fire('pointerup', .6, .8, { target: handle });
  assert.equal(h.focused(), handle);
  h.fire('keydown', 0, 0, { target: h.focused(), key: 'ArrowRight' });
  close(h.value(), { x: .2, y: .3, width: .41, height: .5 });
  assert.equal(h.commits.length, 1);
});

test('changing tools mid-drag cancels and binding cleanup restores SVG keyboard attributes', () => {
  const h = setup(); assert.equal(h.svg.getAttribute('tabindex'), '0');
  h.fire('pointerdown', .1, .1); h.fire('pointermove', .4, .4); h.setTool('move'); h.fire('pointerup', .8, .8);
  assert.deepEqual(h.value(), initial); assert.equal(h.commits.length, 0);
  h.binding.destroy(); assert.equal(h.svg.getAttribute('tabindex'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../dist/drawing-editor.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const line = (x1 = .1, y1 = .2, x2 = .7, y2 = .2) => ({ kind: 'line', x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 });
const arc = () => ({ kind: 'arc', x1: .1, y1: .2, x2: .7, y2: .2, cx: .4, cy: .8 });
const box = { x: 10, y: 20, width: 100, height: 200 };
function setup(tool = 'line', initial = { segments: [] }, callbacks = {}) {
  assert.equal(typeof module.bindDrawingEditor, 'function');
  const handlers = new Map(), events = [], errors = [], previews = [], attributes = new Map();
  let value = structuredClone(initial), currentTool = tool, captured = null;
  const target = (dataset) => ({ dataset, closest(selector) {
    return Object.keys(this.dataset).some(key => selector.includes(key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`))) ? this : null;
  } });
  const surface = target({ drawingSurface: '' });
  const outside = target({ dimensionAnnotation: '' });
  const segment = index => target({ drawingSegment: String(index) });
  const endpoint = (index, end) => target({ drawingEndpoint: end, drawingSegmentIndex: String(index) });
  const control = index => target({ drawingControl: String(index) });
  const svg = {
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name),
    contains: () => true,
    getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }),
    setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id,
    releasePointerCapture: () => { captured = null; },
    addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: type => handlers.delete(type),
  };
  const binding = module.bindDrawingEditor(svg, {
    box, getDrawing: () => value, getTool: () => currentTool,
    onSelect: (index, kind) => { events.push(['select', index, kind]); callbacks.onSelect?.(index, kind); },
    onStart: () => events.push(['start']),
    onChange: next => { value = next; events.push(['change']); },
    onCommit: next => events.push(['commit', next]),
    onCancel: original => { value = original; events.push(['cancel']); },
    onPreview: preview => previews.push(preview), onError: error => errors.push(error),
  });
  function fire(type, x = .1, y = .2, extra = {}) {
    let stopped = false;
    handlers.get(type)?.({ target: surface, button: 0, isPrimary: true, pointerId: 1,
      clientX: box.x + x * box.width, clientY: box.y + y * box.height,
      preventDefault() { stopped = true; }, stopPropagation() {}, ...extra });
    return stopped;
  }
  function click(x, y, extra = {}) { fire('pointerdown', x, y, extra); fire('pointerup', x, y, extra); }
  return { binding, fire, click, events, errors, previews, handlers, svg, surface, outside, segment, endpoint, control,
    value: () => value, captured: () => captured, setTool: next => { currentTool = next; } };
}
const count = (h, name) => h.events.filter(event => event[0] === name).length;

test('overlay renders drawing bounds, every segment, open ends and accessible selected handles', () => {
  assert.equal(typeof module.renderDrawingOverlay, 'function');
  const html = module.renderDrawingOverlay({ segments: [line(), arc()] }, box, 1, { segments: [line(.2, .3, .5, .6)], points: [] });
  assert.match(html, /data-drawing-surface/);
  assert.equal((html.match(/data-drawing-segment=/g) || []).length, 2);
  assert.match(html, /data-drawing-endpoint="start"/);
  assert.match(html, /data-drawing-endpoint="end"/);
  assert.match(html, /data-drawing-control="1"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /data-drawing-preview/);
  const open = module.renderDrawingOverlay({ segments: [line()] }, box);
  assert.equal((open.match(/data-drawing-open-end/g) || []).length, 2);
  assert.match(open, /data-drawing-open-end[^>]*data-drawing-endpoint="start"[^>]*pointer-events="all"/);
});

test('dragged line reads pointerup coordinates, clamps bounds and commits one undoable change', () => {
  const h = setup(); h.fire('pointerdown'); h.fire('pointermove', .5, .4);
  assert.equal(h.value().segments.length, 0);
  assert.equal(count(h, 'start'), 0);
  h.fire('pointerup', 1.4, .6);
  assert.deepEqual(h.value().segments, [line(.1, .2, 1, .6)]);
  assert.deepEqual(h.events.filter(e => e[0] !== 'select').map(e => e[0]), ['start', 'change', 'commit']);
  assert.equal(h.captured(), null);
  assert.equal(h.previews.at(-1), null);
});

test('two clicks create a line while a first click alone is cancellable without writing', () => {
  const h = setup(); h.click(.1, .2); h.fire('pointermove', .7, .2);
  assert.equal(h.value().segments.length, 0);
  assert.equal(h.previews.at(-1).segments[0].x2, .7);
  h.click(.7, .2);
  assert.deepEqual(h.value().segments, [line()]); assert.equal(count(h, 'commit'), 1);
  h.click(.3, .4); h.fire('keydown', 0, 0, { key: 'Escape' });
  assert.equal(count(h, 'commit'), 1); assert.equal(h.previews.at(-1), null);
});

test('three clicks create a quadratic arc with its third point as the control', () => {
  const h = setup('arc'); h.click(.1, .2); h.click(.7, .2); h.fire('pointermove', .4, .8);
  assert.equal(h.value().segments.length, 0);
  assert.deepEqual(h.previews.at(-1).segments, [arc()]);
  h.click(.4, .8);
  assert.deepEqual(h.value().segments, [arc()]); assert.equal(count(h, 'commit'), 1);
});

test('pen drag simplifies collinear points and commits only on release', () => {
  const h = setup('pen'); h.fire('pointerdown', .1, .2);
  for (const x of [.2, .3, .4, .5, .6]) h.fire('pointermove', x, .2);
  assert.equal(h.value().segments.length, 0);
  h.fire('pointerup', .7, .2);
  assert.deepEqual(h.value().segments, [line()]); assert.equal(count(h, 'commit'), 1);
});

test('erase removes only the selected segment, retaining the gap', () => {
  const second = line(.7, .2, .7, .8), h = setup('erase', { segments: [line(), second] });
  h.click(.4, .2, { target: h.segment(0) });
  assert.deepEqual(h.value().segments, [second]); assert.equal(count(h, 'commit'), 1);
});

test('endpoint drag is one transaction, uses final coordinates and updates connected ends', () => {
  const h = setup('select', { segments: [line(), line(.7, .2, .7, .8)] });
  const target = h.endpoint(0, 'end');
  h.fire('pointerdown', .7, .2, { target }); h.fire('pointermove', .6, .3, { target });
  h.fire('pointerup', .5, .4, { target });
  assert.equal(h.value().segments[0].x2, .5); assert.ok(Math.abs(h.value().segments[0].y2 - .4) < 1e-12);
  assert.equal(h.value().segments[1].x1, .5); assert.equal(count(h, 'start'), 1); assert.equal(count(h, 'commit'), 1);
  h.fire('lostpointercapture'); assert.equal(count(h, 'cancel'), 0);
});

test('pointer cancellation, Escape and destroy restore original dragged geometry', () => {
  for (const action of ['pointercancel', 'Escape', 'destroy', 'cancelPending']) {
    const original = { segments: [arc()] }, h = setup('select', original), target = h.control(0);
    h.fire('pointerdown', .4, .8, { target }); h.fire('pointermove', .6, .6, { target });
    if (action === 'destroy' || action === 'cancelPending') h.binding[action]();
    else if (action === 'Escape') h.fire('keydown', 0, 0, { key: action });
    else h.fire(action);
    assert.deepEqual(h.value(), original); assert.equal(count(h, 'commit'), 0); assert.equal(count(h, 'cancel'), 1);
    assert.equal(h.captured(), null);
    if (action === 'destroy') assert.equal(h.handlers.size, 0);
  }
});

test('unrelated pointers cannot move, finish or cancel active strokes', () => {
  const h = setup(); h.fire('pointerdown'); h.fire('pointermove', .5, .5, { pointerId: 2 });
  h.fire('pointerup', .7, .7, { pointerId: 2 }); h.fire('pointercancel', 0, 0, { pointerId: 2 });
  assert.equal(count(h, 'commit'), 0); assert.equal(h.captured(), 1);
  h.fire('pointerup', .7, .2); assert.deepEqual(h.value().segments, [line()]);
});

test('tool changes cancel pending clicks and active drags instead of committing them', () => {
  const h = setup(); h.click(.1, .2); h.setTool('arc'); h.click(.7, .2); h.click(.4, .8);
  assert.equal(h.value().segments.length, 0);
  h.binding.cancelPending(); assert.equal(h.previews.at(-1), null);
  const edit = setup('select', { segments: [arc()] }), target = edit.control(0);
  edit.fire('pointerdown', .4, .8, { target }); edit.fire('pointermove', .3, .3, { target });
  edit.setTool('line'); edit.fire('pointerup', .2, .2, { target });
  assert.deepEqual(edit.value().segments, [arc()]); assert.equal(count(edit, 'commit'), 0);
});

test('finishStroke commits a live drag but drops incomplete click drawings', () => {
  const h = setup(); h.fire('pointerdown'); h.fire('pointermove', .7, .2);
  h.binding.finishStroke(); h.binding.finishStroke();
  assert.deepEqual(h.value().segments, [line()]); assert.equal(count(h, 'commit'), 1);
  h.click(.4, .5); h.binding.finishStroke(); h.click(.2, .6);
  assert.equal(count(h, 'commit'), 1);
  h.binding.destroy();
});

test('finishStroke cancels a second click that has not been released or dragged', () => {
  const h = setup(); h.click(.1, .2); h.fire('pointerdown', .7, .2); h.binding.finishStroke();
  assert.equal(h.value().segments.length, 0); assert.equal(count(h, 'commit'), 0);
  assert.equal(h.previews.at(-1), null);
});

test('restoring focus after a live render cannot repeatedly select and rerender the same handle', () => {
  let notifications = 0;
  const h = setup('select', { segments: [line()] }, { onSelect() {
    notifications++;
    if (notifications < 5) h.fire('focusin', 0, 0, { target: h.endpoint(0, 'start') });
  } });
  h.fire('focusin', 0, 0, { target: h.endpoint(0, 'start') });
  assert.equal(notifications, 1);
});

test('root SVG is focusable while editing and restores its original focus behavior on destroy', () => {
  const h = setup(); assert.equal(h.svg.getAttribute('tabindex'), '0');
  h.binding.destroy(); assert.equal(h.svg.getAttribute('tabindex'), null);
});

test('boundary segment hit areas remain usable slightly outside the drawing rectangle', () => {
  const original = { segments: [line(0, 0, 0, 1)] }, erase = setup('erase', original);
  erase.click(-.02, .5, { target: erase.segment(0) });
  assert.equal(erase.value().segments.length, 0);
  const h = setup('select', original), target = h.endpoint(0, 'start');
  h.fire('pointerdown', -.01, -.01, { target }); h.fire('pointerup', .1, .2, { target });
  assert.equal(h.value().segments[0].x1, .1); assert.equal(h.value().segments[0].y1, .2);
});

test('clicking the outer halves of visible open endpoints can close a missing boundary line', () => {
  const h = setup('line', { segments: [line(0, 0, 0, 1), line(0, 1, 1, 1), line(1, 1, 1, 0)] });
  h.click(.001, -.002, { target: h.endpoint(0, 'start') });
  assert.equal(h.previews.at(-1).points.length, 1);
  h.click(.999, -.002, { target: h.endpoint(2, 'end') });
  assert.deepEqual(h.value().segments.at(-1), line(0, 0, 1, 0));
  assert.equal(count(h, 'commit'), 1);
});

test('Delete removes selection and arrow keys adjust a focused endpoint within bounds', () => {
  const h = setup('select', { segments: [line()] });
  h.click(.4, .2, { target: h.segment(0) });
  h.fire('keydown', 0, 0, { target: h.endpoint(0, 'start'), key: 'ArrowRight' });
  assert.equal(h.value().segments[0].x1, .11);
  h.fire('keydown', 0, 0, { target: h.surface, key: 'Delete' });
  assert.equal(h.value().segments.length, 0); assert.equal(count(h, 'commit'), 2);
});

test('dimension annotations and clicks beyond the drawing bounds are left untouched', () => {
  const h = setup();
  assert.equal(h.fire('pointerdown', .5, .5, { target: h.outside }), false);
  assert.equal(h.fire('pointerdown', -1, .5), false);
  assert.equal(count(h, 'start'), 0); assert.equal(h.captured(), null);
});

test('invalid strokes report errors without mutating the original drawing', () => {
  const original = { segments: Array.from({ length: 80 }, (_, i) => line(.1, i / 100, .7, i / 100)) };
  const h = setup('line', original); h.fire('pointerdown', .2, .9); h.fire('pointerup', .8, .9);
  assert.deepEqual(h.value(), original); assert.equal(count(h, 'commit'), 0);
  assert.equal(h.errors.length, 1); assert.equal(h.captured(), null);
});

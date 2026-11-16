import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../dist/outline-editor.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const square = () => ({ nodes: [
  { x: 0, y: 0, cx: .5, cy: 0 }, { x: 1, y: 0, cx: 1, cy: .5 },
  { x: 1, y: 1, cx: .5, cy: 1 }, { x: 0, y: 1, cx: 0, cy: .5 },
] });
function setup(kind = 'control') {
  assert.equal(typeof module.bindOutlineEditor, 'function');
  const handlers = new Map(), events = [];
  let value = square(), captured = false;
  const target = { dataset: { [kind === 'control' ? 'outlineControl' : 'outlineNode']: '0' }, closest() { return this; } };
  const svg = {
    contains: element => element === target,
    getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }),
    setPointerCapture: () => { captured = true; }, hasPointerCapture: () => captured,
    releasePointerCapture: () => { captured = false; },
    addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: type => handlers.delete(type),
  };
  const binding = module.bindOutlineEditor(svg, {
    box: { x: 10, y: 20, width: 100, height: 200 }, getOutline: () => value,
    onSelect: () => events.push('select'), onStart: () => events.push('start'),
    onChange: next => { value = next; events.push('change'); },
    onCommit: () => events.push('commit'),
    onCancel: original => { value = original; events.push('cancel'); },
  });
  function fire(type, extra = {}) {
    handlers.get(type)?.({ target, button: 0, isPrimary: true, pointerId: 1, clientX: 60, clientY: 20,
      preventDefault() {}, stopPropagation() {}, ...extra });
  }
  return { binding, fire, events, handlers, value: () => value, captured: () => captured };
}

test('outline controls distinguish node and curve handles and selected edges', () => {
  assert.equal(typeof module.renderOutlineControls, 'function');
  const html = module.renderOutlineControls(square(), { x: 10, y: 20, width: 100, height: 200 }, 0);
  assert.match(html, /data-outline-node="0"/);
  assert.match(html, /data-outline-control="0"/);
  assert.match(html, /data-outline-edge="0"/);
  assert.match(html, /aria-label=".*弧度/);
  assert.equal((html.match(/data-outline-node=/g) || []).length, 4);
});
test('curve drag uses final pointerup coordinates and commits once', () => {
  const h = setup();
  h.fire('pointerdown'); h.fire('pointermove', { clientY: 60 }); h.fire('pointerup', { clientY: 100 });
  assert.equal(h.value().nodes[0].cy, .4);
  assert.equal(h.events.filter(e => e === 'commit').length, 1);
  assert.equal(h.captured(), false);
  h.fire('lostpointercapture');
  assert.equal(h.events.filter(e => e === 'cancel').length, 0);
});
test('unrelated pointers cannot mutate a contour drag', () => {
  const h = setup(); h.fire('pointerdown'); h.fire('pointermove', { pointerId: 2, clientY: 120 });
  assert.equal(h.value().nodes[0].cy, 0);
  h.fire('pointerup', { pointerId: 2 });
  assert.equal(h.events.includes('commit'), false);
  h.fire('pointercancel');
});
test('cancel and destroy restore the pre-drag shape without a save', () => {
  for (const action of ['pointercancel', 'destroy']) {
    const h = setup(); h.fire('pointerdown'); h.fire('pointermove', { clientY: 100 });
    if (action === 'destroy') h.binding.destroy(); else h.fire(action);
    assert.deepEqual(h.value(), square()); assert.equal(h.events.includes('commit'), false);
    assert.equal(h.events.filter(e => e === 'cancel').length, 1);
    if (action === 'destroy') assert.equal(h.handlers.size, 0);
  }
});
test('finishing a pending drag commits once before a view switch', () => {
  const h = setup(); h.fire('pointerdown'); h.fire('pointermove', { clientY: 70 });
  h.binding.finishStroke(); h.binding.finishStroke(); h.binding.destroy();
  assert.equal(h.value().nodes[0].cy, .25);
  assert.equal(h.events.filter(e => e === 'commit').length, 1);
});
test('keyboard arrows move a focused node, bounded by the piece dimensions', () => {
  const h = setup('node'); h.fire('keydown', { key: 'ArrowRight' });
  assert.equal(h.value().nodes[0].x, .01);
  assert.equal(h.events.filter(e => e === 'commit').length, 1);
  h.fire('keydown', { key: 'ArrowUp' }); assert.equal(h.value().nodes[0].y, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';

const ui = await import('../dist/motif-settings.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

function setup({ width = 48, height = 43, gauge = { stitches: 22, rows: 30 }, locked = true } = {}) {
  assert.equal(typeof ui.bindMotifSettings, 'function');
  const grid = Array.from({ length: height }, () => Array(width).fill('#123456'));
  const original = structuredClone(grid), calls = [], locks = [];
  const ids = ['grid-width', 'grid-height', 'grid-width-cm', 'grid-height-cm', 'grid-lock-ratio', 'resize-grid', 'grid-size-status'];
  const nodes = Object.fromEntries(ids.map(id => {
    const handlers = new Map(), attributes = new Map(), classes = new Set();
    return [id, { id, value: '', checked: locked, disabled: false, textContent: '',
      handlers, attributes, classes,
      addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(handler); },
      removeEventListener(type, handler) { handlers.set(type, (handlers.get(type) || []).filter(item => item !== handler)); },
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name),
      classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    }];
  }));
  const root = { querySelector: selector => nodes[selector.slice(1)] || null };
  const binding = ui.bindMotifSettings(root, { grid, gauge, locked, onApply: (w, h) => calls.push([w, h]), onLockChange: value => locks.push(value) });
  function fire(id, type, value) {
    const node = nodes[id];
    if (value !== undefined) node.value = String(value);
    for (const handler of node.handlers.get(type) || []) handler({ target: node, preventDefault() {} });
  }
  return { nodes, grid, original, calls, locks, binding, fire, width: () => Number(nodes['grid-width'].value), height: () => Number(nodes['grid-height'].value) };
}

test('canvas settings show both count axes, physical dimensions, shared gauge and locked proportion', () => {
  assert.equal(typeof ui.motifSettingsHTML, 'function');
  const html = ui.motifSettingsHTML(Array.from({ length: 43 }, () => Array(48).fill('#123456')), { stitches: 22, rows: 30 });
  for (const id of ['grid-width', 'grid-height', 'grid-width-cm', 'grid-height-cm', 'grid-lock-ratio', 'grid-size-status']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /21\.82/); assert.match(html, /14\.33/); assert.match(html, /22 针/); assert.match(html, /30 行/);
  assert.match(html, /id="grid-lock-ratio"[^>]*checked/);
});

test('count inputs update both axes from the original ratio without applying or mutating the motif', () => {
  const h = setup();
  h.fire('grid-width', 'input', 96);
  assert.equal(h.width(), 96); assert.equal(h.height(), 86);
  h.fire('grid-width', 'input', 60);
  assert.equal(h.height(), 54);
  h.fire('grid-height', 'input', 43);
  assert.equal(h.width(), 48);
  assert.equal(h.calls.length, 0); assert.deepEqual(h.grid, h.original);
  h.fire('resize-grid', 'click'); assert.deepEqual(h.calls, [[48, 43]]);
});

test('centimeter inputs keep the typed text until committed and report rounded real dimensions', () => {
  const h = setup();
  h.fire('grid-width-cm', 'input', '20.');
  assert.equal(h.nodes['grid-width-cm'].value, '20.');
  assert.equal(h.width(), 44); assert.equal(h.height(), 39);
  assert.equal(Number(h.nodes['grid-height-cm'].value), 13);
  h.fire('grid-width-cm', 'input', '20.25');
  assert.equal(h.nodes['grid-width-cm'].value, '20.25');
  assert.equal(h.width(), 45); assert.equal(h.height(), 40);
  assert.match(h.nodes['grid-size-status'].textContent, /20\.45/);
  h.fire('grid-width-cm', 'change');
  assert.equal(Number(h.nodes['grid-width-cm'].value), 20.45);
  h.fire('resize-grid', 'click'); assert.deepEqual(h.calls, [[45, 40]]);
});

test('unlocked axes retain each pending dimension, then locking returns to the applied source ratio', () => {
  const h = setup();
  h.nodes['grid-lock-ratio'].checked = false; h.fire('grid-lock-ratio', 'change');
  h.fire('grid-width', 'input', 70); h.fire('grid-height', 'input', 80);
  assert.equal(h.width(), 70); assert.equal(h.height(), 80);
  h.nodes['grid-lock-ratio'].checked = true; h.fire('grid-lock-ratio', 'change');
  assert.equal(h.width(), 89); assert.equal(h.height(), 80);
  assert.deepEqual(h.locks, [false, true]);
});

test('empty, decimal count, and oversized proportional inputs block apply until corrected', () => {
  const h = setup({ width: 20, height: 40 });
  for (const input of ['', '20.5', '200']) {
    h.fire('grid-width', 'input', input);
    assert.equal(h.nodes['resize-grid'].disabled, true);
    assert.equal(h.nodes['grid-width'].attributes.get('aria-invalid'), 'true');
    h.fire('resize-grid', 'click'); assert.equal(h.calls.length, 0);
    h.fire('grid-width', 'input', 40);
    assert.equal(h.nodes['resize-grid'].disabled, false);
    assert.equal(h.height(), 80);
  }
  h.fire('resize-grid', 'click'); assert.deepEqual(h.calls, [[40, 80]]);
});

test('editing another field does not silently discard an invalid field and apply stale dimensions', () => {
  const h = setup();
  h.fire('grid-width', 'input', '');
  h.fire('grid-height', 'input', 86);
  assert.equal(h.nodes['grid-width'].value, '');
  assert.equal(h.nodes['resize-grid'].disabled, true);
  h.fire('resize-grid', 'click'); assert.equal(h.calls.length, 0);
  h.fire('grid-width', 'input', 96);
  assert.equal(h.nodes['resize-grid'].disabled, false);
  h.fire('resize-grid', 'click'); assert.deepEqual(h.calls, [[96, 86]]);
});

test('unequal gauge converts vertical centimeters through row density and supports binding cleanup', () => {
  const h = setup({ width: 32, height: 40, gauge: { stitches: 20, rows: 32 } });
  h.fire('grid-height-cm', 'input', 25);
  assert.equal(h.height(), 80); assert.equal(h.width(), 64);
  assert.equal(Number(h.nodes['grid-width-cm'].value), 32);
  h.binding.destroy();
  h.fire('resize-grid', 'click'); assert.equal(h.calls.length, 0);
});

test('focusing and leaving an untouched rounded companion field does not change the chosen size', () => {
  const h = setup();
  h.fire('grid-width', 'input', 5);
  assert.equal(h.width(), 5); assert.equal(h.height(), 4);
  h.fire('grid-height', 'blur');
  assert.equal(h.width(), 5); assert.equal(h.height(), 4);
});

test('an out-of-bounds ratio after enabling the lock recovers when the edited dimension is corrected', () => {
  const h = setup({locked: false});
  h.fire('grid-height', 'input', 240);
  h.nodes['grid-lock-ratio'].checked = true; h.fire('grid-lock-ratio', 'change');
  assert.equal(h.nodes['resize-grid'].disabled, true);
  h.fire('grid-height', 'input', 86);
  assert.equal(h.nodes['resize-grid'].disabled, false);
  h.fire('resize-grid', 'click'); assert.deepEqual(h.calls, [[96, 86]]);
});

test('binding is harmless when the pattern settings are absent on another page', () => {
  assert.equal(typeof ui.bindMotifSettings, 'function');
  assert.doesNotThrow(() => ui.bindMotifSettings({ querySelector: () => null }, { grid: [], gauge: {} }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAnnotations, bindAnnotationCanvas } from '../dist/annotations.js';

const label = { id: 'note-1', garmentId: 'round-front', x: 0.5, y: 0.4, text: '领口预留', fontSize: 14, color: '#824859' };

test('annotation rendering filters labels to the active garment and preserves normalized coordinates', () => {
  const source = [label, { ...label, id: 'back-note', garmentId: 'round-back', text: '后片专用' }];
  const original = structuredClone(source);
  const svg = renderAnnotations(source, 'round-front');
  assert.match(svg, /data-annotation-id="note-1"/);
  assert.match(svg, /id="annotation-note-1"/);
  assert.match(svg, /transform="translate\(140 124\)"/);
  assert.match(svg, /data-x="0\.5" data-y="0\.4"/);
  assert.doesNotMatch(svg, /后片专用|back-note/);
  assert.doesNotMatch(svg, /<svg/);
  assert.deepEqual(source, original);
});

test('text, annotation IDs and accessible descriptions are XML escaped', () => {
  const svg = renderAnnotations([{ ...label, id: 'a"&<', text: '<script>"hello" & \'world\'</script>' }], 'round-front', null, true);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;&quot;hello&quot; &amp; &apos;world&apos;&lt;\/script&gt;/);
  assert.match(svg, /data-annotation-id="a&quot;&amp;&lt;"/);
  assert.match(svg, /aria-label="编辑注释：&lt;script&gt;/);
});

test('multiline annotations retain blank lines with 1.25 line spacing and centered text', () => {
  const svg = renderAnnotations([{ ...label, text: '第一行\r\n\r\n第三行', fontSize: 16 }], 'round-front');
  assert.equal((svg.match(/<tspan/g) || []).length, 3);
  assert.match(svg, /<tspan x="0" y="0">第一行<\/tspan>/);
  assert.match(svg, /<tspan x="0" dy="20">&#160;<\/tspan>/);
  assert.match(svg, /<tspan x="0" dy="20">第三行<\/tspan>/);
  assert.match(svg, /text-anchor="middle"/);
  assert.match(svg, /paint-order="stroke fill"/);
  assert.match(svg, /stroke="#FFFFFF"/);
});

test('selected annotations have a selection rectangle and interactive labels are keyboard accessible', () => {
  const interactive = renderAnnotations([label], 'round-front', 'note-1', true);
  assert.match(interactive, /class="annotation-item selected"/);
  assert.match(interactive, /class="annotation-selection"/);
  assert.match(interactive, /role="button" tabindex="0"/);
  const inactive = renderAnnotations([label], 'round-front');
  assert.doesNotMatch(inactive, /annotation-selection|role="button"|tabindex/);
});

test('rendering does not silently move edge labels and ignores invalid entries', () => {
  const svg = renderAnnotations([{ ...label, x: 0, y: 1 }, null, { ...label, id: 'bad', color: 'red' }], 'round-front');
  assert.match(svg, /translate\(0 310\)/);
  assert.doesNotMatch(svg, /data-annotation-id="bad"/);
  assert.equal(renderAnnotations(null, 'round-front'), '');
  assert.equal(typeof bindAnnotationCanvas, 'function');
});

test('pointer capture keeps the double-click target on the annotation rather than the SVG root', () => {
  const handlers = new Map();
  let captureOwner = null;
  const selections = [];
  const edits = [];
  const captureAPI = owner => ({
    setPointerCapture() { captureOwner = owner; },
    hasPointerCapture() { return captureOwner === owner; },
    releasePointerCapture() { if (captureOwner === owner) captureOwner = null; },
  });
  const group = { dataset: { annotationId: 'note-1', x: '0.5', y: '0.4' }, closest() { return this; }, setAttribute() {}, focus() {} };
  const svg = {
    closest() { return null; },
    contains(node) { return node === group; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 280, bottom: 310, width: 280, height: 310 }; },
    getScreenCTM() { return { inverse() { return {}; } }; },
    createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; },
    addEventListener(type, handler) { handlers.set(type, handler); },
    removeEventListener(type) { handlers.delete(type); },
  };
  Object.assign(svg, captureAPI(svg));
  Object.assign(group, captureAPI(group));
  const cleanup = bindAnnotationCanvas(svg, { onSelect: id => selections.push(id), onEdit: id => edits.push(id) });
  const event = target => ({ target, pointerId: 1, button: 0, clientX: 140, clientY: 124, preventDefault() {}, stopPropagation() {} });
  let clickTarget;
  for (let click = 0; click < 2; click++) {
    handlers.get('pointerdown')(event(group));
    // A captured pointer makes its capture owner the browser's click target.
    clickTarget = captureOwner || group;
    handlers.get('pointerup')(event(clickTarget));
  }
  handlers.get('dblclick')(event(clickTarget));
  assert.deepEqual(selections, ['note-1', 'note-1']);
  assert.deepEqual(edits, ['note-1']);
  assert.equal(captureOwner, null);
  cleanup();
  assert.equal(handlers.size, 0);
});

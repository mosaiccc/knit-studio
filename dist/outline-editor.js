import { moveOutlineNode, moveOutlineControl } from './core/outline-editing.js';

const n = value => Math.round(value * 10000) / 10000;
const clamp = value => Math.max(0, Math.min(1, value));

export function renderOutlineControls(outline, box, selected = 0) {
  const { nodes } = outline;
  const point = (x, y) => [n(box.x + x * box.width), n(box.y + y * box.height)];
  const edges = nodes.map((node, i) => {
    const next = nodes[(i + 1) % nodes.length];
    const path = `M${point(node.x, node.y).join(' ')} Q${point(node.cx, node.cy).join(' ')} ${point(next.x, next.y).join(' ')}`;
    return `<path data-outline-edge="${i}" d="${path}" fill="none" stroke="transparent" stroke-width="8" pointer-events="stroke"/>` +
      (i === selected ? `<path d="${path}" fill="none" stroke="#b96d78" stroke-width="1.3" pointer-events="none"/>` : '');
  }).join('');
  const node = nodes[selected] || nodes[0], next = nodes[(selected + 1) % nodes.length];
  const [cx, cy] = point(node.cx, node.cy);
  const guide = `<path d="M${point(node.x, node.y).join(' ')} L${cx} ${cy} L${point(next.x, next.y).join(' ')}" fill="none" stroke="#b96d78" stroke-width=".6" stroke-dasharray="2 2" pointer-events="none"/>`;
  const handles = nodes.map((p, i) => {
    const [x, y] = point(p.x, p.y);
    return `<circle data-outline-node="${i}" cx="${x}" cy="${y}" r="${i === selected ? 3.2 : 2.5}" class="outline-node" fill="${i === selected ? '#b96d78' : '#fffefa'}" stroke="#b96d78" stroke-width=".8" role="button" tabindex="0" aria-label="轮廓节点 ${i + 1}"/>`;
  }).join('');
  return `${edges}${guide}${handles}<path data-outline-control="${selected}" d="M${cx} ${cy - 4} L${cx + 4} ${cy} L${cx} ${cy + 4} L${cx - 4} ${cy} Z" class="outline-control" fill="#79836a" stroke="#fffefa" stroke-width=".8" role="button" tabindex="0" aria-label="调整第 ${selected + 1} 段弧度"/>`;
}

/** Root pointer capture survives live replacement of the node/handle markup. */
export function bindOutlineEditor(svg, { box, getOutline, onSelect, onStart, onChange, onCommit, onCancel } = {}) {
  let drag = null, destroyed = false;
  function targetOf(event) {
    const target = event.target?.closest?.('[data-outline-node],[data-outline-control],[data-outline-edge]');
    if (!target || !svg.contains(target)) return null;
    const kind = target.dataset.outlineNode !== undefined ? 'node' : target.dataset.outlineControl !== undefined ? 'control' : 'edge';
    const index = Number(target.dataset[kind === 'node' ? 'outlineNode' : kind === 'control' ? 'outlineControl' : 'outlineEdge']);
    return Number.isInteger(index) && index >= 0 && index < getOutline().nodes.length ? { kind, index } : null;
  }
  function localPoint(event) {
    try {
      const matrix = svg.getScreenCTM(); if (!matrix) return null;
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      return Number.isFinite(local.x) && Number.isFinite(local.y) ? { x: (local.x - box.x) / box.width, y: (local.y - box.y) / box.height } : null;
    } catch { return null; }
  }
  function stop(event) { event.preventDefault(); event.stopPropagation(); }
  function release(pointerId) {
    try { if (svg.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId); } catch { /* Already released. */ }
  }
  function pointerDown(event) {
    if (destroyed || drag || event.button !== 0 || event.isPrimary === false) return;
    const target = targetOf(event); if (!target) return;
    stop(event); onSelect?.(target.index, target.kind);
    if (target.kind === 'edge') return;
    const point = localPoint(event); if (!point) return;
    drag = { ...target, point, pointerId: event.pointerId, original: structuredClone(getOutline()), changed: false };
    onStart?.();
    try { svg.setPointerCapture(event.pointerId); } catch { /* Capture may be unavailable in embedded viewers. */ }
  }
  function pointerMove(event) {
    if (destroyed || !drag || drag.pointerId !== event.pointerId) return;
    const point = localPoint(event); if (!point) return;
    stop(event);
    const node = drag.original.nodes[drag.index], control = drag.kind === 'control';
    const x = clamp(node[control ? 'cx' : 'x'] + point.x - drag.point.x);
    const y = clamp(node[control ? 'cy' : 'y'] + point.y - drag.point.y);
    const next = (control ? moveOutlineControl : moveOutlineNode)(drag.original, drag.index, x, y);
    drag.changed = JSON.stringify(next) !== JSON.stringify(drag.original);
    onChange?.(next, drag.index, drag.kind);
  }
  function finishStroke() {
    if (!drag) return;
    const finished = drag; drag = null; release(finished.pointerId);
    if (finished.changed) onCommit?.(getOutline()); else onCancel?.(finished.original);
  }
  function pointerUp(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    pointerMove(event); stop(event); finishStroke();
  }
  function cancel(event) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const cancelled = drag; drag = null; release(cancelled.pointerId); onCancel?.(cancelled.original);
  }
  function keyDown(event) {
    if (destroyed || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { cancel(); return; }
    const target = targetOf(event); if (!target || target.kind === 'edge') return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    stop(event); finishStroke(); onSelect?.(target.index, target.kind);
    const source = getOutline(), node = source.nodes[target.index], control = target.kind === 'control', step = event.shiftKey ? .05 : .01;
    const next = (control ? moveOutlineControl : moveOutlineNode)(source, target.index,
      clamp(node[control ? 'cx' : 'x'] + delta[0] * step), clamp(node[control ? 'cy' : 'y'] + delta[1] * step));
    if (JSON.stringify(next) === JSON.stringify(source)) return;
    onStart?.(); onChange?.(next, target.index, target.kind); onCommit?.(next);
  }
  const handlers = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: cancel, lostpointercapture: cancel, keydown: keyDown };
  for (const [type, handler] of Object.entries(handlers)) svg.addEventListener(type, handler);
  return { finishStroke, destroy() { cancel(); destroyed = true; for (const [type, handler] of Object.entries(handlers)) svg.removeEventListener(type, handler); } };
}

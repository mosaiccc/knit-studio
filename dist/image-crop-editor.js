import { normalizeCrop, cropFromPoints, moveCrop, resizeCrop } from './core/image-crop.js';

const HANDLES = [
  ['nw', 0, 0, '左上角', 'nwse-resize'], ['n', .5, 0, '上边', 'ns-resize'],
  ['ne', 1, 0, '右上角', 'nesw-resize'], ['e', 1, .5, '右边', 'ew-resize'],
  ['se', 1, 1, '右下角', 'nwse-resize'], ['s', .5, 1, '下边', 'ns-resize'],
  ['sw', 0, 1, '左下角', 'nesw-resize'], ['w', 0, .5, '左边', 'ew-resize'],
];
const same = (a, b) => ['x', 'y', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) < 1e-12);
const n = value => Math.round(value * 1000000) / 1000000;
function dimensions(width, height) {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) throw new RangeError('原图宽高必须是正整数。');
}

/** Markup for a stable parent SVG whose viewBox is 0 0 width height. */
export function renderCropOverlay(crop, { width, height }) {
  dimensions(width, height);
  const value = normalizeCrop(crop, 1 / width, 1 / height);
  const x = n(value.x * width), y = n(value.y * height), w = n(value.width * width), h = n(value.height * height);
  const right = n(x + w), bottom = n(y + h), radius = Math.max(width, height) * .011;
  const handles = HANDLES.map(([key, dx, dy, label, cursor]) =>
    `<circle data-crop-handle="${key}" cx="${n(x + w * dx)}" cy="${n(y + h * dy)}" r="${n(radius)}" fill="#fffefa" stroke="#b96d78" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="all" style="cursor:${cursor}" role="button" tabindex="0" aria-label="调整选区${label}"/>`
  ).join('');
  return `<rect data-crop-surface x="0" y="0" width="${width}" height="${height}" fill="transparent" pointer-events="all"/>` +
    `<path d="M0 0H${width}V${height}H0Z M${x} ${y}H${right}V${bottom}H${x}Z" fill="rgba(18,28,20,.48)" fill-rule="evenodd" pointer-events="none"/>` +
    `<rect data-crop-selection x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent" stroke="#b96d78" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="all" role="button" tabindex="0" aria-label="移动选区"/>` +
    `<path d="M${n(x + w / 3)} ${y}V${bottom}M${n(x + 2 * w / 3)} ${y}V${bottom}M${x} ${n(y + h / 3)}H${right}M${x} ${n(y + 2 * h / 3)}H${right}" stroke="#fffefa" stroke-opacity=".6" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" pointer-events="none"/>` + handles;
}

/** The root SVG owns capture, so callers can replace the overlay during a drag. */
export function bindCropEditor(svg, { width, height, getCrop, getTool = () => 'select', onChange, onCommit, onError } = {}) {
  dimensions(width, height);
  let active = null, destroyed = false;
  const originalTabIndex = svg.getAttribute?.('tabindex') ?? null;
  if (originalTabIndex === null) svg.setAttribute?.('tabindex', '0');
  const stop = event => { event.preventDefault(); event.stopPropagation(); };
  const report = error => onError?.(error);
  function release(id) {
    try { if (svg.hasPointerCapture?.(id)) svg.releasePointerCapture(id); } catch { /* Capture may already have ended. */ }
  }
  function localPoint(event) {
    const matrix = svg.getScreenCTM(); if (!matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse()), x = local.x / width, y = local.y / height;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  function targetOf(event) {
    const element = event.target?.closest?.('[data-crop-handle],[data-crop-selection],[data-crop-surface]');
    if (!element || !svg.contains(element)) return null;
    const handle = element.dataset.cropHandle;
    if (handle !== undefined) return HANDLES.some(([key]) => key === handle) ? { kind: 'resize', handle, element } : null;
    return { kind: element.dataset.cropSelection !== undefined ? 'selection' : 'surface', element };
  }
  function cancelPending() {
    if (!active) return;
    const cancelled = active; active = null; release(cancelled.pointerId);
    if (!same(getCrop(), cancelled.original)) onChange?.(cancelled.original);
  }
  function toolChanged() {
    if (!active || active.tool === getTool()) return false;
    cancelPending(); return true;
  }
  function update(event) {
    if (!active) return;
    const point = localPoint(event); if (!point) return;
    if (Math.hypot(event.clientX - active.screenX, event.clientY - active.screenY) >= 3) active.moved = true;
    if (!active.moved) return;
    let next;
    if (active.kind === 'resize') next = resizeCrop(active.original, active.handle, point, 1 / width, 1 / height);
    else if (active.kind === 'move') next = moveCrop(active.original, point.x - active.start.x, point.y - active.start.y);
    else next = cropFromPoints(active.start, point, 1 / width, 1 / height);
    if (!same(next, active.next)) { active.next = next; onChange?.(next); }
  }
  function pointerDown(event) {
    if (destroyed || active || event.button !== 0 || event.isPrimary === false) return;
    try {
      const target = targetOf(event), point = localPoint(event);
      if (!target || !point) return;
      const margin = target.kind === 'resize' ? .04 : 0;
      if (point.x < -margin || point.y < -margin || point.x > 1 + margin || point.y > 1 + margin) return;
      stop(event);
      (target.kind === 'surface' ? svg : target.element).focus?.({ preventScroll: true });
      const original = normalizeCrop(getCrop(), 1 / width, 1 / height), tool = getTool();
      active = { ...target, kind: target.kind === 'resize' ? 'resize' : tool === 'move' && target.kind === 'selection' ? 'move' : 'select',
        original, next: original, tool, start: point, screenX: event.clientX, screenY: event.clientY, pointerId: event.pointerId, moved: false };
      try { svg.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional in embedded viewers. */ }
    } catch (error) { cancelPending(); report(error); }
  }
  function pointerMove(event) {
    if (destroyed || toolChanged() || !active || active.pointerId !== event.pointerId) return;
    stop(event);
    try { update(event); } catch (error) { cancelPending(); report(error); }
  }
  function pointerUp(event) {
    if (destroyed || toolChanged() || !active || active.pointerId !== event.pointerId) return;
    stop(event);
    try {
      update(event);
      const finished = active; active = null; release(finished.pointerId);
      if (!same(finished.original, finished.next)) onCommit?.(finished.next);
    } catch (error) { cancelPending(); report(error); }
  }
  function pointerCancel(event) {
    if (!active || (event.pointerId !== undefined && event.pointerId !== active.pointerId)) return;
    cancelPending();
  }
  function keyDown(event) {
    if (destroyed) return;
    if (event.key === 'Escape') { if (active) { stop(event); cancelPending(); } return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    const target = targetOf(event);
    if (event.target !== svg && !target) return;
    stop(event); cancelPending();
    try {
      const current = normalizeCrop(getCrop(), 1 / width, 1 / height), multiplier = event.shiftKey ? 10 : 1;
      const dx = delta[0] * multiplier / width, dy = delta[1] * multiplier / height;
      let next;
      if (target?.kind === 'resize') {
        const [, x, y] = HANDLES.find(([key]) => key === target.handle);
        next = resizeCrop(current, target.handle, { x: current.x + current.width * x + dx, y: current.y + current.height * y + dy }, 1 / width, 1 / height);
      } else next = moveCrop(current, dx, dy);
      if (!same(current, next)) { onChange?.(next); onCommit?.(next); }
    } catch (error) { report(error); }
  }
  const handlers = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: pointerCancel, lostpointercapture: pointerCancel, keydown: keyDown };
  for (const [type, handler] of Object.entries(handlers)) svg.addEventListener(type, handler);
  return {
    cancelPending,
    destroy() {
      if (destroyed) return;
      cancelPending(); destroyed = true;
      for (const [type, handler] of Object.entries(handlers)) svg.removeEventListener(type, handler);
      if (originalTabIndex === null) svg.removeAttribute?.('tabindex'); else svg.setAttribute?.('tabindex', originalTabIndex);
    },
  };
}

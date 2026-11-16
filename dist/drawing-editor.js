import {
  addDrawingSegment, addDrawingPolyline, removeDrawingSegment,
  moveDrawingEndpoint, moveDrawingControl, inspectOutlineDrawing,
} from './core/outline-drawing.js';

const n = value => Math.round(value * 10000) / 10000;
const clamp = value => Math.max(0, Math.min(1, value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const segmentBetween = (a, b, control = null) => control
  ? { kind: 'arc', x1: a.x, y1: a.y, x2: b.x, y2: b.y, cx: control.x, cy: control.y }
  : { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };

/** Preview is { segments: [...], points: [{ x, y }] }, in normalized coordinates, or null. */
export function renderDrawingOverlay(drawing, box, selected = -1, preview = null) {
  const point = (x, y) => `${n(box.x + x * box.width)} ${n(box.y + y * box.height)}`;
  const path = s => `M${point(s.x1, s.y1)} ${s.kind === 'arc' ? `Q${point(s.cx, s.cy)}` : 'L'} ${point(s.x2, s.y2)}`;
  const circle = (p, attrs) => `<circle cx="${n(box.x + p.x * box.width)}" cy="${n(box.y + p.y * box.height)}" ${attrs}/>`;
  const bounds = `<rect data-drawing-surface x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" fill="transparent" pointer-events="all"/>`;
  const segments = drawing.segments.map((s, index) =>
    `<path d="${path(s)}" fill="none" stroke="${index === selected ? '#b96d78' : '#56644d'}" stroke-width="${index === selected ? 1.7 : 1.2}" pointer-events="none"/>` +
    `<path data-drawing-segment="${index}" d="${path(s)}" fill="none" stroke="transparent" stroke-width="9" pointer-events="stroke" role="button" tabindex="0" aria-label="轮廓${s.kind === 'arc' ? '弧线' : '线段'} ${index + 1}"/>`
  ).join('');
  const ends = inspectOutlineDrawing(drawing).openEnds.map(p => {
    const index = drawing.segments.findIndex(s => (s.x1 === p.x && s.y1 === p.y) || (s.x2 === p.x && s.y2 === p.y));
    const s = drawing.segments[index], end = s.x1 === p.x && s.y1 === p.y ? 'start' : 'end';
    // A visible end extends beyond a path's butt cap, so its entire red circle must accept clicks.
    return circle(p, `data-drawing-open-end data-drawing-endpoint="${end}" data-drawing-segment-index="${index}" r="2.6" fill="#fffefa" stroke="#c3514d" stroke-width="1.1" pointer-events="all"`);
  }).join('');
  const s = drawing.segments[selected];
  let handles = '';
  if (s) {
    if (s.kind === 'arc') {
      const cx = n(box.x + s.cx * box.width), cy = n(box.y + s.cy * box.height);
      handles += `<path d="M${point(s.x1, s.y1)} L${cx} ${cy} L${point(s.x2, s.y2)}" fill="none" stroke="#79836a" stroke-width=".6" stroke-dasharray="2 2" pointer-events="none"/>`;
      handles += `<path data-drawing-control="${selected}" d="M${cx} ${cy - 4} L${cx + 4} ${cy} L${cx} ${cy + 4} L${cx - 4} ${cy} Z" class="drawing-control" fill="#79836a" stroke="#fffefa" stroke-width=".8" role="button" tabindex="0" aria-label="调整第 ${selected + 1} 段弧度"/>`;
    }
    handles += ['start', 'end'].map((end, index) => circle({ x: s[index ? 'x2' : 'x1'], y: s[index ? 'y2' : 'y1'] },
      `data-drawing-endpoint="${end}" data-drawing-segment-index="${selected}" class="drawing-endpoint" r="3.3" fill="#fffefa" stroke="#b96d78" stroke-width="1.1" role="button" tabindex="0" aria-label="第 ${selected + 1} 段${index ? '终点' : '起点'}"`
    )).join('');
  }
  const ghost = preview ? `<g data-drawing-preview pointer-events="none">${(preview.segments || []).map(s =>
    `<path d="${path(s)}" fill="none" stroke="#b96d78" stroke-width="1.3" stroke-dasharray="3 2"/>`
  ).join('')}${(preview.points || []).map(p => circle(p, 'r="2.3" fill="#b96d78"')).join('')}</g>` : '';
  return `${bounds}${segments}${ends}${handles}${ghost}`;
}

/** Capture the stable root SVG, so replacing live overlay markup cannot interrupt a drag. */
export function bindDrawingEditor(svg, {
  box, getDrawing, getTool = () => 'select', onSelect, onStart, onChange, onCommit,
  onCancel, onPreview, onError,
} = {}) {
  let active = null, pending = null, selected = -1, selectedKind = 'segment', keyboardTarget = null, destroyed = false;
  const previousTabIndex = svg.getAttribute?.('tabindex') ?? null;
  if (previousTabIndex === null) svg.setAttribute?.('tabindex', '0');
  const stop = event => { event.preventDefault(); event.stopPropagation(); };
  const report = error => { onError?.(error); };
  const emit = preview => { onPreview?.(preview); };
  function release(id) {
    try { if (svg.hasPointerCapture?.(id)) svg.releasePointerCapture(id); } catch { /* Already released. */ }
  }
  function capture(id) {
    try { svg.setPointerCapture(id); } catch { /* Embedded viewers may not support capture. */ }
  }
  function localPoint(event, bounded = true) {
    try {
      const matrix = svg.getScreenCTM(); if (!matrix || !box.width || !box.height) return null;
      const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
      const local = p.matrixTransform(matrix.inverse());
      const x = (local.x - box.x) / box.width, y = (local.y - box.y) / box.height;
      return Number.isFinite(x) && Number.isFinite(y) ? { x: bounded ? clamp(x) : x, y: bounded ? clamp(y) : y } : null;
    } catch (error) { report(error); return null; }
  }
  function targetOf(event) {
    const element = event.target?.closest?.('[data-drawing-surface],[data-drawing-segment],[data-drawing-endpoint],[data-drawing-control]');
    if (!element || !svg.contains(element)) return null;
    const data = element.dataset;
    if (data.drawingSurface !== undefined) return { kind: 'surface', element };
    const kind = data.drawingEndpoint ?? (data.drawingControl !== undefined ? 'control' : 'segment');
    const index = Number(data.drawingSegmentIndex ?? data.drawingControl ?? data.drawingSegment);
    return Number.isInteger(index) && index >= 0 && index < getDrawing().segments.length ? { kind, index, element } : null;
  }
  function choose(index, kind = 'segment') {
    const changed = selected !== index || selectedKind !== kind;
    selected = index; selectedKind = kind;
    keyboardTarget = ['start', 'end', 'control'].includes(kind) ? { index, kind } : null;
    if (changed) onSelect?.(index, kind);
  }
  function cancelPending() {
    const cancelled = active;
    active = null; pending = null;
    if (cancelled) {
      release(cancelled.pointerId);
      if (cancelled.type === 'edit') onCancel?.(cancelled.original);
    }
    emit(null);
  }
  function toolNow() {
    const tool = getTool();
    if ((active && active.tool !== tool) || (pending && pending.tool !== tool)) cancelPending();
    return tool;
  }
  function previewAt(point) {
    if (active?.type === 'pen') {
      const points = active.points;
      emit({ segments: points.slice(1).map((p, i) => segmentBetween(points[i], p)), points: [points[0], points.at(-1)] });
      return;
    }
    const points = pending?.points || (active && active.type !== 'edit' ? [active.start] : []);
    if (!points.length) return;
    const tool = pending?.tool || active?.tool;
    emit({ segments: point ? [segmentBetween(points[0], points[1] || point, tool === 'arc' && points.length === 2 ? point : null)] : [], points: [...points] });
  }
  function transaction(makeNext, index = -1, kind = 'segment') {
    const original = structuredClone(getDrawing());
    let started = false;
    try {
      const next = makeNext(original);
      if (same(next, original)) return false;
      onStart?.(); started = true;
      onChange?.(next, index, kind); onCommit?.(next);
      return true;
    } catch (error) {
      if (started) onCancel?.(original);
      report(error); return false;
    }
  }
  function commitSegment(points) {
    pending = null;
    const added = transaction(drawing => addDrawingSegment(drawing, points[0], points[1], points[2] || null));
    if (added) choose(getDrawing().segments.length - 1);
    emit(null);
  }
  function updateActive(point) {
    if (!active) return;
    active.last = point;
    const dx = (point.x - active.start.x) * box.width, dy = (point.y - active.start.y) * box.height;
    if (Math.hypot(dx, dy) >= 3) active.moved = true;
    if (active.type === 'edit') {
      const s = active.original.segments[active.index], control = active.kind === 'control';
      const origin = { x: s[control ? 'cx' : active.kind === 'start' ? 'x1' : 'x2'], y: s[control ? 'cy' : active.kind === 'start' ? 'y1' : 'y2'] };
      const nextPoint = { x: clamp(origin.x + point.x - active.start.x), y: clamp(origin.y + point.y - active.start.y) };
      try {
        const next = control ? moveDrawingControl(active.original, active.index, nextPoint)
          : moveDrawingEndpoint(active.original, active.index, active.kind, nextPoint);
        active.changed = !same(next, active.original);
        if (!same(next, active.next)) {
          active.next = next; onChange?.(next, active.index, active.kind);
        }
      } catch (error) { cancelPending(); report(error); }
    } else {
      if (active.type === 'pen') {
        const last = active.points.at(-1);
        if (Math.hypot(point.x - last.x, point.y - last.y) > .0001) active.points.push(point);
      }
      previewAt(point);
    }
  }
  function finishActive(forced = false) {
    if (!active) return;
    const finished = active; active = null; release(finished.pointerId);
    if (finished.type === 'edit') {
      if (finished.changed) onCommit?.(finished.next); else onCancel?.(finished.original);
      return;
    }
    if (finished.type === 'pen') {
      if (finished.points.length > 1) {
        const added = transaction(drawing => addDrawingPolyline(drawing, finished.points));
        if (added) choose(getDrawing().segments.length - 1);
      }
      pending = null; emit(null); return;
    }
    if (finished.tool === 'line') {
      if (forced && !finished.moved) { pending = null; emit(null); return; }
      if (pending?.points.length === 1) commitSegment([pending.points[0], finished.last]);
      else if (finished.moved) commitSegment([finished.start, finished.last]);
      else if (!forced) { pending = { tool: 'line', points: [finished.last] }; previewAt(); }
      else { pending = null; emit(null); }
      return;
    }
    if (forced) { pending = null; emit(null); return; }
    pending = { tool: 'arc', points: [...(pending?.points || []), finished.last] };
    if (pending.points.length === 3) commitSegment(pending.points); else previewAt();
  }
  function pointerDown(event) {
    if (destroyed || event.button !== 0 || event.isPrimary === false) return;
    const tool = toolNow(); if (active) return;
    const target = targetOf(event), raw = localPoint(event, false), margin = target?.kind === 'surface' ? 0 : .03;
    if (!target || !raw || raw.x < -margin || raw.x > 1 + margin || raw.y < -margin || raw.y > 1 + margin) return;
    const point = { x: clamp(raw.x), y: clamp(raw.y) };
    stop(event);
    svg.focus?.({ preventScroll: true });
    if (tool === 'erase') {
      if (target.index !== undefined) { transaction(drawing => removeDrawingSegment(drawing, target.index), target.index); choose(-1); }
      return;
    }
    if (tool === 'select') {
      if (target.kind === 'surface') { choose(-1); return; }
      choose(target.index, target.kind);
      if (target.kind === 'segment') return;
      const original = structuredClone(getDrawing());
      active = { type: 'edit', tool, ...target, start: point, last: point, pointerId: event.pointerId, original, next: original, changed: false };
      onStart?.(); capture(event.pointerId); return;
    }
    if (!['line', 'arc', 'pen'].includes(tool)) return;
    active = { type: tool === 'pen' ? 'pen' : 'draw', tool, start: point, last: point, pointerId: event.pointerId, points: [point], moved: false };
    capture(event.pointerId); previewAt(point);
  }
  function pointerMove(event) {
    if (destroyed) return;
    toolNow();
    if (active) {
      if (active.pointerId !== event.pointerId) return;
      const point = localPoint(event); if (!point) return;
      stop(event); updateActive(point);
    } else if (pending && event.isPrimary !== false) {
      const target = targetOf(event); if (!target) return;
      const point = localPoint(event); if (point) previewAt(point);
    }
  }
  function pointerUp(event) {
    if (destroyed) return;
    toolNow();
    if (!active || active.pointerId !== event.pointerId) return;
    stop(event);
    const point = localPoint(event); if (point) updateActive(point);
    finishActive();
  }
  function pointerCancel(event) {
    if (!active || (event.pointerId !== undefined && event.pointerId !== active.pointerId)) return;
    cancelPending();
  }
  function finishStroke() {
    if (destroyed) return;
    toolNow(); finishActive(true); pending = null; emit(null);
  }
  function keyDown(event) {
    if (destroyed || event.altKey || event.ctrlKey || event.metaKey) return;
    const tool = toolNow();
    if (event.key === 'Escape') { if (active || pending) { stop(event); cancelPending(); } return; }
    if (tool !== 'select') return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selected < 0 || selected >= getDrawing().segments.length) return;
      stop(event); cancelPending();
      transaction(drawing => removeDrawingSegment(drawing, selected), selected); choose(-1); return;
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const target = targetOf(event), handle = target && ['start', 'end', 'control'].includes(target.kind) ? target : keyboardTarget;
    if (!delta || !handle || !getDrawing().segments[handle.index]) return;
    stop(event); finishStroke(); choose(handle.index, handle.kind);
    transaction(drawing => {
      const s = drawing.segments[handle.index], step = event.shiftKey ? .05 : .01, control = handle.kind === 'control';
      const point = {
        x: clamp(n(s[control ? 'cx' : handle.kind === 'start' ? 'x1' : 'x2'] + delta[0] * step)),
        y: clamp(n(s[control ? 'cy' : handle.kind === 'start' ? 'y1' : 'y2'] + delta[1] * step)),
      };
      return control ? moveDrawingControl(drawing, handle.index, point) : moveDrawingEndpoint(drawing, handle.index, handle.kind, point, 0);
    }, handle.index, handle.kind);
  }
  function focusIn(event) {
    const target = targetOf(event);
    if (target && target.kind !== 'surface') choose(target.index, target.kind);
  }
  const handlers = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp,
    pointercancel: pointerCancel, lostpointercapture: pointerCancel, keydown: keyDown, focusin: focusIn };
  const safeHandlers = Object.fromEntries(Object.entries(handlers).map(([type, handler]) => [type, event => {
    try { handler(event); } catch (error) { cancelPending(); report(error); }
  }]));
  for (const [type, handler] of Object.entries(safeHandlers)) svg.addEventListener(type, handler);
  return { finishStroke, cancelPending, destroy() {
    cancelPending(); destroyed = true;
    for (const [type, handler] of Object.entries(safeHandlers)) svg.removeEventListener(type, handler);
    if (previousTabIndex === null) svg.removeAttribute?.('tabindex');
  } };
}

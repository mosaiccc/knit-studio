const VIEW_WIDTH = 280;
const VIEW_HEIGHT = 310;
const FONT = "'Microsoft YaHei','PingFang SC',Arial,sans-serif";
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const numericText = value => String(Math.round(value * 10000) / 10000);

function escapeXML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function validAnnotation(annotation) {
  return annotation && typeof annotation.id === 'string' && annotation.id.length > 0 &&
    typeof annotation.garmentId === 'string' && typeof annotation.text === 'string' &&
    annotation.text.trim().length > 0 && annotation.text.length <= 300 &&
    Number.isFinite(annotation.x) && annotation.x >= 0 && annotation.x <= 1 &&
    Number.isFinite(annotation.y) && annotation.y >= 0 && annotation.y <= 1 &&
    Number.isFinite(annotation.fontSize) && annotation.fontSize >= 8 && annotation.fontSize <= 28 &&
    typeof annotation.color === 'string' && /^#[0-9a-f]{6}$/i.test(annotation.color);
}

function approximateWidth(text, fontSize) {
  return [...text].reduce((width, character) => width + (/[^\x00-\xff]/.test(character) ? 1 : 0.6) * fontSize, 0);
}

/** Returns markup for a root SVG with viewBox="0 0 280 310"; saved label positions are never changed. */
export function renderAnnotations(annotations, garmentId, selectedId = null, interactive = false) {
  if (!Array.isArray(annotations)) return '';
  return annotations.filter(annotation => validAnnotation(annotation) && annotation.garmentId === garmentId).map(annotation => {
    const { id, x, y, text, fontSize, color } = annotation;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const lineHeight = fontSize * 1.25;
    const width = Math.max(fontSize, ...lines.map(line => approximateWidth(line, fontSize))) + 10;
    const height = fontSize * 1.25 + (lines.length - 1) * lineHeight + 8;
    const rectangle = `x="${numericText(-width / 2)}" y="${numericText(-fontSize - 4)}" width="${numericText(width)}" height="${numericText(height)}" rx="3"`;
    const selected = id === selectedId;
    const attributes = interactive ? ` role="button" tabindex="0" aria-label="${escapeXML(`编辑注释：${text.replace(/\s+/g, ' ')}`)}" style="touch-action:none"` : '';
    const spans = lines.map((line, index) => `<tspan x="0" ${index ? `dy="${numericText(lineHeight)}"` : 'y="0"'}>${line ? escapeXML(line) : '&#160;'}</tspan>`).join('');
    return `<g id="annotation-${escapeXML(id)}" data-annotation-id="${escapeXML(id)}" data-x="${x}" data-y="${y}" class="annotation-item${selected ? ' selected' : ''}" transform="translate(${numericText(x * VIEW_WIDTH)} ${numericText(y * VIEW_HEIGHT)})"${attributes}>` +
      (interactive ? `<rect class="annotation-hitbox" ${rectangle} fill="transparent" stroke="none"/>` : '') +
      (selected ? `<rect class="annotation-selection" ${rectangle} fill="none" stroke="#AD6B63" stroke-width="1" stroke-dasharray="3 2" pointer-events="none"/>` : '') +
      `<text x="0" y="0" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" fill="${color}" stroke="#FFFFFF" stroke-width="3" stroke-opacity="0.94" stroke-linejoin="round" paint-order="stroke fill" xml:space="preserve">${spans}</text></g>`;
  }).join('');
}

function annotationGroup(svg, target) {
  const element = target?.closest ? target : target?.parentElement;
  const group = element?.closest?.('[data-annotation-id]');
  return group && svg.contains(group) ? group : null;
}

function position(group) {
  const x = Number(group.dataset.x);
  const y = Number(group.dataset.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function transform(group, x, y) {
  group.setAttribute('transform', `translate(${numericText(x * VIEW_WIDTH)} ${numericText(y * VIEW_HEIGHT)})`);
}

/** Delegates events so annotation groups may be rerendered without rebinding the SVG root. */
export function bindAnnotationCanvas(svg, { onSelect, onEdit, onMove } = {}) {
  let drag = null;

  function localPoint(event) {
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return null;
    try {
      const matrix = svg.getScreenCTM();
      if (!matrix) return null;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      if (!Number.isFinite(local.x) || !Number.isFinite(local.y) || local.x < 0 || local.x > VIEW_WIDTH || local.y < 0 || local.y > VIEW_HEIGHT) return null;
      return local;
    } catch { return null; }
  }

  function release(group, pointerId) {
    try {
      if (group.hasPointerCapture?.(pointerId)) group.releasePointerCapture(pointerId);
    } catch { /* The browser may already have released a cancelled pointer. */ }
  }

  function pointerDown(event) {
    if (drag || event.button !== 0 || event.isPrimary === false) return;
    const group = annotationGroup(svg, event.target);
    const point = group && localPoint(event);
    const origin = group && position(group);
    if (!point || !origin) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { pointerId: event.pointerId, id: group.dataset.annotationId, group, point, origin, current: { ...origin }, startClientX: event.clientX, startClientY: event.clientY, moved: false };
    // Keeping capture on the label also keeps native click/dblclick targeting that label.
    try { group.setPointerCapture(event.pointerId); } catch { /* Pointer capture is unavailable in some embedded previews. */ }
    try { group.focus?.({ preventScroll: true }); } catch { group.focus?.(); }
  }

  function pointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = localPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 3) return;
    drag.moved = true;
    drag.current = {
      x: clamp(drag.origin.x + (point.x - drag.point.x) / VIEW_WIDTH, 0.03, 0.97),
      y: clamp(drag.origin.y + (point.y - drag.point.y) / VIEW_HEIGHT, 0.03, 0.95),
    };
    transform(drag.group, drag.current.x, drag.current.y);
  }

  function pointerUp(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Pointerup can have a newer coordinate than the last pointermove.
    pointerMove(event);
    const finished = drag;
    drag = null;
    event.preventDefault();
    event.stopPropagation();
    release(finished.group, finished.pointerId);
    const movement = Math.hypot((finished.current.x - finished.origin.x) * VIEW_WIDTH, (finished.current.y - finished.origin.y) * VIEW_HEIGHT);
    if (finished.moved && movement >= 0.25) {
      finished.group.dataset.x = String(finished.current.x);
      finished.group.dataset.y = String(finished.current.y);
      onMove?.(finished.id, finished.current.x, finished.current.y);
    } else {
      transform(finished.group, finished.origin.x, finished.origin.y);
      if (localPoint(event)) onSelect?.(finished.id);
    }
  }

  function cancel(event) {
    if (!drag || (event?.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
    const cancelled = drag;
    drag = null;
    transform(cancelled.group, cancelled.origin.x, cancelled.origin.y);
    release(cancelled.group, cancelled.pointerId);
  }

  function doubleClick(event) {
    const group = annotationGroup(svg, event.target);
    if (!group) return;
    event.preventDefault();
    event.stopPropagation();
    onEdit?.(group.dataset.annotationId);
  }

  function keyDown(event) {
    const group = annotationGroup(svg, event.target);
    if (!group || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onEdit?.(group.dataset.annotationId);
      return;
    }
    const direction = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[event.key];
    const origin = direction && position(group);
    if (!origin) return;
    event.preventDefault();
    event.stopPropagation();
    const x = clamp(origin.x + direction[0], 0.03, 0.97);
    const y = clamp(origin.y + direction[1], 0.03, 0.95);
    if (x === origin.x && y === origin.y) return;
    group.dataset.x = String(x);
    group.dataset.y = String(y);
    transform(group, x, y);
    onMove?.(group.dataset.annotationId, x, y);
  }

  const handlers = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: cancel, lostpointercapture: cancel, dblclick: doubleClick, keydown: keyDown };
  for (const [type, handler] of Object.entries(handlers)) svg.addEventListener(type, handler);
  return () => {
    cancel();
    for (const [type, handler] of Object.entries(handlers)) svg.removeEventListener(type, handler);
  };
}

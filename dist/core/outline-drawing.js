import { sanitizeCustomOutline, MAX_OUTLINE_NODES } from './outline-editing.js';

export const MAX_DRAWING_SEGMENTS = MAX_OUTLINE_NODES;
const FIELDS = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unit = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const clamp = value => Math.max(0, Math.min(1, value));
const same = (a, b) => a.x === b.x && a.y === b.y;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const startOf = segment => ({ x: segment.x1, y: segment.y1 });
const endOf = segment => ({ x: segment.x2, y: segment.y2 });
const endpoints = drawing => drawing.segments.flatMap(segment => [startOf(segment), endOf(segment)]);
const line = (start, end) => ({ kind: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y, cx: (start.x + end.x) / 2, cy: (start.y + end.y) / 2 });

/** A draft may contain open lines, branches, or no lines at all. Geometry is checked when applied. */
export function assertOutlineDrawing(value) {
  if (value === undefined || value === null) return;
  if (!record(value) || !Array.isArray(value.segments) || value.segments.length > MAX_DRAWING_SEGMENTS) throw new Error('轮廓草稿需包含 0–80 条线段。');
  for (const segment of value.segments) {
    if (!record(segment) || !['line', 'arc'].includes(segment.kind)) throw new Error('轮廓草稿只支持直线和弧线线段。');
    if (!FIELDS.every(field => unit(segment[field]))) throw new Error('线段端点和弧线控制点需为画布内 0–1 的有效坐标。');
  }
}

export function sanitizeOutlineDrawing(value) {
  assertOutlineDrawing(value);
  return value == null ? null : { segments: value.segments.map(segment => segment.kind === 'line'
    ? line(startOf(segment), endOf(segment))
    : { kind: 'arc', ...Object.fromEntries(FIELDS.map(field => [field, segment[field]])) }) };
}

export function drawingFromOutline(value) {
  const outline = sanitizeCustomOutline(value);
  if (!outline) throw new Error('请先选择要绘制的裁片轮廓。');
  return { segments: outline.nodes.map((node, index) => {
    const next = outline.nodes[(index + 1) % outline.nodes.length], segment = line(node, next);
    if (segment.cx !== node.cx || segment.cy !== node.cy) Object.assign(segment, { kind: 'arc', cx: node.cx, cy: node.cy });
    return segment;
  }) };
}

function point(value) {
  if (!record(value) || !unit(value.x) || !unit(value.y)) throw new Error('绘制坐标需为画布内 0–1 的有效数字。');
  return { x: value.x, y: value.y };
}

function tolerance(value, label = '吸附') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label}容差需为有效的非负数。`);
  return value;
}

function snap(value, candidates, amount) {
  let result = value, nearest = amount;
  for (const candidate of candidates) {
    const current = distance(value, candidate);
    if (current <= nearest) { result = candidate; nearest = current; }
  }
  return { ...result };
}

function draft(value) { return sanitizeOutlineDrawing(value) ?? { segments: [] }; }

function editable(value, index) {
  const result = draft(value);
  if (!Number.isInteger(index) || index < 0 || index >= result.segments.length) throw new Error('请选择有效的轮廓线段。');
  return result;
}

function checkRoom(drawing, count) {
  if (drawing.segments.length + count > MAX_DRAWING_SEGMENTS) throw new Error('轮廓草稿最多保留 80 条线段，请先删除或减少绘制的细节。');
}

export function addDrawingSegment(value, start, end, control = null, snapTolerance = .025) {
  const result = draft(value), candidates = endpoints(result);
  tolerance(snapTolerance);
  start = snap(point(start), candidates, snapTolerance);
  end = snap(point(end), candidates, snapTolerance);
  if (control !== null) control = point(control);
  if (same(start, end)) throw new Error('线段起点和终点不能重合，请画出一段距离。');
  checkRoom(result, 1);
  const segment = line(start, end);
  if (control) Object.assign(segment, { kind: 'arc', cx: control.x, cy: control.y });
  result.segments.push(segment);
  return result;
}

function segmentDistance(value, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const t = dx || dy ? clamp(((value.x - start.x) * dx + (value.y - start.y) * dy) / (dx * dx + dy * dy)) : 0;
  return Math.hypot(value.x - start.x - t * dx, value.y - start.y - t * dy);
}

/** Iterative Ramer–Douglas–Peucker keeps the chosen tolerance even for long zigzags. */
function simplify(points, amount) {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop();
    let split = -1, farthest = amount;
    for (let i = first + 1; i < last; i++) {
      const current = segmentDistance(points[i], points[first], points[last]);
      if (current > farthest) { split = i; farthest = current; }
    }
    if (split >= 0) { keep.add(split); pending.push([first, split], [split, last]); }
  }
  return points.filter((_, index) => keep.has(index));
}

export function addDrawingPolyline(value, points, { snapTolerance = .025, simplifyTolerance = .004 } = {}) {
  const result = draft(value);
  tolerance(snapTolerance); tolerance(simplifyTolerance, '简化');
  if (!Array.isArray(points) || points.length < 2 || points.length > 4096) throw new Error('自由绘制需包含 2–4096 个有效坐标点。');
  let samples = Array.from(points, value => point(Array.isArray(value) && value.length === 2 ? { x: value[0], y: value[1] } : value));
  const candidates = endpoints(result);
  samples[0] = snap(samples[0], candidates, snapTolerance);
  samples[samples.length - 1] = snap(samples.at(-1), [...candidates, samples[0]], snapTolerance);
  samples = samples.filter((sample, index) => !index || !same(sample, samples[index - 1]));
  if (samples.length < 2) throw new Error('请拖动画笔画出一段距离。');
  let selected;
  if (same(samples[0], samples.at(-1))) {
    // Split a ring away from its shared start/end to retain the closing corner.
    let opposite = 1;
    for (let i = 2; i < samples.length - 1; i++) if (distance(samples[0], samples[i]) > distance(samples[0], samples[opposite])) opposite = i;
    selected = [...simplify(samples.slice(0, opposite + 1), simplifyTolerance).slice(0, -1), ...simplify(samples.slice(opposite), simplifyTolerance)];
  } else selected = simplify(samples, simplifyTolerance);
  checkRoom(result, selected.length - 1);
  for (let i = 1; i < selected.length; i++) if (!same(selected[i - 1], selected[i])) result.segments.push(line(selected[i - 1], selected[i]));
  return result;
}

export function removeDrawingSegment(value, index) {
  const result = editable(value, index);
  result.segments.splice(index, 1);
  return result;
}

export function moveDrawingEndpoint(value, index, end, destination, snapTolerance = .025) {
  const result = editable(value, index);
  if (!['start', 'end'].includes(end)) throw new Error('请选择线段的起点或终点端点。');
  tolerance(snapTolerance);
  const origin = end === 'start' ? startOf(result.segments[index]) : endOf(result.segments[index]);
  destination = snap(point(destination), endpoints(result).filter(candidate => !same(candidate, origin)), snapTolerance);
  const dx = destination.x - origin.x, dy = destination.y - origin.y;
  for (const segment of result.segments) {
    let moved = 0;
    if (same(startOf(segment), origin)) { segment.x1 = destination.x; segment.y1 = destination.y; moved++; }
    if (same(endOf(segment), origin)) { segment.x2 = destination.x; segment.y2 = destination.y; moved++; }
    if (moved) { segment.cx = clamp(segment.cx + dx * moved / 2); segment.cy = clamp(segment.cy + dy * moved / 2); }
  }
  return result;
}

export function moveDrawingControl(value, index, destination) {
  const result = editable(value, index), control = point(destination);
  Object.assign(result.segments[index], { kind: 'arc', cx: control.x, cy: control.y });
  return result;
}

/** de Casteljau halves an arc without changing the drawn curve. */
export function splitDrawingSegment(value, index) {
  const result = editable(value, index);
  checkRoom(result, 1);
  const segment = result.segments[index], start = startOf(segment), end = endOf(segment), control = { x: segment.cx, y: segment.cy };
  const left = midpoint(start, control), right = midpoint(control, end), middle = midpoint(left, right);
  const halves = [line(start, middle), line(middle, end)];
  if (segment.kind === 'arc') {
    Object.assign(halves[0], { kind: 'arc', cx: left.x, cy: left.y });
    Object.assign(halves[1], { kind: 'arc', cx: right.x, cy: right.y });
  }
  result.segments.splice(index, 1, ...halves);
  return result;
}

/** Resolve exact endpoint connections only; drawing tools turn nearby endpoints into exact shared points. */
export function inspectOutlineDrawing(value) {
  const { segments } = draft(value), vertices = new Map(), key = point => `${point.x}:${point.y}`;
  for (let index = 0; index < segments.length; index++) {
    for (const point of [startOf(segments[index]), endOf(segments[index])]) {
      const id = key(point);
      if (!vertices.has(id)) vertices.set(id, { point, edges: [] });
      vertices.get(id).edges.push(index);
    }
  }
  const openEnds = [...vertices.values()].filter(vertex => vertex.edges.length === 1).map(vertex => ({ ...vertex.point }));
  const invalid = message => ({ closed: false, message, openEnds, outline: null });
  if (segments.length < 3) return invalid('请绘制至少 3 条线段，并连接成单个闭合轮廓。');
  if (segments.some(segment => same(startOf(segment), endOf(segment)))) return invalid('有线段的起点与终点重合，请移动端点或删除该线段。');
  if ([...vertices.values()].some(vertex => vertex.edges.length > 2)) return invalid('轮廓存在分支，请删除多余线段后再应用。');
  if (openEnds.length) return invalid(`轮廓还有 ${openEnds.length} 个未连接的端点，请补齐缺口后再应用。`);
  const visited = new Set(), nodes = [], first = startOf(segments[0]);
  let current = first;
  while (visited.size < segments.length) {
    const index = vertices.get(key(current)).edges.find(index => !visited.has(index));
    if (index === undefined) break;
    const segment = segments[index], forward = same(current, startOf(segment));
    nodes.push({ x: current.x, y: current.y, cx: segment.cx, cy: segment.cy });
    visited.add(index);
    current = forward ? endOf(segment) : startOf(segment);
  }
  if (visited.size !== segments.length || !same(current, first)) return invalid('请把所有线段连接成单个闭合轮廓，不能包含多个独立轮廓。');
  return { closed: true, message: '轮廓已闭合，可以应用到裁片。', openEnds, outline: { nodes } };
}

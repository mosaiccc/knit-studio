/** Normalized quadratic outlines; each node controls the edge leading to the following node. */
export const MAX_OUTLINE_NODES = 80;
const FIELDS = ['x', 'y', 'cx', 'cy'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unit = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const clamp = value => Math.max(0, Math.min(1, value));
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export function assertCustomOutline(value) {
  if (value === undefined || value === null) return;
  if (!record(value) || !Array.isArray(value.nodes) || value.nodes.length < 3 || value.nodes.length > MAX_OUTLINE_NODES) throw new Error('自绘轮廓需包含 3–80 个节点。');
  for (const node of value.nodes) {
    if (!record(node) || !FIELDS.every(field => unit(node[field]))) throw new Error('轮廓节点和曲线控制点需为画布内 0–1 的有效坐标。');
  }
}

export function sanitizeCustomOutline(value) {
  assertCustomOutline(value);
  return value == null ? null : { nodes: value.nodes.map(node => Object.fromEntries(FIELDS.map(field => [field, node[field]]))) };
}

/** Keep dormant template references proportional when resizing a custom contour. */
export function resizeOutlineMeasurements(measurements, field, value) {
  if (!['width', 'height'].includes(field)) throw new Error('自绘轮廓缩放请选择宽度或高度。');
  const positive = number => typeof number === 'number' && Number.isFinite(number) && number > 0;
  if (!record(measurements) || !positive(measurements.width) || !positive(measurements.height) || !positive(value)) throw new Error('裁片宽度、高度和新尺寸必须是有限的正数。');
  const result = structuredClone(measurements), ratio = value / measurements[field];
  if (!positive(ratio)) throw new Error('裁片尺寸缩放比例无效。');
  const references = field === 'width' ? ['shoulderWidth', 'neckWidth', 'cuffWidth'] : ['neckDepth', 'armholeDepth'];
  for (const key of references) {
    if (!Object.hasOwn(measurements, key)) continue;
    const before = measurements[key], after = before * ratio;
    if (typeof before !== 'number' || !Number.isFinite(before) || before < 0 || !Number.isFinite(after)) throw new Error('裁片参考尺寸需为有限的非负数。');
    result[key] = after;
  }
  result[field] = value;
  return result;
}

function segmentDistance(point, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const amount = dx || dy ? clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)) : 0;
  return Math.hypot(point[0] - start[0] - amount * dx, point[1] - start[1] - amount * dy);
}

function simplify(points, tolerance) {
  let split = -1, distance = tolerance;
  for (let i = 1; i < points.length - 1; i++) {
    const current = segmentDistance(points[i], points[0], points.at(-1));
    if (current > distance) { split = i; distance = current; }
  }
  return split < 0 ? [points[0], points.at(-1)] : [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)];
}

/** Converts a sampled template without introducing curve bulges. Later control dragging creates curves. */
export function createEditableOutline(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 4096 || Array.from(points).some(point => !Array.isArray(point) || point.length !== 2 || !Array.from(point).every(unit))) throw new Error('轮廓需要有效的归一化坐标点。');
  const unique = points.filter((point, index) => !index || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]).map(point => [...point]);
  if (unique.length > 1 && unique[0][0] === unique.at(-1)[0] && unique[0][1] === unique.at(-1)[1]) unique.pop();
  if (unique.length < 3) throw new Error('轮廓至少需要 3 个不同节点。');
  // Split the closed ring at its farthest point to preserve both closing corners in RDP.
  let opposite = 1;
  for (let i = 2; i < unique.length; i++) if (Math.hypot(unique[i][0] - unique[0][0], unique[i][1] - unique[0][1]) > Math.hypot(unique[opposite][0] - unique[0][0], unique[opposite][1] - unique[0][1])) opposite = i;
  let tolerance = .002, selected;
  do {
    selected = [...simplify(unique.slice(0, opposite + 1), tolerance).slice(0, -1), ...simplify([...unique.slice(opposite), unique[0]], tolerance).slice(0, -1)];
    tolerance *= 1.5;
  } while (selected.length > MAX_OUTLINE_NODES);
  if (selected.length < 3) selected = unique.length <= MAX_OUTLINE_NODES ? unique : [unique[0], unique[Math.floor(unique.length / 3)], unique[Math.floor(unique.length * 2 / 3)]];
  return { nodes: selected.map(([x, y], index) => {
    const next = selected[(index + 1) % selected.length];
    return { x, y, cx: (x + next[0]) / 2, cy: (y + next[1]) / 2 };
  }) };
}

function editable(value, index) {
  const outline = sanitizeCustomOutline(value);
  if (!outline || !Number.isInteger(index) || index < 0 || index >= outline.nodes.length) throw new Error('请选择有效的轮廓节点。');
  return outline;
}

function coordinates(x, y) {
  if (![x, y].every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error('轮廓节点坐标需为有效数字。');
  return [clamp(x), clamp(y)];
}

export function moveOutlineNode(value, index, x, y) {
  const outline = editable(value, index), node = outline.nodes[index], previous = outline.nodes[(index + outline.nodes.length - 1) % outline.nodes.length];
  [x, y] = coordinates(x, y);
  const dx = x - node.x, dy = y - node.y;
  node.x = x; node.y = y;
  for (const adjacent of [previous, node]) { adjacent.cx = clamp(adjacent.cx + dx / 2); adjacent.cy = clamp(adjacent.cy + dy / 2); }
  return outline;
}

export function moveOutlineControl(value, index, cx, cy) {
  const outline = editable(value, index);
  [cx, cy] = coordinates(cx, cy);
  Object.assign(outline.nodes[index], { cx, cy });
  return outline;
}

/** de Casteljau at t=.5 preserves the exact curve, including the closing segment. */
export function insertOutlineNode(value, index) {
  const outline = editable(value, index);
  if (outline.nodes.length >= MAX_OUTLINE_NODES) throw new Error('轮廓最多保留 80 个节点。');
  const start = outline.nodes[index], end = outline.nodes[(index + 1) % outline.nodes.length];
  const left = midpoint([start.x, start.y], [start.cx, start.cy]);
  const right = midpoint([start.cx, start.cy], [end.x, end.y]);
  const middle = midpoint(left, right);
  start.cx = left[0]; start.cy = left[1];
  outline.nodes.splice(index + 1, 0, { x: middle[0], y: middle[1], cx: right[0], cy: right[1] });
  return outline;
}

export function removeOutlineNode(value, index) {
  const outline = editable(value, index);
  if (outline.nodes.length <= 3) throw new Error('轮廓至少保留 3 个节点。');
  const previous = outline.nodes[(index + outline.nodes.length - 1) % outline.nodes.length], next = outline.nodes[(index + 1) % outline.nodes.length];
  previous.cx = (previous.x + next.x) / 2; previous.cy = (previous.y + next.y) / 2;
  outline.nodes.splice(index, 1);
  return outline;
}

function flattenQuadratic(start, control, end, points, depth = 0) {
  if (depth >= 8 || segmentDistance(control, start, end) <= 1 / 6000) { points.push(end); return; }
  const left = midpoint(start, control), right = midpoint(control, end), middle = midpoint(left, right);
  flattenQuadratic(start, left, middle, points, depth + 1);
  flattenQuadratic(middle, right, end, points, depth + 1);
}

/** SVG and chart sampling use the same quadratic segments. */
export function customOutlineGeometry(value) {
  const outline = sanitizeCustomOutline(value);
  if (!outline) throw new Error('未设置自绘轮廓。');
  const { nodes } = outline, points = [[nodes[0].x, nodes[0].y]], number = value => Number((value * 100).toFixed(6));
  let path = `M${number(nodes[0].x)} ${number(nodes[0].y)}`;
  nodes.forEach((start, index) => {
    const end = nodes[(index + 1) % nodes.length];
    path += ` Q${number(start.cx)} ${number(start.cy)} ${number(end.x)} ${number(end.y)}`;
    flattenQuadratic([start.x, start.y], [start.cx, start.cy], [end.x, end.y], points);
  });
  points.pop();
  return { points, path: path + ' Z' };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { GARMENTS, getOutline, getGarment, createGarmentChart } from '../dist/core/garments.js';
import { createGrid } from '../dist/core/pattern.js';
import { createBaseChart } from '../dist/core/placements.js';
import { sanitizeProject, validateProject } from '../dist/core/project.js';
import { normalizePieces, switchActivePiece, duplicatePiece, getPieceProjects } from '../dist/core/pieces.js';

const outline = await import('../dist/core/outline-editing.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const square = () => ({ nodes: [
  { x: 0, y: 0, cx: .5, cy: 0 }, { x: 1, y: 0, cx: 1, cy: .5 },
  { x: 1, y: 1, cx: .5, cy: 1 }, { x: 0, y: 1, cx: 0, cy: .5 },
] });
const project = (garmentId = 'rectangle') => ({ version: 1, name: '轮廓测试', grid: createGrid(4, 4), palette: ['#f5efe3'], garmentId, measurements: { ...getGarment(garmentId).defaults }, gauge: { stitches: 10, rows: 10 }, placement: 'repeat' });
const pointAt = (a, b, t) => ({ x: (1-t)**2*a.x + 2*(1-t)*t*a.cx + t*t*b.x, y: (1-t)**2*a.y + 2*(1-t)*t*a.cy + t*t*b.y });

test('custom outline schema rejects malformed and sparse nodes, sanitizes extras, and accepts old empty values', () => {
  assert.equal(typeof outline.sanitizeCustomOutline, 'function');
  assert.equal(outline.sanitizeCustomOutline(), null);
  assert.equal(outline.sanitizeCustomOutline(null), null);
  const source = square(); source.extra = 'strip'; source.nodes[0].extra = 'strip';
  const clean = outline.sanitizeCustomOutline(source);
  assert.deepEqual(clean, square()); clean.nodes[0].x = .1;
  assert.equal(source.nodes[0].x, 0);
  for (const value of [false, [], {}, { nodes: [] }, { nodes: Array(3) }, { nodes: Array(81).fill(square().nodes[0]) }]) assert.throws(() => outline.sanitizeCustomOutline(value), /轮廓|节点/);
  for (const value of [NaN, Infinity, -.01, 1.01, '.5', undefined]) {
    const invalid = square(); invalid.nodes[0].cx = value;
    assert.throws(() => outline.sanitizeCustomOutline(invalid), /轮廓|节点/);
  }
});

test('all garment templates become editable with bounded nodes while retaining sharp rectangle corners', () => {
  assert.equal(typeof outline.createEditableOutline, 'function');
  for (const garment of GARMENTS) {
    const original = getOutline(garment.id, garment.defaults).points;
    const saved = structuredClone(original);
    const editable = outline.createEditableOutline(original);
    assert.ok(editable.nodes.length >= 3 && editable.nodes.length <= 80, garment.id);
    assert.deepEqual(original, saved);
    assert.doesNotThrow(() => outline.assertCustomOutline(editable));
  }
  assert.deepEqual(outline.createEditableOutline(getOutline('rectangle').points), square());
});

test('moving a vertex moves adjacent controls halfway and leaves other nodes and input intact', () => {
  assert.equal(typeof outline.moveOutlineNode, 'function');
  const source = square(), moved = outline.moveOutlineNode(source, 0, .2, .2);
  assert.deepEqual(source, square());
  assert.deepEqual(moved.nodes[0], { x: .2, y: .2, cx: .6, cy: .1 });
  assert.deepEqual(moved.nodes[3], { x: 0, y: 1, cx: .1, cy: .6 });
  assert.deepEqual(moved.nodes[1], source.nodes[1]);
  assert.throws(() => outline.moveOutlineNode(source, 8, .5, .5), /节点/);
});

test('moving a curve control produces a curved path and changes the actual chart and row counts', () => {
  assert.equal(typeof outline.moveOutlineControl, 'function');
  const source = square(), curved = outline.moveOutlineControl(source, 0, .5, .6);
  assert.deepEqual(source, square());
  assert.equal(curved.nodes[0].cy, .6);
  const geometry = getOutline('rectangle', { width: 20, height: 20 }, curved);
  assert.match(geometry.path, /Q50(?:\.0+)? 60/);
  const chart = createGarmentChart('rectangle', { width: 20, height: 20 }, { stitches: 10, rows: 10 }, [['#f5efe3']], 'repeat', curved);
  assert.equal(chart.grid[0][10], null);
  assert.equal(chart.grid[10][10], '#f5efe3');
  assert.ok(chart.rowCounts.at(-1).count < 20);
  assert.equal(chart.rowCounts[0].count, 20);
  chart.rowCounts.forEach((row, index) => assert.equal(row.count, chart.mask[chart.height - index - 1].filter(Boolean).length));
});

test('midpoint insertion splits a quadratic exactly, including the final closed segment', () => {
  assert.equal(typeof outline.insertOutlineNode, 'function');
  const source = square(); source.nodes[0].cy = .6; source.nodes[3].cx = .5;
  for (const index of [0, 3]) {
    const split = outline.insertOutlineNode(source, index);
    assert.equal(split.nodes.length, 5);
    for (const t of [0, .1, .3, .5, .8, 1]) {
      const expected = pointAt(source.nodes[index], source.nodes[(index + 1) % 4], t);
      const actual = t <= .5 ? pointAt(split.nodes[index], split.nodes[index + 1], t * 2) : pointAt(split.nodes[index + 1], split.nodes[(index + 2) % 5], (t - .5) * 2);
      assert.ok(Math.abs(expected.x - actual.x) < 1e-12 && Math.abs(expected.y - actual.y) < 1e-12);
    }
  }
  assert.equal(source.nodes.length, 4);
});

test('node deletion retains a valid closed outline and refuses fewer than three points or more than eighty', () => {
  assert.equal(typeof outline.removeOutlineNode, 'function');
  const triangle = outline.removeOutlineNode(square(), 1);
  assert.equal(triangle.nodes.length, 3);
  assert.throws(() => outline.removeOutlineNode(triangle, 1), /3|三/);
  const full = { nodes: Array.from({ length: 80 }, (_, i) => ({ x: .5+.4*Math.cos(i*Math.PI/40), y: .5+.4*Math.sin(i*Math.PI/40), cx: .5, cy: .5 })) };
  assert.throws(() => outline.insertOutlineNode(full, 0), /80/);
});

test('custom normalized curves preserve shape when dimensions or gauge change and reach the composition path', () => {
  const source = project(); source.customOutline = square(); source.customOutline.nodes[0].cy = .6;
  source.measurements = { width: 20, height: 20 };
  const base = createBaseChart(source);
  assert.equal(base.grid[0][10], null);
  const larger = createBaseChart({ ...source, measurements: { width: 40, height: 40 } });
  const denser = createBaseChart({ ...source, gauge: { stitches: 20, rows: 20 } });
  assert.deepEqual(larger.mask, denser.mask);
  assert.equal(larger.mask[1][21], false);
  assert.equal(larger.mask[21][21], true);
});

test('custom contours survive project JSON, piece switching and copy with independent nested data', () => {
  let value = normalizePieces(project('round-front'));
  value.customOutline = square(); value.customOutline.nodes[0].cy = .6;
  const backup = sanitizeProject(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(backup.customOutline, value.customOutline);
  value = switchActivePiece(backup, 'back');
  assert.equal(value.customOutline, null);
  value = switchActivePiece(value, 'front');
  assert.equal(value.customOutline.nodes[0].cy, .6);
  const copy = duplicatePiece(value, 'front', { id: 'copy', label: '复制前片' });
  copy.customOutline.nodes[0].cy = .2;
  assert.equal(copy.pieces.find(piece => piece.id === 'front').customOutline.nodes[0].cy, .6);
  const views = getPieceProjects(value);
  assert.equal(views[0].project.customOutline.nodes[0].cy, .6);
  assert.equal(views[1].project.customOutline, null);
  assert.equal(value.customOutline.nodes[0].cy, .6);
});

test('legacy projects load with no custom contour while invalid contours in any piece are rejected', () => {
  const old = sanitizeProject(project('round-front'));
  assert.equal(old.customOutline, null);
  assert.ok(old.pieces.every(piece => piece.customOutline === null));
  const invalid = structuredClone(old); invalid.pieces[1].customOutline = { nodes: [] };
  assert.equal(validateProject(invalid), false);
  assert.throws(() => sanitizeProject({ ...old, customOutline: { nodes: [] } }), /轮廓|节点/);
});

test('curve row rasterization agrees with point-in-polygon, including tangent vertices, boundaries and crossings', () => {
  function contains(x, y, points) {
    let filled = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j];
      const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
      if (Math.abs(cross) < 1e-12 && x >= Math.min(xi, xj) - 1e-12 && x <= Math.max(xi, xj) + 1e-12 && y >= Math.min(yi, yj) - 1e-12 && y <= Math.max(yi, yj) + 1e-12) return true;
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) filled = !filled;
    }
    return filled;
  }
  const curves = [square(), outline.moveOutlineControl(square(), 0, .5, .7),
    outline.createEditableOutline([[.125,.125],[.875,.875],[.125,.875],[.875,.125]]),
    outline.createEditableOutline([[.125,.375],[.5,.125],[.875,.375],[.5,.875]])];
  for (const custom of curves) {
    const points = outline.customOutlineGeometry(custom).points;
    const chart = createGarmentChart('rectangle', { width: 28, height: 28 }, { stitches: 10, rows: 10 }, [['#f5efe3']], 'repeat', custom);
    assert.deepEqual(chart.mask, Array.from({ length: 28 }, (_, y) => Array.from({ length: 28 }, (_, x) => contains((x+.5)/28, (y+.5)/28, points))));
  }
});

test('resizing custom outline measurements scales template references so shrinking a garment remains valid', () => {
  assert.equal(typeof outline.resizeOutlineMeasurements, 'function');
  const original = project('round-front');
  original.customOutline = outline.createEditableOutline(getOutline(original.garmentId, original.measurements).points);
  const source = structuredClone(original);
  const width = outline.resizeOutlineMeasurements(original.measurements, 'width', 30);
  const resized = outline.resizeOutlineMeasurements(width, 'height', 25);
  assert.equal(resized.width, 30);
  assert.equal(resized.height, 25);
  for (const key of ['shoulderWidth', 'neckWidth']) assert.ok(Math.abs(resized[key] - source.measurements[key] * 30 / 48) < 1e-12);
  for (const key of ['neckDepth', 'armholeDepth']) assert.ok(Math.abs(resized[key] - source.measurements[key] * 25 / 58) < 1e-12);
  assert.deepEqual(original, source);
  const restored = sanitizeProject(JSON.parse(JSON.stringify({ ...original, measurements: resized })));
  assert.deepEqual(restored.customOutline, source.customOutline);
  const chart = createBaseChart(restored);
  assert.equal(chart.width, 30);
  assert.equal(chart.height, 25);
  assert.ok(chart.mask.flat().some(Boolean));
  assert.equal(validateProject(restored), true);
  // The original 18 cm armhole must also shrink below a new 15 cm garment height.
  const shortMeasurements = outline.resizeOutlineMeasurements(restored.measurements, 'height', 15);
  const shorter = sanitizeProject(JSON.parse(JSON.stringify({ ...restored, measurements: shortMeasurements })));
  assert.ok(Math.abs(shorter.measurements.armholeDepth - source.measurements.armholeDepth * 15 / 58) < 1e-12);
  assert.ok(shorter.measurements.armholeDepth < 15);
  assert.equal(createBaseChart(shorter).height, 15);
  assert.deepEqual(shorter.customOutline, source.customOutline);
  assert.equal(validateProject(shorter), true);
});

test('custom outline dimension scaling clones only present references and rejects invalid resize inputs', () => {
  assert.equal(typeof outline.resizeOutlineMeasurements, 'function');
  const source = { width: 48, height: 58, neckWidth: 0, custom: { note: 'keep' } };
  const result = outline.resizeOutlineMeasurements(source, 'width', 24);
  assert.deepEqual(result, { width: 24, height: 58, neckWidth: 0, custom: { note: 'keep' } });
  result.custom.note = 'changed';
  assert.equal(source.custom.note, 'keep');
  for (const value of [0, -1, NaN, Infinity, '30', undefined]) assert.throws(() => outline.resizeOutlineMeasurements(source, 'width', value), /尺寸|宽度|高度/);
  for (const value of [0, -1, NaN, Infinity, '48', undefined]) assert.throws(() => outline.resizeOutlineMeasurements({ ...source, width: value }, 'width', 24), /尺寸|宽度|高度/);
  assert.throws(() => outline.resizeOutlineMeasurements(source, 'neckWidth', 12), /宽度|高度/);
  assert.throws(() => outline.resizeOutlineMeasurements({ width: 48, height: 58, shoulderWidth: Infinity }, 'width', 24), /尺寸/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid } from '../dist/core/pattern.js';
import { GARMENTS } from '../dist/core/garments.js';
import * as project from '../dist/core/project.js';

function example() {
  return {
    version: 1,
    name: '午后郁金香',
    grid: createGrid(16, 20),
    palette: ['#f5efe3', '#bf6373'],
    garmentId: 'round-front',
    measurements: { width: 48, height: 58, neckWidth: 18, neckDepth: 9, armholeDepth: 18 },
    gauge: { stitches: 22, rows: 28 },
    placement: 'repeat',
  };
}

test('validates a complete project and default measurements for every garment', () => {
  assert.equal(typeof project.validateProject, 'function');
  assert.equal(project.validateProject(example()), true);
  for (const garment of GARMENTS) {
    const value = { ...example(), garmentId: garment.id, measurements: { ...garment.defaults } };
    assert.equal(project.validateProject(value), true, garment.id);
  }
  const rectangle = { ...example(), garmentId: 'rectangle', measurements: { width: 20, height: 25 } };
  assert.equal(project.validateProject(rectangle), true);
});

test('rejects invalid JSON roots and unsupported project versions without throwing', () => {
  for (const value of [null, false, 123, 'project', [], {}, { ...example(), version: 2 }, { ...example(), version: '1' }]) {
    assert.equal(project.validateProject(value), false);
  }
});

test('requires a nonempty name of at most 80 characters while accepting markup as plain text', () => {
  for (const name of ['', '   ', null, 42, '字'.repeat(81)]) {
    assert.equal(project.validateProject({ ...example(), name }), false);
  }
  const name = '<img src=x onerror="alert(1)"> & "\\雪"';
  const value = { ...example(), name };
  assert.equal(project.validateProject(value), true);
  assert.equal(project.sanitizeProject(value).name, name);
  assert.equal(project.validateProject({ ...example(), name: '字'.repeat(80) }), true);
});

test('rejects malformed pattern grids including sparse rows and cells', () => {
  for (const grid of [null, [], [[null]], createGrid(4, 4).slice(0, 3)]) {
    assert.equal(project.validateProject({ ...example(), grid }), false);
  }
  const rows = createGrid(4, 4);
  delete rows[1];
  assert.equal(project.validateProject({ ...example(), grid: rows }), false);
  const cells = createGrid(4, 4);
  delete cells[1][2];
  assert.equal(project.validateProject({ ...example(), grid: cells }), false);
});

test('requires one to 32 six-digit palette colors and valid placement and garment', () => {
  for (const palette of [undefined, null, [], ['#fff'], ['red'], Array(33).fill('#f5efe3'), Array(2)]) {
    assert.equal(project.validateProject({ ...example(), palette }), false);
  }
  assert.equal(project.validateProject({ ...example(), palette: ['#ABCDEF'] }), true);
  assert.equal(project.validateProject({ ...example(), placement: 'center' }), true);
  for (const placement of ['', 'tile', null, 1]) assert.equal(project.validateProject({ ...example(), placement }), false);
  for (const garmentId of ['missing', null, 42, '__proto__']) assert.equal(project.validateProject({ ...example(), garmentId }), false);
});

test('requires finite numeric gauge values within 0.1 to 100', () => {
  for (const field of ['stitches', 'rows']) {
    for (const value of [0, -1, 0.099, 100.1, NaN, Infinity, '22', null, undefined]) {
      const data = example();
      data.gauge[field] = value;
      assert.equal(project.validateProject(data), false, `${field} ${value}`);
    }
  }
  const low = { ...example(), garmentId: 'rectangle', measurements: { width: 100, height: 100 }, gauge: { stitches: 0.1, rows: 0.1 } };
  assert.equal(project.validateProject(low), true);
  const high = { ...example(), garmentId: 'rectangle', measurements: { width: 10, height: 10 }, gauge: { stitches: 100, rows: 100 } };
  assert.equal(project.validateProject(high), true);
});

test('rejects missing, nonfinite, string and nonpositive main measurements', () => {
  for (const field of ['width', 'height']) {
    for (const value of [0, -1, NaN, Infinity, '48', null, undefined]) {
      const data = example();
      data.measurements[field] = value;
      assert.equal(project.validateProject(data), false, `${field} ${value}`);
    }
  }
  for (const field of ['neckWidth', 'neckDepth', 'armholeDepth']) {
    for (const value of [-1, NaN, Infinity, '9', null]) {
      const data = example();
      data.measurements[field] = value;
      assert.equal(project.validateProject(data), false, `${field} ${value}`);
    }
  }
});

test('enforces garment geometry and chart size limits without creating the chart', () => {
  for (const [field, value] of [['neckWidth', 48], ['neckDepth', 58], ['armholeDepth', 58], ['width', 500], ['height', 500]]) {
    const data = example();
    data.measurements[field] = value;
    assert.equal(project.validateProject(data), false, field);
  }
  const zero = example();
  Object.assign(zero.measurements, { neckWidth: 0, neckDepth: 0, armholeDepth: 0 });
  assert.equal(project.validateProject(zero), true);
  const tooSmall = { ...example(), garmentId: 'rectangle', measurements: { width: 0.01, height: 0.01 } };
  assert.equal(project.validateProject(tooSmall), false);
});

test('sanitizeProject strips extras, normalizes colors and name, and clones nested values', () => {
  assert.equal(typeof project.sanitizeProject, 'function');
  const value = example();
  value.name = '  午后郁金香  ';
  value.grid[0][0] = '#ABCDEF';
  value.palette = ['#ABCDEF', '#F5EFE3'];
  value.unknown = '<script>';
  value.measurements.other = 'ignored';
  value.gauge.other = 'ignored';
  const cleaned = project.sanitizeProject(value);
  assert.deepEqual(Object.keys(cleaned).sort(), ['version', 'name', 'grid', 'palette', 'garmentId', 'measurements', 'gauge', 'placement', 'chartEdits', 'annotations', 'arrangement', 'motifPlacements', 'fabricColor', 'draftMotifId', 'draftMotifName', 'pieces', 'activePieceId', 'stitchSymbols', 'customOutline', 'outlineDrawing'].sort());
  assert.equal(cleaned.name, '午后郁金香');
  assert.equal(cleaned.grid[0][0], '#abcdef');
  assert.deepEqual(cleaned.palette, ['#abcdef', '#f5efe3']);
  assert.equal('other' in cleaned.measurements, false);
  assert.equal('other' in cleaned.gauge, false);
  cleaned.grid[0][0] = '#000000';
  cleaned.palette[0] = '#000000';
  cleaned.measurements.width = 30;
  cleaned.gauge.rows = 20;
  assert.equal(value.grid[0][0], '#ABCDEF');
  assert.equal(value.palette[0], '#ABCDEF');
  assert.equal(value.measurements.width, 48);
  assert.equal(value.gauge.rows, 28);
});

test('sanitizeProject reports useful Chinese validation errors', () => {
  assert.throws(() => project.sanitizeProject(null), /项目|文件/);
  assert.throws(() => project.sanitizeProject({ ...example(), version: 2 }), /版本/);
  assert.throws(() => project.sanitizeProject({ ...example(), name: '' }), /名称/);
  assert.throws(() => project.sanitizeProject({ ...example(), grid: [] }), /图案|网格/);
  assert.throws(() => project.sanitizeProject({ ...example(), palette: [] }), /颜色|色板/);
  assert.throws(() => project.sanitizeProject({ ...example(), gauge: { stitches: 0, rows: 28 } }), /密度/);
});

const annotation = (overrides = {}) => ({ id: 'note-1', garmentId: 'round-front', x: 0.2, y: 0.8, text: '袖口留 6 行', fontSize: 12, color: '#824859', ...overrides });

test('old projects receive empty garment edits and annotations without a version change', () => {
  const cleaned = project.sanitizeProject(example());
  assert.equal(cleaned.version, 1);
  assert.deepEqual(cleaned.chartEdits, {});
  assert.deepEqual(cleaned.annotations, []);
});

test('sanitizes sparse garment edits and annotations with independent copies and literal text', () => {
  const value = example();
  value.chartEdits = { 'round-front': { '1:1': '#BF6373', '600:400': '#ABCDEF' }, sleeve: { '3:2': '#79836a' } };
  value.annotations = [annotation({ text: '<text>留白 & "收针"</text>', color: '#ABCDEF', ignored: 'remove' })];
  assert.equal(project.validateProject(value), true);
  const cleaned = project.sanitizeProject(value);
  assert.deepEqual(cleaned.chartEdits, { 'round-front': { '1:1': '#bf6373', '600:400': '#abcdef' }, sleeve: { '3:2': '#79836a' } });
  assert.deepEqual(cleaned.annotations, [annotation({ text: '<text>留白 & "收针"</text>', color: '#abcdef' })]);
  cleaned.chartEdits['round-front']['1:1'] = '#000000';
  cleaned.annotations[0].x = 0.9;
  assert.equal(value.chartEdits['round-front']['1:1'], '#BF6373');
  assert.equal(value.annotations[0].x, 0.2);
  assert.equal(project.validateProject(JSON.parse(JSON.stringify(cleaned))), true);
});

test('rejects malformed garment edit maps and out-of-bounds stitch keys', () => {
  const invalid = [null, [], { unknown: {} }, { 'round-front': [] }, { 'round-front': null },
    { 'round-front': { '0:1': '#bf6373' } }, { 'round-front': { '601:1': '#bf6373' } },
    { 'round-front': { '1:401': '#bf6373' } }, { 'round-front': { '1:0': '#bf6373' } },
    { 'round-front': { '01:2': '#bf6373' } }, { 'round-front': { '1:2': 'pink' } },
    JSON.parse('{"__proto__":{"1:1":"#bf6373"}}')];
  for (const chartEdits of invalid) assert.equal(project.validateProject({ ...example(), chartEdits }), false, JSON.stringify(chartEdits));
  assert.throws(() => project.sanitizeProject({ ...example(), chartEdits: { 'round-front': { '0:1': '#bf6373' } } }), /针|图解/);
});

test('accepts annotation position and font boundaries across the full drawing area', () => {
  const annotations = [annotation({ x: 0, y: 1, fontSize: 8 }), annotation({ id: 'note-2', x: 1, y: 0, fontSize: 28, text: '字'.repeat(300) })];
  assert.equal(project.validateProject({ ...example(), annotations }), true);
  assert.deepEqual(project.sanitizeProject({ ...example(), annotations }).annotations, annotations);
});

test('rejects invalid, excessive, sparse or duplicate annotations', () => {
  for (const overrides of [
    { id: '' }, { id: 'a'.repeat(81) }, { id: 5 }, { garmentId: 'unknown' },
    { x: -0.1 }, { x: 1.1 }, { x: NaN }, { y: Infinity }, { y: '0.5' },
    { text: '' }, { text: '   ' }, { text: '字'.repeat(301) }, { text: null },
    { fontSize: 7 }, { fontSize: 29 }, { fontSize: '12' }, { color: '#fff' },
  ]) {
    assert.equal(project.validateProject({ ...example(), annotations: [annotation(overrides)] }), false, JSON.stringify(overrides));
  }
  for (const annotations of [null, {}, [null], Array(2), [annotation(), annotation()], Array.from({ length: 51 }, (_, i) => annotation({ id: `note-${i}` }))]) {
    assert.equal(project.validateProject({ ...example(), annotations }), false);
  }
  assert.equal(project.validateProject({ ...example(), annotations: Array.from({ length: 50 }, (_, i) => annotation({ id: `note-${i}` })) }), true);
  assert.throws(() => project.sanitizeProject({ ...example(), annotations: [annotation({ text: '' })] }), /标注|文字/);
});

function placementSnapshot(overrides = {}) {
  return { id: 'placement-1', garmentId: 'round-front', motifId: 'motif-1', name: '春日花样', grid: createGrid(4, 4), palette: ['#f5efe3', '#bf6373'], row: 1, stitch: 1, transparentBackground: false, flipX: false, flipY: false, ...overrides };
}

test('legacy projects receive arrangement, fabric and draft metadata defaults', () => {
  const cleaned = project.sanitizeProject(example());
  assert.equal(cleaned.arrangement, 'legacy');
  assert.deepEqual(cleaned.motifPlacements, []);
  assert.equal(cleaned.fabricColor, '#f5efe3');
  assert.equal(cleaned.draftMotifId, null);
  assert.equal(cleaned.draftMotifName, '未命名提花');
});

test('placement snapshots and draft metadata survive sanitization independently', () => {
  const value = { ...example(), arrangement: 'custom', fabricColor: '#ABCDEF', draftMotifId: 'motif-1', draftMotifName: '  新花样  ', motifPlacements: [placementSnapshot({ grid: createGrid(4, 4, '#ABCDEF'), palette: ['#ABCDEF'], unknown: 'ignored' })] };
  value.motifPlacements[0].grid[0][0] = '#ABCDEF';
  assert.equal(project.validateProject(value), true);
  const clean = project.sanitizeProject(value);
  assert.equal(clean.arrangement, 'custom');
  assert.equal(clean.fabricColor, '#abcdef');
  assert.equal(clean.draftMotifId, 'motif-1');
  assert.equal(clean.draftMotifName, '新花样');
  assert.deepEqual(clean.motifPlacements, [placementSnapshot({ grid: createGrid(4, 4, '#abcdef'), palette: ['#abcdef'] })]);
  clean.motifPlacements[0].grid[0][0] = '#000000';
  clean.motifPlacements[0].palette[0] = '#000000';
  clean.motifPlacements[0].row = 8;
  assert.equal(value.motifPlacements[0].grid[0][0], '#ABCDEF');
  assert.equal(value.motifPlacements[0].palette[0], '#ABCDEF');
  assert.equal(value.motifPlacements[0].row, 1);
  assert.equal(project.validateProject(JSON.parse(JSON.stringify(clean))), true);
});

test('rejects invalid arrangement and fabric or draft metadata', () => {
  for (const change of [{ arrangement: null }, { arrangement: 'repeat' }, { fabricColor: 'red' }, { fabricColor: null }, { draftMotifId: '' }, { draftMotifId: 1 }, { draftMotifId: 'a'.repeat(81) }, { draftMotifName: '' }, { draftMotifName: null }, { draftMotifName: '字'.repeat(81) }]) {
    assert.equal(project.validateProject({ ...example(), ...change }), false, JSON.stringify(change));
  }
  assert.equal(project.validateProject({ ...example(), draftMotifId: null }), true);
});

test('validates bounded complete placement snapshots and rejects duplicates or holes', () => {
  for (const change of [{ id: '' }, { id: 'a'.repeat(81) }, { garmentId: 'unknown' }, { motifId: '' }, { name: '字'.repeat(81) }, { row: 0 }, { row: 601 }, { row: '1' }, { stitch: 401 }, { stitch: 1.1 }, { grid: [] }, { palette: ['#fff'] }, { flipX: 1 }, { flipY: undefined }, { transparentBackground: null }]) {
    assert.equal(project.validateProject({ ...example(), motifPlacements: [placementSnapshot(change)] }), false, JSON.stringify(change));
  }
  for (const motifPlacements of [null, {}, Array(1), [placementSnapshot(), placementSnapshot()], Array.from({ length: 101 }, (_, i) => placementSnapshot({ id: `p-${i}` }))]) {
    assert.equal(project.validateProject({ ...example(), motifPlacements }), false);
  }
  assert.equal(project.validateProject({ ...example(), motifPlacements: Array.from({ length: 100 }, (_, i) => placementSnapshot({ id: `p-${i}`, row: 600, stitch: 400 })) }), true);
  assert.throws(() => project.sanitizeProject({ ...example(), motifPlacements: [placementSnapshot({ row: 0 })] }), /花样|针|行/);
});

test('sanitization migrates body pairs, normalizes shoulder width, and preserves current flat changes', () => {
  const clean = project.sanitizeProject(example());
  assert.equal(clean.activePieceId, 'front');
  assert.equal(clean.pieces.length, 2);
  assert.ok(clean.measurements.shoulderWidth > clean.measurements.neckWidth);
  assert.equal(clean.measurements.shoulderWidth, clean.pieces[0].measurements.shoulderWidth);
  clean.measurements.height = 63;
  clean.chartEdits = { 'round-front': { '1:1': '#ABCDEF' } };
  const saved = project.sanitizeProject(clean);
  assert.equal(saved.pieces[0].measurements.height, 63);
  assert.equal(saved.pieces[0].chartEdits['round-front']['1:1'], '#abcdef');
  assert.equal(clean.pieces[0].measurements.height, 58);
  assert.deepEqual(project.sanitizeProject(JSON.parse(JSON.stringify(saved))), saved);
});

test('all piece data is validated independently, including inactive geometry and scoped edits', () => {
  const clean = project.sanitizeProject(example());
  for (const change of [
    p => { p.pieces[1].measurements.neckWidth = p.pieces[1].measurements.width; },
    p => { p.pieces[1].measurements.shoulderWidth = 1; },
    p => { p.pieces[1].measurements.height = 500; },
    p => { p.pieces[1].chartEdits = { 'round-back': { '0:1': '#bf6373' } }; },
    p => { p.pieces[1].annotations = [annotation({ garmentId: 'round-back', x: -1 })]; },
    p => { p.pieces[1].motifPlacements = [placementSnapshot({ garmentId: 'round-back', row: 0 })]; },
  ]) {
    const bad = structuredClone(clean); change(bad);
    assert.equal(project.validateProject(bad), false);
    assert.throws(() => project.sanitizeProject(bad));
  }
});

test('piece descriptors require unique bounded ids, labels and an existing active id', () => {
  const clean = project.sanitizeProject(example());
  for (const change of [
    p => { p.pieces = []; }, p => { p.pieces = null; }, p => { p.pieces = Array(1); },
    p => { p.pieces = Array.from({ length: 13 }, (_, i) => ({ ...p.pieces[0], id: `p-${i}` })); },
    p => { p.pieces[1].id = p.pieces[0].id; }, p => { p.pieces[1].id = 'a'.repeat(81); },
    p => { p.pieces[1].label = ''; }, p => { p.pieces[1].label = '字'.repeat(81); },
    p => { p.pieces[1].garmentId = 'unknown'; }, p => { p.activePieceId = 'missing'; },
    p => { delete p.activePieceId; }, p => { delete p.pieces[1].measurements; },
  ]) {
    const bad = structuredClone(clean); change(bad);
    assert.equal(project.validateProject(bad), false);
  }
});

test('same-garment pieces may keep independently named annotations and placements', () => {
  const clean = project.sanitizeProject({ ...example(), garmentId: 'camisole' });
  clean.annotations = [annotation({ garmentId: 'camisole', text: '前片' })];
  clean.motifPlacements = [placementSnapshot({ garmentId: 'camisole' })];
  clean.pieces[1].annotations = [annotation({ garmentId: 'camisole', text: '后片' })];
  clean.pieces[1].motifPlacements = [placementSnapshot({ garmentId: 'camisole', row: 3 })];
  assert.equal(project.validateProject(clean), true);
  const saved = project.sanitizeProject(clean);
  assert.equal(saved.pieces[0].annotations[0].text, '前片');
  assert.equal(saved.pieces[1].annotations[0].text, '后片');
  saved.pieces[1].motifPlacements[0].grid[0][0] = '#000000';
  assert.equal(saved.pieces[0].motifPlacements[0].grid[0][0], '#f5efe3');
});

test('piece composition settings sanitize independently with active top-level authority', () => {
  const source = project.sanitizeProject(example());
  source.arrangement = 'custom';
  source.placement = 'center';
  source.fabricColor = '#ABCDEF';
  source.pieces[1].arrangement = 'legacy';
  source.pieces[1].placement = 'repeat';
  source.pieces[1].fabricColor = '#824859';
  const clean = project.sanitizeProject(source);
  assert.equal(clean.pieces[0].arrangement, 'custom');
  assert.equal(clean.pieces[0].placement, 'center');
  assert.equal(clean.pieces[0].fabricColor, '#abcdef');
  assert.equal(clean.pieces[1].arrangement, 'legacy');
  assert.equal(clean.pieces[1].placement, 'repeat');
  assert.equal(clean.pieces[1].fabricColor, '#824859');
  assert.deepEqual(project.sanitizeProject(JSON.parse(JSON.stringify(clean))), clean);
});

test('piece composition settings reject invalid values and inherit missing older fields', () => {
  const source = project.sanitizeProject({ ...example(), arrangement: 'custom', placement: 'center', fabricColor: '#ABCDEF' });
  for (const [field, value] of [['arrangement', 'bad'], ['arrangement', null], ['placement', 'bad'], ['placement', null], ['fabricColor', 'red'], ['fabricColor', null]]) {
    const invalid = structuredClone(source);
    invalid.pieces[1][field] = value;
    assert.equal(project.validateProject(invalid), false);
  }
  for (const piece of source.pieces) for (const field of ['arrangement', 'placement', 'fabricColor']) delete piece[field];
  const clean = project.sanitizeProject(source);
  for (const piece of clean.pieces) {
    assert.equal(piece.arrangement, 'custom');
    assert.equal(piece.placement, 'center');
    assert.equal(piece.fabricColor, '#abcdef');
  }
});

test('project validation accepts twelve explicit pieces without pairing and rejects a thirteenth', () => {
  const clean = project.sanitizeProject(example());
  clean.pieces = Array.from({ length: 12 }, (_, i) => ({ ...structuredClone(clean.pieces[0]), id: `piece-${i}`, label: `裁片${i}` }));
  clean.activePieceId = 'piece-0';
  assert.equal(project.validateProject(clean), true);
  assert.equal(project.sanitizeProject(clean).pieces.length, 12);
  clean.pieces.push({ ...structuredClone(clean.pieces[0]), id: 'piece-12' });
  assert.equal(project.validateProject(clean), false);
  clean.pieces = [clean.pieces[0]];
  assert.equal(project.sanitizeProject(clean).pieces.length, 1);
});

test('missing stitch symbols default to empty maps and valid symbols survive independent JSON copies', () => {
  const source = project.sanitizeProject(example());
  assert.deepEqual(source.stitchSymbols, {});
  assert.ok(source.pieces.every(piece => JSON.stringify(piece.stitchSymbols) === '{}'));
  source.stitchSymbols = { 'round-front': { '1:1': 'knit', '2:2': 'purl', '3:3': 'yo', '4:4': 'k2tog', '5:5': 'ssk', '6:6': 'k3tog', '7:7': 'slip', '600:400': 'ktbl' } };
  source.pieces[1].stitchSymbols = { 'round-back': { '3:1': 'ssk' } };
  const clean = project.sanitizeProject(source);
  assert.deepEqual(clean.pieces[0].stitchSymbols, source.stitchSymbols);
  assert.deepEqual(clean.pieces[1].stitchSymbols, source.pieces[1].stitchSymbols);
  assert.deepEqual(project.sanitizeProject(JSON.parse(JSON.stringify(clean))), clean);
  clean.stitchSymbols['round-front']['1:1'] = 'yo';
  clean.pieces[1].stitchSymbols['round-back']['3:1'] = 'knit';
  assert.equal(source.stitchSymbols['round-front']['1:1'], 'knit');
  assert.equal(clean.pieces[0].stitchSymbols['round-front']['1:1'], 'knit');
  assert.equal(source.pieces[1].stitchSymbols['round-back']['3:1'], 'ssk');
});

test('symbol persistence rejects malformed maps, coordinates, garment ids and unsupported symbols', () => {
  const invalid = [null, [], { unknown: {} }, { 'round-front': [] }, { 'round-front': null },
    { 'round-front': { '0:1': 'knit' } }, { 'round-front': { '601:1': 'knit' } },
    { 'round-front': { '1:401': 'knit' } }, { 'round-front': { '01:1': 'knit' } },
    { 'round-front': { '1:1': 'invalid' } }, { 'round-front': { '1:1': '#bf6373' } },
    { 'round-front': { '1:1': null } }];
  for (const stitchSymbols of invalid) {
    assert.equal(project.validateProject({ ...example(), stitchSymbols }), false);
    const nested = project.sanitizeProject(example());
    nested.pieces[1].stitchSymbols = stitchSymbols;
    assert.equal(project.validateProject(nested), false);
  }
});

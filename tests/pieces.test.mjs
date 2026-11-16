import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid } from '../dist/core/pattern.js';
import { getGarment, getOutline, calculateDimensions } from '../dist/core/garments.js';
import { composeProjectChart } from '../dist/core/placements.js';

import * as pieces from '../dist/core/pieces.js';

function legacy(garmentId = 'round-front', overrides = {}) {
  return { version: 1, name: '前后片测试', grid: createGrid(4, 4), palette: ['#f5efe3', '#bf6373'], gauge: { stitches: 22, rows: 30 }, garmentId, measurements: { ...getGarment(garmentId).defaults }, placement: 'repeat', chartEdits: {}, annotations: [], motifPlacements: [], ...overrides };
}
function note(garmentId, text = '标注') { return { id: 'note', garmentId, x: .2, y: .4, text, fontSize: 12, color: '#bf6373' }; }
function motif(garmentId) { return { id: 'placement', garmentId, motifId: 'motif', name: '花样', grid: createGrid(4, 4), palette: ['#f5efe3'], row: 1, stitch: 1, transparentBackground: false, flipX: false, flipY: false }; }

test('legacy round-front migration retains its active data and creates a fitted back', () => {
  assert.equal(typeof pieces.normalizePieces, 'function');
  const original = legacy('round-front', { measurements: { width: 52, height: 65, neckWidth: 18.5, neckDepth: 7.5, armholeDepth: 21.5 }, chartEdits: { 'round-front': { '1:1': '#bf6373' } }, annotations: [note('round-front')], motifPlacements: [motif('round-front')] });
  const result = pieces.normalizePieces(original);
  assert.equal(result.activePieceId, 'front');
  assert.deepEqual(result.pieces.map(p => [p.id, p.garmentId]), [['front', 'round-front'], ['back', 'round-back']]);
  for (const field of ['width', 'height', 'neckWidth', 'neckDepth', 'armholeDepth']) assert.equal(result.measurements[field], original.measurements[field]);
  assert.deepEqual(result.chartEdits, original.chartEdits);
  assert.deepEqual(result.annotations, original.annotations);
  assert.deepEqual(result.motifPlacements, original.motifPlacements);
  const back = result.pieces[1];
  for (const field of ['width', 'height', 'neckWidth', 'armholeDepth', 'shoulderWidth']) assert.equal(back.measurements[field], result.measurements[field]);
  assert.equal(back.measurements.neckDepth, 3);
  assert.deepEqual(back.chartEdits, {});
  assert.deepEqual(back.annotations, []);
  assert.deepEqual(back.motifPlacements, []);
  assert.equal(original.pieces, undefined);
  assert.deepEqual(pieces.normalizePieces(result), result);
});

test('migration chooses matching body pieces and retains the selected legacy back or side', () => {
  for (const [garmentId, ids, active, garments] of [
    ['round-back', ['front', 'back'], 'back', ['round-front', 'round-back']],
    ['v-front', ['front', 'back'], 'front', ['v-front', 'round-back']],
    ['vest-back', ['front', 'back'], 'back', ['round-front', 'vest-back']],
    ['mock-neck', ['front', 'back'], 'front', ['mock-neck', 'mock-neck']],
    ['camisole', ['front', 'back'], 'front', ['camisole', 'camisole']],
    ['cardigan-left', ['left', 'right', 'back'], 'left', ['cardigan-left', 'cardigan-right', 'round-back']],
    ['cardigan-right', ['left', 'right', 'back'], 'right', ['cardigan-left', 'cardigan-right', 'round-back']],
  ]) {
    const result = pieces.normalizePieces(legacy(garmentId));
    assert.deepEqual(result.pieces.map(p => p.id), ids, garmentId);
    assert.deepEqual(result.pieces.map(p => p.garmentId), garments, garmentId);
    assert.equal(result.activePieceId, active, garmentId);
    assert.equal(result.garmentId, garmentId);
  }
  const mock = pieces.normalizePieces(legacy('mock-neck'));
  assert.equal(mock.pieces[1].measurements.neckDepth, mock.measurements.neckDepth);
  const camisole = pieces.normalizePieces(legacy('camisole'));
  assert.equal(camisole.pieces[1].measurements.neckDepth, 3);
});

test('cardigan back doubles the half-front dimensions and shoulders', () => {
  const result = pieces.normalizePieces(legacy('cardigan-right'));
  const [left, right, back] = result.pieces;
  assert.equal(left.measurements.width, right.measurements.width);
  assert.equal(back.measurements.width, right.measurements.width * 2);
  assert.equal(back.measurements.neckWidth, right.measurements.neckWidth * 2);
  assert.equal(back.measurements.shoulderWidth, right.measurements.shoulderWidth * 2);
  assert.equal(back.measurements.height, right.measurements.height);
});

test('small valid body dimensions and large cardigan migration keep all companion charts valid', () => {
  const cases = [legacy('round-back', { measurements: { width: 2, height: 2, neckWidth: .7, neckDepth: .3, armholeDepth: .8 }, gauge: { stitches: 10, rows: 10 } }),
    legacy('cardigan-left', { measurements: { width: 400, height: 10, neckWidth: 350, neckDepth: 2, armholeDepth: 3 }, gauge: { stitches: 10, rows: 10 } })];
  for (const original of cases) {
    const result = pieces.normalizePieces(original);
    assert.equal(result.measurements.width, original.measurements.width);
    assert.equal(result.measurements.neckDepth, original.measurements.neckDepth);
    for (const piece of result.pieces) {
      assert.doesNotThrow(() => getOutline(piece.garmentId, piece.measurements));
      assert.doesNotThrow(() => calculateDimensions(piece.measurements, result.gauge));
    }
  }
  assert.equal(pieces.normalizePieces(cases[1]).pieces[2].measurements.width, 400);
});

test('legacy archived data for a different garment migrates into its matching companion', () => {
  const original = legacy('round-front', {
    chartEdits: { 'round-front': { '1:1': '#bf6373' }, 'round-back': { '2:2': '#79836a' }, sleeve: { '3:3': '#824859' } },
    annotations: [note('round-back')], motifPlacements: [motif('round-back')],
  });
  const result = pieces.normalizePieces(original);
  assert.deepEqual(result.chartEdits, original.chartEdits, 'active compatibility data remains intact');
  assert.deepEqual(result.pieces[1].chartEdits, { 'round-back': { '2:2': '#79836a' } });
  assert.deepEqual(result.pieces[1].annotations, original.annotations);
  assert.deepEqual(result.pieces[1].motifPlacements, original.motifPlacements);
  result.pieces[1].motifPlacements[0].grid[0][0] = '#000000';
  assert.equal(original.motifPlacements[0].grid[0][0], '#f5efe3');
});

test('accessories, rectangles and sleeves remain single-piece projects', () => {
  for (const id of ['rectangle', 'sleeve', 'hat', 'raglan', 'sock', 'glove', 'scarf']) {
    const result = pieces.normalizePieces(legacy(id));
    assert.equal(result.pieces.length, 1);
    assert.equal(result.activePieceId, 'main');
    assert.equal(result.pieces[0].garmentId, id);
  }
});

test('switching same-garment pieces synchronizes current flat fields and isolates all piece data', () => {
  assert.equal(typeof pieces.switchActivePiece, 'function');
  let project = pieces.normalizePieces(legacy('camisole'));
  project.measurements.neckDepth = 12;
  project.chartEdits.camisole = { '1:1': '#bf6373' };
  project.annotations = [note('camisole', '前片说明')];
  project.motifPlacements = [motif('camisole')];
  const before = structuredClone(project);
  project = pieces.switchActivePiece(project, 'back');
  assert.equal(project.measurements.neckDepth, 3);
  assert.deepEqual(project.chartEdits, {});
  assert.deepEqual(project.annotations, []);
  assert.deepEqual(project.motifPlacements, []);
  project.measurements.neckDepth = 4;
  project.chartEdits.camisole = { '1:1': '#79836a' };
  project.annotations = [note('camisole', '后片说明')];
  const front = pieces.switchActivePiece(project, 'front');
  assert.equal(front.measurements.neckDepth, 12);
  assert.equal(front.chartEdits.camisole['1:1'], '#bf6373');
  assert.equal(front.annotations[0].text, '前片说明');
  assert.equal(front.pieces[1].annotations[0].text, '后片说明');
  assert.deepEqual(before.pieces[0].chartEdits, {}, 'switch did not modify the input or its old stored piece');
  assert.equal(front.pieces[1].measurements.neckDepth, 4);
});

test('syncActivePiece copies authoritative flat fields and leaves shared project state intact', () => {
  assert.equal(typeof pieces.syncActivePiece, 'function');
  const original = pieces.normalizePieces(legacy());
  original.measurements.height = 62;
  original.chartEdits = { 'round-front': { '1:1': '#bf6373' } };
  const result = pieces.syncActivePiece(original);
  assert.equal(result.pieces[0].measurements.height, 62);
  assert.deepEqual(result.pieces[0].chartEdits, original.chartEdits);
  assert.deepEqual(result.grid, original.grid);
  assert.deepEqual(result.gauge, original.gauge);
  result.pieces[0].measurements.height = 60;
  assert.equal(result.measurements.height, 62);
  assert.equal(original.pieces[0].measurements.height, 58);
});

test('getPieceProjects returns detached nonrecursive render views with pending active edits', () => {
  assert.equal(typeof pieces.getPieceProjects, 'function');
  const source = pieces.normalizePieces(legacy('mock-neck'));
  source.measurements.width = 50;
  source.chartEdits = { 'mock-neck': { '1:1': '#bf6373' } };
  const views = pieces.getPieceProjects(source);
  assert.deepEqual(views.map(v => v.id), ['front', 'back']);
  assert.equal(views[0].project.measurements.width, 50);
  assert.equal(views[1].project.measurements.width, 48);
  assert.deepEqual(views[0].project.chartEdits, source.chartEdits);
  assert.deepEqual(views[1].project.chartEdits, {});
  for (const view of views) {
    assert.equal('pieces' in view.project, false);
    assert.equal('activePieceId' in view.project, false);
  }
  views[0].project.grid[0][0] = '#000000';
  assert.equal(views[1].project.grid[0][0], '#f5efe3');
  assert.equal(source.grid[0][0], '#f5efe3');
  assert.throws(() => pieces.switchActivePiece(source, 'missing'), /裁片|片/);
});

test('adding a custom front placement preserves the legacy back arrangement and chart', () => {
  const grid = createGrid(4, 4, '#bf6373');
  let project = pieces.normalizePieces(legacy('round-front', { grid, arrangement: 'legacy', placement: 'repeat', fabricColor: '#f5efe3' }));
  const beforeBack = composeProjectChart(pieces.getPieceProjects(project).find(p => p.id === 'back').project);
  project.arrangement = 'custom';
  project.placement = 'center';
  project.fabricColor = '#79836a';
  project.motifPlacements = [motif('round-front')];
  const views = pieces.getPieceProjects(project);
  assert.equal(views[0].project.arrangement, 'custom');
  assert.equal(views[1].project.arrangement, 'legacy');
  assert.equal(views[1].project.placement, 'repeat');
  assert.equal(views[1].project.fabricColor, '#f5efe3');
  assert.deepEqual(composeProjectChart(views[1].project), beforeBack);
  project = pieces.switchActivePiece(project, 'back');
  assert.equal(project.arrangement, 'legacy');
  assert.equal(project.placement, 'repeat');
  assert.equal(project.fabricColor, '#f5efe3');
  project = pieces.switchActivePiece(project, 'front');
  assert.equal(project.arrangement, 'custom');
  assert.equal(project.placement, 'center');
  assert.equal(project.fabricColor, '#79836a');
});

test('older saved pieces inherit absent composition settings once from project values', () => {
  const source = pieces.normalizePieces(legacy('camisole', { arrangement: 'custom', placement: 'center', fabricColor: '#824859' }));
  for (const piece of source.pieces) for (const key of ['arrangement', 'placement', 'fabricColor']) delete piece[key];
  const normalized = pieces.normalizePieces(source);
  for (const piece of normalized.pieces) {
    assert.equal(piece.arrangement, 'custom');
    assert.equal(piece.placement, 'center');
    assert.equal(piece.fabricColor, '#824859');
  }
  normalized.fabricColor = '#bf6373';
  assert.equal(pieces.getPieceProjects(normalized)[1].project.fabricColor, '#824859');
});

test('addPiece appends a blank selected sleeve while retaining pending changes and shared data', () => {
  assert.equal(typeof pieces.addPiece, 'function');
  const source = pieces.normalizePieces(legacy('round-front', { fabricColor: '#824859' }));
  source.measurements.height = 62;
  source.chartEdits = { 'round-front': { '1:1': '#bf6373' } };
  source.stitchSymbols = { 'round-front': { '1:1': 'knit' } };
  const before = structuredClone(source);
  const result = pieces.addPiece(source, { id: 'left-sleeve', label: '  左袖  ', garmentId: 'sleeve' });
  assert.deepEqual(result.pieces.map(p => p.id), ['front', 'back', 'left-sleeve']);
  assert.equal(result.activePieceId, 'left-sleeve');
  assert.equal(result.garmentId, 'sleeve');
  assert.equal(result.pieces[2].label, '左袖');
  assert.deepEqual(result.measurements, getGarment('sleeve').defaults);
  assert.deepEqual(result.gauge, source.gauge);
  assert.deepEqual(result.grid, source.grid);
  assert.equal(result.fabricColor, '#824859');
  assert.equal(result.arrangement, 'custom');
  assert.deepEqual(result.chartEdits, {});
  assert.deepEqual(result.stitchSymbols, {});
  assert.deepEqual(result.annotations, []);
  assert.deepEqual(result.motifPlacements, []);
  assert.equal(result.pieces[0].measurements.height, 62);
  assert.deepEqual(result.pieces[0].stitchSymbols, source.stitchSymbols);
  assert.deepEqual(source, before);
  assert.ok(composeProjectChart(result).grid.flat().filter(Boolean).every(color => color === '#824859'));
});

test('explicit single body pieces remain single and accept another body without automatic companions', () => {
  const source = pieces.normalizePieces(legacy());
  source.pieces = [source.pieces[0]];
  assert.equal(pieces.normalizePieces(source).pieces.length, 1);
  const result = pieces.addPiece(source, { id: 'extra-front', label: '另一前片', garmentId: 'v-front' });
  assert.deepEqual(result.pieces.map(p => p.id), ['front', 'extra-front']);
});

test('duplicatePiece selects a detached copy including pending active stitches and symbols', () => {
  assert.equal(typeof pieces.duplicatePiece, 'function');
  const source = pieces.normalizePieces(legacy('camisole', { arrangement: 'custom', fabricColor: '#79836a' }));
  source.chartEdits = { camisole: { '1:1': '#bf6373' } };
  source.stitchSymbols = { camisole: { '1:1': 'yo', '2:1': 'ssk' } };
  source.annotations = [note('camisole', '前片备注')];
  source.motifPlacements = [motif('camisole')];
  const result = pieces.duplicatePiece(source, 'front', { id: 'front-copy', label: '前片副本' });
  assert.deepEqual(result.pieces.map(p => p.id), ['front', 'front-copy', 'back']);
  assert.equal(result.activePieceId, 'front-copy');
  assert.deepEqual(result.stitchSymbols, source.stitchSymbols);
  assert.deepEqual(result.motifPlacements, source.motifPlacements);
  result.stitchSymbols.camisole['1:1'] = 'purl';
  result.chartEdits.camisole['1:1'] = '#000000';
  result.annotations[0].text = '副本备注';
  result.motifPlacements[0].grid[0][0] = '#000000';
  assert.equal(result.pieces[0].stitchSymbols.camisole['1:1'], 'yo');
  assert.equal(result.pieces[0].chartEdits.camisole['1:1'], '#bf6373');
  assert.equal(result.pieces[0].annotations[0].text, '前片备注');
  assert.equal(result.pieces[0].motifPlacements[0].grid[0][0], '#f5efe3');
  assert.equal(source.stitchSymbols.camisole['1:1'], 'yo');
  const synced = pieces.syncActivePiece(result);
  assert.equal(synced.pieces[1].stitchSymbols.camisole['1:1'], 'purl');
});

test('renamePiece preserves data and selection, with validation of bounded labels', () => {
  assert.equal(typeof pieces.renamePiece, 'function');
  const source = pieces.normalizePieces(legacy());
  source.stitchSymbols = { 'round-front': { '1:1': 'knit' } };
  const result = pieces.renamePiece(source, 'back', '  后片 <备选>  ');
  assert.equal(result.pieces[1].label, '后片 <备选>');
  assert.equal(result.activePieceId, 'front');
  assert.deepEqual(result.pieces[0].stitchSymbols, source.stitchSymbols);
  assert.equal(source.pieces[1].label, '后片');
  for (const label of ['', '   ', '字'.repeat(81), null]) assert.throws(() => pieces.renamePiece(source, 'back', label));
  assert.throws(() => pieces.renamePiece(source, 'missing', '名称'));
});

test('removePiece selects the adjacent piece when necessary and never recreates deleted pieces', () => {
  assert.equal(typeof pieces.removePiece, 'function');
  const source = pieces.normalizePieces(legacy('cardigan-right'));
  source.stitchSymbols = { 'cardigan-right': { '2:2': 'ktbl' } };
  const withoutLeft = pieces.removePiece(source, 'left');
  assert.equal(withoutLeft.activePieceId, 'right');
  assert.deepEqual(withoutLeft.stitchSymbols, source.stitchSymbols);
  const withoutRight = pieces.removePiece(source, 'right');
  assert.equal(withoutRight.activePieceId, 'back');
  assert.equal(withoutRight.garmentId, 'round-back');
  const withoutLast = pieces.removePiece(pieces.switchActivePiece(source, 'back'), 'back');
  assert.equal(withoutLast.activePieceId, 'right');
  const remaining = pieces.removePiece(withoutRight, 'left');
  assert.equal(pieces.normalizePieces(remaining).pieces.length, 1);
  assert.throws(() => pieces.removePiece(remaining, 'back'), /至少|最后/);
  assert.throws(() => pieces.removePiece(source, 'missing'), /裁片/);
  assert.equal(source.pieces.length, 3);
});

test('piece operations enforce the 12-piece capacity, unique ids and every retained geometry', () => {
  assert.equal(pieces.MAX_PIECES, 12);
  let full = pieces.normalizePieces(legacy('rectangle'));
  for (let i = 1; i < 12; i++) full = pieces.addPiece(full, { id: `extra-${i}`, label: `裁片${i}`, garmentId: 'rectangle' });
  assert.equal(full.pieces.length, 12);
  assert.throws(() => pieces.addPiece(full, { id: 'overflow', label: '多余裁片', garmentId: 'rectangle' }), /12/);
  assert.throws(() => pieces.duplicatePiece(full, 'main', { id: 'overflow', label: '副本' }), /12/);
  assert.equal(pieces.renamePiece(full, 'main', '主片').pieces.length, 12);
  const source = pieces.normalizePieces(legacy());
  for (const options of [{ id: 'front', label: '重复', garmentId: 'sleeve' }, { id: '', label: '无编号', garmentId: 'sleeve' }, { id: 'a'.repeat(81), label: '过长', garmentId: 'sleeve' }, { id: 'new', label: '', garmentId: 'sleeve' }, { id: 'new', label: '未知版型', garmentId: 'unknown' }]) {
    assert.throws(() => pieces.addPiece(source, options));
  }
  const invalid = structuredClone(source);
  invalid.pieces[1].measurements.height = 1000;
  assert.throws(() => pieces.addPiece(invalid, { id: 'sleeve', label: '袖子', garmentId: 'sleeve' }));
  assert.throws(() => pieces.duplicatePiece(invalid, 'front', { id: 'copy', label: '副本' }));
  assert.throws(() => pieces.renamePiece(invalid, 'front', '前片新名称'));
  assert.throws(() => pieces.removePiece(invalid, 'front'));
  const dense = pieces.normalizePieces(legacy('rectangle', { measurements: { width: 10, height: 10 }, gauge: { stitches: 10, rows: 100 } }));
  assert.throws(() => pieces.addPiece(dense, { id: 'scarf', label: '围巾', garmentId: 'scarf' }), /600|上限/);
});

test('stitch symbols migrate and switch independently, including old garment-keyed archives', () => {
  const source = legacy('round-front', { stitchSymbols: { 'round-front': { '1:1': 'knit' }, 'round-back': { '2:3': 'purl' }, sleeve: { '4:5': 'yo' } } });
  const normalized = pieces.normalizePieces(source);
  assert.deepEqual(normalized.stitchSymbols, source.stitchSymbols);
  assert.deepEqual(normalized.pieces[1].stitchSymbols, { 'round-back': { '2:3': 'purl' } });
  const back = pieces.switchActivePiece(normalized, 'back');
  back.stitchSymbols['round-back']['2:3'] = 'k2tog';
  const front = pieces.switchActivePiece(back, 'front');
  assert.equal(front.stitchSymbols['round-front']['1:1'], 'knit');
  assert.equal(front.pieces[1].stitchSymbols['round-back']['2:3'], 'k2tog');
  const views = pieces.getPieceProjects(front);
  assert.equal(views[1].project.stitchSymbols['round-back']['2:3'], 'k2tog');
  assert.deepEqual(pieces.normalizePieces(legacy('camisole', { stitchSymbols: { camisole: { '1:1': 'yo' } } })).pieces[1].stitchSymbols, {});
});

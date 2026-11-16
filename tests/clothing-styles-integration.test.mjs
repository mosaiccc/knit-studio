import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOTHING_STYLES, createStyleProject } from '../dist/core/clothing-styles.js';
import { getGarment, getFrontOpeningLength, isHalfFront, isRaisedNeck } from '../dist/core/garments.js';
import { getPieceProjects, switchActivePiece } from '../dist/core/pieces.js';
import { sanitizeProject } from '../dist/core/project.js';
import { composeProjectChart } from '../dist/core/placements.js';
import { buildWrittenPattern } from '../dist/core/written-pattern.js';
import { buildAllPiecesSVG, buildAnnotatedShapeSVG, buildChartSVG } from '../dist/export.js';

const palette = ['#f5efe3', '#bf6373', '#79836a'];
const make = (styleId, options = {}) => createStyleProject({
  styleId, name: '整衣 <裁片> & 配色', gauge: { stitches: 10, rows: 10 }, palette, ...options,
});
const roundtrip = project => sanitizeProject(JSON.parse(JSON.stringify(project)));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .02, `${message}: ${actual} ≈ ${expected}`);

for (const style of CLOTHING_STYLES) {
  test(`${style.id}: complete piece roster survives save/load and both visual and written exports`, () => {
    const project = make(style.id);
    const restored = roundtrip(project);
    assert.deepEqual(restored, project, 'saving a new style must not add or replace pieces');
    assert.deepEqual(restored.pieces.map(piece => piece.garmentId), style.pieces.map(piece => piece.garmentId));
    assert.equal(new Set(restored.pieces.map(piece => piece.id)).size, restored.pieces.length);

    const views = getPieceProjects(restored);
    const charts = views.map(piece => composeProjectChart(piece.project));
    assert.ok(charts.every(chart => chart.mask.some(row => row.some(Boolean))), 'every component has actual stitch cells');
    for (const kind of ['chart', 'shape']) {
      const svg = buildAllPiecesSVG(restored, kind);
      assert.equal((svg.match(/data-piece-id=/g) || []).length, views.length);
      assert.doesNotMatch(svg, /(?:NaN|Infinity|undefined)/);
      assert.match(svg, /整衣 &lt;裁片&gt; &amp; 配色/);
      for (const piece of views) assert.ok(svg.includes(`data-piece-id="${piece.id}"`), `${kind} includes ${piece.id}`);
      if (kind === 'chart') {
        const expectedCells = charts.reduce((sum, chart) => sum + chart.mask.flat().filter(Boolean).length, 0);
        assert.equal((svg.match(/data-cell="true"/g) || []).length, expectedCells, 'combined export keeps all knitted cells');
      }
    }
    for (const direction of ['bottom-up', 'top-down']) {
      const tutorial = buildWrittenPattern(restored, { direction, scope: 'all' });
      assert.deepEqual(tutorial.pieces.map(piece => piece.id), views.map(piece => piece.id));
      assert.ok(tutorial.pieces.every(piece => piece.rows.length > 0));
      assert.equal(tutorial.direction, direction);
      for (const piece of tutorial.pieces) {
        assert.ok(tutorial.text.includes(`${piece.label} · ${getGarment(piece.garmentId).name}`));
        const firstRow = piece.rows[0].chartRow;
        const lastRow = piece.rows.at(-1).chartRow;
        assert.ok(direction === 'bottom-up' ? firstRow <= lastRow : firstRow >= lastRow);
      }
    }
  });
}

for (const styleId of ['round-cardigan', 'v-cardigan']) {
  test(`${styleId}: seven pieces include two independently editable overlapping button bands`, () => {
    let project = make(styleId, { width: 52, height: 62, placketWidth: 3 });
    assert.equal(project.pieces.length, 7);
    const fronts = project.pieces.filter(piece => isHalfFront(piece.garmentId));
    const bands = project.pieces.filter(piece => piece.garmentId.startsWith('placket-'));
    const back = project.pieces.find(piece => piece.garmentId === 'cardigan-back');
    assert.equal(fronts.length, 2);
    assert.deepEqual(bands.map(piece => piece.garmentId).sort(), ['placket-left', 'placket-right']);
    near(fronts[0].measurements.width + fronts[1].measurements.width + 3, 52, 'closed front width includes one overlap width');
    assert.equal(back.measurements.width, 52);
    for (const band of bands) {
      assert.equal(band.measurements.width, 3);
      const matchingFront = fronts.find(front => front.garmentId.endsWith(band.garmentId.endsWith('-left') ? '-left' : '-right'));
      near(band.measurements.height, getFrontOpeningLength(matchingFront.garmentId, matchingFront.measurements), 'band follows its front opening');
    }
    const originalRight = structuredClone(bands[1]);
    const originalFronts = structuredClone(fronts);
    project = switchActivePiece(project, bands[0].id);
    project.measurements.width = 4;
    project.measurements.height += 2;
    project = roundtrip(project);
    assert.equal(project.pieces.find(piece => piece.id === bands[0].id).measurements.width, 4);
    assert.deepEqual(project.pieces.find(piece => piece.id === bands[1].id), originalRight);
    assert.deepEqual(project.pieces.filter(piece => isHalfFront(piece.garmentId)), originalFronts);

    const bandProject = getPieceProjects(project).find(piece => piece.id === bands[0].id).project;
    const bandShape = buildAnnotatedShapeSVG(bandProject, composeProjectChart(bandProject));
    assert.doesNotMatch(bandShape, /data-role="shoulder-dimension"/);
    const tutorial = buildWrittenPattern(project, { scope: 'all' });
    assert.equal(tutorial.pieces.filter(piece => piece.garmentId.startsWith('placket-')).length, 2);
    assert.equal(tutorial.pieces.find(piece => piece.id === bands[0].id).shoulderWidth, undefined);
  });
}

test('all half-front shoulder dimensions align with the outer shoulder edge in SVG', () => {
  const projects = ['round-cardigan', 'v-cardigan', 'cardigan-vest'].flatMap(styleId =>
    getPieceProjects(make(styleId)).filter(piece => isHalfFront(piece.project.garmentId)).map(piece => piece.project));
  assert.equal(new Set(projects.map(project => project.garmentId)).size, 6);
  for (const project of projects) {
    const svg = buildAnnotatedShapeSVG(project, composeProjectChart(project));
    const dimension = /data-role="shoulder-dimension"><path d="M([\d.-]+) [\d.-]+v-8M[\d.-]+ [\d.-]+H([\d.-]+)/.exec(svg);
    assert.ok(dimension, `${project.garmentId} has a shoulder dimension`);
    const m = project.measurements;
    const scale = Math.min(173 / m.width, 216 / m.height);
    const width = m.width * scale;
    const left = (280 - width) / 2;
    const span = m.shoulderWidth * scale;
    const expectedStart = project.garmentId.endsWith('-left') ? left + width - span : left;
    near(Number(dimension[1]), expectedStart, `${project.garmentId} shoulder start`);
    near(Number(dimension[2]), expectedStart + span, `${project.garmentId} shoulder end`);
  }
});

test('raised-neck back remains a raised neck after piece switching and JSON reload', () => {
  let project = make('mock-pullover');
  const front = project.pieces.find(piece => piece.garmentId === 'mock-neck');
  const back = project.pieces.find(piece => piece.garmentId === 'mock-neck-back');
  assert.ok(front && back);
  assert.equal(isRaisedNeck(back.garmentId), true);
  assert.ok(getGarment(back.garmentId).fields.includes('neckDepth'));
  assert.equal(back.measurements.neckDepth, front.measurements.neckDepth);
  project = switchActivePiece(project, back.id);
  project.measurements.neckDepth += 1;
  project = roundtrip(project);
  assert.equal(project.measurements.neckDepth, front.measurements.neckDepth + 1);
  assert.equal(project.pieces.find(piece => piece.id === front.id).measurements.neckDepth, front.measurements.neckDepth);
  assert.ok(composeProjectChart(project).mask.some(row => row.some(Boolean)));
});

test('two sleeves of the same template keep dimensions, colors, stitches and notes independent across export', () => {
  let project = make('round-pullover');
  const sleeves = project.pieces.filter(piece => piece.garmentId === 'sleeve');
  assert.equal(sleeves.length, 2);
  const [left, right] = sleeves;
  project = switchActivePiece(project, left.id);
  const originalWidth = project.measurements.width;
  const originalChart = composeProjectChart(project);
  const stitch = Math.ceil(originalChart.width / 2);
  const key = `1:${stitch}`;
  project.chartEdits = { sleeve: { [key]: '#bf6373' } };
  project.stitchSymbols = { sleeve: { [key]: 'purl' } };
  project.annotations = [{ id: 'left-sleeve-note', garmentId: 'sleeve', x: .5, y: .5, text: '左袖留两行', fontSize: 12, color: '#bf6373' }];
  project.measurements.width += 1;
  project = switchActivePiece(project, right.id);
  assert.equal(project.measurements.width, originalWidth);
  assert.deepEqual(project.chartEdits, {});
  assert.deepEqual(project.stitchSymbols, {});
  assert.deepEqual(project.annotations, []);
  project = roundtrip(project);
  const views = getPieceProjects(project);
  const leftProject = views.find(piece => piece.id === left.id).project;
  const rightProject = views.find(piece => piece.id === right.id).project;
  const leftChart = composeProjectChart(leftProject);
  const rightChart = composeProjectChart(rightProject);
  assert.equal(leftChart.grid.at(-1)[leftChart.width - stitch], '#bf6373');
  assert.equal(rightChart.grid.at(-1)[rightChart.width - stitch], '#f5efe3');
  const leftSVG = buildChartSVG(leftProject, leftChart);
  const rightSVG = buildChartSVG(rightProject, rightChart);
  assert.match(leftSVG, /data-stitch-legend="purl"/);
  assert.match(leftSVG, /左袖留两行/);
  assert.doesNotMatch(rightSVG, /data-stitch-legend="purl"|左袖留两行/);
  const tutorial = buildWrittenPattern(project, { scope: 'all' });
  assert.deepEqual(tutorial.pieces.find(piece => piece.id === left.id).usedStitches, ['purl']);
  assert.deepEqual(tutorial.pieces.find(piece => piece.id === right.id).usedStitches, []);
  assert.match(tutorial.pieces.find(piece => piece.id === left.id).text, /左袖留两行/);
  assert.doesNotMatch(tutorial.pieces.find(piece => piece.id === right.id).text, /左袖留两行/);
});

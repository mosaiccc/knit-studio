import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartSVG, buildPatternSVG, buildAnnotatedShapeSVG, buildAllPiecesSVG, printAllPieces } from '../dist/export.js';
import { getOutline } from '../dist/core/garments.js';
import { createEditableOutline, moveOutlineControl } from '../dist/core/outline-editing.js';
import { composeProjectChart } from '../dist/core/placements.js';

const measurements = { width: 10, height: 10 };
function outline(bend) {
  return moveOutlineControl(createEditableOutline(getOutline('rectangle', measurements).points), 0, .5, bend);
}
function example() {
  return {
    version: 1, name: '自绘裁片与扭针', garmentId: 'rectangle', measurements: { ...measurements },
    gauge: { stitches: 10, rows: 10 }, grid: Array.from({ length: 4 }, () => Array(4).fill('#ffffff')),
    palette: ['#ffffff'], placement: 'repeat', customOutline: outline(.7),
    stitchSymbols: { rectangle: { '1:1': 'ptbl', '1:2': 'k3tog' } }, annotations: [],
  };
}
function paired() {
  const project = example();
  const piece = (id, label, customOutline) => ({ id, label, garmentId: 'rectangle', measurements: { ...measurements }, customOutline,
    chartEdits: {}, stitchSymbols: {}, annotations: [], motifPlacements: [], arrangement: 'legacy', placement: 'repeat', fabricColor: '#ffffff' });
  project.activePieceId = 'front';
  project.pieces = [piece('front', '前片', project.customOutline), piece('back', '后片', outline(.3))];
  return project;
}
function metadata(svg) {
  const value = /<metadata>([\s\S]*?)<\/metadata>/.exec(svg)[1];
  return JSON.parse(value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
function pieceFragments(svg) {
  const markers = [...svg.matchAll(/<g data-piece-id="([^"]+)"/g)];
  return new Map(markers.map((marker, i) => [marker[1], svg.slice(marker.index, markers[i + 1]?.index ?? svg.length)]));
}

test('chart exports retain visible twisted purl and retired k3tog symbols with both Chinese legends', () => {
  const project = example(), chart = composeProjectChart(project);
  const svg = buildChartSVG(project, chart, '自绘矩形');
  for (const id of ['ptbl', 'k3tog']) {
    assert.match(svg, new RegExp(`data-stitch-symbol="${id}"`));
    assert.match(svg, new RegExp(`data-stitch-legend="${id}"`));
  }
  assert.match(svg, /扭上针/);
  assert.match(svg, /右倾三并一/);
  assert.deepEqual(metadata(svg).stitchSymbols, project.stitchSymbols.rectangle);
  assert.deepEqual(metadata(svg).customOutline, project.customOutline);
  assert.doesNotMatch(buildPatternSVG(project), /data-stitch-symbol|data-stitch-legend|customOutline/);
});

test('the annotated shape uses its edited quadratic path and preserves normalized controls in metadata', () => {
  const project = example(), chart = composeProjectChart(project);
  const svg = buildAnnotatedShapeSVG(project, chart, '自绘矩形');
  const path = /data-role="shape-outline" d="([^"]+)"/.exec(svg)[1];
  assert.match(path, /Q/);
  assert.equal(path, getOutline(project.garmentId, project.measurements, project.customOutline).path);
  assert.deepEqual(metadata(svg).customOutline, project.customOutline);
  assert.ok((svg.match(/data-role="shape-outline"/g) || []).length === 1);
});

test('custom outlines label shoulder and neckline measurements as template references without relabelling ordinary templates', () => {
  const project = { ...example(), garmentId: 'round-front',
    measurements: { width: 48, height: 58, shoulderWidth: 36, neckWidth: 18, neckDepth: 9, armholeDepth: 18 } };
  const svg = buildAnnotatedShapeSVG(project, composeProjectChart(project), '自绘前片');
  assert.match(svg, /模板肩宽参考 36 cm \/ 36 针/);
  assert.match(svg, /自定义轮廓；肩部、领口参数为模板参考，实际针位以图解为准/);
  const original = { ...project, customOutline: null };
  const originalSVG = buildAnnotatedShapeSVG(original, composeProjectChart(original), '圆领前片');
  assert.match(originalSVG, /肩宽 36 cm \/ 36 针/);
  assert.doesNotMatch(originalSVG, /模板肩宽参考|自定义轮廓；/);
});

test('combined shape and chart exports retain each same-template piece\'s independent edited outline', () => {
  const project = paired();
  const shapes = pieceFragments(buildAllPiecesSVG(project, 'shape'));
  const charts = pieceFragments(buildAllPiecesSVG(project, 'chart'));
  assert.deepEqual([...shapes.keys()], ['front', 'back']);
  const expected = new Map([['front', project.customOutline], ['back', project.pieces[1].customOutline]]);
  for (const [id, customOutline] of expected) {
    const fragment = shapes.get(id), path = /data-role="shape-outline" d="([^"]+)"/.exec(fragment)[1];
    assert.match(path, /Q/);
    assert.equal(path, getOutline('rectangle', measurements, customOutline).path);
    assert.deepEqual(metadata(fragment).customOutline, customOutline);
    assert.deepEqual(metadata(charts.get(id)).customOutline, customOutline);
    assert.ok((charts.get(id).match(/data-cell="true"/g) || []).length < 100, 'the exported chart must follow the edited outline');
  }
  assert.notEqual(metadata(shapes.get('front')).customOutline.nodes[0].cy, metadata(shapes.get('back')).customOutline.nodes[0].cy);
});

test('all-piece printing includes edited outlines and the new and retired symbol legends', () => {
  let html = '';
  const previous = globalThis.window;
  globalThis.window = { open: () => ({ document: { open() {}, write(value) { html = value; }, close() {} }, focus() {} }) };
  try { assert.equal(printAllPieces(paired()), true); }
  finally { globalThis.window = previous; }
  assert.match(html, /data-role="shape-outline" d="[^"]*Q/);
  assert.match(html, /data-stitch-legend="ptbl"/);
  assert.match(html, /data-stitch-legend="k3tog"/);
  assert.match(html, /扭上针/);
  assert.match(html, /右倾三并一/);
});

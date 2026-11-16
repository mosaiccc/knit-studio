import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartSVG, buildPatternSVG, buildAnnotatedShapeSVG, buildAllPiecesSVG, printChart, printAllPieces } from '../dist/export.js';

const project = {
  name: '小熊 <亲子> & "花样"', garmentId: 'vest',
  grid: [['#aabbcc', '#ffffff'], ['#ffffff', '#aabbcc']],
  measurements: { width: 20, height: 30, neckWidth: 8, neckDepth: 5, armholeDepth: 10 },
  gauge: { stitches: 20, rows: 30 }, placement: 'repeat'
};
const chart = {
  width: 3, height: 2, stitches: 3, rows: 2, actualWidth: 1.5, actualHeight: 0.67,
  grid: [[null, '#aabbcc', null], ['#ffffff', '#aabbcc', '#ffffff']],
  mask: [[false, true, false], [true, true, true]],
  rowCounts: [{ row: 1, count: 3, segments: [{ start: 1, end: 3 }] }, { row: 2, count: 1, segments: [{ start: 2, end: 2 }] }]
};

test('chart export includes escaped title, dimensions and gauge', () => {
  const svg = buildChartSVG(project, chart, '背心');
  assert.match(svg, /小熊 &lt;亲子&gt; &amp; &quot;花样&quot;/);
  assert.doesNotMatch(svg, /<亲子>/);
  assert.match(svg, /背心/);
  assert.match(svg, /20 × 30 cm/);
  assert.match(svg, /3 针 × 2 行/);
  assert.match(svg, /20 针 × 30 行 \/ 10 cm/);
  assert.match(svg, /1\.5 × 0\.67 cm/);
});

test('chart exports only knitted cells with bottom-up rows and right-to-left stitches', () => {
  const svg = buildChartSVG(project, chart, '背心');
  assert.equal((svg.match(/data-cell="true"/g) || []).length, 4);
  assert.match(svg, /data-row="2" data-stitch="2"[^>]*fill="#AABBCC"/);
  assert.match(svg, /data-row="1" data-stitch="3"[^>]*fill="#FFFFFF"/);
  assert.doesNotMatch(svg, /data-row="2" data-stitch="3"[^>]*data-cell/);
  assert.match(svg, /data-axis="row" data-number="1"/);
  assert.match(svg, /data-axis="stitch" data-number="1"/);
  assert.match(svg, /A · #AABBCC · 2 针/);
  assert.match(svg, /B · #FFFFFF · 2 针/);
});

test('mask excludes a cell even when a color is supplied', () => {
  const svg = buildChartSVG(project, { ...chart, grid: [['#ff0000', '#aabbcc', '#ff0000'], chart.grid[1]] }, '背心');
  assert.equal((svg.match(/data-cell="true"/g) || []).length, 4);
  assert.doesNotMatch(svg, /#FF0000/);
});

test('motif export contains motif counts and cannot include an injected SVG element', () => {
  const svg = buildPatternSVG({ ...project, name: '</text><script>alert(1)</script>', grid: [['#fff', '#000']] });
  assert.match(svg, /2 针 × 1 行/);
  assert.match(svg, /#FFFFFF · 1 针/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test('large SVG keeps every cell, all edge labels, and heavier ten-cell guides', () => {
  const grid = Array.from({ length: 82 }, () => Array(62).fill('#663322'));
  const svg = buildChartSVG(project, { ...chart, grid, mask: null, width: 62, height: 82, stitches: 62, rows: 82 }, '围巾');
  assert.equal((svg.match(/data-cell="true"/g) || []).length, 62 * 82);
  assert.match(svg, /data-axis="row" data-number="82"/);
  assert.match(svg, /data-axis="stitch" data-number="62"/);
  assert.match(svg, /data-guide="10"/);
});

test('print export reports a blocked popup without throwing', () => {
  const oldWindow = globalThis.window;
  globalThis.window = { open: () => null };
  try { assert.equal(printChart(project, chart, '背心'), false); }
  finally { globalThis.window = oldWindow; }
});

test('print creates bounded detail tiles and merges equal adjacent row instructions', () => {
  const grid = Array.from({ length: 82 }, () => Array(62).fill('#663322'));
  let html = '';
  const popup = { document: { open() {}, write(value) { html += value; }, close() {} }, focus() {} };
  const oldWindow = globalThis.window;
  globalThis.window = { open: () => popup };
  try {
    assert.equal(printChart(project, { ...chart, grid, mask: null, width: 62, height: 82, stitches: 62, rows: 82,
      rowCounts: Array.from({ length: 82 }, (_, i) => ({ row: i + 1, count: 62, segments: [{ start: 1, end: 62 }] }))
    }, '围巾'), true);
  } finally { globalThis.window = oldWindow; }
  assert.equal((html.match(/class="detail-page"/g) || []).length, 4);
  assert.match(html, /第 1–82 行/);
  assert.match(html, /break-after: page/);
  assert.match(html, /打印|另存为 PDF/);
  assert.doesNotMatch(html, /<亲子>/);
});

const annotatedProject = {
  ...project, garmentId: 'rectangle',
  annotations: [
    { id: 'note-1', garmentId: 'rectangle', x: 0.5, y: 0.5, text: '领口 <留针> & "确认"\n第二行\n\n第四行', fontSize: 14, color: '#123456' },
    { id: 'other-note', garmentId: 'hat', x: 0.5, y: 0.5, text: '帽子的专属备注', fontSize: 12, color: '#000000' }
  ]
};

test('full chart carries current-shape notes without changing knitted cells or legend', () => {
  const svg = buildChartSVG(annotatedProject, chart, '矩形');
  assert.match(svg, /版型与文字标注/);
  assert.match(svg, /data-annotation-id="note-1"/);
  assert.match(svg, /领口 &lt;留针&gt; &amp; &quot;确认&quot;/);
  assert.match(svg, /<tspan[^>]*>第二行<\/tspan>/);
  assert.match(svg, /<tspan[^>]*><\/tspan><tspan[^>]*>第四行<\/tspan>/);
  assert.doesNotMatch(svg, /帽子的专属备注/);
  assert.equal((svg.match(/data-cell="true"/g) || []).length, 4);
  assert.match(svg, /A · #AABBCC · 2 针/);
  assert.match(svg, /B · #FFFFFF · 2 针/);
});

test('annotated diagram preserves preview coordinates, centered text, size, and line spacing', () => {
  const svg = buildAnnotatedShapeSVG(annotatedProject, chart, '矩形');
  assert.match(svg, /data-annotation-id="note-1"[^>]*x="140" y="155"[^>]*font-size="14"[^>]*fill="#123456"[^>]*text-anchor="middle"/);
  assert.match(svg, /<tspan x="140" y="172\.5">第二行<\/tspan>/);
  assert.match(svg, /<tspan x="140" y="207\.5">第四行<\/tspan>/);
  assert.match(svg, /data-role="shape-outline"/);
  assert.match(svg, /stroke-width="3" stroke-opacity="0\.94"[^>]*paint-order="stroke fill"/);
});

test('diagram expands around edge notes and preserves edited chart colors', () => {
  const note = { id: 'edge', garmentId: 'rectangle', x: 1, y: 1, text: '右侧文字'.repeat(8) + '\n最后一行', fontSize: 28, color: '#aa3344' };
  const editedChart = { ...chart, grid: [chart.grid[0], ['#112233', '#aabbcc', '#ffffff']] };
  const svg = buildAnnotatedShapeSVG({ ...annotatedProject, annotations: [note] }, editedChart, '矩形');
  const bounds = /data-role="annotated-shape"[^>]*viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  assert.ok(bounds, 'diagram has explicit bounds');
  const [x, y, width, height] = bounds.slice(1).map(Number);
  assert.ok(x < 0 && x + width > 560, 'long centered edge note is within the expanded width');
  assert.ok(y + height > 345, 'last baseline and descenders remain within the expanded height');
  assert.match(svg, /fill="#112233"/);
  assert.match(svg, /最后一行/);
});

test('legacy charts and motif-only SVGs stay unchanged when there are no relevant notes', () => {
  const original = buildChartSVG(project, chart, '背心');
  assert.equal(buildChartSVG({ ...project, annotations: [] }, chart, '背心'), original);
  assert.equal(buildChartSVG({ ...project, annotations: annotatedProject.annotations }, chart, '背心'), original);
  assert.equal(buildPatternSVG(annotatedProject), buildPatternSVG({ ...annotatedProject, annotations: [] }));
  assert.doesNotMatch(buildPatternSVG(annotatedProject), /领口|版型与文字标注/);
  const shape = buildAnnotatedShapeSVG({ ...annotatedProject, annotations: [] }, chart, '矩形');
  assert.match(shape, /data-role="shape-outline"/);
});

test('print keeps the normal overview and places shape annotations on a separate page', () => {
  let html = '';
  const oldWindow = globalThis.window;
  globalThis.window = { open: () => ({ document: { open() {}, write(value) { html = value; }, close() {} }, focus() {} }) };
  try { assert.equal(printChart(annotatedProject, chart, '矩形'), true); }
  finally { globalThis.window = oldWindow; }
  assert.equal((html.match(/class="annotation-page"/g) || []).length, 1);
  const overview = /<section class="overview">([\s\S]*?)<\/section>/.exec(html)?.[1];
  assert.ok(overview);
  assert.doesNotMatch(overview, /data-annotation-id/);
  assert.match(html, /data-annotation-id="note-1"/);
  assert.doesNotMatch(html, /帽子的专属备注/);
});

test('body chart and shape exports label shoulder centimeters and rounded needle count', () => {
  const body = { ...project, garmentId: 'round-front', measurements: { width: 48, height: 58, neckWidth: 18, neckDepth: 9, armholeDepth: 18, shoulderWidth: 36 }, gauge: { stitches: 22, rows: 30 } };
  assert.match(buildChartSVG(body, chart, '圆领前片'), /肩宽 36 cm \/ 79 针/);
  const shape = buildAnnotatedShapeSVG(body, chart, '圆领前片');
  assert.match(shape, /肩宽 36 cm \/ 79 针/);
  assert.match(shape, /data-role="shoulder-dimension"/);
  assert.doesNotMatch(buildChartSVG({ ...body, garmentId: 'rectangle' }, chart, '矩形'), /肩宽/);
});

function pairedProject(overrides = {}) {
  const note = (text) => ({ id: 'same-note-id', garmentId: 'rectangle', x: 0.5, y: 0.5, text, fontSize: 12, color: '#343c36' });
  const front = { id: 'front', label: '前片 <A>', garmentId: 'rectangle', measurements: { width: 8, height: 6 }, chartEdits: { rectangle: { '1:1': '#00ff00' } }, annotations: [note('前片专用备注')], motifPlacements: [] };
  const back = { id: 'back', label: '后片 & B', garmentId: 'rectangle', measurements: { width: 10, height: 7 }, chartEdits: { rectangle: { '1:1': '#0000ff' } }, annotations: [note('后片专用备注')], motifPlacements: [] };
  return { version: 1, name: '前后片工程', grid: Array.from({ length: 4 }, () => Array(4).fill('#ffffff')), palette: ['#ffffff', '#ff0000', '#0000ff'], gauge: { stitches: 10, rows: 10 }, placement: 'repeat', arrangement: 'custom', fabricColor: '#ffffff', activePieceId: 'front', pieces: [front, back], garmentId: front.garmentId, measurements: { ...front.measurements }, chartEdits: { rectangle: { '1:1': '#ff0000' } }, annotations: structuredClone(front.annotations), motifPlacements: [], ...overrides };
}

function pieceFragments(svg) {
  const markers = [...svg.matchAll(/<g data-piece-id="([^"]+)"/g)];
  return new Map(markers.map((marker, i) => [marker[1], svg.slice(marker.index, markers[i + 1]?.index ?? svg.length)]));
}

test('combined charts preserve independent same-template pieces, pending active edits, and notes', () => {
  const svg = buildAllPiecesSVG(pairedProject());
  const fragments = pieceFragments(svg);
  assert.equal(fragments.size, 2);
  const front = fragments.get('front'), back = fragments.get('back');
  assert.match(front, /前片 &lt;A&gt;/);
  assert.match(back, /后片 &amp; B/);
  assert.match(front, /8 针 × 6 行/);
  assert.match(back, /10 针 × 7 行/);
  assert.equal((front.match(/data-cell="true"/g) || []).length, 48);
  assert.equal((back.match(/data-cell="true"/g) || []).length, 70);
  assert.match(front, /data-row="1" data-stitch="1"[^>]*fill="#FF0000"/);
  assert.match(back, /data-row="1" data-stitch="1"[^>]*fill="#0000FF"/);
  assert.match(front, /前片专用备注/);
  assert.doesNotMatch(front, /后片专用备注|#00FF00|#0000FF/);
  assert.match(back, /后片专用备注/);
  assert.doesNotMatch(back, /前片专用备注|#FF0000/);
});

test('combined diagrams use separate adjacent panels and all SVG ID references are unique', () => {
  const chartSVG = buildAllPiecesSVG(pairedProject(), 'chart');
  const ids = [...chartSVG.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.ok(ids.length >= 4);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of chartSVG.matchAll(/aria-labelledby="([^"]+)"/g)) for (const id of match[1].split(/\s+/)) assert.ok(ids.includes(id));
  const shapeSVG = buildAllPiecesSVG(pairedProject(), 'shape');
  const panels = [...shapeSVG.matchAll(/<g data-piece-id="[^"]+" transform="translate\(([\d.]+) ([\d.]+)\)"/g)];
  assert.equal(panels.length, 2);
  assert.equal(panels[0][2], panels[1][2], 'front and back are on the same horizontal row');
  assert.notEqual(panels[0][1], panels[1][1]);
  assert.equal((shapeSVG.match(/data-role="shape-outline"/g) || []).length, 2);
  assert.throws(() => buildAllPiecesSVG(pairedProject(), 'unknown'), /chart|shape|导出/);
});

test('all-piece print opens one window with labelled per-piece overviews and bounded detail pages', () => {
  const data = pairedProject();
  data.measurements = { width: 62, height: 82 };
  data.pieces[1].measurements = { width: 61, height: 81 };
  let html = '', opens = 0;
  const oldWindow = globalThis.window;
  globalThis.window = { open: () => { opens++; return { document: { open() {}, write(value) { html += value; }, close() {} }, focus() {} }; } };
  try { assert.equal(printAllPieces(data), true); }
  finally { globalThis.window = oldWindow; }
  assert.equal(opens, 1);
  assert.equal((html.match(/class="overview"/g) || []).length, 2);
  assert.equal((html.match(/class="detail-page"/g) || []).length, 8);
  assert.match(html, /前片 &lt;A&gt;[^<]*详细图/);
  assert.match(html, /后片 &amp; B[^<]*详细图/);
  assert.match(html, /class="pieces-overview"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('stitch symbols overlay cells with contrast and only valid in-shape symbols enter the legend', () => {
  const symbolic = { ...project, stitchSymbols: { vest: { '1:1': 'knit', '1:2': 'purl', '2:2': 'yo', '2:1': 'ssk', '2:3': 'k3tog', '3:1': 'slip', '1:99': 'ktbl', '1:3': 'unknown' }, hat: { '1:3': 'k2tog' } } };
  const colored = { ...chart, grid: [[null, '#aabbcc', null], ['#ffffff', '#000000', '#ffffff']] };
  const svg = buildChartSVG(symbolic, colored, '背心');
  const overlays = [...svg.matchAll(/<g data-stitch-symbol="([^"]+)" data-row="(\d+)" data-stitch="(\d+)"[^>]*>/g)];
  assert.deepEqual(overlays.map(m => m.slice(1)), [['yo', '2', '2'], ['purl', '1', '2'], ['knit', '1', '1']]);
  assert.match(svg, /data-stitch-symbol="knit"[^>]*data-color="#222222"/);
  assert.match(svg, /data-stitch-symbol="purl"[^>]*data-color="#FFFFFF"/);
  assert.equal((svg.match(/data-cell="true"/g) || []).length, 4);
  assert.match(svg, /#000000 · 1 针/);
  assert.match(svg, /#FFFFFF · 2 针/);
  assert.deepEqual([...svg.matchAll(/data-stitch-legend="([^"]+)"/g)].map(m => m[1]).sort(), ['knit', 'purl', 'yo']);
  assert.match(svg, /下针/);
  assert.match(svg, /上针/);
  assert.match(svg, /正面效果/);
  assert.match(svg, /不自动改变针数/);
});

test('legacy and motif exports ignore empty, other-shape, and invalid stitch symbols', () => {
  const original = buildChartSVG(project, chart, '背心');
  assert.equal(buildChartSVG({ ...project, stitchSymbols: {} }, chart, '背心'), original);
  assert.equal(buildChartSVG({ ...project, stitchSymbols: { vest: { '0:1': 'knit', '1.5:1': 'yo', '2:1': 'purl' }, hat: { '1:1': 'knit' } } }, chart, '背心'), original);
  assert.equal(buildPatternSVG({ ...project, stitchSymbols: { vest: { '1:1': 'yo' } } }), buildPatternSVG(project));
});

test('print tiles retain global stitch coordinates and display only their used needle symbols', () => {
  const grid = Array.from({ length: 82 }, () => Array(62).fill('#ffffff'));
  const symbolic = { ...project, stitchSymbols: { vest: { '1:1': 'knit', '80:60': 'purl', '81:61': 'yo', '82:62': 'ssk' } } };
  let html = '';
  const oldWindow = globalThis.window;
  globalThis.window = { open: () => ({ document: { open() {}, write(value) { html = value; }, close() {} }, focus() {} }) };
  try { assert.equal(printChart(symbolic, { grid, width: 62, height: 82, actualWidth: 31, actualHeight: 27.33 }, '针法样片'), true); }
  finally { globalThis.window = oldWindow; }
  const tiles = [...html.matchAll(/<section class="detail-page">([\s\S]*?)<\/section>/g)].map(m => m[1]);
  assert.equal(tiles.length, 4);
  assert.match(tiles[0], /data-stitch-symbol="knit" data-row="1" data-stitch="1"[^>]*transform="translate\(903 1210\)"/);
  assert.match(tiles[0], /data-stitch-symbol="purl" data-row="80" data-stitch="60"[^>]*transform="translate\(18 25\)"/);
  assert.deepEqual([...tiles[0].matchAll(/data-stitch-legend="([^"]+)"/g)].map(m => m[1]).sort(), ['knit', 'purl']);
  assert.doesNotMatch(tiles[1] + tiles[2], /data-stitch-symbol=|data-stitch-legend=/);
  assert.match(tiles[3], /data-stitch-symbol="yo" data-row="81" data-stitch="61"[^>]*transform="translate\(33 40\)"/);
  assert.match(tiles[3], /data-stitch-symbol="ssk" data-row="82" data-stitch="62"[^>]*transform="translate\(18 25\)"/);
  assert.deepEqual([...tiles[3].matchAll(/data-stitch-legend="([^"]+)"/g)].map(m => m[1]).sort(), ['ssk', 'yo']);
});

test('same-template left and right sleeves export independent stitch symbols including pending edits', () => {
  const left = { id: 'left-sleeve', label: '左袖', garmentId: 'sleeve', measurements: { width: 8, height: 8, armholeDepth: 2 }, chartEdits: {}, annotations: [], motifPlacements: [], stitchSymbols: { sleeve: { '1:1': 'yo' } } };
  const right = { ...structuredClone(left), id: 'right-sleeve', label: '右袖', stitchSymbols: { sleeve: { '1:1': 'ssk' } } };
  const data = pairedProject({ activePieceId: left.id, pieces: [left, right], garmentId: 'sleeve', measurements: { ...left.measurements }, chartEdits: {}, annotations: [], stitchSymbols: { sleeve: { '1:1': 'k2tog' } } });
  const fragments = pieceFragments(buildAllPiecesSVG(data));
  assert.match(fragments.get(left.id), /data-stitch-symbol="k2tog" data-row="1" data-stitch="1"/);
  assert.doesNotMatch(fragments.get(left.id), /data-stitch-symbol="ssk"|data-stitch-legend="yo"/);
  assert.match(fragments.get(right.id), /data-stitch-symbol="ssk" data-row="1" data-stitch="1"/);
  assert.doesNotMatch(fragments.get(right.id), /data-stitch-symbol="k2tog"|data-stitch-legend="yo"/);
});

function manyPieces(count) {
  const data = pairedProject({ annotations: [], chartEdits: {} });
  const first = { ...data.pieces[0], id: 'piece-1', label: '裁片 1', annotations: [], chartEdits: {} };
  data.pieces = Array.from({ length: count }, (_, index) => ({ ...structuredClone(first), id: `piece-${index + 1}`, label: `裁片 ${index + 1}`, measurements: { width: 8, height: 6 + index } }));
  data.activePieceId = first.id;
  return data;
}

test('more than four pieces wrap into bounded chart and shape columns with complete SVG bounds', () => {
  for (const [kind, count, columns] of [['shape', 12, 3], ['chart', 5, 2]]) {
    const svg = buildAllPiecesSVG(manyPieces(count), kind);
    const root = /^<svg[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    const panels = [...svg.matchAll(/<g data-piece-id="[^"]+" transform="translate\(([\d.]+) ([\d.]+)\)">[\s\S]*?<svg x="0" y="43"[^>]*width="([\d.]+)" height="([\d.]+)"/g)];
    assert.equal(panels.length, count);
    assert.equal(new Set(panels.map(m => m[2])).size, Math.ceil(count / columns));
    for (const panel of panels) {
      assert.ok(Number(panel[1]) + Number(panel[3]) <= Number(root[1]), 'each piece fits root width');
      assert.ok(Number(panel[2]) + 43 + Number(panel[4]) < Number(root[2]), 'last row fits root height');
    }
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('twelve-piece print keeps all pieces in one window and divides comparison sheets into readable batches', () => {
  let html = '', opens = 0;
  const oldWindow = globalThis.window;
  globalThis.window = { open: () => { opens++; return { document: { open() {}, write(value) { html = value; }, close() {} }, focus() {} }; } };
  try { assert.equal(printAllPieces(manyPieces(12)), true); }
  finally { globalThis.window = oldWindow; }
  assert.equal(opens, 1);
  assert.equal((html.match(/class="overview"/g) || []).length, 12);
  const comparisons = [...html.matchAll(/<section class="pieces-overview">([\s\S]*?)<\/section>/g)];
  assert.equal(comparisons.length, 2);
  for (const page of comparisons) assert.equal((page[1].match(/data-piece-id=/g) || []).length, 6);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

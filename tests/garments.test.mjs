import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GARMENTS, getGarment, getOutline, calculateDimensions, createGarmentChart } from '../dist/core/garments.js';
import * as garmentEngine from '../dist/core/garments.js';

const gauge = { stitches: 22, rows: 30 };
const motif = [['#f8f0e2', '#bc6b55'], ['#223c39', '#f8f0e2']];
const measurement = { width: 48, height: 58, neckWidth: 18, neckDepth: 9, armholeDepth: 18 };

test('48 × 58 cm at 22 stitches / 30 rows per 10 cm gives 106 stitches and 174 rows', () => {
  const dimensions = calculateDimensions(measurement, gauge);
  assert.equal(dimensions.stitches, 106);
  assert.equal(dimensions.rows, 174);
  assert.ok(Math.abs(dimensions.actualWidth - 1060 / 22) < 1e-10);
  assert.equal(dimensions.actualHeight, 58);
});

test('dimension validation rejects invalid inputs and oversized charts without changing the gauge', () => {
  for (const width of [0, -1, NaN, Infinity, 'oops']) {
    assert.throws(() => calculateDimensions({ ...measurement, width }, gauge), /宽度/);
  }
  assert.throws(() => calculateDimensions(measurement, { stitches: 0, rows: 30 }), /密度/);
  assert.throws(() => calculateDimensions({ width: 300, height: 50 }, gauge), /400/);
  assert.throws(() => calculateDimensions({ width: 30, height: 300 }, gauge), /600/);
});

test('catalog includes all 31 unique classified templates with Chinese names and editable defaults', () => {
  assert.equal(GARMENTS.length, 31);
  assert.equal(new Set(GARMENTS.map(entry => entry.id)).size, 31);
  for (const entry of GARMENTS) {
    assert.equal(getGarment(entry.id), entry);
    assert.ok(entry.name && entry.category && entry.note);
    assert.ok(entry.fields.includes('width') && entry.fields.includes('height'));
    assert.ok(entry.defaults.width > 0 && entry.defaults.height > 0);
  }
  assert.throws(() => getGarment('missing'), /版型/);
});

test('all outlines use finite normalized points and a closed SVG path', () => {
  for (const garment of GARMENTS) {
    const outline = getOutline(garment.id, garment.defaults);
    assert.ok(outline.points.length >= 4, garment.id);
    assert.ok(outline.path.startsWith('M') && outline.path.endsWith('Z'), garment.id);
    assert.ok(outline.note, garment.id);
    for (const point of outline.points) {
      assert.equal(point.length, 2);
      assert.ok(point.every(value => Number.isFinite(value) && value >= 0 && value <= 1), garment.id);
    }
  }
});

test('cardigan front pieces are exact horizontal mirrors', () => {
  const left = createGarmentChart('cardigan-left', measurement, gauge, motif);
  const right = createGarmentChart('cardigan-right', measurement, gauge, motif);
  assert.deepEqual(left.mask.map(row => [...row].reverse()), right.mask);
});

test('a rectangle fills every cell and reports knitting rows from the bottom', () => {
  const chart = createGarmentChart('rectangle', { width: 4, height: 3 }, { stitches: 10, rows: 10 }, motif);
  assert.equal(chart.width, 4);
  assert.equal(chart.height, 3);
  assert.equal(chart.stitches, 4);
  assert.equal(chart.rows, 3);
  assert.equal(chart.grid.flat().filter(cell => cell !== null).length, 12);
  assert.deepEqual(chart.rowCounts, [1, 2, 3].map(row => ({ row, count: 4, segments: [{ start: 1, end: 4, count: 4 }] })));
});

test('asymmetric piece segments use stitch 1 at the right edge, matching exported axes', () => {
  const chart = createGarmentChart('cardigan-left', { width: 10, height: 10, neckWidth: 4, neckDepth: 4, armholeDepth: 3 }, { stitches: 10, rows: 10 }, motif);
  // The top row has three empty cells on its right and one on its left.
  assert.deepEqual(chart.mask[0], [false, true, true, true, true, true, true, false, false, false]);
  assert.deepEqual(chart.rowCounts.at(-1), { row: 10, count: 6, segments: [{ start: 4, end: 9, count: 6 }] });
});

test('all templates yield nonempty masked charts with accurate per-row segment counts', () => {
  for (const garment of GARMENTS) {
    const chart = createGarmentChart(garment.id, garment.defaults, { stitches: 4, rows: 4 }, motif);
    assert.ok(chart.grid.flat().some(cell => cell !== null), garment.id);
    assert.equal(chart.grid.length, chart.rows);
    assert.equal(chart.grid[0].length, chart.stitches);
    for (let index = 0; index < chart.rowCounts.length; index++) {
      const knittingRow = chart.rowCounts[index];
      const screenRow = chart.height - 1 - index;
      assert.equal(knittingRow.row, index + 1);
      assert.equal(knittingRow.count, chart.mask[screenRow].filter(Boolean).length, garment.id);
      assert.equal(knittingRow.count, knittingRow.segments.reduce((sum, segment) => sum + segment.count, 0));
      for (const segment of knittingRow.segments) {
        assert.equal(segment.count, segment.end - segment.start + 1);
      }
      chart.grid[screenRow].forEach((cell, column) => assert.equal(cell === null, !chart.mask[screenRow][column]));
    }
  }
});

test('neck openings separate the shoulder segments and a deeper neckline removes more cells', () => {
  const shallow = createGarmentChart('round-front', { ...measurement, neckDepth: 4 }, gauge, motif);
  const deep = createGarmentChart('round-front', { ...measurement, neckDepth: 16 }, gauge, motif);
  assert.ok(deep.rowCounts.some(row => row.segments.length === 2));
  assert.ok(deep.rowCounts.reduce((sum, row) => sum + row.count, 0) < shallow.rowCounts.reduce((sum, row) => sum + row.count, 0));
});

test('repeat placement anchors pattern bottom and horizontal center across garment heights', () => {
  const small = createGarmentChart('rectangle', { width: 4, height: 3 }, { stitches: 10, rows: 10 }, motif);
  const tall = createGarmentChart('rectangle', { width: 4, height: 5 }, { stitches: 10, rows: 10 }, motif);
  assert.deepEqual(small.grid[2], tall.grid[4]);
  assert.equal(small.grid[2][1], motif[1][0]);
  assert.equal(small.grid[2][2], motif[1][1]);
});

test('center placement places the motif once on its background', () => {
  const chart = createGarmentChart('rectangle', { width: 6, height: 6 }, { stitches: 10, rows: 10 }, motif, 'center');
  assert.equal(chart.grid[2][2], motif[0][0]);
  assert.equal(chart.grid[2][3], motif[0][1]);
  assert.equal(chart.grid[3][2], motif[1][0]);
  assert.equal(chart.grid[5][5], motif[0][0]);
});

test('empty patterns use a readable cream ground and malformed patterns are rejected', () => {
  assert.ok(createGarmentChart('rectangle', { width: 3, height: 3 }, { stitches: 10, rows: 10 }, []).grid[0][0]);
  assert.throws(() => createGarmentChart('rectangle', measurement, gauge, [['red'], ['red', 'blue']]), /图案/);
});

test('specialty templates clearly state their construction limitations', () => {
  assert.match(getGarment('sock').note, /足跟/);
  assert.match(getGarment('glove').note, /手指筒/);
  assert.ok(GARMENTS.every(entry => /参考/.test(entry.note)));
});

const bodyIds = ['round-front', 'round-back', 'v-front', 'cardigan-left', 'cardigan-right', 'vest-back', 'mock-neck', 'camisole'];
const addedBodyIds=['vest-front','vest-v-front','cardigan-round-left','cardigan-round-right','cardigan-back','vest-cardigan-left','vest-cardigan-right','mock-neck-back','drop-front','drop-back','raglan-front','raglan-back'];

test('body templates expose shoulder width defaults while accessories have no shoulder field', () => {
  assert.equal(typeof garmentEngine.resolveShoulderWidth, 'function');
  for (const garment of GARMENTS) {
    assert.equal(garment.fields.includes('shoulderWidth'), [...bodyIds,...addedBodyIds].includes(garment.id));
    if ([...bodyIds,...addedBodyIds].includes(garment.id)) {
      assert.ok(garment.defaults.shoulderWidth > garment.defaults.neckWidth);
      assert.ok(garment.defaults.shoulderWidth <= garment.defaults.width);
      assert.equal(garmentEngine.resolveShoulderWidth(garment.id), garment.defaults.shoulderWidth);
    } else {
      assert.equal(garment.defaults.shoulderWidth, undefined);
      assert.equal(garmentEngine.resolveShoulderWidth(garment.id), undefined);
    }
  }
});

test('new templates are classified by their actual piece role',()=>{
  const categories=['套衫前后片','马甲前后片','开衫前后片','袖片','门襟与收边','配饰','基础裁片'];
  assert.deepEqual(new Set(GARMENTS.map(g=>g.category)),new Set(categories));
  for(const id of addedBodyIds)assert.equal(typeof getGarment(id).defaults.shoulderWidth,'number');
  assert.equal(getGarment('vest-v-front').category,'马甲前后片');
  assert.equal(getGarment('cardigan-back').category,'开衫前后片');
  assert.equal(getGarment('placket-left').category,'门襟与收边');
  assert.match(getGarment('cardigan-left').name,/V领/);
});

test('half-front and raised-neck predicates cover new templates without matching cardigan backs or plackets',()=>{
  assert.equal(typeof garmentEngine.isHalfFront,'function');
  assert.equal(typeof garmentEngine.isRaisedNeck,'function');
  const halfIds=['cardigan-left','cardigan-right','cardigan-round-left','cardigan-round-right','vest-cardigan-left','vest-cardigan-right'];
  for(const g of GARMENTS){
    assert.equal(garmentEngine.isHalfFront(g.id),halfIds.includes(g.id),g.id);
    assert.equal(garmentEngine.isRaisedNeck(g.id),['mock-neck','mock-neck-back'].includes(g.id),g.id);
  }
  for(const id of halfIds)assert.ok(garmentEngine.resolveShoulderWidth(id)>getGarment(id).defaults.width/2);
});

test('each new cardigan front pair is an exact mirrored outline and mask at edited sizes',()=>{
  for(const [leftId,rightId] of [['cardigan-round-left','cardigan-round-right'],['vest-cardigan-left','vest-cardigan-right']]){
    const m={...getGarment(leftId).defaults,width:27,height:63,neckWidth:10,shoulderWidth:22};
    const left=getOutline(leftId,m),right=getOutline(rightId,m);
    assert.deepEqual(left.points.map(([x,y])=>[1-x,y]),right.points);
    assert.deepEqual(createGarmentChart(leftId,m,gauge,motif).mask.map(row=>row.toReversed()),createGarmentChart(rightId,m,gauge,motif).mask);
  }
});

test('vest front neckline variants, cardigan curve, and front/back neckline depths create distinct masks',()=>{
  for(const [a,b] of [['vest-front','vest-v-front'],['vest-front','vest-back'],['cardigan-round-left','cardigan-left'],['drop-front','drop-back'],['raglan-front','raglan-back']]){
    assert.notDeepEqual(createGarmentChart(a,getGarment(a).defaults,gauge,motif).mask,createGarmentChart(b,getGarment(b).defaults,gauge,motif).mask,`${a} versus ${b}`);
  }
});

test('plackets are independent solid strips and rounding follows the gauge',()=>{
  for(const id of ['placket-left','placket-right']){
    const g=getGarment(id),chart=createGarmentChart(id,g.defaults,gauge,motif);
    assert.deepEqual(g.fields,['width','height']);assert.equal(g.defaults.width,3);assert.equal(g.defaults.height,58);
    assert.equal(chart.stitches,7);assert.equal(chart.rows,174);
    assert.ok(chart.mask.flat().every(Boolean));assert.equal(garmentEngine.resolveShoulderWidth(id),undefined);
    assert.match(g.note,/扣眼/);assert.match(g.note,/独立/);
  }
});

test('drop shoulders allow full piece width and their sleeves have no sleeve cap',()=>{
  for(const id of ['drop-front','drop-back']){
    const g=getGarment(id);assert.equal(g.defaults.shoulderWidth,g.defaults.width);
    assert.ok(getOutline(id,g.defaults).points.some(([x,y])=>x===0&&y<.1));
  }
  const g=getGarment('drop-sleeve');assert.deepEqual(g.fields,['width','height']);
  assert.ok(createGarmentChart(g.id,g.defaults,gauge,motif).mask.flat().every(Boolean));
});

test('raised-neck back keeps the collar-height parameter and raglan bodies have straight matching slopes',()=>{
  const front=getGarment('mock-neck'),back=getGarment('mock-neck-back');
  assert.equal(back.defaults.neckDepth,front.defaults.neckDepth);
  assert.deepEqual(getOutline(back.id,back.defaults).points,getOutline(front.id,front.defaults).points);
  for(const id of ['raglan-front','raglan-back']){
    const g=getGarment(id),p=getOutline(id,g.defaults).points;
    assert.deepEqual(p[0],[0,1]);assert.deepEqual(p[1],[0,g.defaults.armholeDepth/g.defaults.height]);
    const slope=Math.hypot((p[2][0]-p[1][0])*g.defaults.width,(p[2][1]-p[1][1])*g.defaults.height);
    const sleeve=getGarment('raglan').defaults;
    assert.ok(Math.abs(slope-Math.hypot(sleeve.width*.34,sleeve.armholeDepth))<1e-9);
  }
});

test('front opening lengths follow the measured neckline and remain equal for left and right fronts',()=>{
  assert.equal(typeof garmentEngine.getFrontOpeningLength,'function');
  const m={width:26,height:58,neckWidth:9,neckDepth:20,armholeDepth:18,shoulderWidth:22};
  for(const [left,right] of [['cardigan-left','cardigan-right'],['cardigan-round-left','cardigan-round-right'],['vest-cardigan-left','vest-cardigan-right']]){
    const a=garmentEngine.getFrontOpeningLength(left,m),b=garmentEngine.getFrontOpeningLength(right,m);
    assert.ok(Number.isFinite(a)&&a>=m.height);assert.equal(a,b);
    if(left==='cardigan-round-left')assert.ok(a>m.height-m.neckDepth+Math.hypot(m.neckWidth,m.neckDepth));
    else assert.ok(Math.abs(a-(38+Math.hypot(9,20)))<1e-10);
    const doubled={...m,width:52,height:116,neckWidth:18,neckDepth:40,armholeDepth:36,shoulderWidth:44};
    assert.ok(Math.abs(garmentEngine.getFrontOpeningLength(left,doubled)-2*a)<1e-9);
  }
  assert.throws(()=>garmentEngine.getFrontOpeningLength('cardigan-back',m),/前片/);
  assert.throws(()=>garmentEngine.getFrontOpeningLength('cardigan-left',{...m,neckWidth:26}),/领宽/);
});

test('new shoulder-bearing templates validate shoulder bounds without altering the source measurements',()=>{
  for(const id of addedBodyIds){
    const g=getGarment(id),m={...g.defaults},before=structuredClone(m);
    assert.throws(()=>getOutline(id,{...m,shoulderWidth:m.neckWidth}),/肩宽/);
    assert.throws(()=>getOutline(id,{...m,shoulderWidth:m.width+.01}),/肩宽/);
    assert.doesNotThrow(()=>getOutline(id,{...m,shoulderWidth:m.width}));
    getOutline(id,m);assert.deepEqual(m,before);
  }
});

test('shoulder width means total span for symmetric bodies and one half-front span for cardigans', () => {
  assert.equal(typeof garmentEngine.resolveShoulderWidth, 'function');
  assert.ok(Math.abs(garmentEngine.resolveShoulderWidth('round-front') - 34.56) < 1e-10);
  assert.ok(Math.abs(garmentEngine.resolveShoulderWidth('vest-back') - 28.08) < 1e-10);
  assert.ok(Math.abs(garmentEngine.resolveShoulderWidth('camisole') - 30) < 1e-10);
  assert.ok(Math.abs(garmentEngine.resolveShoulderWidth('cardigan-left') - 21.75) < 1e-10);
  const body = getOutline('round-front', { ...measurement, shoulderWidth: 36 });
  const half = getOutline('cardigan-left', { ...measurement, shoulderWidth: 36 });
  assert.ok(Math.abs(body.points[11][0] - 0.125) < 1e-10);
  assert.ok(Math.abs(half.points[11][0] - 0.25) < 1e-10);
});

test('legacy measurements without shoulder width preserve their previous outline, mask and row counts', () => {
  // Fixtures captured before shoulder-width support, including custom width/neck dimensions.
  const fingerprints = {
    'round-front': 'bbe9ad3fd177a0a05cb4a421253ace2a0f2fef302bccf657b2ea8ed6fb1b9e1f',
    'round-back': 'bbe9ad3fd177a0a05cb4a421253ace2a0f2fef302bccf657b2ea8ed6fb1b9e1f',
    'v-front': '79125c7dc339e2072b9914000096a66c6406184ae10681efa6f6394f675fae57',
    'cardigan-left': '6db03edba6265da2b268e28eb79c772d0e503489d41c744b76b7578b2d479458',
    'cardigan-right': 'be55ccbd8c98be26ccfa23e00a97b7d27f2d7004e4231a87cacde4997a009b0f',
    'vest-back': '771b2de4cdd74c4aa46fcd0ece840baac39596434e2d16a406cf12b8e5ec544f',
    'mock-neck': '528ecaa2f93bf6d459ab0d829e88adffcb9334e40f2eb7a50d4d20f24d8abbb8',
    'camisole': '1078311fe070f90e936b4da6d5ab3a52f295b48091aca601cbdd2bbab8f729b7',
  };
  const legacy = { width: 31, height: 52, neckWidth: 13, neckDepth: 7, armholeDepth: 16 };
  for (const id of bodyIds) {
    const outline = getOutline(id, legacy);
    const chart = createGarmentChart(id, legacy, { stitches: 10, rows: 10 }, [['#f5f0e8']]);
    const hash = createHash('sha256').update(JSON.stringify({ path: outline.path, mask: chart.mask, rowCounts: chart.rowCounts })).digest('hex');
    assert.equal(hash, fingerprints[id], id);
  }
  assert.equal(typeof garmentEngine.resolveShoulderWidth, 'function');
  const narrowLegacy = { width: 24, height: 50, neckWidth: 12, neckDepth: 6, armholeDepth: 16 };
  assert.ok(Math.abs(garmentEngine.resolveShoulderWidth('round-front', narrowLegacy) - 17.28) < 1e-10);
  assert.doesNotThrow(() => getOutline('round-front', narrowLegacy));
});

test('changing shoulder width changes every body mask and row counts without changing chart dimensions', () => {
  for (const id of bodyIds) {
    const narrow = createGarmentChart(id, { ...measurement, shoulderWidth: 28 }, gauge, motif);
    const wide = createGarmentChart(id, { ...measurement, shoulderWidth: 44 }, gauge, motif);
    assert.equal(narrow.width, wide.width);
    assert.equal(narrow.height, wide.height);
    assert.notDeepEqual(narrow.mask, wide.mask, id);
    assert.ok(narrow.rowCounts.reduce((sum, row) => sum + row.count, 0) < wide.rowCounts.reduce((sum, row) => sum + row.count, 0), id);
    assert.deepEqual(narrow.rowCounts[0], wide.rowCounts[0]);
  }
});

test('explicit cardigan shoulder widths retain exact horizontal mask mirrors', () => {
  const measurements = { ...getGarment('cardigan-left').defaults, shoulderWidth: 20 };
  const left = createGarmentChart('cardigan-left', measurements, gauge, motif);
  const right = createGarmentChart('cardigan-right', measurements, gauge, motif);
  assert.deepEqual(left.mask.map(row => [...row].reverse()), right.mask);
});

test('shoulder width requires finite positive width larger than the neck and no wider than the piece', () => {
  assert.equal(typeof garmentEngine.resolveShoulderWidth, 'function');
  for (const id of bodyIds) {
    for (const shoulderWidth of [0, -1, NaN, Infinity, null, 'invalid', 18, 17, 49]) {
      assert.throws(() => getOutline(id, { ...measurement, shoulderWidth }), /肩宽/, `${id}: ${shoulderWidth}`);
    }
    for (const shoulderWidth of [18.001, 48]) {
      assert.equal(garmentEngine.resolveShoulderWidth(id, { ...measurement, shoulderWidth }), shoulderWidth);
      assert.ok(getOutline(id, { ...measurement, shoulderWidth }).points.every(point => point.every(value => value >= 0 && value <= 1)));
    }
  }
});

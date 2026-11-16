import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid } from '../dist/core/pattern.js';
import { createBaseChart } from '../dist/core/placements.js';
import { getGarment } from '../dist/core/garments.js';
import { sanitizeProject, validateProject } from '../dist/core/project.js';
import { normalizePieces, switchActivePiece, duplicatePiece, getPieceProjects } from '../dist/core/pieces.js';

const drawing = await import('../dist/core/outline-drawing.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const point = (x, y) => ({ x, y });
const line = (x1, y1, x2, y2) => ({ kind: 'line', x1, y1, x2, y2, cx: (x1+x2)/2, cy: (y1+y2)/2 });
const square = () => ({ nodes: [
  { x: 0, y: 0, cx: .5, cy: 0 }, { x: 1, y: 0, cx: 1, cy: .5 },
  { x: 1, y: 1, cx: .5, cy: 1 }, { x: 0, y: 1, cx: 0, cy: .5 },
] });
const squareDrawing = () => ({ segments: [line(0,0,1,0), line(1,0,1,1), line(1,1,0,1), line(0,1,0,0)] });
const project = (garmentId = 'rectangle') => ({ version: 1, name: '线段草稿', grid: createGrid(4,4), palette: ['#f5efe3'], garmentId, measurements: { ...getGarment(garmentId).defaults }, gauge: { stitches: 10, rows: 10 }, placement: 'repeat' });

test('drawing schema supports empty drafts, strips extras, copies data and rejects invalid coordinates or records', () => {
  assert.equal(typeof drawing.sanitizeOutlineDrawing, 'function');
  assert.equal(drawing.sanitizeOutlineDrawing(), null);
  assert.equal(drawing.sanitizeOutlineDrawing(null), null);
  assert.deepEqual(drawing.sanitizeOutlineDrawing({ segments: [] }), { segments: [] });
  const source = squareDrawing(); source.extra = 'strip'; source.segments[0].extra = 'strip';
  const clean = drawing.sanitizeOutlineDrawing(source);
  assert.deepEqual(clean, squareDrawing()); clean.segments[0].x1 = .1;
  assert.equal(source.segments[0].x1, 0);
  for (const value of [false, [], {}, {segments: Array(3)}, {segments: [null]}, {segments: Array(81).fill(line(0,0,1,1))}]) {
    assert.throws(() => drawing.assertOutlineDrawing(value), /草稿|线段|坐标/);
  }
  for (const field of ['x1','y1','x2','y2','cx','cy']) for (const value of [NaN, Infinity, -.1, 1.1, '.5', undefined]) {
    assert.throws(() => drawing.sanitizeOutlineDrawing({ segments: [{ ...line(0,0,1,1), [field]: value }] }), /坐标/);
  }
  assert.throws(() => drawing.sanitizeOutlineDrawing({ segments: [{ ...line(0,0,1,1), kind: 'other' }] }), /线段|草稿/);
});

test('converts existing outlines into independent lines and arcs without changing their geometry', () => {
  assert.equal(typeof drawing.drawingFromOutline, 'function');
  assert.deepEqual(drawing.drawingFromOutline(square()), squareDrawing());
  const source = square(); source.nodes[0].cy = .6;
  const converted = drawing.drawingFromOutline(source);
  assert.equal(converted.segments[0].kind, 'arc');
  assert.equal(converted.segments[0].cy, .6);
  assert.deepEqual(drawing.inspectOutlineDrawing(converted).outline, source);
  converted.segments[0].cy = .2;
  assert.equal(source.nodes[0].cy, .6);
});

test('deleting a segment leaves a real gap until a snapped straight or curved replacement closes it', () => {
  assert.equal(typeof drawing.removeDrawingSegment, 'function');
  const source = squareDrawing(), open = drawing.removeDrawingSegment(source, 0);
  assert.equal(open.segments.length, 3);
  assert.deepEqual(source, squareDrawing());
  const status = drawing.inspectOutlineDrawing(open);
  assert.equal(status.closed, false); assert.equal(status.outline, null);
  assert.deepEqual(status.openEnds, [point(1,0), point(0,0)]);
  const straight = drawing.addDrawingSegment(open, point(.01,.01), point(.99,.01));
  const restored = drawing.inspectOutlineDrawing(straight);
  assert.equal(restored.closed, true); assert.equal(restored.openEnds.length, 0);
  const base = project(); base.measurements = { width:20, height:20 };
  const originalChart = createBaseChart({ ...base, customOutline: restored.outline });
  const curved = drawing.addDrawingSegment(open, point(.01,.01), point(.99,.01), point(.5,.6));
  const applied = drawing.inspectOutlineDrawing(curved);
  assert.equal(applied.closed, true);
  const changedChart = createBaseChart({ ...base, customOutline: applied.outline });
  assert.equal(originalChart.grid[0][10], '#f5efe3');
  assert.equal(changedChart.grid[0][10], null);
  assert.ok(changedChart.rowCounts.at(-1).count < originalChart.rowCounts.at(-1).count);
  assert.equal(open.segments.length, 3);
});

test('joins unordered and reversed segments into one ring while preserving reversed arc controls', () => {
  assert.equal(typeof drawing.inspectOutlineDrawing, 'function');
  const original = squareDrawing(); original.segments[0] = { ...original.segments[0], kind:'arc', cy:.6 };
  const reversed = s => ({ ...s, x1:s.x2, y1:s.y2, x2:s.x1, y2:s.y1 });
  const scrambled = {segments: [original.segments[2], reversed(original.segments[0]), reversed(original.segments[3]), original.segments[1]]};
  const status = drawing.inspectOutlineDrawing(scrambled);
  assert.equal(status.closed, true);
  assert.equal(status.outline.nodes.find(n => n.cy === .6).cx, .5);
  const base = project(); base.measurements = { width:20, height:20 };
  assert.deepEqual(createBaseChart({...base, customOutline:status.outline}).mask, createBaseChart({...base, customOutline:drawing.inspectOutlineDrawing(original).outline}).mask);
});

test('only a single closed ring with at least three nonzero segments can be applied', () => {
  assert.equal(typeof drawing.inspectOutlineDrawing, 'function');
  const invalid = [null, {segments:[]}, {segments:[line(0,0,1,0)]}, {segments:[line(0,0,1,0),line(1,0,0,0)]},
    {segments:[...squareDrawing().segments,line(0,0,.5,.5)]},
    {segments:[...squareDrawing().segments,line(.1,.1,.2,.1),line(.2,.1,.2,.2),line(.2,.2,.1,.1)]},
    {segments:[...squareDrawing().segments,line(.5,.5,.5,.5)]}];
  for (const source of invalid) {
    const status = drawing.inspectOutlineDrawing(source);
    assert.equal(status.closed, false); assert.equal(status.outline, null);
    assert.ok(status.message.length > 0);
  }
  assert.match(drawing.inspectOutlineDrawing(invalid[4]).message, /分支/);
  assert.match(drawing.inspectOutlineDrawing(invalid[5]).message, /单个|多个|连接/);
});

test('endpoint editing moves connected ends together, follows adjacent controls and snaps to other endpoints', () => {
  assert.equal(typeof drawing.moveDrawingEndpoint, 'function');
  const source = squareDrawing(); source.segments[0] = {...source.segments[0],kind:'arc', cy:.9};
  const moved = drawing.moveDrawingEndpoint(source, 0, 'start', point(.2,.4));
  assert.deepEqual([moved.segments[0].x1,moved.segments[0].y1,moved.segments[3].x2,moved.segments[3].y2], [.2,.4,.2,.4]);
  assert.deepEqual([moved.segments[0].cx,moved.segments[0].cy], [.6,1]);
  assert.deepEqual([moved.segments[3].cx,moved.segments[3].cy], [.1,.7]);
  assert.deepEqual(source.segments[0], {...squareDrawing().segments[0],kind:'arc',cy:.9});
  const open = {segments:[line(0,0,.5,0),line(1,1,.5,.5)]};
  const snapped = drawing.moveDrawingEndpoint(open, 0, 'end', point(.49,.49));
  assert.deepEqual([snapped.segments[0].x2,snapped.segments[0].y2],[.5,.5]);
});

test('moving a control turns a line into an independently stored arc', () => {
  assert.equal(typeof drawing.moveDrawingControl, 'function');
  const source = squareDrawing(), curved = drawing.moveDrawingControl(source, 0, point(.5,.6));
  assert.deepEqual(curved.segments[0], {...source.segments[0],kind:'arc',cx:.5,cy:.6});
  assert.equal(source.segments[0].kind,'line');
});

test('splitting a segment preserves exact quadratic geometry and lets only half the edge be deleted', () => {
  assert.equal(typeof drawing.splitDrawingSegment, 'function');
  const source = squareDrawing(); source.segments[0] = {...source.segments[0],kind:'arc',cy:.6};
  const split = drawing.splitDrawingSegment(source,0);
  assert.equal(split.segments.length,5);
  const at = (s,t) => point((1-t)**2*s.x1+2*(1-t)*t*s.cx+t*t*s.x2,(1-t)**2*s.y1+2*(1-t)*t*s.cy+t*t*s.y2);
  for (const t of [0,.1,.3,.5,.7,1]) {
    const a = at(source.segments[0],t), b = t <= .5 ? at(split.segments[0],t*2) : at(split.segments[1],(t-.5)*2);
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-12);
  }
  assert.equal(drawing.inspectOutlineDrawing(split).closed,true);
  const gap = drawing.removeDrawingSegment(split,0);
  assert.equal(drawing.inspectOutlineDrawing(gap).closed,false);
  assert.deepEqual(gap.segments[0],split.segments[1]);
  const straight = drawing.splitDrawingSegment(squareDrawing(),0);
  assert.deepEqual(straight.segments.slice(0,2),[line(0,0,.5,0),line(.5,0,1,0)]);
  assert.equal(source.segments.length,4);
  assert.throws(()=>drawing.splitDrawingSegment({segments:Array(80).fill(line(0,0,1,1))},0),/80/);
});

test('drawing operations validate indexes, points and tolerances and never silently truncate eighty segments', () => {
  assert.equal(typeof drawing.addDrawingSegment, 'function');
  const full = {segments:Array.from({length:80},(_,i)=>line(i/80,0,(i+1)/80,0))};
  assert.throws(() => drawing.addDrawingSegment(full,point(0,1),point(1,1)), /80/);
  for (const index of [-1,4,.5,NaN]) {
    assert.throws(() => drawing.removeDrawingSegment(squareDrawing(),index), /线段/);
    assert.throws(() => drawing.moveDrawingControl(squareDrawing(),index,point(.5,.5)), /线段/);
  }
  for (const value of [null,{},point(NaN,0),point(2,0),point('0',0)]) assert.throws(() => drawing.addDrawingSegment(null,value,point(1,1)), /坐标/);
  assert.throws(() => drawing.moveDrawingEndpoint(squareDrawing(),0,'other',point(.1,.1)), /端点/);
  for (const value of [-1,Infinity,NaN,'0.1']) assert.throws(() => drawing.addDrawingSegment(null,point(0,0),point(1,1),null,value), /吸附|容差/);
});

test('freehand strokes simplify continuous samples and snap the first and last ends into an existing gap', () => {
  assert.equal(typeof drawing.addDrawingPolyline, 'function');
  const open = drawing.removeDrawingSegment(squareDrawing(),0);
  const samples = Array.from({length:101},(_,i)=>point(.01+i*.0098,.001+(i%2)*.0002));
  const closed = drawing.addDrawingPolyline(open,samples);
  assert.equal(closed.segments.length,4);
  assert.equal(drawing.inspectOutlineDrawing(closed).closed,true);
  assert.equal(samples[0].x,.01);
});

test('freehand can close a new ring and preserves corners while rejecting excess segments', () => {
  assert.equal(typeof drawing.addDrawingPolyline, 'function');
  const samples = [point(.1,.1),point(.5,.1),point(.9,.1),point(.9,.5),point(.9,.9),point(.5,.9),point(.1,.9),point(.1,.5),point(.11,.11)];
  const closed = drawing.addDrawingPolyline(null,samples);
  assert.equal(closed.segments.length,4);
  assert.equal(drawing.inspectOutlineDrawing(closed).closed,true);
  const zigzag = Array.from({length:82},(_,i)=>point(i/81,i%2 ? .8:.2));
  assert.throws(() => drawing.addDrawingPolyline(null,zigzag,{snapTolerance:0,simplifyTolerance:0}), /80/);
  for (const value of [[],Array(3),[point(0,0),point(NaN,1)]]) assert.throws(() => drawing.addDrawingPolyline(null,value), /坐标|点|绘/);
  assert.throws(() => drawing.addDrawingPolyline(null,samples,{simplifyTolerance:-1}), /容差|简化/);
});

test('open and branched drafts survive JSON, piece switching and duplication independently from the applied outline', () => {
  let value = normalizePieces(project('round-front'));
  const draft = {segments:[line(0,0,1,0),line(1,0,1,1),line(1,0,.5,.5)]};
  value.outlineDrawing = draft; value.customOutline = square();
  const backup = sanitizeProject(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(backup.outlineDrawing,draft);
  assert.deepEqual(backup.customOutline,square());
  value = switchActivePiece(backup,'back');
  assert.equal(value.outlineDrawing,null);
  value = switchActivePiece(value,'front');
  assert.deepEqual(value.outlineDrawing,draft);
  const copy = duplicatePiece(value,'front',{id:'copy',label:'复制前片'});
  copy.outlineDrawing.segments[0].y1=.2;
  assert.equal(copy.pieces.find(p=>p.id==='front').outlineDrawing.segments[0].y1,0);
  const views = getPieceProjects(value);
  assert.deepEqual(views[0].project.outlineDrawing,draft);
  assert.equal(views[1].project.outlineDrawing,null);
  views[0].project.outlineDrawing.segments[0].y1=.3;
  assert.equal(value.outlineDrawing.segments[0].y1,0);
});

test('old projects default to no draft and malformed drafts in active or inactive pieces are rejected', () => {
  const old = sanitizeProject(project('round-front'));
  assert.equal(old.outlineDrawing,null);
  assert.ok(old.pieces.every(piece=>piece.outlineDrawing===null));
  const invalid = {...old,outlineDrawing:{segments:[{...line(0,0,1,1),cx:NaN}]}};
  assert.equal(validateProject(invalid),false);
  const inactive = structuredClone(old); inactive.pieces[1].outlineDrawing={segments:Array(1)};
  assert.equal(validateProject(inactive),false);
  assert.throws(()=>sanitizeProject(inactive),/草稿|线段|坐标/);
});

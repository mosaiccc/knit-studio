import test from 'node:test';
import assert from 'node:assert/strict';
import { GridEditor } from '../dist/editor.js';
import { paintChartLine, fillChartRegion } from '../dist/core/chart-editing.js';

const CREAM = '#f5efe3';
const ROSE = '#bf6373';

class FakeCanvas {
  listeners = new Map();
  captures = new Set();
  attributes = new Map();
  focusCalls = [];
  parentElement = {};
  getAttribute(name) { return this.attributes.get(name)??null; }
  setAttribute(name,value) { this.attributes.set(name,String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus(options) { this.focusCalls.push(options); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    if (this.captures.delete(id)) this.emit('lostpointercapture', { pointerId: id });
  }
  emit(type, properties = {}) {
    const event = { type, button: 0, pointerId: 1, clientX: 0.2, clientY: 0.2, preventDefault() {}, ...properties };
    for (const handler of [...(this.listeners.get(type) || [])]) handler(event);
  }
}

class TestEditor extends GridEditor {
  render() { this.margin = 0; this.cellW = 1; this.cellH = 1; }
}

function fixture({ tool = 'pen', grid = [Array(5).fill(CREAM)], canvasAttributes={}, ...overrides } = {}) {
  const OriginalObserver = globalThis.ResizeObserver;
  let disconnects = 0;
  globalThis.ResizeObserver = class { observe() {} disconnect() { disconnects++; } };
  const canvas = new FakeCanvas();
  for(const [name,value] of Object.entries(canvasAttributes))canvas.setAttribute(name,value);
  let current = grid;
  const commits = [];
  const draws = [];
  let cancellations = 0;
  let editor;
  try {
    editor = new TestEditor(canvas, {
      getGrid: () => current, getTool: () => tool, getColor: () => ROSE,
      getBackground: () => CREAM, getMirror: () => false,
      paintLine: paintChartLine, fillRegion: fillChartRegion,
      onDraw: next => { current = next; draws.push(next); },
      onCommit: before => commits.push({ before, grid: current }),
      onCancel: () => { cancellations++; }, ...overrides,
    });
  } finally {
    if (OriginalObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = OriginalObserver;
  }
  return { canvas, editor, commits, draws, get grid() { return current; }, get cancellations() { return cancellations; }, get disconnects() { return disconnects; } };
}

test('pointerup paints the final segment beyond the last pointermove and commits once', () => {
  const state = fixture();
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointermove', { clientX: 2.2 });
  state.canvas.emit('pointerup', { clientX: 4.2 });
  assert.deepEqual(state.grid, [Array(5).fill(ROSE)]);
  assert.equal(state.commits.length, 1);
  assert.deepEqual(state.commits[0].before, [Array(5).fill(CREAM)]);
  state.canvas.emit('lostpointercapture');
  state.canvas.emit('pointerup', { clientX: 4.2 });
  assert.equal(state.commits.length, 1);
  assert.equal(state.draws.length, 3, 'release adds one paint operation');
});

test('pointerup at the last painted point or outside the garment does not repaint', () => {
  for (const clientX of [0.2, -10, 100]) {
    const state = fixture();
    state.canvas.emit('pointerdown');
    state.canvas.emit('pointerup', { clientX });
    assert.equal(state.draws.length, 1);
    assert.equal(state.commits.length, 1);
  }
  const masked = fixture({ grid: [[CREAM, null, CREAM]] });
  masked.canvas.emit('pointerdown');
  masked.canvas.emit('pointerup', { clientX: 1.2 });
  assert.deepEqual(masked.grid, [[ROSE, null, CREAM]]);
});

test('pointercancel and lost capture finish only the already drawn cells', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const state = fixture();
    state.canvas.emit('pointerdown');
    state.canvas.emit(type, { clientX: 4.2 });
    assert.deepEqual(state.grid, [[ROSE, CREAM, CREAM, CREAM, CREAM]]);
    assert.equal(state.commits.length, 1);
    assert.equal(state.draws.length, 1);
    assert.equal(state.editor.stroke, false);
  }
});

test('finishStroke commits before the owning view changes and is idempotent', () => {
  const state = fixture();
  assert.equal(typeof state.editor.finishStroke, 'function');
  state.canvas.emit('pointerdown');
  state.editor.finishStroke();
  state.editor.finishStroke();
  assert.equal(state.commits.length, 1);
  assert.deepEqual(state.grid, [[ROSE, CREAM, CREAM, CREAM, CREAM]]);
  assert.equal(state.editor.stroke, false);
  state.editor.destroy();
  assert.equal(state.cancellations, 0);
});

test('destroy restores the pre-stroke grid without committing and removes all handlers', () => {
  const original = [[CREAM, null, CREAM]];
  const state = fixture({ grid: original });
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointermove', { clientX: 2.2 });
  assert.notDeepEqual(state.grid, original);
  state.editor.destroy();
  assert.deepEqual(state.grid, original);
  assert.equal(state.commits.length, 0);
  assert.equal(state.cancellations, 1);
  assert.equal(state.editor.stroke, false);
  assert.equal([...state.canvas.listeners.values()].reduce((count, handlers) => count + handlers.size, 0), 0);
  assert.equal(state.canvas.captures.size, 0);
  state.editor.destroy();
  assert.equal(state.cancellations, 1);
  assert.equal(state.disconnects, 1);
});

test('destroyed editors ignore queued stale handlers and direct event methods', () => {
  const state = fixture();
  const staleDown = [...state.canvas.listeners.get('pointerdown')][0];
  const staleUp = [...state.canvas.listeners.get('pointerup')][0];
  state.canvas.emit('pointerdown');
  state.editor.destroy();
  const drawCount = state.draws.length;
  const event = { button: 0, pointerId: 1, clientX: 4.2, clientY: 0.2, preventDefault() {} };
  staleDown(event);
  staleUp(event);
  state.editor.move(event);
  state.editor.finishStroke();
  assert.equal(state.draws.length, drawCount);
  assert.equal(state.commits.length, 0);
  assert.deepEqual(state.grid, [Array(5).fill(CREAM)]);
});

test('fill commits immediately without a second release paint', () => {
  const state = fixture({ tool: 'fill' });
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointerup', { clientX: 4.2 });
  assert.deepEqual(state.grid, [Array(5).fill(ROSE)]);
  assert.equal(state.draws.length, 1);
  assert.equal(state.commits.length, 1);
});

test('position tool drags across cutouts without painting and commits the final release point once', () => {
  const events = [];
  let paintStarts = 0;
  const original = [[CREAM, null, CREAM, null, CREAM]];
  const state = fixture({ tool: 'position', grid: original,
    onStart: () => { paintStarts++; },
    onPositionStart: point => events.push(['start', point]),
    onPositionMove: point => events.push(['move', point]),
    onPositionCommit: (...args) => events.push(['commit', ...args])
  });
  state.canvas.emit('pointerdown', { clientX: 1.2 });
  assert.equal(state.canvas.captures.has(1), true);
  state.canvas.emit('pointermove', { clientX: 2.2 });
  state.canvas.emit('pointerup', { clientX: 3.2 });
  state.canvas.emit('pointerup', { clientX: 4.2 });
  state.canvas.emit('lostpointercapture');
  assert.deepEqual(events, [['start', { x: 1, y: 0 }], ['move', { x: 2, y: 0 }], ['move', { x: 3, y: 0 }], ['commit']]);
  assert.equal(state.draws.length, 0);
  assert.equal(state.commits.length, 0);
  assert.equal(paintStarts, 0);
  assert.deepEqual(state.grid, original);
  assert.equal(state.editor.stroke, false);
  assert.equal(state.canvas.captures.size, 0);
});

test('position dragging ignores unrelated pointers, repeated cells, and outside coordinates', () => {
  const moves = [], starts = [];
  let commits = 0;
  const state = fixture({ tool: 'position',
    onPositionStart: point => starts.push(point), onPositionMove: point => moves.push(point),
    onPositionCommit: () => { commits++; }
  });
  state.canvas.emit('pointerdown', { clientX: -1 });
  state.canvas.emit('pointerdown', { clientX: 100 });
  assert.equal(starts.length, 0);
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointerdown', { pointerId: 2, clientX: 2.2 });
  state.canvas.emit('pointermove', { pointerId: 2, clientX: 2.2 });
  state.canvas.emit('pointerup', { pointerId: 2, clientX: 2.2 });
  state.canvas.emit('pointermove', { clientX: 0.3 });
  state.canvas.emit('pointermove', { clientX: 1.2 });
  state.canvas.emit('pointermove', { clientX: 1.3 });
  state.canvas.emit('pointermove', { clientX: -2 });
  state.canvas.emit('pointerup', { clientX: 100 });
  assert.deepEqual(starts, [{ x: 0, y: 0 }]);
  assert.deepEqual(moves, [{ x: 1, y: 0 }]);
  assert.equal(commits, 1);
  assert.equal(state.draws.length, 0);
});

test('finishStroke commits positioning once and supports redraws during drag', () => {
  let starts = 0, moves = 0, commits = 0, cancellations = 0;
  let state;
  state = fixture({ tool: 'position',
    onPositionStart: () => { starts++; state.editor.render(); state.canvas.emit('pointerdown'); },
    onPositionMove: () => { moves++; state.editor.render(); },
    onPositionCommit: () => { commits++; }, onPositionCancel: () => { cancellations++; }
  });
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointermove', { clientX: 2.2 });
  state.editor.finishStroke();
  state.editor.finishStroke();
  state.editor.destroy();
  assert.deepEqual({ starts, moves, commits, cancellations }, { starts: 1, moves: 1, commits: 1, cancellations: 0 });
  assert.equal(state.draws.length, 0);
});

test('destroy cancels positioning once without paint rollback or stale callback commits', () => {
  let commits = 0, cancellations = 0;
  const state = fixture({ tool: 'position', onPositionCommit: () => { commits++; }, onPositionCancel: () => { cancellations++; } });
  const staleUp = [...state.canvas.listeners.get('pointerup')][0];
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointermove', { clientX: 2.2 });
  state.editor.destroy();
  state.editor.destroy();
  staleUp({ pointerId: 1, clientX: 4.2, clientY: 0.2, preventDefault() {} });
  state.editor.finishStroke();
  assert.equal(cancellations, 1);
  assert.equal(commits, 0);
  assert.equal(state.cancellations, 0);
  assert.equal(state.draws.length, 0);
  assert.equal(state.canvas.captures.size, 0);
  assert.equal([...state.canvas.listeners.values()].reduce((count, handlers) => count + handlers.size, 0), 0);
});

test('placement bounds render as a dashed rose outline in cell coordinates', () => {
  const operations = [];
  const context = {
    scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
    setLineDash(dash) { operations.push(['dash', dash]); },
    strokeRect(...rectangle) { operations.push(['rect', rectangle, this.strokeStyle, this.lineWidth]); }
  };
  const state = fixture({ grid: Array.from({ length: 4 }, () => Array(5).fill(CREAM)),
    getAspect: () => 0.5, getPlacementBounds: () => ({ x: 1, y: 2, width: 3, height: 2 })
  });
  state.canvas.parentElement = { clientWidth: 500, clientHeight: 500 };
  state.canvas.style = {};
  state.canvas.getContext = () => context;
  const originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    GridEditor.prototype.render.call(state.editor);
    const outline = operations.filter(operation => operation[0] === 'rect').at(-1);
    assert.deepEqual(outline[1], [state.editor.margin + state.editor.cellW, state.editor.margin + 2 * state.editor.cellH, 3 * state.editor.cellW, 2 * state.editor.cellH]);
    assert.equal(outline[2], '#b96d78');
    assert.ok(operations.some(operation => operation[0] === 'dash' && operation[1].length > 0));
    assert.deepEqual(operations.at(-1), ['dash', []]);
    delete context.setLineDash;
    assert.doesNotThrow(() => GridEditor.prototype.render.call(state.editor));
  } finally { globalThis.window = originalWindow; }
});

test('stitch tool draws through the final release cell and commits one independent symbol snapshot without changing colors', () => {
  let symbols = { '40:40': 'slip' };
  const original = structuredClone(symbols);
  let starts = 0;
  const changes = [];
  const state = fixture({ tool: 'stitch', getStitches: () => symbols, getStitch: () => 'yo',
    onStart: () => { starts++; }, onStitchesDraw: next => { symbols = next; changes.push(next); }
  });
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointermove', { clientX: 2.2 });
  state.canvas.emit('pointerup', { clientX: 4.2 });
  assert.deepEqual(symbols, { '40:40': 'slip', '1:5': 'yo', '1:4': 'yo', '1:3': 'yo', '1:2': 'yo', '1:1': 'yo' });
  assert.equal(starts, 1);
  assert.equal(changes.length, 3);
  assert.equal(state.commits.length, 1);
  assert.deepEqual(state.commits[0].before, original);
  assert.equal(state.draws.length, 0);
  assert.deepEqual(state.grid, [Array(5).fill(CREAM)]);
  state.canvas.emit('lostpointercapture');
  assert.equal(state.commits.length, 1);
});

test('stitch erase affects only symbols, skips garment holes, and keeps dormant needle positions', () => {
  let symbols = { '1:1': 'knit', '1:2': 'purl', '1:3': 'yo', '30:30': 'ktbl' };
  const state = fixture({ tool: 'stitch-erase', grid: [[CREAM, null, CREAM]],
    getStitches: () => symbols, getStitch: () => 'knit', onStitchesDraw: next => { symbols = next; }
  });
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointerup', { clientX: 2.2 });
  assert.deepEqual(symbols, { '1:2': 'purl', '30:30': 'ktbl' });
  assert.deepEqual(state.grid, [[CREAM, null, CREAM]]);
  assert.equal(state.draws.length, 0);
});

test('destroy cancels an unfinished symbol stroke by restoring symbols without color rollback', () => {
  const original = { '1:1': 'purl' };
  let symbols = structuredClone(original);
  const state = fixture({ tool: 'stitch', getStitches: () => symbols, getStitch: () => 'knit', onStitchesDraw: next => { symbols = next; } });
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointermove', { clientX: 2.2 });
  assert.notDeepEqual(symbols, original);
  state.editor.destroy();
  assert.deepEqual(symbols, original);
  assert.equal(state.cancellations, 1);
  assert.equal(state.commits.length, 0);
  assert.equal(state.draws.length, 0);
  assert.equal(state.canvas.captures.size, 0);
  state.editor.destroy();
  assert.equal(state.cancellations, 1);
});

test('symbol stroke interruptions match existing paint lifecycle and readonly previews never draw symbols', () => {
  for (const event of ['pointercancel', 'lostpointercapture']) {
    let symbols = {};
    const state = fixture({ tool: 'stitch', getStitches: () => symbols, getStitch: () => 'knit', onStitchesDraw: next => { symbols = next; } });
    state.canvas.emit('pointerdown');
    state.canvas.emit(event, { clientX: 4.2 });
    assert.deepEqual(symbols, { '1:5': 'knit' });
    assert.equal(state.commits.length, 1);
    assert.equal(state.draws.length, 0);
  }
  let readOnlyDraws = 0;
  const state = fixture({ tool: 'stitch', readOnly: true, getStitches: () => ({}), getStitch: () => 'knit', onStitchesDraw: () => { readOnlyDraws++; } });
  state.canvas.emit('pointerdown');
  state.canvas.emit('pointerup', { clientX: 4.2 });
  assert.equal(readOnlyDraws, 0);
  assert.equal(state.commits.length, 0);
});

test('symbols render above the chart using contrast colors and skip null or out-of-bounds cells', () => {
  const strokes = [];
  const context = {
    scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, fillText() {}, strokeRect() {}, save() {}, restore() {},
    stroke() { strokes.push(this.strokeStyle); }
  };
  const state = fixture({ grid: [['#111111', '#ffffff', null]], getShowGrid: () => false,
    getStitches: () => ({ '1:3': 'knit', '1:2': 'purl', '1:1': 'yo', '4:4': 'ktbl' })
  });
  state.canvas.parentElement = { clientWidth: 500, clientHeight: 500 };
  state.canvas.style = {};
  state.canvas.getContext = () => context;
  const originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    GridEditor.prototype.render.call(state.editor);
    assert.deepEqual(strokes, ['#ffffff', '#343c36']);
  } finally { globalThis.window = originalWindow; }
});

test('paint passes brush size and locks size, color, tool and both mirror axes for one stroke', () => {
  let tool='pen',size=3,color=ROSE,mirror=false,mirrorVertical=true;
  const calls=[];
  const state=fixture({getTool:()=>tool,getBrushSize:()=>size,getColor:()=>color,getMirror:()=>mirror,getMirrorVertical:()=>mirrorVertical,
    paintLine:(...args)=>{calls.push(args.slice(1));return args[0].map(row=>row.slice());}});
  state.canvas.emit('pointerdown');
  tool='eraser';size=7;color='#123456';mirror=true;mirrorVertical=false;
  state.canvas.emit('pointermove',{clientX:2.2});
  state.canvas.emit('pointerup',{clientX:4.2});
  assert.equal(calls.length,3);
  for(const call of calls)assert.deepEqual(call.slice(4),[ROSE,false,3,true]);
  assert.equal(state.commits.length,1);
  state.canvas.emit('pointerdown',{clientX:1.2});
  state.canvas.emit('pointerup',{clientX:1.2});
  assert.deepEqual(calls.at(-1).slice(4),[CREAM,true,7,false]);
  assert.equal(state.commits.length,2);
});

test('vertical brush strokes include release positions and erase both ends in one undo step',()=>{
  let tool='pen';
  const state=fixture({grid:Array.from({length:8},()=>Array(7).fill(CREAM)),getTool:()=>tool,getMirrorVertical:()=>true,getBrushSize:()=>2});
  state.canvas.emit('pointerdown',{clientX:1.2,clientY:1.2});
  state.canvas.emit('pointerup',{clientX:3.2,clientY:1.2});
  assert.equal(state.grid.flat().filter(c=>c===ROSE).length,16);
  assert.deepEqual(state.grid,[...state.grid].reverse());
  assert.equal(state.commits.length,1);
  tool='eraser';
  state.canvas.emit('pointerdown',{clientX:2.2,clientY:1.2});state.canvas.emit('pointerup',{clientX:2.2,clientY:1.2});
  assert.equal(state.grid.flat().filter(c=>c===ROSE).length,8);
  assert.equal(state.commits.length,2);
});

test('four-way fill uses each original seed region once, skips holes and commits once',()=>{
  const grid=[[CREAM,CREAM,null,'#111111','#111111'],[null,null,null,null,null],['#222222','#222222',null,'#333333','#333333']];
  const state=fixture({tool:'fill',grid,getMirror:()=>true,getMirrorVertical:()=>true});
  state.canvas.emit('pointerdown');state.canvas.emit('pointerup');
  assert.deepEqual(state.grid,grid.map(row=>row.map(c=>c===null?null:ROSE)));
  assert.equal(state.commits.length,1);assert.equal(state.draws.length,1);
  assert.deepEqual(state.commits[0].before,grid);
});

test('vertical symbol painting and erasing use frozen mirror flags and one commit per stroke',()=>{
  let symbols={},tool='stitch',vertical=true;
  const state=fixture({grid:Array.from({length:5},()=>Array(5).fill(CREAM)),getTool:()=>tool,getStitches:()=>symbols,
    getStitch:()=> 'ptbl',getMirror:()=>true,getMirrorVertical:()=>vertical,onStitchesDraw:next=>{symbols=next;}});
  state.canvas.emit('pointerdown',{clientX:1.2,clientY:1.2});vertical=false;
  state.canvas.emit('pointerup',{clientX:1.2,clientY:1.2});
  assert.deepEqual(symbols,{'4:4':'ptbl','4:2':'ptbl','2:4':'ptbl','2:2':'ptbl'});
  assert.equal(state.commits.length,1);
  tool='stitch-erase';vertical=true;
  state.canvas.emit('pointerdown',{clientX:1.2,clientY:1.2});state.canvas.emit('pointerup',{clientX:1.2,clientY:1.2});
  assert.deepEqual(symbols,{});assert.equal(state.commits.length,2);
});

test('four-way even brush preview matches mirrored rectangles including reflected cloth across cutouts',()=>{
  const grid=Array.from({length:8},()=>Array(10).fill(null));grid[6][8]=CREAM;
  const state=fixture({grid,getBrushSize:()=>2,getMirror:()=>true,getMirrorVertical:()=>true});
  state.canvas.emit('pointermove',{clientX:1.2,clientY:1.2});
  assert.deepEqual(state.editor.hoverPoint,{x:1,y:1});
  const rectangles=[];const ctx={setLineDash(){},strokeRect(...args){if(this.lineWidth===1.3)rectangles.push(args);}};
  state.editor.drawBrushPreview(ctx,10,8);
  assert.deepEqual(rectangles,[[1,1,2,2],[7,1,2,2],[1,5,2,2],[7,5,2,2]]);
  state.canvas.emit('pointerdown',{clientX:1.2,clientY:1.2});state.canvas.emit('pointerup',{clientX:1.2,clientY:1.2});
  assert.equal(state.grid[6][8],ROSE);assert.equal(state.grid.flat().filter(c=>c!==null).length,1);
});

test('brush size defaults to one and does not affect fill, dropper, position or stitch tools', () => {
  const calls=[];
  const state=fixture({paintLine:(...args)=>{calls.push(args);return args[0].map(row=>row.slice());}});
  state.canvas.emit('pointerdown');state.canvas.emit('pointerup');
  assert.equal(calls[0][7],1);
  for(const tool of ['fill','dropper','position','stitch','stitch-erase']){
    const other=fixture({tool,getBrushSize:()=>{throw new Error('irrelevant size read');},onPick:()=>{}});
    assert.doesNotThrow(()=>{other.canvas.emit('pointerdown');other.canvas.emit('pointerup');});
  }
});

test('hover only redraws on a new cell and never paints or commits; pointerleave clears it', () => {
  const state=fixture({getBrushSize:()=>5});
  let renders=0;state.editor.render=()=>{renders++;};
  state.canvas.emit('pointermove',{clientX:1.2});
  state.canvas.emit('pointermove',{clientX:1.8});
  assert.equal(renders,1);
  state.canvas.emit('pointermove',{clientX:2.2});
  assert.equal(renders,2);
  state.canvas.emit('pointerleave');
  assert.equal(renders,3);
  state.canvas.emit('pointerleave');
  assert.equal(renders,3);
  assert.equal(state.draws.length,0);assert.equal(state.commits.length,0);
  state.editor.destroy();state.canvas.emit('pointermove');
  assert.equal(renders,3);
});

test('hover bounds reflect even brush footprints exactly, clip edges, and scale with non-square cells', () => {
  const rectangles=[];
  const context={scale(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},fillText(){},
    setLineDash(){},strokeRect(...args){rectangles.push({args,color:this.strokeStyle});}};
  const state=fixture({grid:Array.from({length:8},()=>Array(10).fill(CREAM)),getBrushSize:()=>4,getMirror:()=>true,getAspect:()=>.5});
  state.canvas.emit('pointermove',{clientX:.2,clientY:3.2});
  state.canvas.parentElement={clientWidth:500,clientHeight:500};state.canvas.style={};state.canvas.getContext=()=>context;
  const originalWindow=globalThis.window;globalThis.window={devicePixelRatio:1};
  try{
    GridEditor.prototype.render.call(state.editor);
    const previews=rectangles.filter(r=>r.color==='#3f5e4a');
    assert.deepEqual(previews.map(r=>r.args),[
      [state.editor.margin,state.editor.margin+2*state.editor.cellH,3*state.editor.cellW,4*state.editor.cellH],
      [state.editor.margin+7*state.editor.cellW,state.editor.margin+2*state.editor.cellH,3*state.editor.cellW,4*state.editor.cellH]
    ]);
    assert.equal(state.draws.length,0);assert.equal(state.commits.length,0);
    rectangles.length=0;state.canvas.emit('pointerleave');GridEditor.prototype.render.call(state.editor);
    assert.equal(rectangles.filter(r=>r.color==='#3f5e4a').length,0);
  }finally{globalThis.window=originalWindow;}
});

test('read-only and non-brush tool hover have no brush preview or repeated paint', () => {
  for(const override of [{readOnly:true},{tool:'fill'},{tool:'stitch'}]){
    const state=fixture({...override,getBrushSize:()=>5});let renders=0;state.editor.render=()=>{renders++;};
    state.canvas.emit('pointermove');state.canvas.emit('pointerleave');
    assert.equal(renders,0);assert.equal(state.draws.length,0);
  }
  const state=fixture();state.canvas.emit('pointerdown');
  state.canvas.emit('pointermove',{clientX:.5,clientY:.5});
  state.canvas.emit('pointerup');assert.equal(state.draws.length,1);
});

test('large brushes centered on a cutout paint surrounding cloth but never chart labels or null cells', () => {
  const grid=Array.from({length:5},()=>Array(5).fill(null));
  grid[0][0]=CREAM;grid[2][2]=CREAM;grid[4][4]=CREAM;
  const state=fixture({grid,getBrushSize:()=>3});
  state.canvas.emit('pointermove',{clientX:1.2,clientY:1.2});
  assert.deepEqual(state.editor.hoverPoint,{x:1,y:1});
  assert.equal(state.draws.length,0);
  state.canvas.emit('pointerdown',{clientX:-.2,clientY:.2});
  assert.equal(state.draws.length,0,'chart label margins must not start a stroke');
  state.canvas.emit('pointerdown',{clientX:1.2,clientY:1.2});
  assert.equal(state.grid[0][0],ROSE);assert.equal(state.grid[2][2],ROSE);
  state.canvas.emit('pointerup',{clientX:3.2,clientY:3.2});
  assert.equal(state.grid[4][4],ROSE);assert.equal(state.commits.length,1);
  assert.equal(state.grid.flat().filter(cell=>cell===null).length,22);
  const single=fixture({grid,getBrushSize:()=>1});
  single.canvas.emit('pointerdown',{clientX:1.2,clientY:1.2});single.canvas.emit('pointerup',{clientX:1.2,clientY:1.2});
  assert.equal(single.draws.length,0);assert.equal(single.commits.length,0);
});

test('release outside the grid without a move clears the last brush preview', () => {
  const state=fixture();let renders=0;state.editor.render=()=>{renders++;};
  state.canvas.emit('pointerdown');assert.equal(renders,1);
  state.canvas.emit('pointerup',{clientX:100});
  assert.equal(renders,2);assert.equal(state.editor.hoverPoint,null);
  assert.equal(state.draws.length,1);assert.equal(state.commits.length,1);
  state.canvas.emit('pointerleave');assert.equal(renders,2);
});

test('editable canvas takes focus on valid input so shortcuts leave the size field, restoring tabindex on destroy', () => {
  const state=fixture({getBrushSize:()=>3});
  assert.equal(state.canvas.getAttribute('tabindex'),'0');
  state.canvas.emit('pointerdown',{clientX:-2});
  assert.equal(state.canvas.focusCalls.length,0);
  state.canvas.emit('pointerdown');state.canvas.emit('pointerup');
  assert.deepEqual(state.canvas.focusCalls,[{preventScroll:true}]);
  state.editor.destroy();assert.equal(state.canvas.getAttribute('tabindex'),null);
  const custom=fixture({canvasAttributes:{tabindex:'7'}});
  assert.equal(custom.canvas.getAttribute('tabindex'),'7');
  custom.canvas.emit('pointerdown');custom.canvas.emit('pointerup');custom.editor.destroy();
  assert.equal(custom.canvas.getAttribute('tabindex'),'7');
});

test('read-only previews never become focusable or take focus on click', () => {
  for(const canvasAttributes of [{},{tabindex:'-1'}]){
    const state=fixture({readOnly:true,canvasAttributes});
    const before=canvasAttributes.tabindex??null;
    assert.equal(state.canvas.getAttribute('tabindex'),before);
    state.canvas.emit('pointerdown');state.canvas.emit('pointerup');
    assert.equal(state.canvas.focusCalls.length,0);
    state.editor.destroy();assert.equal(state.canvas.getAttribute('tabindex'),before);
  }
});

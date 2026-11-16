import test from 'node:test';
import assert from 'node:assert/strict';
import {createGrid} from '../dist/core/pattern.js';
import {normalizePieces, duplicatePiece, switchActivePiece} from '../dist/core/pieces.js';
import {composeProjectChart} from '../dist/core/placements.js';

const written = await import('../dist/core/written-pattern.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const A='#ffffff', B='#111111', C='#ff0000';
const base = overrides => ({version:1,name:'小羊文字教程',grid:createGrid(4,4,A),palette:[A,B,C],garmentId:'rectangle',measurements:{width:4,height:4},gauge:{stitches:10,rows:10},placement:'repeat',arrangement:'custom',fabricColor:A,chartEdits:{},stitchSymbols:{},annotations:[],motifPlacements:[],...overrides});
function rows(grid,symbols={},options={}) {
  assert.equal(typeof written.buildWrittenRows,'function');
  return written.buildWrittenRows(grid,symbols,options);
}

test('written rows preserve chart coordinates while reversing work order and alternating reading direction',()=>{
  const grid=[[A,A,B],[B,C,C],[A,B,C]];
  const bottom=rows(grid),top=rows(grid,{}, {direction:'top-down'});
  assert.deepEqual(bottom.rows.map(row=>[row.workRow,row.chartRow,row.side]),[[1,1,'rs'],[2,2,'ws'],[3,3,'rs']]);
  assert.deepEqual(top.rows.map(row=>row.chartRow),[3,2,1]);
  assert.deepEqual(bottom.rows[0].segments[0].runs.map(run=>run.color),[C,B,A]);
  assert.deepEqual(bottom.rows[1].segments[0].runs.map(run=>run.color),[B,C]);
  assert.deepEqual(top.rows[0].segments[0].runs.map(run=>[run.color,run.count]),[[B,1],[A,2]]);
  assert.match(bottom.rows[0].text,/正面.*从图右向左/);
  assert.match(bottom.rows[1].text,/反面.*从图左向右/);
});

test('empty symbol cells use stockinette and first-side selection governs all rows',()=>{
  const grid=[[A,A],[A,A]];
  const rs=rows(grid),ws=rows(grid,{}, {firstSide:'ws'});
  assert.match(rs.rows[0].segments[0].text,/织 2 针下针/);
  assert.match(rs.rows[1].segments[0].text,/织 2 针上针/);
  assert.deepEqual(ws.rows.map(row=>row.side),['ws','rs']);
  assert.match(ws.rows[0].segments[0].text,/织 2 针上针/);
});

test('all saved symbols have actual right and wrong side operations, including retired symbols',()=>{
  const ids=['knit','purl','yo','k2tog','ssk','slip','ktbl','ptbl','k3tog'];
  const grid=[Array(ids.length).fill(A)];
  const symbols=Object.fromEntries(ids.map((id,i)=>['1:'+(i+1),id]));
  const rs=rows(grid,symbols).rows[0],ws=rows(grid,symbols,{firstSide:'ws'}).rows[0];
  assert.match(rs.text,/下针/);assert.match(rs.text,/上针/);assert.match(rs.text,/绕线/);
  assert.match(rs.text,/并织下针/);assert.match(ws.text,/并织上针/);
  assert.match(rs.text,/SSK/);assert.match(ws.text,/SSP/);
  assert.match(rs.text,/线在后/);assert.match(ws.text,/线在前/);
  assert.match(rs.text,/后针脚/);assert.match(ws.text,/后针脚/);
  assert.equal(rs.symbolDelta,-3);
  assert.equal(rs.requiredInput,12);
});

test('top-down keeps symbols at their original chart locations and does not turn decreases into increases',()=>{
  const result=rows([[A,A],[A,A]],{'2:1':'k2tog'},{direction:'top-down'});
  assert.equal(result.rows[0].chartRow,2);
  assert.equal(result.rows[0].requiredInput,3);
  assert.match(result.rows[0].text,/两针并织下针/);
  assert.doesNotMatch(result.rows[1].text,/并织/);
});

test('initial cast-on and segment input counts include extra stitches consumed by decreases',()=>{
  const row=rows([[A,A,null,A,A]],{'1:1':'k2tog','1:5':'yo'}).rows[0];
  assert.equal(row.count,4);assert.equal(row.requiredInput,4);
  assert.deepEqual(row.segments.map(segment=>segment.inputCount),[3,1]);
  assert.equal(row.transition.kind,'cast-on');
  assert.match(row.transition.text,/分别起针/);
  assert.match(row.transition.text,/3 针/);assert.match(row.transition.text,/1 针/);
});

test('simple geometric decreases become increases in the opposite knitting direction',()=>{
  const grid=[[null,A,A,null],[A,A,A,A]];
  const bottom=rows(grid).rows[1],top=rows(grid,{}, {direction:'top-down'}).rows[1];
  assert.equal(bottom.transition.delta,-2);assert.equal(top.transition.delta,2);
  assert.match(bottom.transition.text,/图左侧减 1 针.*图右侧减 1 针/);
  assert.match(top.transition.text,/图左侧加 1 针.*图右侧加 1 针/);
});

test('a decrease already explaining contour change is not counted again',()=>{
  const result=rows([[A,A,null],[A,A,A]],{'2:2':'k2tog'}).rows[1];
  assert.equal(result.requiredInput,3);
  assert.equal(result.transition.additionalChange,0);
  assert.equal(result.transition.kind,'symbols');
  assert.match(result.transition.text,/行内针法.*完成/);
  assert.doesNotMatch(result.transition.text,/另.*减 1 针/);
});

test('symbol-versus-contour mismatch explicitly states the missing change',()=>{
  const result=rows([[A,A,A],[A,A,A]],{'2:1':'k2tog'});
  assert.equal(result.rows[1].transition.additionalChange,1);
  assert.equal(result.rows[1].transition.needsReview,true);
  assert.match(result.rows[1].transition.text,/尚需.*加 1 针/);
  assert.ok(result.warnings.some(message=>message.includes('第 2 行')));
});

test('equal-width shifted rows do not silently become work-even rows',()=>{
  const row=rows([[null,A,A,A],[A,A,A,null]]).rows[1];
  assert.equal(row.transition.delta,0);
  assert.match(row.transition.text,/图左侧减 1 针.*图右侧加 1 针/);
  assert.doesNotMatch(row.transition.text,/不加不减/);
});

test('split and merge instructions keep disconnected parts separate',()=>{
  const grid=[[A,A,null,null,A,A],[A,A,A,A,A,A]];
  const bottom=rows(grid),top=rows(grid,{}, {direction:'top-down'});
  assert.equal(bottom.rows[1].segments.length,2);
  assert.equal(bottom.rows[1].transition.kind,'split');
  assert.match(bottom.rows[1].transition.text,/分成 2 段.*分别编织/);
  assert.equal(top.rows[0].transition.kind,'cast-on');
  assert.match(top.rows[0].transition.text,/分别起针/);
  assert.equal(top.rows[1].transition.kind,'merge');
  assert.match(top.rows[1].transition.text,/连接.*2 针/);
  assert.deepEqual(bottom.rows[1].segments.map(segment=>segment.count),[2,2]);
});

test('independent segments cannot borrow stitches across a gap when symbol changes cancel globally',()=>{
  const result=rows([[A,A,null,A,A],[A,A,null,A,A]],{'2:1':'yo','2:5':'k2tog'});
  const row=result.rows[1];
  assert.equal(row.symbolDelta,0);
  assert.equal(row.transition.needsReview,true);
  assert.match(row.transition.text,/各段.*单独核对/);
  assert.match(row.transition.text,/尚需安排减 1 针/);
  assert.match(row.transition.text,/尚需安排加 1 针/);
  const other=rows([[null,A,null,A,A],[A,A,null,A,A]],{'2:1':'k2tog'}).rows[1];
  assert.equal(other.transition.needsReview,true);
  assert.match(other.transition.text,/尚需安排减 1 针/);
  assert.match(other.transition.text,/尚需安排加 1 针/);
});

test('custom outlines and shaped upper edges receive concrete construction notes',()=>{
  const source=base({garmentId:'round-front',measurements:{width:48,height:58,shoulderWidth:35,neckWidth:18,neckDepth:9,armholeDepth:18}});
  const result=written.buildWrittenPattern(source,{direction:'top-down',scope:'current'});
  assert.match(result.pieces[0].text,/肩斜.*短行|肩部.*短行/);
  assert.match(result.pieces[0].rows[0].transition.text,/分别起针/);
});

test('unchanged earlier segments do not renumber a later segment edge adjustment',()=>{
  const row=rows([[A,A,null,A,A,A],[A,A,null,A,A,null]]).rows[1];
  assert.match(row.transition.text,/第 2 段（按图左到右）图右侧加 1 针/);
  assert.doesNotMatch(row.transition.text,/第 1 段/);
});

test('simultaneous splits and joins are not treated as a simple same-count segment pairing',()=>{
  const row=rows([[A,null,A,A,A,A,A],[A,A,A,null,A,A,A]]).rows[1];
  assert.equal(row.transition.needsReview,true);
  assert.equal(row.transition.kind,'disconnected');
});

test('leading and trailing empty rows are excluded, internal gaps restart a separate piece region',()=>{
  const result=rows([[null,null],[A,A],[null,null],[A,A],[null,null]]);
  assert.deepEqual(result.rows.map(row=>row.chartRow),[2,4]);
  assert.deepEqual(result.rows.map(row=>row.side),['rs','rs']);
  assert.equal(result.rows[1].transition.kind,'restart');
  assert.match(result.rows[1].transition.text,/断开.*另起/);
  assert.ok(result.warnings.some(message=>message.includes('空行')));
});

test('only visible chart symbols enter instructions; malformed symbol identifiers fail',()=>{
  const result=rows([[A,null,A]],{'1:2':'k2tog','50:50':'yo','1:1':'purl'});
  assert.equal(result.rows[0].symbolDelta,0);
  assert.deepEqual(result.usedStitches,['purl']);
  assert.throws(()=>rows([[A]],{'1:1':'unknown'}),/针法|符号/);
});

test('public tutorial composes placed motifs and hand edits then preserves source data',()=>{
  assert.equal(typeof written.buildWrittenPattern,'function');
  const project=base({chartEdits:{rectangle:{'1:1':C}},motifPlacements:[{id:'p',motifId:'m',name:'双色',garmentId:'rectangle',grid:createGrid(4,4,B),palette:[A,B],row:1,stitch:1,transparentBackground:false,flipX:false,flipY:false}]});
  const before=structuredClone(project),result=written.buildWrittenPattern(project);
  assert.equal(result.pieces.length,1);
  assert.equal(result.pieces[0].rows[0].segments[0].runs[0].color,C);
  assert.equal(result.pieces[0].rows[0].segments[0].runs[1].color,B);
  assert.deepEqual(project,before);
  assert.match(result.text,/每 10 cm：10 针 × 10 行/);
  assert.match(result.text,/平织往返/);
  assert.match(result.text,/近似色名/);
  assert.match(result.text,/craftyarncouncil.com/);
});

test('same-template pieces keep current edits, notes and symbols independent under all/current scope',()=>{
  let project=normalizePieces(base());
  project.annotations=[{id:'n1',garmentId:'rectangle',x:.2,y:.2,text:'第一片原文',fontSize:12,color:A}];
  project=duplicatePiece(project,'main',{id:'second',label:'第二片'});
  project.annotations=[{id:'n2',garmentId:'rectangle',x:.2,y:.2,text:'第二片原文',fontSize:12,color:B}];
  project.stitchSymbols={rectangle:{'1:1':'purl'}};
  const all=written.buildWrittenPattern(project),current=written.buildWrittenPattern(project,{scope:'current'});
  assert.equal(all.pieces.length,2);assert.equal(current.pieces.length,1);
  assert.equal(current.pieces[0].id,'second');
  assert.match(all.pieces[0].text,/第一片原文/);assert.doesNotMatch(all.pieces[0].text,/第二片原文/);
  assert.match(all.pieces[1].text,/第二片原文/);assert.doesNotMatch(all.pieces[1].text,/第一片原文/);
  assert.equal(all.pieces[0].rows[0].segments[0].runs[0].stitchId,'knit');
  assert.equal(all.pieces[1].rows[0].segments[0].runs[0].stitchId,'purl');
});

test('draft outlines and absent construction details are described without fabricating garment steps',()=>{
  const result=written.buildWrittenPattern(base({outlineDrawing:{segments:[]}}));
  assert.match(result.text,/未应用.*轮廓草稿/);
  assert.match(result.text,/已应用轮廓/);
  assert.match(result.text,/缝合/);
  assert.ok(result.warnings.length>0);
});

test('empty grids, malformed colors, options and projects fail clearly rather than producing invented text',()=>{
  for(const grid of [[],[[null]],[[A],[]],[[undefined]],[[12]]]) assert.throws(()=>rows(grid),/图解|网格|有效/);
  for(const options of [{direction:'sideways'},{firstSide:'xx'},{scope:'other'}]) assert.throws(()=>written.buildWrittenPattern(base(),options),/方向|正反面|范围/);
  assert.throws(()=>written.buildWrittenPattern(null),/项目|工程/);
  assert.throws(()=>written.buildWrittenPattern(base({gauge:{stitches:0,rows:10}})),/密度/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {getGarment,getOutline,createGarmentChart,resolveShoulderWidth} from '../dist/core/garments.js';
import {sanitizeProject,validateProject} from '../dist/core/project.js';
import {addPiece,switchActivePiece,getPieceProjects} from '../dist/core/pieces.js';
import {createStyleProject} from '../dist/core/clothing-styles.js';

const id='trapezoid-sleeve';
const gauge={stitches:20,rows:30};
const base={width:36,height:48,cuffWidth:18};
const project=measurements=>({version:1,name:'梯形袖测试',grid:Array.from({length:4},()=>Array(4).fill('#f5efe3')),palette:['#f5efe3'],gauge,garmentId:id,measurements,placement:'center'});

test('trapezoid sleeve is a separately adjustable sleeve template with no sleeve cap or shoulder',()=>{
  const g=getGarment(id);
  assert.equal(g.name,'梯形袖子');assert.equal(g.category,'袖片');
  assert.deepEqual(g.fields,['width','height','cuffWidth']);
  for(const key of g.fields)assert.equal(g.defaults[key],base[key]);
  assert.equal(resolveShoulderWidth(id,base),undefined);
  assert.deepEqual(getOutline(id,base).points,[[0,0],[1,0],[.75,1],[.25,1]]);
});

test('trapezoid sleeve has straight symmetric sides and independently sized cuff edge',()=>{
  const wideCuff=getOutline(id,{width:40,height:50,cuffWidth:28});
  const expected=[[0,0],[1,0],[.85,1],[.15,1]];
  assert.equal(wideCuff.points.length,4);
  wideCuff.points.forEach((point,index)=>point.forEach((value,axis)=>assert.ok(Math.abs(value-expected[index][axis])<1e-12)));
  const rectangle=getOutline(id,{...base,cuffWidth:base.width});
  assert.deepEqual(rectangle.points,[[0,0],[1,0],[1,1],[0,1]]);
  assert.match(wideCuff.path,/ Z$/);
  for(const cuffWidth of [0,-1,37,NaN,Infinity,null,'invalid'])assert.throws(()=>getOutline(id,{...base,cuffWidth}),/袖口/);
});

test('trapezoid chart grows from cuff to upper edge with a centered symmetric mask',()=>{
  const chart=createGarmentChart(id,base,gauge,[['#f5efe3']]);
  assert.equal(chart.width,72);assert.equal(chart.height,144);
  assert.equal(chart.rowCounts[0].count,36);assert.equal(chart.rowCounts.at(-1).count,72);
  for(let row=0;row<chart.height;row++){
    assert.deepEqual(chart.mask[row],[...chart.mask[row]].reverse());
    if(row)assert.ok(chart.rowCounts[row].count>=chart.rowCounts[row-1].count);
    assert.equal(chart.rowCounts[row].segments.length,1);
  }
});

test('nondefault cuff width survives project JSON sanitation and missing cuff receives its template default',()=>{
  const original=project({...base,cuffWidth:22.5});
  const clean=sanitizeProject(original),restored=sanitizeProject(JSON.parse(JSON.stringify(clean)));
  assert.equal(restored.measurements.cuffWidth,22.5);
  assert.equal(restored.pieces[0].measurements.cuffWidth,22.5);
  assert.ok(validateProject(restored));assert.equal(original.pieces,undefined);
  assert.equal(sanitizeProject(project({width:36,height:48})).measurements.cuffWidth,18);
  for(const cuffWidth of [0,-1,37,null,'18'])assert.equal(validateProject(project({...base,cuffWidth})),false);
});

test('two added trapezoid sleeves retain independent cuff and length dimensions after switching and JSON reload',()=>{
  let p=createStyleProject({styleId:'round-vest',name:'独立袖片测试',gauge});
  p=addPiece(p,{id:'left-t',label:'左梯形袖',garmentId:id});
  p.measurements.cuffWidth=16;p.measurements.height=45;
  p=addPiece(p,{id:'right-t',label:'右梯形袖',garmentId:id});
  p.measurements.cuffWidth=21;p.measurements.height=50;
  p=switchActivePiece(p,'left-t');
  const restored=sanitizeProject(JSON.parse(JSON.stringify(p)));
  const entries=getPieceProjects(restored);
  assert.equal(entries.find(e=>e.id==='left-t').project.measurements.cuffWidth,16);
  assert.equal(entries.find(e=>e.id==='right-t').project.measurements.cuffWidth,21);
  assert.equal(entries.find(e=>e.id==='left-t').project.measurements.height,45);
  assert.equal(entries.find(e=>e.id==='right-t').project.measurements.height,50);
  assert.equal(entries.length,4);
});

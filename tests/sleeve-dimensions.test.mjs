import test from 'node:test';
import assert from 'node:assert/strict';
import {trapezoidDimensionsSVG} from '../dist/sleeve-dimensions.js';
import {resizeOutlineMeasurements} from '../dist/core/outline-editing.js';
import {sanitizeProject} from '../dist/core/project.js';
import {composeProjectChart} from '../dist/core/placements.js';
import {buildAnnotatedShapeSVG,buildChartSVG} from '../dist/export.js';
import {buildWrittenPattern} from '../dist/core/written-pattern.js';

const project={measurements:{width:36,height:48,cuffWidth:18},gauge:{stitches:22,rows:30}};
test('sleeve dimensions show separately editable upper cuff and length with gauge counts',()=>{
  const html=trapezoidDimensionsSVG(project,{x:50,y:40,width:180,height:240,interactive:true,pieceId:'left',pieceLabel:'左袖'});
  for(const field of ['width','height','cuffWidth'])assert.ok(html.includes(`data-dimension="${field}"`));
  assert.match(html,/袖根宽 36 cm \/ 79 针/);assert.match(html,/袖口宽 18 cm \/ 约 40 针/);assert.match(html,/袖长 48 cm \/ 144 行/);
  assert.match(html,/M95 293v12M185 293v12M95 299H185/);
  assert.match(html,/data-piece-id="left"/);
});
test('exported dimension markup is static and custom cuffs are marked as references',()=>{
  const html=trapezoidDimensionsSVG({...project,customOutline:{}},{x:50,y:40,width:180,height:240});
  assert.doesNotMatch(html,/role="button"|tabindex|data-dimension=/);
  assert.match(html,/模板袖口参考/);
});
test('custom outline resizing scales cuff with width while length changes preserve cuff',()=>{
  assert.equal(resizeOutlineMeasurements(project.measurements,'width',72).cuffWidth,36);
  assert.equal(resizeOutlineMeasurements(project.measurements,'height',96).cuffWidth,18);
  assert.equal(project.measurements.cuffWidth,18);
});

test('nondefault cuff dimensions survive shape chart and written exports',()=>{
  const p=sanitizeProject({version:1,name:'梯形袖',grid:Array.from({length:4},()=>Array(4).fill('#ffffff')),palette:['#ffffff'],garmentId:'trapezoid-sleeve',measurements:{width:36,height:48,cuffWidth:22},gauge:{stitches:22,rows:30},placement:'center'});
  const chart=composeProjectChart(p),shape=buildAnnotatedShapeSVG(p,chart,'梯形袖子');
  for(const expected of ['袖根宽 36','袖口宽 22','袖长 48'])assert.ok(shape.includes(expected),expected);
  assert.equal((shape.match(/data-role="sleeve-/g)||[]).length,3);
  assert.ok(buildChartSVG(p,chart,'梯形袖子').includes('袖口宽 22 cm'));
  for(const direction of ['top-down','bottom-up'])assert.ok(buildWrittenPattern(p,{direction}).text.includes('袖口宽 22 cm'));
});

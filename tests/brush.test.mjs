import test from 'node:test';
import assert from 'node:assert/strict';
import {drawLine} from '../dist/core/pattern.js';
import {paintChartLine} from '../dist/core/chart-editing.js';
import {brushBounds,MAX_BRUSH_SIZE} from '../dist/core/brush.js';

const BASE='#f5efe3',INK='#bf6373';
const solid=(w=12,h=12,color=BASE)=>Array.from({length:h},()=>Array(w).fill(color));
const painted=grid=>grid.flat().filter(color=>color===INK).length;

test('preview footprint matches painted coverage for every supported brush size',()=>{
  assert.equal(MAX_BRUSH_SIZE,25);
  assert.deepEqual(brushBounds(8,8),{x:8,y:8,width:1,height:1});
  for(let size=1;size<=MAX_BRUSH_SIZE;size++){
    const bounds=brushBounds(15,15,size),result=drawLine(solid(32,32),15,15,15,15,INK,false,size);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(result[y][x]===INK,x>=bounds.x&&x<bounds.x+bounds.width&&y>=bounds.y&&y<bounds.y+bounds.height);
  }
  assert.throws(()=>brushBounds(1.1,2,3),TypeError);
  assert.throws(()=>brushBounds(1,2,26),RangeError);
});

test('square brush paints the requested odd and even footprint without changing input',()=>{
  for(const paint of [drawLine,paintChartLine])for(const size of [1,2,3,4,9,25]){
    const original=solid(32,32),before=structuredClone(original);
    const result=paint(original,15,15,15,15,INK,false,size);
    assert.equal(painted(result),size*size);
    const start=15-Math.floor((size-1)/2),end=15+Math.floor(size/2);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(result[y][x],x>=start&&x<=end&&y>=start&&y<=end?INK:BASE);
    assert.deepEqual(original,before);
    assert.notEqual(result[0],original[0]);
  }
});

test('wide continuous strokes include pointer endpoints and erase exactly their coverage',()=>{
  for(const paint of [drawLine,paintChartLine]){
    const original=solid(),result=paint(original,2,3,8,3,INK,false,3);
    assert.equal(painted(result),27);
    for(let y=2;y<=4;y++)assert.deepEqual(result[y].slice(1,10),Array(9).fill(INK));
    assert.deepEqual(paint(original,8,3,2,3,INK,false,3),result);
    const erased=paint(result,4,3,4,3,BASE,false,3);
    assert.equal(painted(erased),18);
    assert.equal(result[3][4],INK,'erasing cannot mutate the previous undo snapshot');
    const steep=paint(original,3,2,5,9,INK,false,3);
    for(let y=1;y<=10;y++)assert.ok(steep[y].includes(INK),'dragged stamps have no missing row');
  }
});

test('wide brushes clip each edge and can reach inside from an outside center',()=>{
  for(const paint of [drawLine,paintChartLine]){
    assert.equal(painted(paint(solid(6,6),0,0,0,0,INK,false,3)),4);
    assert.equal(painted(paint(solid(6,6),5,5,5,5,INK,false,4)),4);
    const edge=paint(solid(6,6),-1,0,-1,5,INK,false,3);
    assert.equal(painted(edge),6);
    assert.ok(edge.every(row=>row[0]===INK&&row[1]===BASE));
    const distant=paint(solid(6,6),-1e9,2,1e9,2,INK,false,3);
    assert.equal(painted(distant),18);
    assert.deepEqual(paint(solid(6,6),-100,-100,-80,-80,INK,false,25),solid(6,6));
  }
});

test('even brush mirroring reflects covered cells rather than offsetting the mirrored center',()=>{
  for(const paint of [drawLine,paintChartLine]){
    const mirrored=paint(solid(10,8),1,2,1,4,INK,true,2);
    assert.equal(painted(mirrored),16);
    for(const row of mirrored)assert.deepEqual(row,[...row].reverse());
    assert.deepEqual(mirrored[2],[BASE,INK,INK,BASE,BASE,BASE,BASE,INK,INK,BASE]);
  }
});

test('chart brush respects every cutout and paints mirrored cloth even opposite a cutout',()=>{
  const original=solid(8,6);
  original[1][1]=null;original[1][2]=null;original[2][5]=null;original[2][6]=null;
  const before=structuredClone(original),result=paintChartLine(original,1,1,1,1,INK,true,2);
  assert.equal(result[1][1],null);assert.equal(result[1][2],null);
  assert.equal(result[1][5],INK);assert.equal(result[1][6],INK);
  assert.equal(result[2][1],INK);assert.equal(result[2][2],INK);
  assert.equal(result[2][5],null);assert.equal(result[2][6],null);
  assert.deepEqual(original,before);
  assert.deepEqual(paintChartLine([[null]],0,0,0,0,INK,true,25),[[null]]);
});

test('omitting size remains identical to a one-cell brush and invalid sizes are rejected',()=>{
  for(const paint of [drawLine,paintChartLine]){
    assert.deepEqual(paint(solid(),0,0,11,7,INK,true),paint(solid(),0,0,11,7,INK,true,1));
    for(const size of [0,-1,26,1.5,NaN,Infinity,'3',null])assert.throws(()=>paint(solid(),0,0,1,1,INK,false,size),RangeError);
  }
});

test('vertical and four-way chart brushes reflect whole odd and even footprints',()=>{
  for(const [w,h] of [[10,8],[9,7]])for(const size of [1,2,3,4])for(const horizontal of [false,true]){
    const source=solid(w,h),before=structuredClone(source);
    const original=paintChartLine(source,1,1,2,2,INK,false,size);
    const mirrored=paintChartLine(source,1,1,2,2,INK,horizontal,size,true);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const expected=original[y][x]===INK||original[h-1-y][x]===INK||horizontal&&(original[y][w-1-x]===INK||original[h-1-y][w-1-x]===INK);
      assert.equal(mirrored[y][x]===INK,Boolean(expected));
    }
    assert.deepEqual(source,before);
    assert.deepEqual(paintChartLine(source,2,2,1,1,INK,horizontal,size,true),mirrored);
  }
});

test('vertical brush and eraser preserve null cells and independently reach reflected cloth',()=>{
  const source=solid(6,8);source[1][1]=null;source[6][4]=null;
  const mirrored=paintChartLine(source,1,1,1,1,INK,true,1,true);
  assert.equal(mirrored[1][1],null);assert.equal(mirrored[6][4],null);
  assert.equal(mirrored[6][1],INK);assert.equal(mirrored[1][4],INK);
  assert.equal(painted(mirrored),2);
  assert.deepEqual(paintChartLine(mirrored,1,1,1,1,BASE,true,1,true),source);
  assert.equal(painted(paintChartLine(solid(5,5),2,2,2,2,INK,true,1,true)),1);
});

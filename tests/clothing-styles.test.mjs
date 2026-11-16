import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeProject,validateProject} from '../dist/core/project.js';
import {getGarment,calculateDimensions,getOutline} from '../dist/core/garments.js';
import {getPieceProjects,switchActivePiece} from '../dist/core/pieces.js';
import {composeProjectChart} from '../dist/core/placements.js';

const styles=await import('../dist/core/clothing-styles.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const palette=['#f5efe3','#bf6373','#79836a'];
const gauge={stitches:22,rows:30};
const create=(styleId,overrides={})=>{assert.equal(typeof styles.createStyleProject,'function');return styles.createStyleProject({styleId,name:'测试衣服',gauge,palette,...overrides});};
const descriptor=project=>project.pieces.map(piece=>[piece.id,piece.garmentId]);

test('six clothing categories contain sixteen immutable complete-style entries',()=>{
  assert.equal(styles.CLOTHING_STYLES?.length,16);
  assert.deepEqual([...new Set(styles.CLOTHING_STYLES.map(s=>s.category))],['套衫','马甲','开衫','夏季上衣','配饰','基础设计']);
  assert.equal(new Set(styles.CLOTHING_STYLES.map(s=>s.id)).size,16);
  assert.ok(Object.isFrozen(styles.CLOTHING_STYLES));
  for(const entry of styles.CLOTHING_STYLES){assert.ok(Object.isFrozen(entry));assert.ok(Object.isFrozen(entry.defaults));assert.ok(Object.isFrozen(entry.pieces));assert.ok(entry.pieces.every(Object.isFrozen));}
  assert.throws(()=>styles.getClothingStyle('missing'),/款式|未找到/);
});

test('every style creates a valid explicit independent project and all pieces compose',()=>{
  assert.ok(Array.isArray(styles.CLOTHING_STYLES));
  for(const entry of styles.CLOTHING_STYLES){
    const project=create(entry.id);
    assert.ok(validateProject(project),entry.id);
    assert.ok(project.pieces.length<=12);
    assert.equal(project.pieces.length,entry.pieces.length,entry.id);
    assert.equal(project.activePieceId,entry.pieces[0].id);
    assert.deepEqual(project.grid,Array.from({length:16},()=>Array(16).fill(palette[0])));
    assert.equal(project.arrangement,'custom');
    assert.equal(project.draftMotifName,'新提花');
    assert.deepEqual(project.gauge,gauge);
    for(const view of getPieceProjects(project)){
      const chart=composeProjectChart(view.project);
      assert.ok(chart.grid.flat().some(value=>value!==null),entry.id+' / '+view.label);
    }
  }
});

test('pullovers generate coordinated front back and two sleeve descriptors',()=>{
  assert.deepEqual(descriptor(create('round-pullover')),[['front','round-front'],['back','round-back'],['left-sleeve','sleeve'],['right-sleeve','sleeve']]);
  assert.equal(create('v-pullover').pieces[0].garmentId,'v-front');
  assert.deepEqual(create('mock-pullover').pieces.slice(0,2).map(p=>p.garmentId),['mock-neck','mock-neck-back']);
  assert.deepEqual(create('drop-pullover').pieces.map(p=>p.garmentId),['drop-front','drop-back','drop-sleeve','drop-sleeve']);
  assert.deepEqual(create('raglan-pullover').pieces.map(p=>p.garmentId),['raglan-front','raglan-back','raglan','raglan']);
});

test('round and V neck vests use separate sleeve-free front templates',()=>{
  const round=create('round-vest'),v=create('v-vest');
  assert.deepEqual(descriptor(round),[['front','vest-front'],['back','vest-back']]);
  assert.deepEqual(descriptor(v),[['front','vest-v-front'],['back','vest-back']]);
  assert.notEqual(getOutline(round.garmentId,round.measurements).path,getOutline(v.garmentId,v.measurements).path);
});

test('cardigans include two independent plackets and closed width includes one overlapping band',()=>{
  for(const styleId of ['round-cardigan','v-cardigan','cardigan-vest']){
    const project=create(styleId,{width:50,height:62,placketWidth:4});
    assert.equal(project.pieces.length,styleId==='cardigan-vest'?5:7);
    assert.equal(project.activePieceId,'left');
    const left=project.pieces.find(p=>p.id==='left'),right=project.pieces.find(p=>p.id==='right'),back=project.pieces.find(p=>p.id==='back');
    const bands=project.pieces.filter(p=>p.id.endsWith('placket'));
    assert.equal(left.measurements.width,23);assert.equal(right.measurements.width,23);assert.equal(back.measurements.width,50);
    assert.equal(left.measurements.width+right.measurements.width+bands[0].measurements.width,50);
    assert.deepEqual(bands.map(p=>p.garmentId),['placket-left','placket-right']);
    assert.ok(bands.every(p=>p.measurements.width===4));
    assert.equal(bands[0].measurements.height,bands[1].measurements.height);
    assert.ok(bands[0].measurements.height>62);
    for(const band of bands){assert.equal(getGarment(band.garmentId).fields.length,2);assert.equal(band.measurements.shoulderWidth,undefined);}
  }
});

test('V cardigan band follows the sloped opening rather than merely body height',()=>{
  const project=create('v-cardigan'),left=project.pieces.find(p=>p.id==='left'),band=project.pieces.find(p=>p.id==='left-placket');
  const {height,neckDepth,neckWidth}=left.measurements;
  assert.ok(Math.abs(band.measurements.height-(height-neckDepth+Math.hypot(neckWidth,neckDepth)))<1e-8);
  const round=create('round-cardigan');
  assert.notEqual(round.pieces.find(p=>p.id==='left-placket').measurements.height,band.measurements.height);
});

test('closed cardigan neck shoulder and armhole dimensions meet the matching back',()=>{
  for(const id of ['round-cardigan','v-cardigan','cardigan-vest']){
    const project=create(id,{width:50,height:62,placketWidth:4});
    const left=project.pieces.find(p=>p.id==='left').measurements,back=project.pieces.find(p=>p.id==='back').measurements;
    assert.ok(Math.abs(left.neckWidth*2+4-back.neckWidth)<1e-9);
    assert.ok(Math.abs(left.shoulderWidth*2+4-back.shoulderWidth)<1e-9);
    assert.ok(Math.abs((left.shoulderWidth-left.neckWidth)-(back.shoulderWidth-back.neckWidth)/2)<1e-9);
    assert.equal(left.armholeDepth,back.armholeDepth);
  }
  assert.throws(()=>create('v-cardigan',{width:48,placketWidth:20}),/门襟|领口/);
  for(const id of ['v-pullover','v-vest']){
    const [front,back]=create(id).pieces;
    for(const field of ['neckWidth','shoulderWidth','armholeDepth'])assert.equal(front.measurements[field],back.measurements[field]);
    assert.ok(front.measurements.neckDepth>back.measurements.neckDepth);
  }
});

test('custom body dimensions scale neckline armhole shoulder and sleeves proportionally',()=>{
  const initial=create('round-pullover'),large=create('round-pullover',{width:96,height:116});
  for(let i=0;i<initial.pieces.length;i++)for(const field of getGarment(initial.pieces[i].garmentId).fields){assert.equal(large.pieces[i].measurements[field],initial.pieces[i].measurements[field]*2,field);}
  const small=create('v-cardigan',{width:12,height:15,placketWidth:1,gauge:{stitches:10,rows:10}});
  assert.ok(validateProject(small));
});

test('camisole creates separate front and shallow-back measurements',()=>{
  const project=create('camisole');
  assert.equal(project.pieces.length,2);
  const [front,back]=project.pieces;
  assert.equal(front.garmentId,'camisole');assert.equal(back.garmentId,'camisole');
  assert.ok(back.measurements.neckDepth<front.measurements.neckDepth);
  assert.equal(back.measurements.width,front.measurements.width);
  assert.equal(back.measurements.height,front.measurements.height);
});

test('accessories and base styles remain single pieces instead of creating unrelated bodies',()=>{
  for(const id of ['hat','scarf','sock','glove','rectangle'])assert.deepEqual(descriptor(create(id)),[['main',id]]);
});

test('preview returns detached measurements and validates impossible widths without touching defaults',()=>{
  assert.equal(typeof styles.previewStylePieces,'function');
  const first=styles.previewStylePieces('round-cardigan'),second=styles.previewStylePieces('round-cardigan');
  assert.deepEqual(first,second);first[0].measurements.width=99;
  assert.notEqual(second[0].measurements.width,99);
  assert.notEqual(styles.previewStylePieces('round-cardigan')[0].measurements.width,99);
  for(const options of [{width:0},{height:0},{width:NaN},{height:Infinity},{width:'48'},{placketWidth:0},{width:3,placketWidth:3},{width:3,placketWidth:4}])assert.throws(()=>styles.previewStylePieces('round-cardigan',options));
});

test('creation validates every piece including too-narrow or overlong plackets',()=>{
  assert.throws(()=>create('v-cardigan',{placketWidth:.1,gauge:{stitches:10,rows:10}}),/1 针|不足/);
  assert.throws(()=>create('v-cardigan',{width:48,height:200,gauge:{stitches:22,rows:30}}),/上限|600/);
  assert.throws(()=>create('round-pullover',{width:200}),/上限|400/);
  for(const value of [0,.09,101,NaN,Infinity,'22'])assert.throws(()=>create('round-vest',{gauge:{stitches:value,rows:30}}));
  assert.throws(()=>create('round-vest',{palette:[]}));assert.throws(()=>create('round-vest',{palette:['bad']}));
  assert.throws(()=>create('round-vest',{name:''}));
});

test('creation and later piece changes cannot mutate caller inputs catalog or matching sleeves',()=>{
  const args={styleId:'round-pullover',name:'原名',gauge:{...gauge},palette:[...palette]};
  const before=structuredClone(args),project=styles.createStyleProject(args);
  project.palette[0]='#000000';project.gauge.rows=20;project.pieces[2].measurements.width=18;project.pieces[2].chartEdits.sleeve={'1:1':'#000000'};
  assert.deepEqual(args,before);assert.equal(project.pieces[3].measurements.width,32);assert.deepEqual(project.pieces[3].chartEdits,{});
  assert.equal(create('round-pullover').pieces[2].measurements.width,32);
});

test('new pieces survive JSON roundtrip and switching keeps edited plackets independent',()=>{
  let project=create('round-cardigan');
  assert.deepEqual(sanitizeProject(JSON.parse(JSON.stringify(project))),project);
  project=switchActivePiece(project,'left-placket');
  project.measurements.width=5;project.chartEdits={'placket-left':{'1:1':'#bf6373'}};
  project=switchActivePiece(project,'right-placket');
  assert.equal(project.measurements.width,3);assert.deepEqual(project.chartEdits,{});
  project=switchActivePiece(project,'left-placket');
  assert.equal(project.measurements.width,5);assert.equal(project.chartEdits['placket-left']['1:1'],'#bf6373');
});

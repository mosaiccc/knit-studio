import {getGarment,getOutline,getFrontOpeningLength,calculateDimensions} from './garments.js';
import {sanitizeProject} from './project.js';
import {createGrid} from './pattern.js';

const piece=(id,label,garmentId,role)=>({id,label,garmentId,role});
const body=(front,back)=>[piece('front','前片',front,'front'),piece('back','后片',back,'back')];
const sleeves=garmentId=>[piece('left-sleeve','左袖',garmentId,'sleeve'),piece('right-sleeve','右袖',garmentId,'sleeve')];
const bands=()=>[piece('left-placket','左门襟边','placket-left','placket'),piece('right-placket','右门襟边','placket-right','placket')];
const cardigan=(left,right,back,sleeveId)=>[
  piece('left','左前片',left,'half-front'),piece('right','右前片',right,'half-front'),piece('back','后片',back,'back'),
  ...(sleeveId?sleeves(sleeveId):[]),...bands(),
];
function style(id,name,category,description,width,height,pieces,placketWidth){
  return Object.freeze({id,name,category,description,
    defaults:Object.freeze({width,height,...(placketWidth===undefined?{}:{placketWidth})}),
    pieces:Object.freeze(pieces.map(entry=>Object.freeze(entry))),
  });
}

/** Complete outfits are creation presets; saved projects retain independent explicit pieces. */
export const CLOTHING_STYLES=Object.freeze([
  style('round-pullover','圆领套衫','套衫','圆领前后片，配左右袖。',48,58,[...body('round-front','round-back'),...sleeves('sleeve')]),
  style('v-pullover','V领套衫','套衫','V 领前片、浅圆领后片，配左右袖。',48,58,[...body('v-front','round-back'),...sleeves('sleeve')]),
  style('mock-pullover','半高领套衫','套衫','前后片均带半高领轮廓，配左右袖。',48,64,[...body('mock-neck','mock-neck-back'),...sleeves('sleeve')]),
  style('drop-pullover','落肩套衫','套衫','宽肩前后片，配无袖山的直筒袖片。',54,58,[...body('drop-front','drop-back'),...sleeves('drop-sleeve')]),
  style('raglan-pullover','插肩套衫','套衫','前后斜肩衣片，配左右插肩袖。',48,60,[...body('raglan-front','raglan-back'),...sleeves('raglan')]),
  style('round-vest','圆领马甲','马甲','无袖圆领前片与浅领后片。',46,56,body('vest-front','vest-back')),
  style('v-vest','V领马甲','马甲','无袖 V 领前片与浅领后片。',46,56,body('vest-v-front','vest-back')),
  style('cardigan-vest','开衫马甲','马甲','无袖开衫左右前片、后片与两条独立门襟边。',46,56,cardigan('vest-cardigan-left','vest-cardigan-right','vest-back'),3),
  style('round-cardigan','圆领开衫','开衫','圆领左右前片、后片、左右袖与两条独立门襟边。',48,58,cardigan('cardigan-round-left','cardigan-round-right','cardigan-back','sleeve'),3),
  style('v-cardigan','V领开衫','开衫','V 领左右前片、后片、左右袖与两条独立门襟边。',48,58,cardigan('cardigan-left','cardigan-right','cardigan-back','sleeve'),3),
  style('camisole','吊带上衣','夏季上衣','吊带前片与浅领后片，可分别调整。',42,50,body('camisole','camisole')),
  style('hat','帽子','配饰','帽身平面裁片，帽顶收针与合缝需另行安排。',26,25,[piece('main','帽身','hat','accessory')]),
  style('scarf','斜角围巾','配饰','两端斜角的围巾裁片。',25,150,[piece('main','围巾','scarf','accessory')]),
  style('sock','筒袜','配饰','筒袜平面参考，足跟与转跟需另行设计。',10,38,[piece('main','袜片','sock','accessory')]),
  style('glove','五指手套','配饰','掌片与指筒平面参考，分指连接需另行安排。',15,24,[piece('main','手套片','glove','accessory')]),
  style('rectangle','基础矩形','基础设计','从独立矩形开始，自由添加裁片和绘制轮廓。',48,58,[piece('main','直筒矩形','rectangle','base')]),
]);

export function getClothingStyle(id){
  const result=CLOTHING_STYLES.find(entry=>entry.id===id);
  if(!result)throw new Error(`未找到衣服款式“${String(id)}”，请重新选择。`);
  return result;
}

function validRecord(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function positive(value,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw new Error(`${label}需为大于零的有效数值。`);
  return value;
}

function scaledMeasurements(garmentId,width,height,shallowBack=false){
  const garment=getGarment(garmentId),defaults=garment.defaults;
  const horizontal=width/defaults.width,vertical=height/defaults.height;
  const measurements=Object.fromEntries(garment.fields.map(field=>[field,
    field==='width'?width:field==='height'?height:defaults[field]*(['neckWidth','shoulderWidth'].includes(field)?horizontal:vertical),
  ]));
  if(shallowBack)measurements.neckDepth=3*vertical;
  getOutline(garmentId,measurements);
  return measurements;
}

/** Width means finished body flat width; closed cardigan width includes the overlapping bands. */
export function previewStylePieces(styleId,options={}){
  const selected=getClothingStyle(styleId);
  if(!validRecord(options))throw new Error('衣服尺寸设置无效。');
  const width=positive(options.width??selected.defaults.width,'衣身平铺宽度');
  const height=positive(options.height??selected.defaults.height,'衣服长度');
  const hasBands=selected.defaults.placketWidth!==undefined;
  const placketWidth=hasBands?positive(options.placketWidth??selected.defaults.placketWidth,'门襟宽度'):0;
  if(hasBands&&placketWidth>=width)throw new Error('门襟宽度需小于衣身平铺宽度，请为左右前片保留宽度。');
  const backDescriptor=selected.pieces.find(entry=>entry.role==='back');
  const backMeasurements=backDescriptor?scaledMeasurements(backDescriptor.garmentId,width,height,styleId==='camisole'):null;
  if(styleId==='v-pullover'||styleId==='v-vest'){
    const front=scaledMeasurements(selected.pieces.find(entry=>entry.role==='front').garmentId,width,height);
    for(const field of ['neckWidth','shoulderWidth','armholeDepth'])backMeasurements[field]=front[field];
    getOutline(backDescriptor.garmentId,backMeasurements);
  }
  if(hasBands&&placketWidth>=backMeasurements.neckWidth)throw new Error('门襟过宽会占满领口，请减小门襟宽度或增大衣身宽度。');
  const result=[];
  for(const descriptor of selected.pieces){
    let measurements;
    if(descriptor.role==='placket'){
      const front=result.find(entry=>entry.id===(descriptor.id==='left-placket'?'left':'right'));
      measurements={width:placketWidth,height:getFrontOpeningLength(front.garmentId,front.measurements)};
      getOutline(descriptor.garmentId,measurements);
    }else if(descriptor.role==='back'){
      measurements={...backMeasurements};
    }else{
      const defaults=getGarment(descriptor.garmentId).defaults;
      const targetWidth=descriptor.role==='half-front'?(width-placketWidth)/2:
        descriptor.role==='sleeve'?defaults.width*width/selected.defaults.width:width;
      const targetHeight=descriptor.role==='sleeve'?defaults.height*height/selected.defaults.height:height;
      measurements=scaledMeasurements(descriptor.garmentId,targetWidth,targetHeight);
      if(descriptor.role==='half-front'){
        // Two front shoulders/neck edges plus the overlapping band meet the matching back.
        measurements.neckWidth=(backMeasurements.neckWidth-placketWidth)/2;
        measurements.shoulderWidth=(backMeasurements.shoulderWidth-placketWidth)/2;
        measurements.armholeDepth=backMeasurements.armholeDepth;
        getOutline(descriptor.garmentId,measurements);
      }
    }
    result.push({...descriptor,measurements});
  }
  return result;
}

/** Build a new project only. Existing projects and legacy migration are intentionally untouched. */
export function createStyleProject(options={}){
  if(!validRecord(options))throw new Error('新工程设置无效。');
  const {styleId,name,width,height,placketWidth,gauge={stitches:22,rows:30},palette=['#f5efe3','#bf6373','#79836a']}=options;
  if(!validRecord(gauge)||![gauge.stitches,gauge.rows].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=.1&&value<=100))throw new Error('每 10 cm 试织密度需为 0.1–100 之间的有效针数和行数。');
  if(!Array.isArray(palette)||palette.length<1||palette.length>32||palette.some(color=>typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)))throw new Error('请设置 1–32 个有效的线色色号。');
  const background=palette[0].toLowerCase();
  const pieces=previewStylePieces(styleId,{width,height,placketWidth}).map(({id,label,garmentId,measurements})=>{
    try{calculateDimensions(measurements,gauge);}catch(error){throw new Error(`${label}：${error.message}`);}
    return {id,label,garmentId,measurements,customOutline:null,outlineDrawing:null,chartEdits:{},stitchSymbols:{},annotations:[],motifPlacements:[],arrangement:'custom',placement:'center',fabricColor:background};
  });
  const active=pieces[0];
  return sanitizeProject({
    version:1,name,grid:createGrid(16,16,background),palette:[...palette],gauge:{...gauge},draftMotifId:null,draftMotifName:'新提花',
    ...structuredClone(active),pieces,activePieceId:active.id,
  });
}

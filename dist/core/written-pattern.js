import {sanitizeProject} from './project.js';
import {getPieceProjects} from './pieces.js';
import {composeProjectChart} from './placements.js';
import {getGarment, resolveShoulderWidth, isHalfFront} from './garments.js';
import {ALL_STITCHES, assertStitchSymbols, getStitch} from './stitches.js';

const SOURCE='https://www.craftyarncouncil.com/standards/knit-chart-symbols';
const HEX=/^#[0-9a-f]{6}$/i;
const numberText=value=>String(Math.round(value*100)/100);
const directionText=direction=>direction==='top-down'?'从上往下':'从下往上';
const sideText=side=>side==='rs'?'正面':'反面';
const opposite=side=>side==='rs'?'ws':'rs';
const directionOf=side=>side==='rs'?'从图右向左':'从图左向右';
const DELTA={yo:1,k2tog:-1,ssk:-1,k3tog:-2};

function checkedOptions(options={}) {
  if (!options || typeof options!=='object' || Array.isArray(options)) throw new Error('文字图解的方向、范围和正反面设置无效。');
  const {direction='bottom-up',scope='all',firstSide='rs'}=options;
  if (!['bottom-up','top-down'].includes(direction)) throw new Error('请选择从下往上或从上往下的编织方向。');
  if (!['all','current'].includes(scope)) throw new Error('请选择全部裁片或当前裁片的导出范围。');
  if (!['rs','ws'].includes(firstSide)) throw new Error('请选择首行正反面。');
  return {direction,scope,firstSide};
}

function checkedGrid(grid) {
  if (!Array.isArray(grid)||grid.length<1||grid.length>600||!Array.isArray(grid[0])||grid[0].length<1||grid[0].length>400) throw new Error('文字图解需为 1–400 针 × 1–600 行的有效网格。');
  const width=grid[0].length;
  let visible=0;
  for (const row of Array.from(grid)) {
    if (!Array.isArray(row)||row.length!==width) throw new Error('图解网格的各行长度必须一致。');
    for (const cell of Array.from(row)) {
      if (cell!==null && (typeof cell!=='string'||!HEX.test(cell))) throw new Error('图解网格需使用有效颜色，空白轮廓使用空值。');
      if (cell!==null) visible++;
    }
  }
  if (!visible) throw new Error('图解中没有有效针格，无法生成文字教程。');
}

function letterAt(index) {
  let result='';
  for(let n=index+1;n>0;n=Math.floor((n-1)/26)) result=String.fromCharCode(65+(n-1)%26)+result;
  return result;
}

const COLOR_NAMES=[
  ['黑色','#171717'],['深灰','#525252'],['灰色','#929292'],['浅灰','#cccccc'],['白色','#ffffff'],
  ['奶白','#eee7d7'],['米色','#d5bd97'],['棕色','#805439'],['深棕','#473123'],['红色','#bc3039'],
  ['玫红','#c54c78'],['浅粉','#e4b4bf'],['橙色','#e68a42'],['黄色','#e0cb53'],['浅绿','#b3c08b'],
  ['绿色','#6c8a53'],['深绿','#304a37'],['蓝色','#527fa9'],['浅蓝','#a3c4d6'],['深蓝','#293e60'],
  ['紫色','#87628e'],['浅紫','#bcabc9'],['橄榄绿','#7a7c3f'],
];
const rgb=color=>[1,3,5].map(start=>parseInt(color.slice(start,start+2),16));
function colorName(color) {
  const channels=rgb(color);
  let closest=COLOR_NAMES[0][0],distance=Infinity;
  for(const [name,reference] of COLOR_NAMES) {
    const sample=rgb(reference),next=channels.reduce((sum,value,index)=>sum+(value-sample[index])**2,0);
    if(next<distance){distance=next;closest=name;}
  }
  return closest;
}

function chartColors(grids) {
  const map=new Map();
  for(const grid of grids) for(const row of grid) for(const value of row) {
    if(value===null) continue;
    const color=value.toLowerCase();
    if(!map.has(color)) map.set(color,{letter:letterAt(map.size),color,name:colorName(color)});
  }
  return [...map.values()];
}

function operation(id,side) {
  const rs=side==='rs';
  switch(id) {
    case 'knit': return {name:rs?'下针':'上针',verb:'knit',consumes:1,produces:1};
    case 'purl': return {name:rs?'上针':'下针',verb:'knit',consumes:1,produces:1};
    case 'ktbl': return {name:rs?'从后针脚织下针（扭下针）':'从后针脚织上针（扭上针）',verb:'repeat',consumes:1,produces:1};
    case 'ptbl': return {name:rs?'从后针脚织上针（扭上针）':'从后针脚织下针（扭下针）',verb:'repeat',consumes:1,produces:1};
    case 'yo': return {name:'绕线空加 1 针',verb:'repeat',consumes:0,produces:1};
    case 'k2tog': return {name:rs?'两针并织下针':'两针并织上针',verb:'repeat',consumes:2,produces:1};
    case 'ssk': return {name:rs?'依次以下针方式滑 2 针，再穿后针脚并织下针（SSK）':'依次以下针方式滑 2 针，保持新针脚方向移回左针，再穿后针脚并织上针（SSP）',verb:'repeat',consumes:2,produces:1};
    case 'slip': return {name:`以上针方式滑 1 针，线在${rs?'后':'前'}`,verb:'repeat',consumes:1,produces:1};
    case 'k3tog': return {name:rs?'三针并织下针':'三针并织上针',verb:'repeat',consumes:3,produces:1};
    default: getStitch(id); throw new Error('针法暂无文字说明。');
  }
}

function runText(run) {
  const yarn=`用 ${run.letter} 线`;
  if(run.operation.verb==='knit') return `${yarn}织 ${run.count} 针${run.operation.name}`;
  return `${yarn}${run.operation.name}${run.count>1?`，重复 ${run.count} 次`:''}`;
}

function segmentBounds(row) {
  const segments=[];
  for(let x=0;x<row.length;x++) {
    if(row[x]===null) continue;
    const startX=x;
    while(x+1<row.length&&row[x+1]!==null)x++;
    segments.push({startX,endX:x,count:x-startX+1});
  }
  return segments;
}

function segmentInstructions(gridRow,bounds,chartRow,width,side,symbols,palette,used) {
  const positions=Array.from({length:bounds.count},(_,i)=>side==='rs'?bounds.endX-i:bounds.startX+i),runs=[];
  let delta=0,explicitSymbols=0;
  for(const x of positions) {
    const key=`${chartRow}:${width-x}`,explicit=symbols[key];
    const stitchId=explicit||'knit',color=gridRow[x].toLowerCase();
    if(explicit){used.add(explicit);explicitSymbols++;}
    delta+=DELTA[stitchId]||0;
    const last=runs.at(-1);
    if(last?.stitchId===stitchId&&last.color===color) last.count++;
    else runs.push({stitchId,color,letter:palette.get(color).letter,count:1,operation:operation(stitchId,side)});
  }
  for(const run of runs) {
    run.consumes=run.count*run.operation.consumes;
    run.produces=run.count*run.operation.produces;
    run.text=runText(run);
  }
  return {...bounds,startStitch:width-positions[0],endStitch:width-positions.at(-1),inputCount:bounds.count-delta,symbolDelta:delta,explicitSymbols,runs,text:runs.map(run=>run.text).join('；')};
}

function edgeText(previous,current) {
  const changes=[['图左侧',previous.startX-current.startX],['图右侧',current.endX-previous.endX]];
  return changes.filter(([,amount])=>amount).map(([label,amount])=>`${label}${amount>0?'加':'减'} ${Math.abs(amount)} 针`).join('，');
}

function physicalSegments(row) {return [...row.segments].sort((a,b)=>a.startX-b.startX);}
function overlap(a,b) {return a.startX<=b.endX&&b.startX<=a.endX;}
function sameBounds(a,b) {return a.startX===b.startX&&a.endX===b.endX;}

function castOn(row,restart=false) {
  const parts=row.segments.map((segment,index)=>`第 ${index+1} 段起 ${segment.inputCount} 针（本行织后 ${segment.count} 针）`);
  const text=(restart?'与前一区域之间有整空行，图解轮廓断开；另起新区域。':'')+
    (parts.length>1?`按本行读图顺序分别起针：${parts.join('；')}。各段分别用线，暂不跨空格连接。`:`起 ${row.requiredInput} 针；本行完成后为 ${row.count} 针。`);
  return {kind:restart?'restart':'cast-on',delta:row.count,symbolDelta:row.symbolDelta,additionalChange:row.requiredInput,needsReview:restart||row.segments.some(segment=>segment.inputCount<1),text};
}

function describeTransition(previous,current,gap=false) {
  if(!previous||gap) return castOn(current,gap);
  const before=physicalSegments(previous),after=physicalSegments(current),delta=current.count-previous.count;
  const additionalChange=current.requiredInput-previous.count;
  const result={kind:'even',delta,symbolDelta:current.symbolDelta,additionalChange,needsReview:false,text:''};
  const unchanged=before.length===after.length&&before.every((segment,i)=>sameBounds(segment,after[i]));
  const corresponding=before.length===after.length&&before.every((segment,i)=>overlap(segment,after[i])&&after.filter(next=>overlap(segment,next)).length===1)&&after.every(segment=>before.filter(old=>overlap(old,segment)).length===1);
  const missing=additionalChange===0?'':`尚需安排${additionalChange>0?'加':'减'} ${Math.abs(additionalChange)} 针，位置和方法需确认。`;
  if(corresponding&&after.length>1&&after.some(segment=>segment.symbolDelta!==0)) {
    const balances=after.map((segment,index)=>({index,previousCount:before[index].count,inputCount:segment.inputCount,outputCount:segment.count,change:segment.inputCount-before[index].count}));
    result.needsReview=balances.some(balance=>balance.change!==0);
    result.kind=result.needsReview?'review':'symbols';
    result.segmentBalances=balances;
    result.text='各段针数需单独核对，不能跨空格相互抵消。'+balances.map(balance=>
      `图左到右第 ${balance.index+1} 段：上行 ${balance.previousCount} 针，本行需 ${balance.inputCount} 针、织后 ${balance.outputCount} 针；${balance.change?`尚需安排${balance.change>0?'加':'减'} ${Math.abs(balance.change)} 针，位置和方法需确认。`:'数量变化已由本段行内针法完成。'}`).join('');
    return result;
  }
  if(current.symbolDelta!==0) {
    if(additionalChange===0&&corresponding) {
      result.kind='symbols';result.text=`上一行 ${previous.count} 针，本行行内针法净${current.symbolDelta>0?'加':'减'} ${Math.abs(current.symbolDelta)} 针，已完成本行 ${current.count} 针的数量变化；不再按轮廓重复加减。边缘位置仍需对照图解。`;
      return result;
    }
    result.kind='review';result.needsReview=true;
    result.text=`上一行 ${previous.count} 针；本行针法需消耗 ${current.requiredInput} 针、织后 ${current.count} 针。${missing||'总针数吻合，但分段衔接需确认。'}`;
  }
  if(before.length<after.length) {
    result.kind='split';result.needsReview=true;
    result.text+=`轮廓从 ${before.length} 段分成 ${after.length} 段，分别编织；空缺位置不织，先确认这些针是平收还是暂留。${delta<0?`总针数减少 ${-delta} 针。`:''}不要直接跨过领口等空格。`;
  } else if(before.length>after.length) {
    result.kind='merge';result.needsReview=true;
    result.text+=`轮廓从 ${before.length} 段连接成 ${after.length} 段；原各段先持针待接，${delta>0?`本行比上行增加 ${delta} 针，连接空隙处的起针与边缘增针需按图分配。`:'连接时的针数与接线方法需确认。'}确认后再连续编织。`;
  } else if(current.symbolDelta===0) {
    if(unchanged) {
      result.kind='even';
      result.text=after.length===1?`轮廓不加不减，保持 ${current.count} 针。`:`各 ${after.length} 段继续分别编织，合计 ${current.count} 针。`;
      if(current.segments.some(segment=>segment.explicitSymbols)) result.text+='本行若有加减针，已按符号净变化核对。';
    } else if(corresponding) {
      result.kind='edges';
      const plans=before.map((segment,index)=>({text:edgeText(segment,after[index]),index})).filter(plan=>plan.text);
      result.text=`轮廓目标：${plans.map(({text,index})=>after.length>1?`第 ${index+1} 段（按图左到右）${text}`:text).join('；')}；本行完成后合计 ${current.count} 针。边缘加减针计入本行，需用选定的边缘织法替换相应普通针目，不再额外加一行。`;
      if(current.segments.some(segment=>segment.explicitSymbols)) {result.needsReview=true;result.text+='本行同时有针法标记，边缘操作的位置需确认。';}
    } else {
      result.kind='disconnected';result.needsReview=true;
      result.text=`本行与上一行有不相接的轮廓区段，不能按普通增减针直接连织；本行目标 ${current.count} 针，请确认另起针、持针或分段连接安排。`;
    }
  }
  return result;
}

/** Read the final chart in knitting order; one visible chart cell is one produced stitch. */
export function buildWrittenRows(grid,symbols={},options={}) {
  const {direction,firstSide}=checkedOptions(options);
  checkedGrid(grid);assertStitchSymbols({rectangle:symbols});
  const colors=options.colors||chartColors([grid]),palette=new Map(colors.map(color=>[color.color.toLowerCase(),color]));
  for(const line of grid) for(const color of line) if(color!==null&&!palette.has(color.toLowerCase())) throw new Error('文字图解配色表缺少实际使用的颜色。');
  const width=grid[0].length,height=grid.length,rows=[],warnings=[],used=new Set(),emptyRows=[];
  const yOrder=Array.from({length:height},(_,i)=>direction==='bottom-up'?height-1-i:i);
  let previous=null,gap=false,nextSide=firstSide;
  for(const y of yOrder) {
    const bounds=segmentBounds(grid[y]),chartRow=height-y;
    if(!bounds.length){emptyRows.push(chartRow);if(previous)gap=true;continue;}
    if(gap)nextSide=firstSide;
    const side=nextSide;nextSide=opposite(side);
    const order=side==='rs'?[...bounds].reverse():bounds;
    const segments=order.map(bound=>segmentInstructions(grid[y],bound,chartRow,width,side,symbols,palette,used));
    const count=segments.reduce((sum,segment)=>sum+segment.count,0),symbolDelta=segments.reduce((sum,segment)=>sum+segment.symbolDelta,0);
    const row={workRow:rows.length+1,chartRow,side,count,requiredInput:count-symbolDelta,symbolDelta,segments};
    row.transition=describeTransition(previous,row,gap);
    if(row.transition.needsReview) warnings.push(`第 ${row.workRow} 行（原图第 ${chartRow} 行）：${row.transition.text}`);
    if(segments.some(segment=>segment.inputCount<1)) warnings.push(`第 ${row.workRow} 行：某段没有可承接的针目，空加针或独立起针的衔接需确认。`);
    const header=`第 ${row.workRow} 行（${sideText(side)}｜原图第 ${chartRow} 行｜${directionOf(side)}），行后 ${count} 针：`;
    row.text=[header,`  ${row.transition.text}`,...segments.map((segment,index)=>
      `  ${segments.length>1?`第 ${index+1} 段 · `:''}图第 ${segment.startStitch}${segment.startStitch===segment.endStitch?'':`→${segment.endStitch}`} 针：${segment.text}。${segments.length>1?`本段行后 ${segment.count} 针。`:''}`)].join('\n');
    rows.push(row);previous=row;gap=false;
  }
  return {rows,colors,warnings,usedStitches:ALL_STITCHES.filter(stitch=>used.has(stitch.id)).map(stitch=>stitch.id),emptyRows};
}

function pieceText(piece,index) {
  const lines=[`${index+1}. ${piece.label} · ${piece.garmentName}`,
    `目标尺寸：宽 ${numberText(piece.measurements.width)} cm × 长 ${numberText(piece.measurements.height)} cm；按密度取整后约 ${numberText(piece.actualWidth)} × ${numberText(piece.actualHeight)} cm。`,
    `图解范围：最大 ${piece.width} 针 × ${piece.height} 行；本教程含 ${piece.rows.length} 个有效编织行。`];
  if(piece.shoulderWidth!==undefined) lines.push(`${isHalfFront(piece.garmentId)?'肩宽（半片）':'肩宽'}：${numberText(piece.shoulderWidth)} cm。`);
  if(piece.shoulderWidth!==undefined) lines.push('肩部与领口：起针数和逐行变化按平面轮廓计算；肩斜是否采用短行、挑针或分别起针，以及领口怎样连接，需先确定工艺后再按对应行施工。');
  if(piece.garmentId==='trapezoid-sleeve')lines.push(`${piece.customOutline?'模板尺寸参考：':'袖片尺寸：'}袖根宽 ${numberText(piece.measurements.width)} cm，袖口宽 ${numberText(piece.measurements.cuffWidth??18)} cm，袖长 ${numberText(piece.measurements.height)} cm。图解上端是袖根，下端是袖口。`);
  if(piece.outlineDraft)lines.push('有未应用的轮廓草稿：本教程使用已应用轮廓，请应用草稿后重新导出才会更新。');
  if(piece.customOutline)lines.push('本片使用自绘轮廓；行针数反映图形，特殊转折、短行和分段工艺需按实际编织确认。');
  if(piece.emptyRows.length)lines.push(`原图第 ${piece.emptyRows.join('、')} 行无有效针格，已跳过；内部整空行代表区域断开，不作为普通平织行连接。`);
  if(piece.notes.length)lines.push('你的文字标注（原文）：',...piece.notes.map(note=>'  '+note));
  lines.push('开始与逐行步骤：',...piece.rows.map(row=>row.text));
  const last=piece.rows.at(-1);
  lines.push(`收尾：本片最后一个有效行完成后，共 ${last.count} 针${last.segments.length>1?`，分 ${last.segments.length} 段分别保留`:''}。按边缘用途选择平收或留针；肩部、领口等需要连接的位置先确认再收针。`);
  if(getGarment(piece.garmentId).category==='门襟与收边')lines.push('门襟补充：本片为独立直条，长度按前片开口边估算，实际织成后按开口长度调整；扣眼位置、间隔以及缝合或挑针连接方式需自行标注与安排。');
  if(piece.garmentId==='sock')lines.push('筒袜补充：本片未包含足跟和转跟结构，袜头收针、筒身合缝需另行设计。');
  if(piece.garmentId==='glove')lines.push('手套补充：手指、掌片和拇指的围度及连接需另行安排，本教程只逐行描述现有平面裁片。');
  if(piece.garmentId==='hat')lines.push('帽子补充：本教程按单片平织，合缝及帽顶连接方式需另行安排。');
  return lines.join('\n');
}

/** Compose hand edits and independent motif placements before describing any row. */
export function buildWrittenPattern(project,options={}) {
  const settings=checkedOptions(options),clean=sanitizeProject(project);
  const entries=getPieceProjects(clean).filter(entry=>settings.scope==='all'||entry.id===clean.activePieceId);
  if(!entries.length)throw new Error('未找到需要导出的裁片。');
  const charts=entries.map(entry=>({entry,chart:composeProjectChart(entry.project)}));
  for(const {chart} of charts)checkedGrid(chart.grid);
  const colors=chartColors(charts.map(({chart})=>chart.grid));
  const pieces=charts.map(({entry,chart},index)=>{
    const data=buildWrittenRows(chart.grid,entry.project.stitchSymbols?.[entry.project.garmentId]||{},{...settings,colors});
    const piece={id:entry.id,label:entry.label,garmentId:entry.project.garmentId,garmentName:getGarment(entry.project.garmentId).name,
      measurements:structuredClone(entry.project.measurements),shoulderWidth:resolveShoulderWidth(entry.project.garmentId,entry.project.measurements),
      width:chart.width,height:chart.height,actualWidth:chart.actualWidth,actualHeight:chart.actualHeight,
      outlineDraft:Boolean(entry.project.outlineDrawing),customOutline:Boolean(entry.project.customOutline),
      notes:entry.project.annotations.filter(note=>note.garmentId===entry.project.garmentId).map(note=>note.text),...data};
    if(piece.outlineDraft)piece.warnings.unshift('有未应用的轮廓草稿，教程按已应用轮廓生成。');
    piece.text=pieceText(piece,index);return piece;
  });
  const warnings=pieces.flatMap(piece=>piece.warnings.map(warning=>`${piece.label}：${warning}`));
  const used=new Set(pieces.flatMap(piece=>piece.usedStitches));
  const title=`${clean.name} · ${directionText(settings.direction)}文字编织教程`;
  const lines=[title,'',
    `编织方向：${directionText(settings.direction)}；导出范围：${settings.scope==='all'?'全部裁片':'当前裁片'}（${pieces.length} 片）。`,
    `编织方式：各裁片分别平织往返；每片首个有效行按${sideText(settings.firstSide)}开始，之后正反面交替。`,
    `试织密度：每 10 cm：${numberText(clean.gauge.stitches)} 针 × ${numberText(clean.gauge.rows)} 行。`,
    '先按实际线材、棒针织小样，确认密度后再起针；工具未指定线材用量和棒针号。',
    '', '读法：',
    '· 原图行号始终从底部起算；图中针位始终自右向左编号。工作行按所选方向重新排序，正面从图右向左读，反面从图左向右读。',
    '· 未标针法的有效格按平针：正面下针、反面上针；空白轮廓不算针，不跨越领口等空格连织。',
    '· 每个图格表示本行形成的一个针目。文字顺序按行后针目与配色描述；并针会消耗多针，空加针不消耗旧针，不可把所有操作都当成只消耗一针。',
    '· 轮廓加减针目标须计入该行，边缘织法需替换相应普通针目；不要照目标先加减一次、再把同行并针重复做一次。标为“需确认”的行应先调整后编织。',
    '· 改为从上往下会重新读取现有针法与轮廓，不会把二并一自动改成加针，也不保证复杂针法与原方向得到完全相同的织物结构。',
    '', '配色表（本次教程全部裁片共用，按图解从上到下、从左到右首次出现顺序编号）：',
    '近似色名仅帮助辨认，以色号和实际线色为准。',
    ...colors.map(color=>`${color.letter} 线：${color.name} · ${color.color.toUpperCase()}`),
    '',...pieces.flatMap(piece=>[piece.text,'']),
    '针法说明：'];
  if(!used.size)lines.push('本图未使用针法符号，按上述平针规则编织。');
  for(const stitch of ALL_STITCHES.filter(stitch=>used.has(stitch.id))) {
    lines.push(`${stitch.label}：正面 ${operation(stitch.id,'rs').name}；反面 ${operation(stitch.id,'ws').name}。`);
  }
  if(warnings.length)lines.push('',`需要核对的位置：共 ${warnings.length} 项，已在对应裁片和逐行步骤中标明。`);
  lines.push('', '组合与整理：以上按各裁片分别编织。缝合顺序、缝份、罗纹边、挑领和扣眼等只在原图有信息时才能确定；请结合你的文字标注补充，勿把未设计的连接视为已完成教程。',
    `针法正反面参考：${SOURCE}`);
  return {title,...settings,pieces,colors,warnings,gauge:structuredClone(clean.gauge),text:lines.join('\n')};
}

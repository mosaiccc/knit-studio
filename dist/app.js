import {createOfflineSupport,renderOfflineStatus,openOfflineHelp,updateOfflineHelp} from './offline.js';
import {trapezoidDimensionsSVG} from './sleeve-dimensions.js';
import {generateMotif,createGrid,flipGrid,colorCounts} from './core/pattern.js';
import {scaleMotifGrid} from './core/motif-sizing.js';
import {motifSettingsHTML,bindMotifSettings} from './motif-settings.js';
import {openWrittenPatternExport} from './written-pattern-modal.js';
import {groupedGarmentOptions,garmentCategoryCards} from './garment-picker.js';
import {openStyleProjectModal} from './new-project-modal.js';
import {openImageImport} from './image-import-modal.js';
import {MAX_BRUSH_SIZE} from './core/brush.js';
import {GARMENTS,getGarment,getOutline,createGarmentChart,resolveShoulderWidth,isHalfFront,isRaisedNeck} from './core/garments.js';
import {normalizePieces,syncActivePiece,switchActivePiece,getPieceProjects,addPiece,duplicatePiece,renamePiece,removePiece,MAX_PIECES} from './core/pieces.js';
import {pieceSelectorHTML,pieceBoardHTML} from './pieces-view.js';
import {STITCHES} from './core/stitches.js';
import {stitchPickerHTML} from './stitches-view.js';
import {createEditableOutline,insertOutlineNode,removeOutlineNode,moveOutlineControl,resizeOutlineMeasurements} from './core/outline-editing.js';
import {renderOutlineControls,bindOutlineEditor} from './outline-editor.js';
import {drawingFromOutline,inspectOutlineDrawing,removeDrawingSegment,splitDrawingSegment} from './core/outline-drawing.js';
import {renderDrawingOverlay,bindDrawingEditor} from './drawing-editor.js';
import {drawingPanelHTML,DRAWING_HINTS} from './drawing-panel.js';
import {getMotifPreset} from './core/motif-presets.js';
import {motifPresetsHTML} from './motif-presets-ui.js';
import {sanitizeProject} from './core/project.js';
import {createBaseChart} from './core/placements.js';
import {createWorkspace,sanitizeWorkspace,upsertProject,activateProject,removeProject,upsertMotif,removeMotif,parseMotifFile} from './core/workspace.js';
import {readWorkspace,writeWorkspace,stageWorkspace} from './storage.js';
import {patternLibrarySection,placementSection,motifLibraryHTML,projectManagerHTML} from './library-ui.js';
import {applyChartEdits,captureChartEdits,paintChartLine,fillChartRegion} from './core/chart-editing.js';
import {renderAnnotations,bindAnnotationCanvas} from './annotations.js';
import {GridEditor} from './editor.js';
import {icon} from './icons.js';
import {buildChartSVG,buildPatternSVG,buildAnnotatedShapeSVG,buildAllPiecesSVG,downloadSVG,downloadPNG,printChart,printAllPieces} from './export.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='knit-studio-project-v1';
const defaultPalette=['#f5efe3','#bf6373','#79836a','#824859','#d7b68b','#d7c3c4','#adb59e','#666f64','#a7b9bd'];
let project={version:1,name:'春日郁金香 · 提花毛衣',grid:generateMotif(32,40,'tulip'),palette:defaultPalette.slice(),garmentId:'round-front',measurements:{...getGarment('round-front').defaults},gauge:{stitches:22,rows:30},placement:'repeat'};
let loadWarning='';
try{const saved=localStorage.getItem(STORAGE);if(saved)project=sanitizeProject(JSON.parse(saved));}catch{loadWarning='上次作品未能读取，已打开示例。你仍可导入备份文件。';}
let workspaceState,workspaceReadFailed=false;
try{const saved=await readWorkspace();workspaceState=saved?sanitizeWorkspace(saved):createWorkspace(project,crypto.randomUUID());project=structuredClone(workspaceState.projects.find(e=>e.id===workspaceState.activeProjectId).project);}catch{workspaceReadFailed=true;workspaceState=createWorkspace(project,crypto.randomUUID());loadWarning='工程库未能读取，已保留旧作品。请检查浏览器存储权限，或导入备份。';}
let tab='pattern',tool='pen',selectedColor='#bf6373',mirror=false,showGrid=true,texture=false,aspect=false,zoom=1,editor=null,history=[],future=[],chart=null,saveTimer,toastTimer,uploadedImage=null,uploadUrl=null;
let strokeSnapshot=null,selectedAnnotationId=null,annotationCleanup=null;
let selectedPlacementId=null,positionGesture=null,saveQueue=Promise.resolve(),saveRevision=0,saveState=workspaceReadFailed?'工程库读取失败 · 请备份':'已自动保存';
let pieceViews=[],previewEditors=[],selectedStitch='knit';
let outlineMode=false,outlineDraft=null,outlineSelected=0,outlineEditor=null,outlineBefore=null;
let drawingMode=false,drawingTool='line',drawingSelected=-1,drawingPreview=null,drawingEditor=null,drawingBefore=null;
let uploadedImageName='',importSettings=null,imageLoadRevision=0,modalCleanup=null;
const BRUSH_PREFERENCES='knit-studio-brush-sizes-v1';
let brushSizes={pen:1,eraser:1};
let motifRatioLocked=true;
let mirrorVertical=false;
try{const saved=JSON.parse(localStorage.getItem(BRUSH_PREFERENCES));for(const name of ['pen','eraser'])if(Number.isInteger(saved?.[name])&&saved[name]>=1&&saved[name]<=MAX_BRUSH_SIZE)brushSizes[name]=saved[name];}catch{}
project.chartEdits??={};project.annotations??=[];project.stitchSymbols??={};
if(!project.palette.includes(selectedColor))selectedColor=project.palette[0];

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function safe(fn){try{return fn();}catch(e){toast(e.message||'操作未完成，请检查输入。');return undefined;}}
function baseChart(){return createBaseChart(project);}
function computeChart(){chart=applyChartEdits(baseChart(),project.chartEdits?.[project.garmentId]||{});return chart;}
function syncActiveProject(){project=syncActivePiece(project);workspaceState=upsertProject(workspaceState,workspaceState.activeProjectId,project);}
function setSaveState(value){saveState=value;if($('#save-text'))$('#save-text').textContent=value;}
function persistWorkspace(){clearTimeout(saveTimer);if(workspaceReadFailed){setSaveState('工程库读取失败 · 请备份');toast('为保留原工程库，本次修改暂未写入。请下载当前工程备份后刷新重试。');return Promise.resolve(false);}const revision=++saveRevision;let value;try{syncActiveProject();value=structuredClone(workspaceState);}catch(e){setSaveState('保存失败，请下载备份');toast(e.message);return Promise.resolve(false);}setSaveState('正在保存');stageWorkspace(value);saveQueue=saveQueue.catch(()=>{}).then(()=>writeWorkspace(value)).then(()=>{if(revision===saveRevision)setSaveState('已自动保存');return true;}).catch(()=>{setSaveState('保存失败，请下载备份');toast('浏览器未能保存，请在「我的工程」下载备份后再关闭页面。');return false;});return saveQueue;}
function save(){persistWorkspace();}
const HISTORY_KEYS=['outlineDrawing','customOutline','stitchSymbols','grid','palette','chartEdits','annotations','motifPlacements','arrangement','fabricColor','draftMotifId','draftMotifName','placement','pieces','activePieceId','garmentId','measurements','gauge'];
function snapshot(){project=syncActivePiece(project);return {...Object.fromEntries(HISTORY_KEYS.map(k=>[k,structuredClone(project[k])])),selectedColor};}
function commitGrid(before){const previous=Array.isArray(before)?{...snapshot(),grid:before}:before;const current=snapshot();if(HISTORY_KEYS.every(k=>JSON.stringify(previous[k])===JSON.stringify(current[k])))return;history.push(previous);if(history.length>40)history.shift();future=[];computeChart();save();updateSidePreview();updatePalette();updateHistoryButtons();updateChartLegend();}
function replaceGrid(grid,palette,draftName){finishEditing();const before=snapshot();project.grid=grid;if(palette){project.palette=palette;if(!palette.includes(selectedColor))selectedColor=palette[1]||palette[0];}if(draftName){project.draftMotifId=null;project.draftMotifName=draftName;}commitGrid(before);render();}
function restoreSnapshot(value){for(const k of HISTORY_KEYS)project[k]=structuredClone(value[k]);selectedColor=value.selectedColor;}
function undo(){finishEditing();if(!history.length)return;future.push(snapshot());restoreSnapshot(history.pop());computeChart();save();render();}
function redo(){finishEditing();if(!future.length)return;history.push(snapshot());restoreSnapshot(future.pop());computeChart();save();render();}
function updateHistoryButtons(){if($('#undo'))$('#undo').disabled=!history.length;if($('#redo'))$('#redo').disabled=!future.length;}
const displayNumber=value=>Number(Number(value).toFixed(2));
function numberField(id,label,value,unit='cm',options={}){return `<label class="field"><span>${label}</span><div class="input-wrap"><input id="${id}" type="number" value="${displayNumber(value)}" min="${options.min??0.1}" max="${options.max??200}" step="${options.step??0.5}" aria-label="${label}"><small>${unit}</small></div></label>`;}
function garmentOptions(){return groupedGarmentOptions(project.garmentId);}
function header(){return `<aside class="rail"><div class="brand-mark" title="织间 Knit Studio">${icon('yarn')}</div>${[['pattern','grid','提花设计'],['shape','shirt','版型设计'],['chart','file','编织图解']].map(([id,i,label])=>`<button class="rail-button ${tab===id?'active':''}" data-tab="${id}" title="${label}" aria-label="${label}">${icon(i,21)}</button>`).join('')}<button class="rail-button" data-action="projects" title="工程与备份" aria-label="工程与备份">${icon('folder',21)}</button><div class="rail-bottom"><button class="rail-button" data-action="help" title="使用指南" aria-label="使用指南">${icon('help',20)}</button><div class="profile" title="你的编织工作室">K</div></div></aside>
  <main class="main"><header class="topbar"><div class="brand-name">织间<small>KNIT STUDIO</small></div><div class="top-right"><span class="save-status"><i></i><span id="save-text">${saveState}</span></span><button class="btn new-project-button" data-action="new-project">${icon('plus',15)}新建工程</button><button class="btn project-button" data-action="projects">${icon('folder',15)}我的工程</button><button class="btn primary" data-action="export">${icon('download',15)}导出图解</button></div></header>
  <section class="projectbar"><div><div class="eyebrow">A LITTLE INSPIRATION, STITCH BY STITCH</div><div class="project-title"><input id="project-name" maxlength="80" aria-label="作品名称" value="${esc(project.name)}">${icon('pen',13)}</div><div class="project-desc">把喜欢的图案，织进日常的温柔里。</div></div><nav class="step-tabs" aria-label="设计流程">${[['pattern','01','提花设计'],['shape','02','版型设计'],['chart','03','编织图解']].map(([id,n,label])=>`<button class="step-tab ${tab===id?'active':''}" data-tab="${id}" aria-current="${tab===id?'step':'false'}"><span>${n}</span>${label}</button>`).join('')}</nav></section><div id="offline-status"></div>`;}
function paletteHTML(){const colors=[...new Set([...project.palette,...(tab==='chart'?chartColors():colorCounts(project.grid)).map(c=>c.color)])].slice(0,32);return `<div class="palette">${colors.map((c,i)=>`<button class="swatch ${selectedColor.toLowerCase()===c.toLowerCase()?'selected':''}" style="background:${c}" data-color="${c}" title="颜色 ${i+1} · ${c}" aria-label="选择颜色 ${c}" aria-pressed="${selectedColor===c}"></button>`).join('')}<button class="swatch add" data-action="add-color" title="添加颜色" aria-label="添加颜色">${icon('plus',15)}</button></div><div class="selected-color"><span>当前画笔颜色</span><code>${esc(selectedColor)}</code></div>`;}
function updatePalette(){if($('#palette-body')){$('#palette-body').innerHTML=paletteHTML();bindColors();}}
function patternLeft(){return `<section class="section preset-entry"><h3 class="section-title">内置提花</h3><button class="btn full soft" data-action="motif-presets">小羊与常见花样</button><p class="hint">8 款小羊 · 爱心、雏菊、四叶草、花边</p></section><section class="section"><h3 class="section-title"><span class="number">01</span>从一张图片开始</h3><button class="upload-zone" id="upload-zone"><span class="upload-icon">${icon('image',22)}</span><strong>点击上传，或拖入图片</strong><small>JPG、PNG、WebP · 最大 20MB</small></button>${uploadedImage?'<button class="btn full soft reopen-image" id="reopen-image">重新框选原图</button>':''}<p class="hint">上传后可框选一只小羊，预览后再应用。原图可在本次页面打开期间重新框选。</p></section>
  ${motifSettingsHTML(project.grid,project.gauge,motifRatioLocked)}
  <section class="section"><h3 class="section-title"><span class="number">03</span>我的线色<span class="muted">${colorCounts(project.grid).length} 色使用中</span></h3><div id="palette-body">${paletteHTML()}</div><div class="palette-presets"><span class="mini-text" style="margin-right:5px;align-self:center">灵感配色</span>${[['#bf6373','#79836a','#f5efe3'],['#657f93','#d5b475','#f4e9d8'],['#786881','#b8a3ad','#ece6df']].map((p,i)=>`<button class="palette-preset" data-palette="${i}" title="添加${['春日花园','海岸晨光','暮色紫藤'][i]}配色">${p.map(c=>`<i style="background:${c}"></i>`).join('')}</button>`).join('')}</div></section>
  <section class="section"><h3 class="section-title">${icon('spark',15)}从一点灵感出发</h3><div class="motif-buttons"><button class="motif-btn" data-motif="tulip">${icon('heart')}春日花园</button><button class="motif-btn" data-motif="nordic">${icon('sun')}北欧雪花</button><button class="motif-btn" data-motif="diamond">${icon('grid')}经典菱格</button><button class="motif-btn" data-motif="blank">${icon('plus')}空白画布</button></div></section>`;}
function measurementFields(){const g=getGarment(project.garmentId),labels={width:project.garmentId==='trapezoid-sleeve'?'上端宽度（袖根）':'裁片宽度',height:project.garmentId==='trapezoid-sleeve'?'袖长':'裁片长度',cuffWidth:'袖口宽度',shoulderWidth:isHalfFront(project.garmentId)?'肩宽（半片）':'肩宽',neckWidth:'领口宽度',neckDepth:isRaisedNeck(project.garmentId)?'领部高度':'领口深度',armholeDepth:['sleeve','raglan'].includes(project.garmentId)?'袖山 / 斜线高度':'袖窿深度'};return g.fields.map(f=>numberField('measure-'+f,labels[f],project.measurements[f],'cm',{min:['width','height','cuffWidth'].includes(f)?.1:0,max:300})).join('');}
function gaugeFields(){return `<div class="form-row">${numberField('gauge-stitches','每 10 cm 针数',project.gauge.stitches,'针',{min:.1,max:100,step:.5})}${numberField('gauge-rows','每 10 cm 行数',project.gauge.rows,'行',{min:.1,max:100,step:.5})}</div>`;}
function finishEditing(){editor?.finishStroke();outlineEditor?.finishStroke();drawingEditor?.finishStroke();}
function outlineBox(m=project.measurements){const scale=Math.min(173/m.width,216/m.height),width=m.width*scale,height=m.height*scale;return {x:(280-width)/2,y:35+(216-height)/2,width,height};}
function editableOutline(){return project.customOutline||createEditableOutline(getOutline(project.garmentId,project.measurements).points);}
function outlineSection(){return `<section class="section outline-section"><h3 class="section-title">自定义裁片轮廓<span class="muted" data-outline-status>${project.outlineDrawing?'有绘制草稿':project.customOutline?'已自定义':'模板轮廓'}</span></h3><div class="outline-mode-buttons"><button class="btn small ${outlineMode?'primary':'soft'}" data-action="toggle-outline" ${project.outlineDrawing?'disabled':''}>${outlineMode?'完成节点调整':'调整轮廓节点'}</button><button class="btn small ${drawingMode?'primary':'soft'}" data-action="toggle-drawing">${drawingMode?'收起绘图工具':project.outlineDrawing?'继续自由绘制':'自由绘制'}</button></div>${drawingMode?drawingPanelHTML(project.outlineDrawing,drawingSelected,drawingTool):project.outlineDrawing?'<p class="draft-notice">绘制草稿已保留。继续绘制并应用后，图解才会使用新轮廓。</p>':''}${outlineMode?`<p class="hint">拖动圆点移动节点，绿色菱形调整弧度。方向键微调，Shift 大步移动。</p><p class="outline-selection" id="outline-selection">第 ${outlineSelected+1} 段 · ${outlineDraft.nodes.length} 个节点</p><div class="outline-actions"><button class="btn small" id="outline-add">增加节点</button><button class="btn small" id="outline-remove">删除节点</button><button class="btn small" id="outline-straight">拉直当前边</button><button class="btn small" id="outline-reset" ${project.customOutline?'':'disabled'}>恢复原版型</button></div>`:''}${!outlineMode&&!drawingMode&&!project.outlineDrawing?'<p class="hint">可调整现有节点，也可自由画直线、弧线，删除旧边重新绘制。</p>':''}<p class="hint">在当前宽高范围内编辑。宽高按比例缩放，自定义的肩部和领口通过轮廓调整。</p></section>`;}
function toggleOutline(){finishEditing();if(project.outlineDrawing){toast('请先应用绘制草稿，或在自由绘制中放弃草稿，再调整轮廓节点。');return;}drawingMode=false;outlineMode=!outlineMode;outlineSelected=0;render();}
function toggleDrawing(){
  finishEditing();outlineMode=false;drawingPreview=null;drawingSelected=-1;
  if(drawingMode){drawingMode=false;render();return;}
  if(!project.outlineDrawing){const before=snapshot();project.outlineDrawing=drawingFromOutline(editableOutline());commitGrid(before);}
  drawingMode=true;render();
}
function refreshDrawingPreview(){
  if(!drawingMode||!project.outlineDrawing)return;
  const svg=$('.piece-card.active .large-garment'),overlay=svg?.querySelector('[data-drawing-overlay]');if(!overlay)return;
  const focusLabel=svg.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
  const drawing=project.outlineDrawing,status=inspectOutlineDrawing(drawing),count=drawing.segments.length;
  if(drawingSelected>=count)drawingSelected=-1;
  overlay.innerHTML=renderDrawingOverlay(drawing,outlineBox(),drawingSelected,drawingPreview);
  if(focusLabel)overlay.querySelector(`[aria-label="${CSS.escape(focusLabel)}"]`)?.focus({preventScroll:true});
  if($('#drawing-status')){$('#drawing-status').textContent=`${count} 段 · ${status.message}`;$('#drawing-status').classList.toggle('closed',status.closed);}
  if($('#drawing-apply'))$('#drawing-apply').disabled=!status.closed||Boolean(drawingPreview);
  for(const id of ['drawing-split','drawing-delete'])if($('#'+id))$('#'+id).disabled=drawingSelected<0;
  if($('#drawing-clear'))$('#drawing-clear').disabled=!count;
  if($('#drawing-tool-hint'))$('#drawing-tool-hint').textContent=DRAWING_HINTS[drawingTool];
  $$('[data-drawing-tool]').forEach(button=>{const active=button.dataset.drawingTool===drawingTool;button.classList.toggle('selected',active);button.classList.toggle('soft',active);button.setAttribute('aria-pressed',String(active));});
}
function changeDrawing(operation){
  finishEditing();safe(()=>{const before=snapshot();project.outlineDrawing=operation(project.outlineDrawing);drawingPreview=null;drawingSelected=-1;commitGrid(before);render();});
}
function applyDrawing(){
  finishEditing();safe(()=>{const result=inspectOutlineDrawing(project.outlineDrawing);if(!result.closed)throw new Error(result.message);
    const before=snapshot();try{project.customOutline=result.outline;project.outlineDrawing=null;computeChart();if(!chart.rowCounts.some(row=>row.count))throw new Error('轮廓内没有可编织的针格，请扩大轮廓后再应用。');validateAllPieces();}catch(error){restoreSnapshot(before);computeChart();throw error;}
    drawingMode=false;drawingPreview=null;drawingSelected=-1;commitGrid(before);render();toast('新轮廓已应用，图解和逐行针数已更新');
  });
}
function bindDrawingActions(){
  $$('[data-drawing-tool]').forEach(button=>button.onclick=()=>{drawingEditor?.finishStroke();drawingEditor?.cancelPending();drawingPreview=null;drawingTool=button.dataset.drawingTool;refreshDrawingPreview();});
  $('#drawing-apply')?.addEventListener('click',applyDrawing);
  $('#drawing-delete')?.addEventListener('click',()=>changeDrawing(value=>removeDrawingSegment(value,drawingSelected)));
  $('#drawing-split')?.addEventListener('click',()=>changeDrawing(value=>splitDrawingSegment(value,drawingSelected)));
  $('#drawing-clear')?.addEventListener('click',()=>changeDrawing(()=>({segments:[]})));
  $('#drawing-reload')?.addEventListener('click',()=>changeDrawing(()=>drawingFromOutline(editableOutline())));
  $('#drawing-discard')?.addEventListener('click',()=>{changeDrawing(()=>null);toast('已放弃绘制草稿，当前裁片保持原样；可撤销');});
  $('#drawing-cancel')?.addEventListener('click',()=>{drawingEditor?.cancelPending();drawingPreview=null;refreshDrawingPreview();});
}
function refreshOutlinePreview(focusKind){
  const svg=$('.piece-card.active .large-garment');if(!svg||!outlineMode)return;
  const hadFocus=svg.contains(document.activeElement)&&document.activeElement.matches('[data-outline-node],[data-outline-control]');
  const restoreKind=focusKind||(document.activeElement?.dataset?.outlineControl!==undefined?'control':document.activeElement?.dataset?.outlineNode!==undefined?'node':null);
  svg.querySelector('[data-shape-image]')?.setAttribute('href',chartImage(chart));
  svg.querySelector('[data-shape-path]')?.setAttribute('d',getOutline(project.garmentId,project.measurements,project.customOutline).path);
  svg.querySelector('[data-outline-controls]').innerHTML=renderOutlineControls(outlineDraft,outlineBox(),outlineSelected);
  if($('#outline-selection'))$('#outline-selection').textContent=`第 ${outlineSelected+1} 段 · ${outlineDraft.nodes.length} 个节点`;
  if($('#outline-remove'))$('#outline-remove').disabled=outlineDraft.nodes.length<=3;
  if($('#outline-add'))$('#outline-add').disabled=outlineDraft.nodes.length>=80;
  if($('#outline-reset'))$('#outline-reset').disabled=!project.customOutline;
  if($('[data-outline-status]'))$('[data-outline-status]').textContent=project.customOutline?'已自定义':'模板轮廓';
  for(const input of $$('[id^="measure-"]'))if(!['measure-width','measure-height'].includes(input.id))input.disabled=Boolean(project.customOutline);
  const shoulder=resolveShoulderWidth(project.garmentId,project.measurements),label=svg.querySelector('[data-shoulder-label]');if(label&&shoulder!==undefined)label.textContent=`${project.customOutline?'模板肩宽参考':'肩宽'} ${Number(shoulder.toFixed(2))} cm / ${Math.round(shoulder*project.gauge.stitches/10)} 针`;
  if(hadFocus&&restoreKind&&restoreKind!=='edge')svg.querySelector(`[data-outline-${restoreKind}="${outlineSelected}"]`)?.focus({preventScroll:true});
}
function applyOutlineOperation(operation){finishEditing();safe(()=>{const before=snapshot();project.customOutline=operation(outlineDraft);outlineDraft=editableOutline();outlineSelected=Math.min(outlineSelected,outlineDraft.nodes.length-1);commitGrid(before);render();});}
function bindOutlineActions(){
  $('#outline-add')?.addEventListener('click',()=>applyOutlineOperation(value=>insertOutlineNode(value,outlineSelected)));
  $('#outline-remove')?.addEventListener('click',()=>applyOutlineOperation(value=>removeOutlineNode(value,outlineSelected)));
  $('#outline-straight')?.addEventListener('click',()=>applyOutlineOperation(value=>{const a=value.nodes[outlineSelected],b=value.nodes[(outlineSelected+1)%value.nodes.length];return moveOutlineControl(value,outlineSelected,(a.x+b.x)/2,(a.y+b.y)/2);}));
  $('#outline-reset')?.addEventListener('click',()=>applyOutlineOperation(()=>null));
}
function motifPresetsModal(){
  finishEditing();openModal('内置提花 · 小羊与日常花样',motifPresetsHTML());
  $$('[data-preset-use]').forEach(button=>button.onclick=()=>safe(()=>{
    const preset=getMotifPreset(button.dataset.presetUse),before=snapshot();
    project.grid=preset.grid;project.palette=preset.palette;project.draftMotifId=null;project.draftMotifName=preset.name;
    selectedColor=preset.palette[1]||preset.palette[0];tab='pattern';tool='pen';$('#modal').close();commitGrid(before);render();toast(`已打开「${preset.name}」，可继续绘制并保存提花；支持撤销`);
  }));
}
function shapeLeft(){return `<section class="section"><h3 class="section-title"><span class="number">01</span>裁片尺寸<span class="muted">${esc(activePieceLabel())} · cm</span></h3><div class="form-row">${measurementFields()}</div><p class="hint">${project.customOutline?'肩宽、领口和袖窿为模板参考。请拖动轮廓节点调整；恢复原版型后可重新按参数生成。':esc(getGarment(project.garmentId).note||'肩宽按两侧肩端水平距离计算，开衫按半片。点击版型上的尺寸也可修改。')}</p></section><section class="section"><h3 class="section-title"><span class="number">02</span>试织密度<span class="muted">全工程共用</span></h3>${gaugeFields()}<p class="hint">用实际线材试织 10 × 10 cm 小样后填写。</p></section><section class="section"><h3 class="section-title"><span class="number">03</span>当前裁片版型</h3>${garmentCategoryCards(project.garmentId)}</section>`;}
function chartLegendHTML(){return chartColors().map((c,i)=>`<div class="legend-row"><i style="background:${c.color}"></i><span>${colorLetter(i)} · ${c.color.toUpperCase()}</span><small>${c.count.toLocaleString()} 针</small></div>`).join('');}
function updateChartLegend(){if($('#stitch-count'))$('#stitch-count').textContent=Object.keys(project.stitchSymbols?.[project.garmentId]||{}).length+' 格标注';if($('#chart-legend'))$('#chart-legend').innerHTML=chartLegendHTML();if($('#chart-edit-count'))$('#chart-edit-count').textContent=Object.keys(project.chartEdits?.[project.garmentId]||{}).length+' 格手绘';}
function chartLeft(){return `${stitchPickerHTML(project,selectedStitch,tool)}${placementSection(project,selectedPlacementId)}<section class="section"><h3 class="section-title">${icon('pen',15)}在图解上绘制<span class="muted" id="chart-edit-count">${Object.keys(project.chartEdits?.[project.garmentId]||{}).length} 格手绘</span></h3><div id="palette-body">${paletteHTML()}</div><p class="hint">选好线色，在裁片内直接画。手绘按当前版型保存，支持撤销重做。</p></section><section class="section"><h3 class="section-title">${icon('shirt',15)}当前版型</h3><select class="select" id="garment-select-left" aria-label="图解版型">${garmentOptions()}</select><p class="setting-description">${displayNumber(project.measurements.width)} × ${displayNumber(project.measurements.height)} cm · ${chart.stitches} 针 × ${chart.rows} 行</p></section><section class="section"><h3 class="section-title">${icon('ruler',15)}试织密度</h3>${gaugeFields()}</section><section class="section"><h3 class="section-title">${icon('grid',15)}颜色图例</h3><div class="color-legend" id="chart-legend">${chartLegendHTML()}</div></section>`;}
function chartColors(){const counts=new Map();for(const row of chart.grid)for(const color of row)if(color)counts.set(color,(counts.get(color)||0)+1);return [...counts].map(([color,count])=>({color,count}));}
function colorLetter(index){let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
function toolbarHTML(){const undoButtons=`<button class="tool" id="undo" title="撤销 Ctrl+Z" aria-label="撤销">${icon('undo',18)}</button><button class="tool" id="redo" title="重做 Ctrl+Shift+Z" aria-label="重做">${icon('redo',18)}</button>`;if(tab==='shape')return `<div class="toolbar shape-toolbar"><button class="btn ${outlineMode?'primary':'soft'} small" data-action="toggle-outline">${outlineMode?'完成节点调整':'调整轮廓节点'}</button><button class="btn ${drawingMode?'primary':'soft'} small" data-action="toggle-drawing">${drawingMode?'收起绘图工具':'自由绘制'}</button><button class="btn soft small" data-action="add-note">${icon('plus',15)}插入文字</button><span class="tool-divider"></span>${undoButtons}<span class="mini-text annotation-toolbar-hint">${drawingMode?'绘制草稿 · 闭合后应用到裁片':outlineMode?'圆点移形 · 绿色菱形调弧度':'拖动文字定位 · 双击编辑'}</span></div>`;return `<div class="toolbar">${[...(tab==='chart'?[["position","shirt","移动提花"],["stitch","grid","绘制针法 S"]]:[]),['pen','pen','画笔 B'],['fill','fill','区域填充 F'],['eraser','eraser','橡皮擦 E'],['dropper','dropper','吸取颜色 I']].map(([id,i,title])=>`<button class="tool ${tool===id?'active':''}" data-tool="${id}" title="${title}" aria-label="${title}" aria-pressed="${tool===id}">${icon(i,18)}</button>`).join('')}<span class="tool-divider"></span>${undoButtons}<span class="tool-divider"></span><button class="tool ${mirror?'active':''}" id="mirror" title="左右对称绘制" aria-label="左右对称绘制" aria-pressed="${mirror}">${icon('mirror',18)}</button>${tab==='chart'?`<button class="tool ${mirrorVertical?'active':''}" id="mirror-vertical" title="上下对称绘制 · 可与左右对称同时开启" aria-label="上下对称绘制" aria-pressed="${mirrorVertical}">${icon('mirror-vertical',18)}</button><button class="tool" id="reset-chart-edits" title="清除当前版型的手绘，可撤销" aria-label="重置图解手绘">${icon('reset',18)}</button>`:`<button class="tool" id="flip" title="左右翻转图案" aria-label="左右翻转图案">${icon('repeat',18)}</button>`}</div>`;}
function activePieceLabel(){return project.pieces?.find(p=>p.id===project.activePieceId)?.label||getGarment(project.garmentId).name;}
function refreshPieceViews(){pieceViews=getPieceProjects(project).map(entry=>({...entry,chart:entry.id===project.activePieceId?chart:applyChartEdits(createBaseChart(entry.project),entry.project.chartEdits?.[entry.project.garmentId]||{})}));}
function activatePiece(id){if(id===project.activePieceId)return;finishEditing();project=switchActivePiece(project,id);drawingSelected=-1;drawingPreview=null;if(!project.outlineDrawing)drawingMode=false;selectedAnnotationId=null;selectedPlacementId=null;positionGesture=null;if(tool==='position')tool='pen';save();render();}
function canvasHTML(){const title={pattern:'提花画布',shape:pieceViews.length>1?'整件衣服版型工作台':'版型工作台',chart:'全部裁片编织图解'}[tab],sub=tab==='pattern'?`${project.grid[0].length} × ${project.grid.length}`:`${pieceViews.length} 片 · 编辑${activePieceLabel()}`;return `<section class="panel canvas-panel ${tab!=='pattern'?'multi-piece-panel':''}"><div class="canvas-header"><h2>${title}</h2><span class="tag">${esc(sub)}</span><span class="right">${icon('save',12)}灵感正在生长</span></div>${toolbarHTML()}${tab!=='shape'?brushSettingsHTML():''}<div class="canvas-stage ${tab!=='pattern'?'pieces-stage':''}" id="canvas-stage">${tab==='pattern'?'<canvas id="grid-canvas" aria-label="提花像素网格，使用画笔、填充和配色工具绘制" role="img"></canvas>':pieceBoardHTML(pieceViews,project.activePieceId,tab,entry=>garmentSVG(true,entry.project,entry.chart,entry.id,entry.label))}</div><div class="canvas-footer"><span class="coordinate" id="coordinate">${tab==='shape'?'尺寸单位：厘米':'移动到网格查看针位'}</span>${tab!=='shape'?`<label class="toggle-label"><input type="checkbox" id="show-grid" ${showGrid?'checked':''}>网格</label><label class="toggle-label"><input type="checkbox" id="texture" ${texture?'checked':''}>针目</label><div class="zoom-control"><button id="zoom-out" aria-label="缩小">${icon('minus',14)}</button><span class="zoom-value" id="zoom-value">${Math.round(zoom*100)}%</span><button id="zoom-in" aria-label="放大">${icon('plus',14)}</button><button id="zoom-fit" title="适应窗口" aria-label="适应窗口">${icon('reset',12)}</button></div>`:'<span>尺寸按各片独立保存</span>'}</div></section>`;}
function chartImage(source=chart){const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(source.grid[y][x]){ctx.fillStyle=source.grid[y][x];ctx.fillRect(x,y,1,1);}return canvas.toDataURL();}
function garmentSVG(large=false,scope=project,source=chart,pieceId=project.activePieceId,pieceLabel=activePieceLabel()){
  const outline=getOutline(scope.garmentId,scope.measurements,scope.customOutline),m=scope.measurements,shoulder=resolveShoulderWidth(scope.garmentId,m);
  const scale=Math.min(173/m.width,216/m.height),w=m.width*scale,h=m.height*scale,x=(280-w)/2,y=35+(216-h)/2,editable=large&&pieceId===project.activePieceId&&!outlineMode&&!drawingMode;
  let shoulderMark='';if(shoulder!==undefined){const span=shoulder*scale,left=isHalfFront(scope.garmentId)&&scope.garmentId.endsWith('-left')?x+w-span:isHalfFront(scope.garmentId)&&scope.garmentId.endsWith('-right')?x:x+(w-span)/2;
    shoulderMark=`<g class="dimension-link" data-dimension="shoulderWidth" data-piece-id="${esc(pieceId)}" role="button" tabindex="0" aria-label="修改${esc(pieceLabel)}肩宽 ${displayNumber(shoulder)} 厘米"><path d="M${left} 18v10M${left+span} 18v10M${left} 22h${span}" stroke="#b96d78" stroke-width=".6"/><rect x="82" y="7" width="116" height="13" rx="3" fill="#fffefa"/><text x="140" y="16" text-anchor="middle" font-size="8.3" fill="#a5656d" data-shoulder-label>${scope.customOutline?'模板肩宽参考':'肩宽'} ${Number(shoulder.toFixed(2))} cm / ${Math.round(shoulder*scope.gauge.stitches/10)} 针</text></g>`;}
  const annotations=renderAnnotations(scope.annotations||[],scope.garmentId,editable?selectedAnnotationId:null,editable).replaceAll('<g id="annotation-',`<g id="${large?'main':'preview'}-${esc(pieceId)}-annotation-`);
  return `<svg class="${large?'large-garment':''} ${large&&(outlineMode||drawingMode)&&pieceId===project.activePieceId?'outline-editing':''} ${large&&drawingMode&&pieceId===project.activePieceId?'free-drawing':''}" viewBox="0 0 280 310" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc(pieceLabel)}，宽 ${displayNumber(m.width)} 厘米，长 ${displayNumber(m.height)} 厘米"><g data-applied-shape><image data-shape-image href="${chartImage(source)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" style="image-rendering:pixelated"/><path data-shape-path d="${outline.path}" transform="translate(${x} ${y}) scale(${w/100} ${h/100})" fill="none" stroke="#9c9e8d" stroke-width=".7" vector-effect="non-scaling-stroke"/></g>${shoulderMark}${scope.garmentId==='trapezoid-sleeve'?trapezoidDimensionsSVG(scope,{x,y,width:w,height:h,interactive:large,pieceId,pieceLabel}):`<g stroke="#b7bbab" stroke-width=".6" fill="none"><path d="M${x} ${y+h+12}v13m${w} -13v13M${x} ${y+h+19}h${w}"/><path d="M${x+w+10} ${y}h13m-13 ${h}h13M${x+w+17} ${y}v${h}"/></g><g class="dimension-link" data-dimension="width" data-piece-id="${esc(pieceId)}" role="button" tabindex="0" aria-label="修改${esc(pieceLabel)}宽度 ${displayNumber(m.width)} 厘米"><rect x="104" y="${y+h+12}" width="72" height="17" rx="3" fill="#fffefa"/><text x="140" y="${y+h+24}" text-anchor="middle" font-size="10" fill="#8b9780">${displayNumber(m.width)} cm / ${source.stitches} 针</text></g><g class="dimension-link" data-dimension="height" data-piece-id="${esc(pieceId)}" role="button" tabindex="0" aria-label="修改${esc(pieceLabel)}长度 ${displayNumber(m.height)} 厘米"><rect x="${x+w+9}" y="${y+h/2-33}" width="17" height="66" rx="3" fill="#fffefa"/><text transform="translate(${x+w+21} ${y+h/2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#8b9780">${displayNumber(m.height)} cm / ${source.rows} 行</text></g>`}<text x="140" y="294" text-anchor="middle" font-size="9" fill="#adae9f">${esc(pieceLabel)} · ${getGarment(scope.garmentId).name}</text>${annotations}${large&&drawingMode&&pieceId===project.activePieceId?`<g data-drawing-overlay>${renderDrawingOverlay(scope.outlineDrawing,outlineBox(m),drawingSelected,drawingPreview)}</g>`:''}${large&&outlineMode&&pieceId===project.activePieceId?`<g data-outline-controls>${renderOutlineControls(outlineDraft,outlineBox(m),outlineSelected)}</g>`:''}</svg>`;
}
function rightHTML(){return `<div class="preview-head">${icon('shirt',16)}上身灵感预览<span class="live-dot"></span><span class="live-label">实时</span></div><div class="garment-select"><select class="select" id="garment-select" aria-label="预览衣服版型">${garmentOptions()}</select></div><div class="preview-picture">${garmentSVG()}</div><p class="preview-caption">${tab==='shape'?'点击任意尺寸标注即可修改':'你的图案，正在变成一件衣服'}</p><div class="stats-row"><div class="stat"><strong>${chart.stitches}</strong><small>针</small><span>最大横向针数</span></div><div class="stat"><strong>${chart.rows}</strong><small>行</small><span>总编织行数</span></div></div><div class="compact-section"><h3 class="section-title">${icon('ruler',14)}尺寸与密度<button class="btn text small" style="margin-left:auto" data-tab="shape">调整 ${icon('chevron',10)}</button></h3><div class="density-box"><div class="density-label">10 × 10 cm 试织小样</div><div class="density-value"><b>${project.gauge.stitches}</b> 针 × <b>${project.gauge.rows}</b> 行<span style="float:right;color:#9fa58e">${displayNumber(project.measurements.width)} × ${displayNumber(project.measurements.height)} cm</span></div></div><p class="hint">取整后约 ${chart.actualWidth.toFixed(1)} × ${chart.actualHeight.toFixed(1)} cm</p></div>${tab==='chart'?`<div class="compact-section"><h3 class="section-title">逐行针数</h3><div class="row-summary"><table><thead><tr><th>行号</th><th>有效针数</th></tr></thead><tbody>${rowGroups().map(r=>`<tr><td>${r.start===r.end?r.start:r.start+'–'+r.end} 行</td><td>${r.count} 针${r.segments>1?' · 分'+r.segments+'段':''}</td></tr>`).join('')}</tbody></table></div></div>`:`<div class="tip-box">${icon('spark',15)}<span>小小的一格，藏着无限可能。<br>先织一片密度小样，让尺寸更合身。</span></div><div class="right-action"><button class="btn full soft" data-tab="chart">生成我的编织图解 ${icon('chevron',13)}</button></div>`}`;}
function rowGroups(){const groups=[];for(const r of chart.rowCounts){const prev=groups.at(-1),key=JSON.stringify(r.segments);if(prev&&prev.key===key){prev.end=r.row;}else groups.push({start:r.row,end:r.row,count:r.count,segments:r.segments.length,key});}return groups;}
function render(){
  finishEditing();drawingEditor?.destroy();drawingEditor=null;drawingPreview=null;outlineEditor?.destroy();outlineEditor=null;editor?.destroy();editor=null;previewEditors.forEach(e=>e.destroy());previewEditors=[];annotationCleanup?.();annotationCleanup=null;project=syncActivePiece(project);computeChart();refreshPieceViews();
  if(drawingMode&&!project.outlineDrawing)drawingMode=false;
  if(drawingMode||project.outlineDrawing)outlineMode=false;
  if(outlineMode){outlineDraft=editableOutline();outlineSelected=Math.min(outlineSelected,outlineDraft.nodes.length-1);}
  $('#app').innerHTML=`<div class="shell">${header()}<div class="workspace ${tab!=='pattern'?'pieces-workspace':''}"><aside class="panel left-panel">${tab==='pattern'?patternLibrarySection(project,workspaceState.motifs.length)+patternLeft():tab==='shape'?pieceSelectorHTML(pieceViews,project.activePieceId)+outlineSection()+shapeLeft()+annotationSection():pieceSelectorHTML(pieceViews,project.activePieceId)+chartLeft()}</aside>${canvasHTML()}${tab==='pattern'?`<aside class="panel right-panel" id="right-panel">${rightHTML()}</aside>`:''}</div><footer class="bottom-note">${icon('heart',12)}每一针都有心意，每一件都独一无二。<span style="margin-left:10px">图片在本地处理 · 作品自动保存</span></footer></main></div>`;
  bind();
  renderOfflineStatus($('#offline-status'),offlineSupport.state,offlineHelp);
  if(tab!=='shape'){
    const chartMode=tab==='chart';
    editor=new GridEditor($('#grid-canvas'),{
      getGrid:()=>chartMode?chart.grid:project.grid,getTool:()=>tool,getColor:()=>selectedColor,getBackground:()=>chartMode?(project.fabricColor||project.palette[0]):project.palette[0],getMirror:()=>mirror,getMirrorVertical:()=>chartMode&&mirrorVertical,
      getBrushSize:()=>brushSizes[tool]||1,
      getShowGrid:()=>showGrid,getTexture:()=>texture,getAspect:()=>chartMode||aspect?project.gauge.stitches/project.gauge.rows:1,
      paintLine:chartMode?paintChartLine:undefined,fillRegion:chartMode?fillChartRegion:undefined,
      getPlacementBounds:()=>chartMode?selectedPlacementBounds():null,onPositionStart:startPosition,onPositionMove:movePosition,onPositionCommit:commitPosition,onPositionCancel:cancelPosition,
      getStitches:()=>chartMode?(project.stitchSymbols?.[project.garmentId]||{}):{},getStitch:()=>selectedStitch,
      onStitchesDraw:values=>{project.stitchSymbols={...project.stitchSymbols,[project.garmentId]:values};},
      onStart:()=>{strokeSnapshot=snapshot();},onCancel:()=>{strokeSnapshot=null;},
      onDraw:grid=>{if(chartMode)chart.grid=grid;else project.grid=grid;},
      onCommit:()=>{if(chartMode&&!['stitch','stitch-erase'].includes(tool))project.chartEdits={...(project.chartEdits||{}),[project.garmentId]:captureChartEdits(baseChart(),chart.grid,project.chartEdits?.[project.garmentId]||{})};commitGrid(strokeSnapshot);strokeSnapshot=null;},
      onPick:c=>{selectedColor=c;selectDrawingTool('pen');updatePalette();},
      onHover:p=>{if($('#coordinate'))$('#coordinate').textContent=p?`第 ${(tab==='chart'?chart.width:project.grid[0].length)-p.x} 针 · 第 ${(tab==='chart'?chart.height:project.grid.length)-p.y} 行`:'移动到网格查看针位';}
    });editor.setZoom(zoom);$('#grid-canvas').style.cursor=tool==='position'?'move':'crosshair';
    if(chartMode)for(const canvas of $$('canvas[data-preview-piece]')){const entry=pieceViews.find(v=>v.id===canvas.dataset.previewPiece);const view=new GridEditor(canvas,{readOnly:true,getGrid:()=>entry.chart.grid,getStitches:()=>entry.project.stitchSymbols?.[entry.project.garmentId]||{},getTool:()=>tool,getShowGrid:()=>showGrid,getTexture:()=>texture,getAspect:()=>project.gauge.stitches/project.gauge.rows});view.setZoom(zoom);previewEditors.push(view);canvas.style.cursor='pointer';canvas.onclick=()=>activatePiece(entry.id);}
  }else if(drawingMode){
    drawingEditor=bindDrawingEditor($('.piece-card.active .large-garment'),{
      box:outlineBox(),getDrawing:()=>project.outlineDrawing,getTool:()=>drawingTool,
      onSelect:(index)=>{drawingSelected=index;refreshDrawingPreview();},
      onStart:()=>{drawingBefore=snapshot();},
      onChange:(value,index)=>{project.outlineDrawing=value;if(Number.isInteger(index))drawingSelected=index;refreshDrawingPreview();},
      onCommit:()=>{const before=drawingBefore;drawingBefore=null;if(before)commitGrid(before);refreshDrawingPreview();},
      onCancel:original=>{if(drawingBefore){restoreSnapshot(drawingBefore);drawingBefore=null;}else if(original)project.outlineDrawing=original;refreshDrawingPreview();},
      onPreview:value=>{drawingPreview=value;refreshDrawingPreview();},onError:error=>toast(error.message||'这一段未完成，请重试')
    });refreshDrawingPreview();
  }else if(outlineMode){
    outlineEditor=bindOutlineEditor($('.piece-card.active .large-garment'),{
      box:outlineBox(),getOutline:()=>outlineDraft,
      onSelect:(index,kind)=>{outlineSelected=index;refreshOutlinePreview(kind);},
      onStart:()=>{outlineBefore=snapshot();},
      onChange:(value,index,kind)=>{outlineDraft=value;project.customOutline=value;computeChart();refreshOutlinePreview(kind);},
      onCommit:()=>{const before=outlineBefore;outlineBefore=null;if(before)commitGrid(before);refreshOutlinePreview();},
      onCancel:original=>{if(outlineBefore){restoreSnapshot(outlineBefore);outlineBefore=null;computeChart();}outlineDraft=original;refreshOutlinePreview();}
    });refreshOutlinePreview();
  }else{
    annotationCleanup=bindAnnotationCanvas($('.piece-card.active .large-garment'),{
      onSelect:selectAnnotation,onEdit:annotationModal,
      onMove:(id,x,y)=>{const before=snapshot();project.annotations=(project.annotations||[]).map(n=>n.id===id?{...n,x,y}:n);selectedAnnotationId=id;commitGrid(before);render();$('.piece-card.active .large-garment [data-annotation-id="'+CSS.escape(id)+'"]')?.focus();}
    });
  }
  updateHistoryButtons();
  if(tab!=='pattern')$('.piece-card.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function updateSidePreview(){if($('#right-panel')){$('#right-panel').innerHTML=rightHTML();bindSide();}const tag=$('.canvas-header .tag');if(tag&&tab==='pattern')tag.textContent=`${project.grid[0].length} × ${project.grid.length}`;}
function selectGarment(id){finishEditing();safe(()=>{const before=snapshot(),g=getGarment(id);try{project.garmentId=id;project.customOutline=null;project.outlineDrawing=null;drawingMode=false;project.measurements={...g.defaults};outlineSelected=0;project=syncActivePiece(project);validateAllPieces();selectedPlacementId=null;tool='pen';commitGrid(before);render();}catch(error){restoreSnapshot(before);computeChart();$$('#garment-select,#garment-select-left').forEach(s=>s.value=project.garmentId);throw error;}});}
function validateAllPieces(){for(const entry of getPieceProjects(project))createBaseChart(entry.project);}
function setTab(id){if(!['pattern','shape','chart'].includes(id))return;finishEditing();tab=id;if(['position','stitch','stitch-erase'].includes(tool)&&id!=='chart')tool='pen';zoom=1;render();}
function bindSide(){for(const button of $$('[data-edit-piece]'))button.onclick=()=>activatePiece(button.dataset.editPiece);for(const el of $$('[data-tab]'))el.onclick=()=>setTab(el.dataset.tab);$('#garment-select')?.addEventListener('change',e=>selectGarment(e.target.value));for(const el of $$('[data-dimension]')){const activate=()=>{const f=el.dataset.dimension;if(el.dataset.pieceId&&el.dataset.pieceId!==project.activePieceId)activatePiece(el.dataset.pieceId);setTab('shape');const input=$('#measure-'+f);input?.focus();input?.select();};el.onclick=activate;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};}}
function bindColors(){for(const el of $$('[data-color]'))el.onclick=()=>{selectedColor=el.dataset.color;if(tab==='chart')selectDrawingTool('pen');updatePalette();};$('[data-action="add-color"]')?.addEventListener('click',addColor);}
function bind(){
  bindSide();bindColors();$$('[data-action]').forEach(el=>{if(el.dataset.action!=='add-color')el.onclick=()=>({export:exportModal,projects:projectsModal,help:helpModal,'add-note':()=>{finishEditing();outlineMode=false;drawingMode=false;render();annotationModal();},'new-project':newProjectModal,'save-motif':()=>saveMotifModal(false),'save-motif-as':()=>saveMotifModal(true),'new-motif':newMotifModal,'motif-library':()=>motifLibraryModal('edit'),'choose-placement':()=>motifLibraryModal('place'),'add-piece':addPieceModal,'rename-piece':()=>pieceNameModal('rename'),'duplicate-piece':()=>pieceNameModal('duplicate'),'remove-piece':removeCurrentPiece,'clear-stitches':clearStitches,'toggle-outline':toggleOutline,'toggle-drawing':toggleDrawing,'motif-presets':motifPresetsModal}[el.dataset.action]?.());});
  $$('[data-edit-note]').forEach(b=>b.onclick=()=>annotationModal(b.dataset.editNote));
  $$('[data-delete-note]').forEach(b=>b.onclick=()=>deleteAnnotation(b.dataset.deleteNote));
  bindPlacements();bindOutlineActions();bindDrawingActions();
  if(project.customOutline||project.outlineDrawing)for(const input of $$('[id^="measure-"]'))if(!['measure-width','measure-height'].includes(input.id)){input.disabled=true;input.title='自定义轮廓请直接拖动节点调整；恢复原版型后可按参数生成';}
  $('#project-name').addEventListener('change',e=>{project.name=e.target.value.trim()||'未命名编织作品';e.target.value=project.name;save();});
  $$('[data-tool]').forEach(el=>el.onclick=()=>selectDrawingTool(el.dataset.tool));
  $('#brush-size-range')?.addEventListener('input',e=>setBrushSize(e.target.value));
  $('#brush-size-number')?.addEventListener('input',e=>{const value=Number(e.target.value);if(Number.isInteger(value)&&value>=1&&value<=MAX_BRUSH_SIZE)setBrushSize(value);});
  $('#brush-size-number')?.addEventListener('change',e=>{if(!setBrushSize(e.target.value)){updateBrushControls();toast(`大小请填写 1–${MAX_BRUSH_SIZE} 的整数。`);}});
  $$('[data-stitch]').forEach(el=>el.onclick=()=>{selectedStitch=el.dataset.stitch;selectDrawingTool('stitch');});
  $('#undo')?.addEventListener('click',undo);$('#redo')?.addEventListener('click',redo);
  $('#mirror')?.addEventListener('click',e=>{finishEditing();mirror=!mirror;e.currentTarget.classList.toggle('active',mirror);e.currentTarget.setAttribute('aria-pressed',String(mirror));editor?.render();toast(mirror?'已开启左右对称绘制':'已关闭左右对称绘制');});
  $('#mirror-vertical')?.addEventListener('click',e=>{finishEditing();mirrorVertical=!mirrorVertical;e.currentTarget.classList.toggle('active',mirrorVertical);e.currentTarget.setAttribute('aria-pressed',String(mirrorVertical));editor?.render();toast(mirrorVertical?(mirror?'已开启左右与上下四向对称绘制':'已开启上下对称绘制'):'已关闭上下对称绘制');});
  $('#flip')?.addEventListener('click',()=>safe(()=>replaceGrid(flipGrid(project.grid))));
  $('#reset-chart-edits')?.addEventListener('click',()=>confirmModal('重置当前图解手绘','恢复为当前提花的自动铺放效果。已有文字标注会保留，重置后可以撤销。',()=>{const before=snapshot();project.chartEdits={...(project.chartEdits||{}),[project.garmentId]:{}};commitGrid(before);render();},'重置手绘'));
  bindMotifSettings(document,{grid:project.grid,gauge:project.gauge,locked:motifRatioLocked,onLockChange:value=>{motifRatioLocked=value;},onApply:(width,height)=>safe(()=>{finishEditing();replaceGrid(scaleMotifGrid(project.grid,width,height));toast(motifRatioLocked?'提花已按比例缩放，可撤销':'提花已缩放到新的画布尺寸，可撤销');})});
  $$('[data-motif]').forEach(b=>b.onclick=()=>confirmModal('换一份灵感','将替换当前画布中的图案，之后可以撤销。',()=>{finishEditing();const before=snapshot();project.grid=generateMotif(project.grid[0].length,project.grid.length,b.dataset.motif);project.palette=defaultPalette.slice();project.draftMotifId=null;project.draftMotifName={tulip:'春日花园',nordic:'北欧雪花',diamond:'经典菱格',blank:'空白提花'}[b.dataset.motif];selectedColor=project.palette[1];commitGrid(before);render();toast('新图案已准备好，开始创作吧');},'应用图案'));
  $$('[data-palette]').forEach(b=>b.onclick=()=>{const choices=[['#bf6373','#79836a','#f5efe3'],['#657f93','#d5b475','#f4e9d8'],['#786881','#b8a3ad','#ece6df']][Number(b.dataset.palette)];project.palette=[...new Set([...project.palette,...choices])].slice(0,32);selectedColor=choices[0];updatePalette();save();});
  const upload=$('#upload-zone');if(upload){upload.onclick=()=>$('#image-file').click();upload.ondragover=e=>{e.preventDefault();upload.classList.add('dragging');};upload.ondragleave=()=>upload.classList.remove('dragging');upload.ondrop=e=>{e.preventDefault();upload.classList.remove('dragging');loadImage(e.dataTransfer.files[0]);};}
  $('#reopen-image')?.addEventListener('click',()=>safe(imageModal));
  $('#show-grid')?.addEventListener('change',e=>{showGrid=e.target.checked;editor?.render();previewEditors.forEach(v=>v.render());});$('#texture')?.addEventListener('change',e=>{texture=e.target.checked;editor?.render();previewEditors.forEach(v=>v.render());});
  const setZoom=value=>{zoom=editor.setZoom(value);previewEditors.forEach(v=>v.setZoom(zoom));$('#zoom-value').textContent=Math.round(zoom*100)+'%';};$('#zoom-in')?.addEventListener('click',()=>setZoom(zoom+.25));$('#zoom-out')?.addEventListener('click',()=>setZoom(zoom-.25));$('#zoom-fit')?.addEventListener('click',()=>setZoom(1));
  $$('[data-garment]').forEach(b=>b.onclick=()=>selectGarment(b.dataset.garment));$('#garment-select-left')?.addEventListener('change',e=>selectGarment(e.target.value));
  $$('[id^="measure-"]').forEach(input=>input.addEventListener('change',()=>{finishEditing();const key=input.id.slice(8),before=snapshot();safe(()=>{try{const value=Number(input.value);if(input.value===''||!Number.isFinite(value))throw new Error('请输入有效尺寸。');if((project.customOutline||project.outlineDrawing)&&['width','height'].includes(key))project.measurements=resizeOutlineMeasurements(project.measurements,key,value);else project.measurements[key]=value;getOutline(project.garmentId,project.measurements,project.customOutline);validateAllPieces();commitGrid(before);render();}catch(e){restoreSnapshot(before);computeChart();input.value=project.measurements[key];throw e;}});}));
  $$('[id^="gauge-"]').forEach(input=>input.addEventListener('change',()=>{finishEditing();const key=input.id.slice(6),before=snapshot();safe(()=>{try{const v=Number(input.value);if(!Number.isFinite(v)||v<.1||v>100)throw new Error('每 10 厘米的密度请填写 0.1–100 之间的数值。');project.gauge[key]=v;validateAllPieces();commitGrid(before);render();}catch(e){restoreSnapshot(before);computeChart();input.value=project.gauge[key];throw e;}});}));
}
function brushSettingsHTML(){const enabled=tool==='pen'||tool==='eraser',label=tool==='eraser'?'橡皮擦大小':'画笔大小',size=brushSizes[tool]||1;return `<div class="brush-settings" id="brush-settings" ${enabled?'':'hidden'}><label id="brush-size-label" for="brush-size-number">${label}</label><input id="brush-size-range" type="range" min="1" max="${MAX_BRUSH_SIZE}" step="1" value="${size}" aria-label="${label}滑块"><input id="brush-size-number" type="number" min="1" max="${MAX_BRUSH_SIZE}" step="1" value="${size}" aria-label="${label}"><output id="brush-size-value" for="brush-size-range brush-size-number">${size} × ${size} 格</output></div>`;}
function updateBrushControls(){const container=$('#brush-settings');if(!container)return;const enabled=tool==='pen'||tool==='eraser',size=brushSizes[tool]||1,label=tool==='eraser'?'橡皮擦大小':'画笔大小';container.hidden=!enabled;$('#brush-size-label').textContent=label;$('#brush-size-range').value=size;$('#brush-size-range').setAttribute('aria-label',label+'滑块');$('#brush-size-range').setAttribute('aria-valuetext',`${size} × ${size} 格`);$('#brush-size-number').value=size;$('#brush-size-number').setAttribute('aria-label',label);$('#brush-size-value').textContent=`${size} × ${size} 格`;}
function setBrushSize(raw){if(tool!=='pen'&&tool!=='eraser')return false;const value=Number(raw);if(!Number.isInteger(value)||value<1||value>MAX_BRUSH_SIZE)return false;if(brushSizes[tool]!==value){finishEditing();brushSizes[tool]=value;try{localStorage.setItem(BRUSH_PREFERENCES,JSON.stringify(brushSizes));}catch{}}updateBrushControls();editor?.render();return true;}
function selectDrawingTool(value){
  finishEditing();tool=value;
  updateBrushControls();editor?.render();
  if($('#grid-canvas'))$('#grid-canvas').style.cursor=tool==='position'?'move':'crosshair';
  $$('[data-tool]').forEach(b=>{const selected=b.dataset.tool===tool;b.classList.toggle('active',selected);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  $$('[data-stitch]').forEach(b=>{const selected=tool==='stitch'&&b.dataset.stitch===selectedStitch;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  const label=STITCHES.find(s=>s.id===selectedStitch)?.label||'下针';
  if($('#stitch-mode-hint'))$('#stitch-mode-hint').textContent=tool==='stitch'?`当前针法：${label}，点击或拖动绘制。`:tool==='stitch-erase'?'点击或拖动擦除针法，提花颜色会保留。':'选择针法后，在网格内点击或连续拖动。';
}
function clearStitches(){confirmModal('清空本片针法',`将清空「${esc(activePieceLabel())}」的针法符号，保留提花颜色、文字及其他裁片。清空后可以撤销。`,()=>{const before=snapshot();project.stitchSymbols={...project.stitchSymbols,[project.garmentId]:{}};commitGrid(before);render();toast('本片针法已清空，可以撤销');},'清空针法');}
function applyPieceChange(change,message){
  finishEditing();
  return safe(()=>{const before=snapshot(),next=sanitizeProject(change(project));project=next;selectedAnnotationId=null;selectedPlacementId=null;positionGesture=null;if(tool==='position')tool='pen';commitGrid(before);render();$('.piece-card.active')?.scrollIntoView({block:'nearest',inline:'nearest'});toast(message);return true;});
}
function nextPieceLabel(garmentId){
  const labels=new Set(project.pieces.map(p=>p.label));
  const base=getGarment(garmentId).category==='袖片'?(!labels.has('左袖')?'左袖':!labels.has('右袖')?'右袖':getGarment(garmentId).name):getGarment(garmentId).name;
  if(!labels.has(base))return base;
  for(let n=2;n<=MAX_PIECES+1;n++)if(!labels.has(base+' '+n))return base+' '+n;
}
function addPieceModal(){
  if(project.pieces.length>=MAX_PIECES)return toast(`每个工程最多添加 ${MAX_PIECES} 个裁片。`);
  const initial='sleeve';
  const modal=openModal('添加裁片',`<label class="field"><span>裁片版型</span><select id="new-piece-garment" aria-label="添加裁片版型">${groupedGarmentOptions(initial)}</select></label><label class="field piece-name-field"><span>裁片名称</span><div class="input-wrap"><input id="new-piece-label" aria-label="裁片名称" maxlength="80" value="${esc(nextPieceLabel(initial))}"></div></label><p id="new-piece-summary"></p><p>新裁片会加入当前工程，与其他裁片同时显示；尺寸、提花、针法和文字分别保存。添加后可在左侧继续调整尺寸。</p>`,`<button class="btn" id="cancel-piece">取消</button><button class="btn primary" id="save-piece">添加到工程</button>`);
  const update=()=>{const g=getGarment($('#new-piece-garment').value);$('#new-piece-summary').textContent=`初始尺寸 ${g.defaults.width} × ${g.defaults.height} cm · 共用密度 ${project.gauge.stitches} 针 × ${project.gauge.rows} 行 / 10 cm。${g.note||''}`;};
  let nameEdited=false;$('#new-piece-label').oninput=()=>nameEdited=true;
  $('#new-piece-garment').onchange=()=>{if(!nameEdited)$('#new-piece-label').value=nextPieceLabel($('#new-piece-garment').value);update();};update();
  $('#cancel-piece').onclick=()=>modal.close();
  $('#save-piece').onclick=()=>{const descriptor={id:crypto.randomUUID(),label:$('#new-piece-label').value.trim(),garmentId:$('#new-piece-garment').value};if(applyPieceChange(p=>addPiece(p,descriptor),'已添加裁片，可继续调整尺寸或绘制图解'))modal.close();};
}
function pieceNameModal(mode){
  const duplicate=mode==='duplicate',label=activePieceLabel(),pieceId=project.activePieceId;
  const proposed=duplicate?label.slice(0,75)+' 副本':label;
  const modal=openModal(duplicate?'复制裁片':'重命名裁片',`<label class="field"><span>裁片名称</span><div class="input-wrap"><input id="piece-name-value" aria-label="裁片名称" maxlength="80" value="${esc(proposed)}"></div></label><p>${duplicate?'复制当前裁片的尺寸、提花、针法和文字。副本可以独立修改，例如将左袖复制为右袖。':'名称用于工作台、工程备份和图解导出。'}</p>`,`<button class="btn" id="cancel-piece-name">取消</button><button class="btn primary" id="save-piece-name">${duplicate?'复制并打开':'保存名称'}</button>`);
  $('#cancel-piece-name').onclick=()=>modal.close();$('#save-piece-name').onclick=()=>{const name=$('#piece-name-value').value.trim();if(applyPieceChange(p=>duplicate?duplicatePiece(p,pieceId,{id:crypto.randomUUID(),label:name}):renamePiece(p,pieceId,name),duplicate?'裁片副本已创建，各片可独立修改':'裁片名称已更新'))modal.close();};
}
function removeCurrentPiece(){
  if(project.pieces.length===1)return toast('工程至少需要保留一个裁片。');
  const id=project.activePieceId,label=activePieceLabel();
  confirmModal('移除裁片',`从本工程移除「${esc(label)}」及其尺寸、提花、针法和文字。其他裁片会保留，移除后可以撤销。`,()=>applyPieceChange(p=>removePiece(p,id),'裁片已移除，可以撤销恢复'),'移除裁片');
}
function openModal(title,body,footer=''){finishEditing();modalCleanup?.();modalCleanup=null;const modal=$('#modal');if(modal.open)modal.close();modal.innerHTML=`<div class="modal-header"><h2>${title}</h2><button class="tool" id="close-modal" aria-label="关闭">${icon('close',19)}</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;$('#close-modal').onclick=()=>modal.close();modal.showModal();return modal;}
function annotationSection(){const notes=(project.annotations||[]).filter(n=>n.garmentId===project.garmentId);return `<section class="section annotation-section"><h3 class="section-title">${icon('pen',15)}我的文字标注<span class="muted">${notes.length} 条</span></h3><button class="btn full soft" data-action="add-note">${icon('plus',15)}插入文字</button>${notes.length?`<div class="annotation-list">${notes.map(n=>`<div class="annotation-row ${n.id===selectedAnnotationId?'selected':''}" data-note-row="${esc(n.id)}"><button class="annotation-edit" data-edit-note="${esc(n.id)}" title="编辑文字标注"><span>${esc(n.text.split('\n')[0])}</span>${icon('pen',12)}</button><button class="tool" data-delete-note="${esc(n.id)}" title="删除文字标注" aria-label="删除标注 ${esc(n.text.split('\n')[0])}">${icon('close',13)}</button></div>`).join('')}</div>`:'<p class="hint">写下收针说明、毛线信息或自己的备注。</p>'}<p class="hint">文字可拖动定位，双击编辑。选中后也可按方向键移动。</p></section>`;}
function selectAnnotation(id){selectedAnnotationId=id;$$('.piece-card.active .annotation-item').forEach(el=>el.classList.toggle('selected',el.dataset.annotationId===id));$$('[data-note-row]').forEach(el=>el.classList.toggle('selected',el.dataset.noteRow===id));}
function deleteAnnotation(id){const before=snapshot();project.annotations=(project.annotations||[]).filter(n=>n.id!==id);if(selectedAnnotationId===id)selectedAnnotationId=null;commitGrid(before);render();toast('已删除文字标注，可以撤销');}
function annotationModal(id){
  const old=(project.annotations||[]).find(n=>n.id===id),count=(project.annotations||[]).filter(n=>n.garmentId===project.garmentId).length;
  if(!old&&(project.annotations||[]).length>=50)return toast('每个作品最多添加 50 条文字标注。');
  const note=old||{text:'',fontSize:12,color:'#343c36',x:.5,y:Math.min(.8,.1+count*.07)};
  const shownX=Number((note.x*100).toFixed(2)),shownY=Number((note.y*100).toFixed(2));
  openModal(old?'编辑文字标注':'插入文字标注',`<label class="field"><span>标注内容（可换行）</span><textarea id="note-text" maxlength="300" rows="4" placeholder="例如：每 4 行两侧各减 1 针" aria-label="标注文字">${esc(note.text)}</textarea></label><div class="form-row" style="margin-top:16px">${numberField('note-size','字号',note.fontSize,'',{min:8,max:28,step:1})}<label class="field"><span>文字颜色</span><input type="color" id="note-color" value="${esc(note.color)}" aria-label="文字颜色"></label></div><div class="form-row">${numberField('note-x','横向位置',shownX,'%',{min:0,max:100,step:1})}${numberField('note-y','纵向位置',shownY,'%',{min:0,max:100,step:1})}</div><p class="hint">也可以回到版型上直接拖动。文字会保存在作品中，并随完整图解和版型标注图导出。</p>`,`<button class="btn" id="cancel-note">取消</button><button class="btn primary" id="save-note">${old?'保存修改':'添加到版型'}</button>`);
  $('#cancel-note').onclick=()=>$('#modal').close();
  $('#save-note').onclick=()=>safe(()=>{
    const text=$('#note-text').value.trim(),fontSize=Number($('#note-size').value),x=Number($('#note-x').value)===shownX?note.x:Number($('#note-x').value)/100,y=Number($('#note-y').value)===shownY?note.y:Number($('#note-y').value)/100,color=$('#note-color').value;
    if(!text)throw new Error('请先填写标注文字。');
    if(!Number.isFinite(fontSize)||fontSize<8||fontSize>28)throw new Error('字号请填写 8–28。');
    if(![x,y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('文字位置请填写 0–100%。');
    const before=snapshot(),next={id:old?.id||crypto.randomUUID(),garmentId:project.garmentId,text,fontSize,x,y,color};
    project.annotations=old?(project.annotations||[]).map(n=>n.id===old.id?next:n):[...(project.annotations||[]),next];selectedAnnotationId=next.id;
    $('#modal').close();commitGrid(before);render();toast(old?'文字标注已更新':'文字已加入版型，可以拖动调整位置');
  });
  $('#note-text').focus();
}
function confirmModal(title,body,onConfirm,label='确认'){const modal=openModal(title,`<p>${body}</p>`,`<button class="btn" id="cancel">保留当前</button><button class="btn primary" id="confirm">${label}</button>`);$('#cancel').onclick=()=>modal.close();$('#confirm').onclick=()=>{modal.close();safe(onConfirm);};}
function addColor(){openModal('调一抹自己的颜色',`<p>选一个喜欢的颜色，加入你的毛线调色盘。</p><div class="form-row"><label class="field"><span>选择线色</span><input type="color" id="custom-color" value="${selectedColor}" style="height:46px;width:100%;border:0;background:none"></label><label class="field"><span>颜色值</span><div class="input-wrap"><input id="color-hex" value="${selectedColor}" maxlength="7" aria-label="颜色十六进制值"></div></label></div>`,`<button class="btn primary" id="apply-color">加入调色盘</button>`);$('#custom-color').oninput=e=>$('#color-hex').value=e.target.value;$('#color-hex').oninput=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value))$('#custom-color').value=e.target.value;};$('#apply-color').onclick=()=>safe(()=>{const color=$('#color-hex').value.toLowerCase();if(!/^#[0-9a-f]{6}$/.test(color))throw new Error('请输入六位颜色值，例如 #bf6373。');if(project.palette.length>=32&&!project.palette.includes(color))throw new Error('调色盘最多可存放 32 种颜色。');project.palette=[...new Set([...project.palette,color])];selectedColor=color;$('#modal').close();updatePalette();save();});}
function cleanFilename(){return (project.name.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,60)||'编织作品');}
function downloadData(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function activateProjectId(id){
  finishEditing();syncActiveProject();workspaceState=activateProject(workspaceState,id);
  project=structuredClone(workspaceState.projects.find(p=>p.id===id).project);history=[];future=[];selectedPlacementId=null;selectedAnnotationId=null;positionGesture=null;tool='pen';selectedColor=project.palette[1]||project.palette[0];zoom=1;tab='shape';outlineMode=false;drawingMode=false;drawingSelected=-1;drawingPreview=null;$('#modal').close();persistWorkspace();render();
}
function projectsModal(){
  finishEditing();syncActiveProject();openModal('我的工程',projectManagerHTML(workspaceState));
  $('#new-project').onclick=newProjectModal;$('#restore').onclick=()=>$('#project-file').click();
  $('#backup-workspace').onclick=()=>{syncActiveProject();downloadData({format:'knit-workspace-v1',workspace:workspaceState},'织间-全部工程与提花库.json');toast('工程和提花库已开始下载');};
  $$('[data-open-project]').forEach(b=>b.onclick=()=>safe(()=>activateProjectId(b.dataset.openProject)));
  $$('[data-download-project]').forEach(b=>b.onclick=()=>{const entry=workspaceState.projects.find(p=>p.id===b.dataset.downloadProject);downloadData(entry.project,entry.project.name+'.knit.json');});
  $$('[data-delete-project]').forEach(b=>b.onclick=()=>{const entry=workspaceState.projects.find(p=>p.id===b.dataset.deleteProject);confirmModal('删除工程',`将先下载「${esc(entry.project.name)}」备份，再从工程列表移除。共享提花库会保留。`,()=>{downloadData(entry.project,entry.project.name+'.knit.json');workspaceState=removeProject(workspaceState,entry.id);project=structuredClone(workspaceState.projects.find(p=>p.id===workspaceState.activeProjectId).project);history=[];future=[];selectedPlacementId=null;selectedAnnotationId=null;tool='pen';persistWorkspace();render();projectsModal();},'备份并删除');});
}
function newProjectModal(){
  modalCleanup=openStyleProjectModal({palette:defaultPalette.slice(),openModal,onCreate:next=>{
    syncActiveProject();const id=crypto.randomUUID();workspaceState=upsertProject(workspaceState,id,next);activateProjectId(id);toast('新工程已创建，各裁片可独立调整');
  }});
}
function newMotifModal(){
  openModal('新建提花',`<label class="field"><span>提花名称</span><div class="input-wrap"><input id="new-motif-name" aria-label="新提花名称" maxlength="80" value="我的提花 ${workspaceState.motifs.length+1}"></div></label><div class="form-row" style="margin-top:16px">${numberField('new-motif-width','提花宽度',16,'针',{min:4,max:200,step:1})}${numberField('new-motif-height','提花高度',16,'行',{min:4,max:240,step:1})}</div><p>当前画布会换成空白提花，支持撤销。已保存的提花和衣片上的花样会保留。</p>`,`<button class="btn" id="cancel-new-motif">取消</button><button class="btn primary" id="create-motif">开始绘制</button>`);
  $('#cancel-new-motif').onclick=()=>$('#modal').close();$('#create-motif').onclick=()=>safe(()=>{const name=$('#new-motif-name').value.trim();if(!name)throw new Error('请填写提花名称。');const grid=createGrid(Number($('#new-motif-width').value),Number($('#new-motif-height').value),project.fabricColor||defaultPalette[0]);const before=snapshot();project.grid=grid;project.palette=defaultPalette.slice();project.palette[0]=project.fabricColor||defaultPalette[0];project.draftMotifId=null;project.draftMotifName=name;selectedColor=project.palette[1];tab='pattern';tool='pen';$('#modal').close();commitGrid(before);render();});
}
function saveMotifModal(asNew=false){
  const existing=!asNew&&workspaceState.motifs.find(m=>m.id===project.draftMotifId);
  openModal(existing?'保存提花修改':'保存独立提花',`<label class="field"><span>提花名称</span><div class="input-wrap"><input id="save-motif-name" aria-label="保存提花名称" maxlength="80" value="${esc(project.draftMotifName||'我的提花')}${asNew?' 副本':''}"></div></label><p>${project.grid[0].length} 针 × ${project.grid.length} 行。保存后可以在任意工程的「图案放置」中选择。衣片上已放好的花样保留原样。</p>`,`<button class="btn" id="cancel-save-motif">取消</button><button class="btn primary" id="confirm-save-motif">保存到提花库</button>`);
  $('#cancel-save-motif').onclick=()=>$('#modal').close();$('#confirm-save-motif').onclick=()=>safe(()=>{const motif={id:existing?.id||crypto.randomUUID(),name:$('#save-motif-name').value.trim(),grid:project.grid,palette:project.palette};workspaceState=upsertMotif(workspaceState,motif);project.draftMotifId=motif.id;project.draftMotifName=motif.name;history=[];future=[];$('#modal').close();save();render();toast('提花已独立保存到花样库');});
}
function motifLibraryModal(mode='edit'){
  openModal(mode==='place'?'选择要放置的提花':'我的提花库',motifLibraryHTML(workspaceState.motifs,mode));
  $('#import-motif').onclick=()=>$('#motif-file').click();$('#library-new-motif')?.addEventListener('click',newMotifModal);$('#go-draw-motif')?.addEventListener('click',()=>{$('#modal').close();setTab('pattern');});
  $$('[data-library-use]').forEach(b=>b.onclick=()=>safe(()=>{const motif=workspaceState.motifs.find(m=>m.id===b.dataset.libraryUse);if(mode==='place'){addPlacement(motif);return;}const before=snapshot();project.grid=structuredClone(motif.grid);project.palette=motif.palette.slice();project.draftMotifId=motif.id;project.draftMotifName=motif.name;selectedColor=motif.palette[1]||motif.palette[0];tab='pattern';tool='pen';$('#modal').close();commitGrid(before);render();toast('已打开提花，修改后点击保存提花');}));
  $$('[data-library-download]').forEach(b=>b.onclick=()=>{const motif=workspaceState.motifs.find(m=>m.id===b.dataset.libraryDownload);downloadData({format:'knit-motif-v1',motif},motif.name+'.knit-motif.json');});
  $$('[data-library-remove]').forEach(b=>b.onclick=()=>{const motif=workspaceState.motifs.find(m=>m.id===b.dataset.libraryRemove);confirmModal('从提花库移除',`将先下载「${esc(motif.name)}」备份，再从库中移除。已经放到衣片上的提花仍会保留。`,()=>{downloadData({format:'knit-motif-v1',motif},motif.name+'.knit-motif.json');workspaceState=removeMotif(workspaceState,motif.id);save();render();motifLibraryModal(mode);},'备份并移除');});
}
function selectedPlacement(){return (project.motifPlacements||[]).find(p=>p.id===selectedPlacementId&&p.garmentId===project.garmentId);}
function selectedPlacementBounds(){const p=selectedPlacement();return p?{x:chart.width-p.stitch-p.grid[0].length+1,y:chart.height-p.row-p.grid.length+1,width:p.grid[0].length,height:p.grid.length}:null;}
function addPlacement(motif){
  if((project.motifPlacements||[]).length>=100)throw new Error('每个工程最多放置 100 个提花。');
  const before=snapshot(),next={...structuredClone(motif),id:crypto.randomUUID(),motifId:motif.id,garmentId:project.garmentId,stitch:Math.max(1,Math.floor((chart.width-motif.grid[0].length)/2)+1),row:Math.max(1,Math.floor((chart.height-motif.grid.length)/2)+1),transparentBackground:true,flipX:false,flipY:false};
  project.motifPlacements=[...(project.motifPlacements||[]),next];project.arrangement='custom';selectedPlacementId=next.id;tab='chart';tool='position';$('#modal').close();commitGrid(before);render();toast('提花已加入：拖动花样或填写针行位置');
}
function updatePlacement(values){const before=snapshot();project.motifPlacements=project.motifPlacements.map(p=>p.id===selectedPlacementId?{...p,...values}:p);commitGrid(before);render();}
function refreshPlacementPanel(){const el=$('.placement-section');if(el){el.outerHTML=placementSection(project,selectedPlacementId);bindPlacements();}}
function bindPlacements(){
  $('#placement-left')?.addEventListener('change',e=>{finishEditing();const before=snapshot();project.placement=e.target.value;commitGrid(before);render();});
  if($('[data-action="choose-placement"]'))$('[data-action="choose-placement"]').onclick=()=>motifLibraryModal('place');
  $$('[data-select-placement]').forEach(b=>b.onclick=()=>{finishEditing();selectedPlacementId=b.dataset.selectPlacement;tool='position';render();});
  for(const [id,key,max] of [['placement-row','row',600],['placement-stitch','stitch',400]])$('#'+id)?.addEventListener('change',e=>safe(()=>{finishEditing();const value=Number(e.target.value);if(!Number.isInteger(value)||value<1||value>max){e.target.value=selectedPlacement()[key];throw new Error(`请填写 1–${max} 的整数。`);}updatePlacement({[key]:value});}));
  $('#placement-transparent')?.addEventListener('change',e=>updatePlacement({transparentBackground:e.target.checked}));
  $('#fabric-color')?.addEventListener('change',e=>{const before=snapshot();project.fabricColor=e.target.value;commitGrid(before);render();});
  $('#arrangement-mode')?.addEventListener('change',e=>{const before=snapshot();project.arrangement=e.target.value;commitGrid(before);render();});
  $$('[data-placement-action]').forEach(b=>b.onclick=()=>safe(()=>{finishEditing();const p=selectedPlacement();if(!p)return;const action=b.dataset.placementAction;if(action==='move'){tool='position';render();return;}if(action==='flip'){updatePlacement({flipX:!p.flipX});return;}const before=snapshot();if(action==='duplicate'){if(project.motifPlacements.length>=100)throw new Error('每个工程最多放置 100 个提花。');const copy={...structuredClone(p),id:crypto.randomUUID(),stitch:Math.min(400,p.stitch+2),row:Math.min(600,p.row+2)};project.motifPlacements.push(copy);selectedPlacementId=copy.id;tool='position';}else if(action==='remove'){project.motifPlacements=project.motifPlacements.filter(v=>v.id!==p.id);selectedPlacementId=null;tool='pen';}else if(action==='front')project.motifPlacements=[...project.motifPlacements.filter(v=>v.id!==p.id),p];commitGrid(before);render();}));
}
function startPosition(point){const before=snapshot(),p=selectedPlacement();if(!p){toast('请先从左侧列表选择一个已放置的提花。');return;}const bounds=selectedPlacementBounds();positionGesture={before,point,stitch:p.stitch,row:p.row};if(point.x<bounds.x||point.x>=bounds.x+bounds.width||point.y<bounds.y||point.y>=bounds.y+bounds.height){p.stitch=chart.width-point.x;p.row=chart.height-point.y;positionGesture.stitch=p.stitch;positionGesture.row=p.row;computeChart();}}
function movePosition(point){if(!positionGesture)return;const p=selectedPlacement();p.stitch=Math.max(1,Math.min(400,positionGesture.stitch-(point.x-positionGesture.point.x)));p.row=Math.max(1,Math.min(600,positionGesture.row-(point.y-positionGesture.point.y)));computeChart();}
function commitPosition(){if(!positionGesture)return;const before=positionGesture.before;positionGesture=null;commitGrid(before);refreshPlacementPanel();}
function cancelPosition(){if(!positionGesture)return;restoreSnapshot(positionGesture.before);positionGesture=null;computeChart();}
function downloadJSON(){finishEditing();project=syncActivePiece(project);const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=cleanFilename()+'.knit.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('作品备份已下载，可在这里重新导入');}
function exportModal(){
  finishEditing();project=syncActivePiece(project);computeChart();const count=project.pieces.length,label=activePieceLabel();
  const options=[['text','file','文字编织图解','逐行中文教程 · 可选从上往下或从下往上'],['all-png','image','全部裁片高清图片 PNG','全部衣身、袖子等裁片合并展示'],['all-svg','file','全部裁片图解 SVG','保留各片配色、针法符号、图例与标注'],['all-shape','shirt','全部裁片版型 SVG','全部裁片尺寸、肩宽与文字分组展示'],['all-print','print','打印全部裁片 / PDF','裁片对照 + 每片总览、分页和逐行针数'],['png','image','当前'+label+'图片 PNG','只导出正在编辑的裁片'],['svg','file','当前'+label+'图解 SVG','单片矢量网格'],['shape','shirt','当前'+label+'版型 SVG','单片尺寸与文字标注'],['motif','grid','仅导出提花图案','保存当前花样的 SVG 网格'],['json','save','可编辑工程备份','包含全部裁片、参数、提花、针法与标注']];
  openModal('把灵感带去编织',`<p style="margin-top:0">${esc(project.name)}<br>${count} 个裁片 · 当前编辑${esc(label)}</p>${project.pieces.some(piece=>piece.outlineDrawing)?'<p class="draft-notice">有尚未应用的轮廓草稿：图解与版型导出使用已应用轮廓；工程备份会同时保存绘制草稿。</p>':''}<div class="export-options">${options.map(([id,i,title,detail])=>`<button class="export-option" data-export="${id}">${icon(i,22)}<span>${esc(title)}<small>${esc(detail)}</small></span><span class="arrow">${icon('chevron',14)}</span></button>`).join('')}</div>`);
  $$('[data-export]').forEach(b=>b.onclick=async()=>{const kind=b.dataset.export;b.disabled=true;try{
    if(kind==='text'){modalCleanup=openWrittenPatternExport({project,openModal,filename:cleanFilename(),toast});return;}
    if(kind==='json')downloadJSON();
    else if(kind==='all-print'){if(!printAllPieces(project))throw new Error('打印窗口被浏览器拦截，请允许此页面打开弹出窗口后重试。');}
    else if(kind.startsWith('all-')){const svg=buildAllPiecesSVG(project,kind==='all-shape'?'shape':'chart');if(kind==='all-png'){toast('正在生成全部裁片图解…');await downloadPNG(svg,cleanFilename()+'-全部裁片.png');}else downloadSVG(svg,cleanFilename()+(kind==='all-shape'?'-全部版型.svg':'-全部裁片.svg'));}
    else if(kind==='shape')downloadSVG(buildAnnotatedShapeSVG(project,chart,label+' · '+getGarment(project.garmentId).name),cleanFilename()+'-'+label+'-版型.svg');
    else if(kind==='motif')downloadSVG(buildPatternSVG({...project,name:project.draftMotifName||project.name}),cleanFilename()+'-提花.svg');
    else {const svg=buildChartSVG(project,chart,label+' · '+getGarment(project.garmentId).name);if(kind==='png'){toast('正在生成高清图解…');await downloadPNG(svg,cleanFilename()+'-'+label+'.png');}else downloadSVG(svg,cleanFilename()+'-'+label+'.svg');}
    if(kind!=='all-print'&&kind!=='json')toast('图解已生成并开始下载');
  }catch(e){toast(e.message||'导出失败，请重试');}finally{b.disabled=false;}});
}
function helpModal(){openModal('一针一线，从这里开始',`<div class="help-steps"><div class="help-step"><div><b>新建自己的工程</b><span>点击顶部「新建工程」，填写名称，按分类选择整件衣服款式、尺寸和试织密度，创建前可预览全部裁片。「我的工程」可以切换不同工程，已有内容会保留。</span></div></div><div class="help-step"><div><b>保存多个独立提花</b><span>在提花设计页新建花样，绘制或导入图片后点击「保存提花」。提花库可保存多个花样，支持单独下载与导入。</span></div></div><div class="help-step"><div><b>为每一格填上心意</b><span>画笔 B、填充 F、橡皮擦 E、吸色 I；支持连续拖动画线、左右对称和 Ctrl+Z 撤销。橡皮擦填入调色盘第一个底色。</span></div></div><div class="help-step"><div><b>让版型合身</b><span>提供 16 种整件款式和 31 种裁片模板，按套衫、马甲、开衫等分类。开衫包含独立左右门襟，可调整宽度和长度。填写平铺尺寸和每 10 cm 试织密度。点击「添加裁片」自由组合前片、后片、左右袖等，最多 12 片；也可重命名、复制和移除，均支持撤销。全部裁片在同页显示，点击编辑按钮选择裁片。肩宽参与轮廓与针数计算，各片尺寸分别保存；点击版型尺寸也可修改。选择新版型时仅调整当前片。点击「插入文字」添加多行备注，拖动定位、双击编辑。</span></div></div><div class="help-step"><div><b>安排花样的位置</b><span>在编织图解的「图案放置」中，从提花库添加多个花样。拖动定位，或填写花样右下角的起始针行；支持重复添加、翻转和移除。手绘显示在所有提花上层。在「编织针法」选择常用针法后，点击或拖动绘入网格；针法与颜色独立，擦除针法会保留颜色。符号按正面效果标注，导出附图例，增减针符号不会自动改变裁片针数。查看每行有效针数，导出 PNG、SVG 或打印为 PDF。图解从底部第 1 行开始，针位从右向左编号；平织往返方向请按自己的编织方式阅读。</span></div></div></div><p>这些版型提供平面裁片与提花排布参考。缝合、收放针织法、袜跟和分指连接等工艺，仍需结合实际小样安排。</p>`);}
async function loadImage(file){
  if(!file)return;
  if(!file.type.startsWith('image/'))return toast('请选择 JPG、PNG 或 WebP 等图片文件。');
  if(file.size>20*1024*1024)return toast('图片需小于 20MB。');
  const revision=++imageLoadRevision,url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
    if(revision!==imageLoadRevision){URL.revokeObjectURL(url);return;}
    if(uploadUrl)URL.revokeObjectURL(uploadUrl);
    uploadedImage=img;uploadUrl=url;uploadedImageName=file.name;importSettings=null;
    render();safe(imageModal);
  };
  img.onerror=()=>{URL.revokeObjectURL(url);if(revision===imageLoadRevision)toast('图片无法读取，请换一张 PNG 或 JPG 图片。');};
  img.src=url;
}
function imageModal(){
  if(!uploadedImage)return;
  modalCleanup=openImageImport({image:uploadedImage,url:uploadUrl,name:uploadedImageName,initialWidth:project.grid[0].length,background:project.palette[0],settings:importSettings,openModal,
    onSettings:value=>{importSettings=value;},
    onApply:(value,name)=>{tab='pattern';replaceGrid(value.grid,value.palette,name);selectedColor=value.palette[1]||value.palette[0];updatePalette();toast(`已将选区生成为 ${value.grid[0].length} × ${value.grid.length} 格提花，可继续绘制并保存`);},
    onError:error=>toast(error.message)});
}
$('#image-file').addEventListener('change',e=>{loadImage(e.target.files[0]);e.target.value='';});
$('#motif-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>3*1024*1024)return toast('提花文件需小于 3MB。');try{const motif=parseMotifFile(JSON.parse(await file.text()));motif.id=crypto.randomUUID();workspaceState=upsertMotif(workspaceState,motif);save();render();motifLibraryModal('edit');toast('独立提花已导入');}catch(error){toast(error instanceof SyntaxError?'文件不是有效的提花备份。':error.message);}});
$('#project-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>100*1024*1024)return toast('备份文件需小于 100MB。');try{
  const value=JSON.parse(await file.text());
  if(value.format==='knit-workspace-v1'){
    const incoming=sanitizeWorkspace(value.workspace);confirmModal('导入全部工程与提花',`将添加 ${incoming.projects.length} 个工程和 ${incoming.motifs.length} 个提花，已有内容会保留。`,()=>{syncActiveProject();let candidate=workspaceState;const motifIds=new Map();for(const motif of incoming.motifs){const id=crypto.randomUUID();motifIds.set(motif.id,id);candidate=upsertMotif(candidate,{...motif,id});}let openId;for(const entry of incoming.projects){const id=crypto.randomUUID(),next=structuredClone(entry.project);next.draftMotifId=motifIds.get(next.draftMotifId)||null;next.motifPlacements=next.motifPlacements.map(p=>({...p,motifId:motifIds.get(p.motifId)||p.motifId}));next.pieces=next.pieces.map(piece=>({...piece,motifPlacements:piece.motifPlacements.map(p=>({...p,motifId:motifIds.get(p.motifId)||p.motifId}))}));candidate=upsertProject(candidate,id,next);if(entry.id===incoming.activeProjectId)openId=id;}workspaceState=candidate;activateProjectId(openId);toast('工程和提花库已导入');},'添加到工程库');
  }else{
    const next=sanitizeProject(value);confirmModal('导入工程',`将「${esc(next.name)}」添加到工程库。当前工程会保留。`,()=>{syncActiveProject();const id=crypto.randomUUID();workspaceState=upsertProject(workspaceState,id,next);activateProjectId(id);toast('工程已导入，可以继续编辑');},'添加并打开');
  }
}catch(error){toast(error instanceof SyntaxError?'文件不是有效的工程备份。':error.message);}});
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||$('#modal').open)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();downloadJSON();return;}if(tab!=='shape'&&!e.ctrlKey&&!e.metaKey){const tools={b:'pen',f:'fill',e:'eraser',i:'dropper',v:'position',s:'stitch'};if(tools[e.key.toLowerCase()]&&(!['v','s'].includes(e.key.toLowerCase())||tab==='chart')){selectDrawingTool(tools[e.key.toLowerCase()]);}}});
window.addEventListener('pagehide',()=>{finishEditing();persistWorkspace();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){finishEditing();persistWorkspace();}});
function offlineHelp(){finishEditing();openOfflineHelp({support:offlineSupport,openModal,onBackup:projectsModal});}
const offlineSupport=createOfflineSupport({onChange:state=>{renderOfflineStatus($('#offline-status'),state,offlineHelp);updateOfflineHelp(state);}});
try{render();if(loadWarning)toast(loadWarning);void offlineSupport.prepare();}catch(e){$('#app').innerHTML=`<div class="model-error">作品未能打开：${esc(e.message)}<br>请刷新页面重试，或先保留浏览器数据以便恢复作品。</div>`;}

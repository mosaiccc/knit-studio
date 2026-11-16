import {normalizeCrop,cropToPixels} from './core/image-crop.js';
import {renderCropOverlay,bindCropEditor} from './image-crop-editor.js';
import {convertImagePixels} from './core/image-import.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const field=(id,label,value,min,max,unit)=>`<label class="field"><span>${label}</span><div class="input-wrap"><input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="1" aria-label="${label}"><small>${unit}</small></div></label>`;

/** A session-only source image; applying is the only operation that changes a project. */
export function openImageImport({image,url,name='',initialWidth=64,background='#f5efe3',settings=null,openModal,onApply,onSettings,onError}){
  const sourceWidth=image.naturalWidth||image.width,sourceHeight=image.naturalHeight||image.height;
  if(!sourceWidth||!sourceHeight)throw new Error('图片尚未读取完成。');
  let crop=normalizeCrop(settings?.crop||{x:0,y:0,width:1,height:1},1/sourceWidth,1/sourceHeight);
  let cropTool='select',timer=null,closed=false,result=null,lastSignature='',controller=null;
  const initialW=clamp(settings?.width||Math.max(48,initialWidth),4,200);
  const initialH=clamp(settings?.height||Math.round(initialW*crop.height*sourceHeight/(crop.width*sourceWidth)),4,240);
  const modal=openModal('框选提花 · 从照片中取出一个花样',`
    <p class="import-intro">在左侧拖动框出小羊，只把选框里的部分变成提花。拖动边角可微调，右侧查看转换结果。</p>
    <div class="crop-import-grid">
      <section class="crop-source-panel" aria-label="原图框选">
        <div class="import-panel-heading"><h3>1. 框出想要的花样</h3><span>${sourceWidth} × ${sourceHeight} 像素</span></div>
        <div class="crop-tools" role="group" aria-label="图片选区工具">
          <button class="btn small selected" id="crop-select" aria-pressed="true">框选范围</button>
          <button class="btn small" id="crop-move" aria-pressed="false">移动选区</button>
          <button class="btn small" id="crop-reset">选择整张图片</button>
          <label class="crop-zoom-label">原图缩放<select id="crop-zoom" aria-label="原图缩放"><option value="1">100%</option><option value="2">200%</option><option value="3">300%</option></select></label>
        </div>
        <div class="crop-image-viewport"><svg id="image-crop-svg" viewBox="0 0 ${sourceWidth} ${sourceHeight}" width="${sourceWidth}" height="${sourceHeight}" role="group" aria-label="拖动框选图片中的提花" tabindex="0"><image href="${esc(url)}" width="${sourceWidth}" height="${sourceHeight}"/><g id="image-crop-overlay"></g></svg></div>
        <div class="crop-coordinates">
          ${field('crop-x','选区左侧',0,0,sourceWidth-1,'px')}${field('crop-y','选区顶部',0,0,sourceHeight-1,'px')}
          ${field('crop-width','选区宽度',sourceWidth,1,sourceWidth,'px')}${field('crop-height','选区高度',sourceHeight,1,sourceHeight,'px')}
        </div>
        <p class="hint" id="crop-summary"></p>
        <p class="hint">框内是要导入的内容，框外不会出现在提花画布。选中边角后也可用方向键微调。</p>
      </section>
      <section class="crop-result-panel" aria-label="选区提花预览">
        <div class="import-panel-heading"><h3>2. 查看提花效果</h3><span id="import-preview-size"></span></div>
        <div class="import-result-stage"><canvas id="import-result-canvas" role="img" aria-label="选框内图案的像素预览"></canvas></div>
        <div class="form-row import-grid-fields">${field('import-width','横向针数',initialW,4,200,'针')}${field('import-height','纵向行数',initialH,4,240,'行')}</div>
        <div class="import-options"><label class="field"><span>限制颜色数量</span><select id="import-colors" aria-label="限制颜色数量">${[2,3,4,6,8,12,16,24,32].map(n=>`<option value="${n}" ${n===(settings?.maxColors||6)?'selected':''}>${n} 种线色</option>`).join('')}</select></label>
          <div class="import-toggles"><label class="toggle-label"><input type="checkbox" id="keep-ratio" ${settings?.keepRatio===false?'':'checked'}>保持选区比例</label><label class="toggle-label"><input type="checkbox" id="preserve-details" ${settings?.preserveDetails===false?'':'checked'}>保留小面积深色细节</label></div>
        </div>
        <p id="import-ratio-warning" class="hint" role="status"></p>
        <div id="import-palette" class="import-palette" aria-label="识别到的线色"></div>
        <p id="import-status" role="status" aria-live="polite"></p>
        <label class="field"><span>新提花名称</span><input id="import-name" class="import-name" aria-label="新提花名称" maxlength="80" value="${esc(settings?.name||'图片选区提花')}"></label>
      </section>
    </div>
    <p class="import-footnote">${name?`原图：${esc(name)}。`:''}图片在本机处理。先框紧小羊，再调针数与颜色数；照片中的织纹、光影可在画布中继续修整。应用会建立新的提花草稿，已保存的花样保留，支持撤销。</p>`,
    '<button class="btn" id="cancel-import">取消</button><button class="btn primary" id="apply-import" disabled>将选区应用到提花画布</button>');
  modal.classList.add('image-import-modal');
  const $=selector=>modal.querySelector(selector),svg=$('#image-crop-svg');
  const getOptions=()=>({width:Number($('#import-width').value),height:Number($('#import-height').value),maxColors:Number($('#import-colors').value),background,preserveDetails:$('#preserve-details').checked});
  function remember(){onSettings?.({...getOptions(),crop:structuredClone(crop),keepRatio:$('#keep-ratio').checked,name:$('#import-name').value.trim()||'图片选区提花'});}
  function ratioHeight(final=false){if($('#keep-ratio').checked){const pixels=cropToPixels(crop,sourceWidth,sourceHeight),width=Number($('#import-width').value);if(!Number.isInteger(width)||width<4||width>200)return;const height=Math.round(width*pixels.height/pixels.width);$('#import-height').value=clamp(height,4,240);if(final&&(height<4||height>240)){$('#keep-ratio').checked=false;$('#import-ratio-warning').textContent='按当前针数保持比例会超出 4–240 行，已关闭比例锁定。请调整针数或选框，避免图案变形。';}else $('#import-ratio-warning').textContent='';}}
  function paintOverlay(){
    const activeLabel=document.activeElement?.closest?.('[data-crop-handle],[data-crop-selection]')?.getAttribute('aria-label');
    $('#image-crop-overlay').innerHTML=renderCropOverlay(crop,{width:sourceWidth,height:sourceHeight});
    if(activeLabel){const handle=[...svg.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===activeLabel);handle?.focus({preventScroll:true});}
    const pixels=cropToPixels(crop,sourceWidth,sourceHeight);
    for(const key of ['x','y','width','height'])$('#crop-'+key).value=pixels[key];
    const whole=pixels.x===0&&pixels.y===0&&pixels.width===sourceWidth&&pixels.height===sourceHeight;
    $('#crop-summary').textContent=whole?'当前选择整张图片 · 可拖动框出一只小羊':`仅转换选区：${pixels.width} × ${pixels.height} 像素 · 左 ${pixels.x}，上 ${pixels.y}`;
    $('#apply-import').textContent=whole?'将整张图片应用到提花画布':'将选区应用到提花画布';
  }
  function showError(error){result=null;$('#apply-import').disabled=true;$('#import-status').textContent=error.message||'图片转换失败，请调整选区重试。';$('#import-status').classList.add('error');}
  function renderResult(value,options){
    const canvas=$('#import-result-canvas');canvas.width=options.width;canvas.height=options.height;
    const ctx=canvas.getContext('2d');
    value.grid.forEach((row,y)=>row.forEach((color,x)=>{ctx.fillStyle=color;ctx.fillRect(x,y,1,1);}));
    canvas.style.aspectRatio=`${options.width} / ${options.height}`;
    canvas.style.width='100%';canvas.style.height='100%';
    $('#import-preview-size').textContent=`${options.width} 针 × ${options.height} 行`;
    $('#import-palette').innerHTML=value.palette.map(color=>`<span class="import-color"><i style="background:${color}"></i><code>${color.toUpperCase()}</code></span>`).join('');
    $('#import-status').classList.remove('error');
    $('#import-status').textContent=`已识别 ${value.palette.length} 种线色。${options.preserveDetails?'已开启深色细节保留。':''}`;
    canvas.setAttribute('aria-label',`选框内图案的像素预览，${options.width} 针、${options.height} 行、${value.palette.length} 色`);
    $('#apply-import').disabled=false;
  }
  function convert(){
    clearTimeout(timer);timer=null;if(closed)return null;
    try{
      const options=getOptions();
      if(!Number.isInteger(options.width)||options.width<4||options.width>200||!Number.isInteger(options.height)||options.height<4||options.height>240)throw new Error('网格请填写 4–200 针、4–240 行的整数。');
      const pixels=cropToPixels(crop,sourceWidth,sourceHeight),signature=JSON.stringify({pixels,options});
      if(result&&signature===lastSignature){$('#apply-import').disabled=false;remember();return result;}
      const scale=Math.min(1,1024/Math.max(pixels.width,pixels.height),Math.sqrt(1000000/(pixels.width*pixels.height)));
      const sample=document.createElement('canvas');sample.width=Math.max(1,Math.floor(pixels.width*scale));sample.height=Math.max(1,Math.floor(pixels.height*scale));
      const context=sample.getContext('2d',{willReadFrequently:true});
      context.drawImage(image,pixels.x,pixels.y,pixels.width,pixels.height,0,0,sample.width,sample.height);
      result=convertImagePixels(context.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height,options);
      lastSignature=signature;renderResult(result,options);remember();return result;
    }catch(error){showError(error);return null;}
  }
  function queuePreview(){clearTimeout(timer);$('#apply-import').disabled=true;$('#import-status').textContent='正在更新选区预览…';timer=setTimeout(convert,180);}
  function updateCrop(next,commit=false){crop=normalizeCrop(next,1/sourceWidth,1/sourceHeight);paintOverlay();ratioHeight(commit);$('#apply-import').disabled=true;if(commit)convert();else queuePreview();}
  controller=bindCropEditor(svg,{width:sourceWidth,height:sourceHeight,getCrop:()=>crop,getTool:()=>cropTool,onChange:next=>updateCrop(next),onCommit:next=>updateCrop(next,true),onError:showError});
  for(const tool of ['select','move'])$('#crop-'+tool).onclick=()=>{controller.cancelPending();cropTool=tool;for(const other of ['select','move']){$('#crop-'+other).classList.toggle('selected',tool===other);$('#crop-'+other).setAttribute('aria-pressed',String(tool===other));}svg.classList.toggle('move-selection',tool==='move');};
  $('#crop-reset').onclick=()=>{controller.cancelPending();updateCrop({x:0,y:0,width:1,height:1},true);};
  $('#crop-zoom').onchange=()=>{const zoom=Number($('#crop-zoom').value);svg.style.width=`${zoom*100}%`;svg.style.height=`${zoom*360}px`;const viewport=$('.crop-image-viewport'),matrix=svg.getScreenCTM();if(matrix){const point=svg.createSVGPoint();point.x=(crop.x+crop.width/2)*sourceWidth;point.y=(crop.y+crop.height/2)*sourceHeight;const screen=point.matrixTransform(matrix),rect=viewport.getBoundingClientRect();viewport.scrollLeft+=screen.x-rect.left-rect.width/2;viewport.scrollTop+=screen.y-rect.top-rect.height/2;}};
  for(const key of ['x','y','width','height'])$('#crop-'+key).onchange=()=>{
    const p=cropToPixels(crop,sourceWidth,sourceHeight),value=Number($('#crop-'+key).value);
    if(!Number.isInteger(value)){paintOverlay();return showError(new Error('选区坐标和大小请填写整数。'));}
    p[key]=value;p.x=clamp(p.x,0,sourceWidth-1);p.y=clamp(p.y,0,sourceHeight-1);p.width=clamp(p.width,1,sourceWidth-p.x);p.height=clamp(p.height,1,sourceHeight-p.y);
    controller.cancelPending();updateCrop({x:p.x/sourceWidth,y:p.y/sourceHeight,width:p.width/sourceWidth,height:p.height/sourceHeight},true);
  };
  $('#import-width').oninput=()=>{ratioHeight();queuePreview();};
  $('#import-width').onchange=()=>{ratioHeight(true);queuePreview();};
  $('#import-height').oninput=()=>{$('#keep-ratio').checked=false;$('#import-ratio-warning').textContent='';queuePreview();};
  $('#keep-ratio').onchange=()=>{$('#import-ratio-warning').textContent='';ratioHeight(true);queuePreview();};
  $('#import-colors').onchange=queuePreview;$('#preserve-details').onchange=queuePreview;
  $('#import-name').onchange=remember;
  $('#cancel-import').onclick=()=>modal.close();
  $('#apply-import').onclick=()=>{ratioHeight(true);const value=convert();if(!value)return;try{const motifName=$('#import-name').value.trim()||'图片选区提花';onApply(value,motifName);modal.close();}catch(error){showError(error);onError?.(error);}};
  function destroy(){if(closed)return;closed=true;clearTimeout(timer);controller?.destroy();modal.classList.remove('image-import-modal');modal.removeEventListener('close',destroy);}
  modal.addEventListener('close',destroy);
  paintOverlay();ratioHeight(true);convert();
  return destroy;
}

import {buildWrittenPattern} from './core/written-pattern.js';
import {buildWrittenHTML,downloadWrittenFile,escapeWrittenHTML as esc} from './written-pattern-view.js';

export function openWrittenPatternExport({project,openModal,filename,toast}){
  const source=structuredClone(project);
  const modal=openModal('文字编织图解',`
    <p class="written-intro">把当前图解整理成逐行教程。每个裁片分别平织，颜色、针法与行数取自你绘制的图解。</p>
    <div class="written-options">
      <label class="field"><span>编织方向</span><select id="written-direction" aria-label="文字图解编织方向"><option value="bottom-up">从下往上编织</option><option value="top-down">从上往下编织</option></select></label>
      <label class="field"><span>导出范围</span><select id="written-scope" aria-label="文字图解导出范围"><option value="all">全部裁片</option><option value="current">当前裁片</option></select></label>
      <label class="field"><span>第一行朝向</span><select id="written-first-side" aria-label="文字图解第一行朝向"><option value="rs">第一行织正面</option><option value="ws">第一行织反面</option></select></label>
      <button class="btn soft" id="written-generate">重新生成文字图解</button>
    </div>
    <p class="written-status" id="written-status" role="status" aria-live="polite"></p>
    <div class="written-colors" id="written-colors" aria-label="教程线色"></div>
    <details class="written-notes" id="written-notes" hidden><summary id="written-note-count"></summary><ul id="written-note-list"></ul></details>
    <label class="field written-preview-label"><span>文字教程预览 · 可以直接修改</span><textarea id="written-preview" aria-label="文字图解内容" spellcheck="false"></textarea></label>
    <p class="hint written-edit-note">下载会保留你修改的文字。更改选项后，点击“重新生成文字图解”会用新教程替换预览。领口分段、针数不匹配等需要补充的位置会在教程中标明。</p>
    `,`<button class="btn" id="written-html">下载可打印版 HTML</button><button class="btn primary" id="written-txt">下载文字图解 TXT</button>`);
  modal.classList.add('written-pattern-modal');
  const $=id=>modal.querySelector('#'+id);
  const controls=[$('written-direction'),$('written-scope'),$('written-first-side')];
  let result=null,stale=false,closed=false;
  function options(){return {direction:controls[0].value,scope:controls[1].value,firstSide:controls[2].value};}
  function disableDownloads(disabled){$('written-html').disabled=disabled;$('written-txt').disabled=disabled;}
  function generate(){
    try{
      result=buildWrittenPattern(source,options());stale=false;
      $('written-preview').value=result.text;
      $('written-status').classList.remove('error');
      $('written-status').textContent=`已生成 ${result.pieces.length} 个裁片 · ${result.direction==='top-down'?'从上往下':'从下往上'} · 往返平织`;
      $('written-colors').innerHTML=result.colors.slice(0,32).map(c=>`<span><i style="background:${/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#eeeeee'}"></i>${esc(c.letter)} · ${esc(c.name)}</span>`).join('')+(result.colors.length>32?'<span>完整线色表见下方教程</span>':'');
      const warnings=result.warnings||[];
      $('written-notes').hidden=!warnings.length;
      $('written-note-count').textContent=`${warnings.length} 处编织安排需确认（正文中有说明）`;
      $('written-note-list').innerHTML=warnings.slice(0,8).map(item=>`<li>${esc(item)}</li>`).join('')+(warnings.length>8?'<li>其余说明见下方对应裁片和行号。</li>':'');
      disableDownloads(false);
    }catch(error){result=null;$('written-status').classList.add('error');$('written-status').textContent=error.message||'文字图解生成失败，请检查当前图解。';disableDownloads(true);}
  }
  for(const control of controls)control.addEventListener('change',()=>{stale=true;disableDownloads(true);$('written-status').textContent='选项已更改，请点击“重新生成文字图解”。现有文字暂时保留。';});
  $('written-generate').onclick=generate;
  function download(format){
    if(!result||stale)return;
    const text=$('written-preview').value;
    if(!text.trim()){toast('请先填写或重新生成文字教程。');return;}
    const name=`${filename}-文字图解-${result.direction==='top-down'?'从上往下':'从下往上'}-${result.scope==='current'?'当前裁片':'全部裁片'}`;
    downloadWrittenFile(format==='txt'?text:buildWrittenHTML({...result,text}),name,format);
    toast('文字图解已生成并开始下载');
  }
  $('written-html').onclick=()=>download('html');$('written-txt').onclick=()=>download('txt');
  const handleClose=()=>{if(!modal.open)destroy();};
  function destroy(){if(closed)return;closed=true;modal.classList.remove('written-pattern-modal');modal.removeEventListener('close',handleClose);}
  modal.addEventListener('close',handleClose);generate();return destroy;
}

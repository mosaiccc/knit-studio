import {CLOTHING_STYLES,getClothingStyle,previewStylePieces,createStyleProject} from './core/clothing-styles.js';
import {calculateDimensions} from './core/garments.js';
import {miniGarmentSVG} from './garment-picker.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=value=>Number(value.toFixed(2));
const field=(id,label,value,unit='cm',max=300)=>`<label class="field"><span>${label}</span><div class="input-wrap"><input id="${id}" type="number" aria-label="${label}" value="${value}" min="0.1" max="${max}" step="0.5"><small>${unit}</small></div></label>`;

/** Select an outfit once; every generated piece then uses the existing independent editor. */
export function openStyleProjectModal({palette,openModal,onCreate}){
  let selected='round-pullover',category=getClothingStyle(selected).category,closed=false;
  const categories=[...new Set(CLOTHING_STYLES.map(s=>s.category))];
  const modal=openModal('新建工程 · 选择衣服款式',`
    <label class="field new-style-name"><span>工程名称</span><div class="input-wrap"><input id="new-project-name" aria-label="新工程名称" maxlength="80" value="我的新毛衣"></div></label>
    <div class="style-create-layout">
      <section class="style-choose" aria-label="选择衣服款式">
        <h3>衣服款式</h3><div class="style-categories" role="group" aria-label="衣服款式分类">${categories.map(c=>`<button class="btn small" data-style-category="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>
        <div class="style-card-grid" id="new-style-list"></div>
      </section>
      <section class="style-details" aria-label="初始尺寸与裁片">
        <h3 id="new-style-title"></h3><p class="style-description" id="new-style-description"></p>
        <div class="form-row">${field('new-project-width','衣身平铺宽度',48)}${field('new-project-height','衣服长度',58)}</div>
        <div id="new-style-placket" hidden>${field('new-project-placket','门襟宽度',3)}<p class="hint">衣身宽度含扣合后的门襟。门襟长度按前片开口边估算，创建后可单独调整；扣眼请自行标记。</p></div>
        <div class="form-row">${field('new-project-stitches','每 10 cm 针数',22,'针',100)}${field('new-project-rows','每 10 cm 行数',30,'行',100)}</div>
        <p class="style-result" id="new-style-status" role="status" aria-live="polite"></p>
        <div class="style-piece-preview" id="new-style-pieces" aria-label="将创建的裁片"></div>
      </section>
    </div>
    <p class="hint style-create-note">创建后，各裁片的尺寸、提花、针法和文字都可独立编辑。袖山、门襟和连接处仍可按试织结果调整。</p>
    `,`<button class="btn" id="cancel-new-project">取消</button><button class="btn primary" id="create-project">创建工程</button>`);
  modal.classList.add('style-project-modal');
  const $=id=>modal.querySelector('#'+id);
  function parameters(){return {styleId:selected,name:$('new-project-name').value.trim(),width:Number($('new-project-width').value),height:Number($('new-project-height').value),placketWidth:Number($('new-project-placket').value),gauge:{stitches:Number($('new-project-stitches').value),rows:Number($('new-project-rows').value)},palette};}
  function refreshPreview(){
    try{
      const input=parameters();
      if(![input.gauge.stitches,input.gauge.rows].every(value=>Number.isFinite(value)&&value>=.1&&value<=100))throw new Error('每 10 cm 密度请填写 0.1–100 之间的数值。');
      const pieces=previewStylePieces(selected,input);
      const preview=pieces.map(piece=>({...piece,dimensions:calculateDimensions(piece.measurements,input.gauge)}));
      $('new-style-pieces').innerHTML=preview.map(p=>`<article>${miniGarmentSVG(p.garmentId,p.measurements,55,60)}<strong>${esc(p.label)}</strong><span>${n(p.measurements.width)} × ${n(p.measurements.height)} cm</span><small>${p.dimensions.stitches} 针 × ${p.dimensions.rows} 行</small></article>`).join('');
      $('new-style-status').textContent=`将创建 ${pieces.length} 个独立裁片：${pieces.map(p=>p.label).join('、')}`;
      $('new-style-status').classList.remove('error');$('create-project').disabled=false;
    }catch(error){$('new-style-status').textContent=error.message||'请检查初始尺寸。';$('new-style-status').classList.add('error');$('new-style-pieces').innerHTML='';$('create-project').disabled=true;}
  }
  function showStyle(resetDimensions=true){
    const style=getClothingStyle(selected),hasPlacket=style.pieces.some(p=>p.role==='placket');
    $('new-style-title').textContent=style.name;$('new-style-description').textContent=style.description;
    $('new-style-placket').hidden=!hasPlacket;
    const bodyStyle=['套衫','马甲','开衫','夏季上衣'].includes(style.category);
    const widthLabel=bodyStyle?(hasPlacket?'衣身平铺宽度（含扣合门襟）':'衣身平铺宽度'):'裁片宽度';
    const heightLabel=bodyStyle?'衣服长度':'裁片长度';
    for(const [id,label] of [['new-project-width',widthLabel],['new-project-height',heightLabel]]){const input=$(id);input.setAttribute('aria-label',label);input.closest('label').querySelector('span').textContent=label;}
    if(resetDimensions){$('new-project-width').value=style.defaults.width;$('new-project-height').value=style.defaults.height;$('new-project-placket').value=style.defaults.placketWidth||3;}
    for(const button of modal.querySelectorAll('[data-style-choice]')){const active=button.dataset.styleChoice===selected;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
    refreshPreview();
  }
  function showCategory(){
    const styles=CLOTHING_STYLES.filter(s=>s.category===category);
    if(!styles.some(s=>s.id===selected))selected=styles[0].id;
    $('new-style-list').innerHTML=styles.map(style=>`<button class="style-choice" data-style-choice="${style.id}" aria-label="选择${esc(style.name)}" aria-pressed="${style.id===selected}"><span class="style-choice-drawing">${miniGarmentSVG(style.pieces[0].garmentId)}</span><strong>${esc(style.name)}</strong><small>${style.pieces.length} 片 · ${esc(style.pieces.map(p=>p.label).join(' / '))}</small></button>`).join('');
    for(const button of modal.querySelectorAll('[data-style-category]')){const active=button.dataset.styleCategory===category;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
    for(const button of modal.querySelectorAll('[data-style-choice]'))button.onclick=()=>{selected=button.dataset.styleChoice;showStyle();};
    showStyle();
  }
  for(const button of modal.querySelectorAll('[data-style-category]'))button.onclick=()=>{category=button.dataset.styleCategory;showCategory();};
  for(const id of ['new-project-width','new-project-height','new-project-placket','new-project-stitches','new-project-rows'])$(id).addEventListener('input',refreshPreview);
  $('cancel-new-project').onclick=()=>modal.close();
  $('create-project').onclick=()=>{try{onCreate(createStyleProject(parameters()));}catch(error){$('new-style-status').textContent=error.message||'工程创建失败，请检查输入。';$('new-style-status').classList.add('error');}};
  const handleClose=()=>{if(!modal.open)destroy();};
  function destroy(){if(closed)return;closed=true;modal.classList.remove('style-project-modal');modal.removeEventListener('close',handleClose);}
  modal.addEventListener('close',handleClose);showCategory();$('new-project-name').focus();$('new-project-name').select();return destroy;
}

import { STITCHES, stitchSymbolSVG } from './core/stitches.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function stitchPickerHTML(project, selectedId, tool) {
  const count=Object.keys(project.stitchSymbols?.[project.garmentId]||{}).length;
  return `<section class="section stitch-section"><h3 class="section-title">编织针法<span class="muted" id="stitch-count">${count} 格标注</span></h3><div class="stitch-picker">${STITCHES.map(s=>`<button class="stitch-choice ${tool==='stitch'&&s.id===selectedId?'selected':''}" data-stitch="${esc(s.id)}" aria-label="针法：${esc(s.label)}" aria-pressed="${tool==='stitch'&&s.id===selectedId}" title="${esc(s.description)}"><svg viewBox="0 0 24 24" aria-hidden="true">${stitchSymbolSVG(s.id,0,0,24,24)}</svg><span>${esc(s.label)}</span></button>`).join('')}</div><div class="stitch-actions"><button class="btn small ${tool==='stitch-erase'?'soft selected':''}" data-tool="stitch-erase" aria-pressed="${tool==='stitch-erase'}">擦除针法</button><button class="btn text small" data-action="clear-stitches">清空本片针法</button></div><p class="hint" id="stitch-mode-hint">${tool==='stitch'?'当前针法：'+esc(STITCHES.find(s=>s.id===selectedId)?.label||'下针')+'，点击或拖动绘制。':tool==='stitch-erase'?'点击或拖动擦除针法，提花颜色会保留。':'选择针法后，在网格内点击或连续拖动。'}</p><p class="hint">符号按织物正面效果标注，导出附针法图例。加减针符号不会自动改变裁片针数。</p></section>`;
}

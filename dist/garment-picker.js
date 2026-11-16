import {GARMENTS,getGarment,getOutline} from './core/garments.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function garmentGroups(){return [...new Set(GARMENTS.map(g=>g.category))].map(category=>({category,garments:GARMENTS.filter(g=>g.category===category)}));}

export function groupedGarmentOptions(selected){
  return garmentGroups().map(group=>`<optgroup label="${esc(group.category)}">${group.garments.map(g=>`<option value="${g.id}"${selected===g.id?' selected':''}>${esc(g.name)}</option>`).join('')}</optgroup>`).join('');
}

export function miniGarmentSVG(garmentId,measurements=getGarment(garmentId).defaults,width=60,height=70){
  const outline=getOutline(garmentId,measurements),scale=Math.min((width-8)/measurements.width,(height-8)/measurements.height),w=measurements.width*scale,h=measurements.height*scale;
  const n=value=>Number(value.toFixed(5));
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${outline.path}" transform="translate(${n((width-w)/2)} ${n((height-h)/2)}) scale(${n(w/100)} ${n(h/100)})" vector-effect="non-scaling-stroke"/></svg>`;
}

export function garmentCategoryCards(selected){
  return `<div class="garment-categories">${garmentGroups().map(group=>`<details class="garment-category"${group.garments.some(g=>g.id===selected)?' open':''}><summary>${esc(group.category)}<span>${group.garments.length}</span></summary><div class="shape-grid">${group.garments.map(g=>`<button class="shape-card ${g.id===selected?'active':''}" data-garment="${g.id}" aria-pressed="${g.id===selected}">${miniGarmentSVG(g.id)}${esc(g.name)}</button>`).join('')}</div></details>`).join('')}</div>`;
}

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=value=>Number(Number(value).toFixed(2));

/** Put upper and cuff dimensions on their actual edges, shared by editor and SVG export. */
export function trapezoidDimensionsSVG(project,{x,y,width,height,interactive=false,pieceId='',pieceLabel='袖片'}){
  const m=project.measurements,g=project.gauge,cuff=m.cuffWidth??18;
  const cuffSpan=width*cuff/m.width,cuffX=x+(width-cuffSpan)/2;
  const attributes=(field,label)=>interactive?` class="dimension-link" data-dimension="${field}" data-piece-id="${esc(pieceId)}" role="button" tabindex="0" aria-label="修改${esc(pieceLabel)}${label}"`:'';
  const label=(x,y,value,rotate=false)=>`<text ${rotate?`transform="translate(${n(x)} ${n(y)}) rotate(-90)"`:`x="${n(x)}" y="${n(y)}"`} text-anchor="middle" font-size="8.5" fill="#65765b" stroke="#fffefa" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke fill">${value}</text>`;
  const horizontal=(field,x,span,lineY,labelY,value)=>`<g data-role="sleeve-${field}-dimension"${attributes(field,value)}><path d="M${n(x)} ${n(lineY-6)}v12M${n(x+span)} ${n(lineY-6)}v12M${n(x)} ${n(lineY)}H${n(x+span)}" fill="none" stroke="#8e9a7c" stroke-width=".6"/>${label(x+span/2,labelY,value)}</g>`;
  return horizontal('width',x,width,y-12,y-19,`${project.customOutline?'裁片宽':'袖根宽'} ${n(m.width)} cm / ${Math.round(m.width*g.stitches/10)} 针`)
    +horizontal('cuffWidth',cuffX,cuffSpan,y+height+19,y+height+31,`${project.customOutline?'模板袖口参考':'袖口宽'} ${n(cuff)} cm / 约 ${Math.round(cuff*g.stitches/10)} 针`)
    +`<g data-role="sleeve-height-dimension"${attributes('height',`袖长 ${n(m.height)} 厘米`)}><path d="M${n(x+width+12)} ${n(y)}h12M${n(x+width+12)} ${n(y+height)}h12M${n(x+width+18)} ${n(y)}v${n(height)}" fill="none" stroke="#8e9a7c" stroke-width=".6"/>${label(x+width+25,y+height/2,`袖长 ${n(m.height)} cm / ${Math.round(m.height*g.rows/10)} 行`,true)}</g>`;
}

export const escapeWrittenHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function buildWrittenHTML({title,text,colors=[]}){
  const esc=escapeWrittenHTML;
  const legend=colors.map(({letter,name,color})=>`<span class="color"><i style="background:${/^#[0-9a-f]{6}$/i.test(color)?color:'#eeeeee'}"></i>${esc(letter)} · ${esc(name)} ${esc(/^#[0-9a-f]{6}$/i.test(color)?color:'')}</span>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
    body{max-width:900px;margin:36px auto;padding:0 24px;color:#303b31;background:#fff;font:15px/1.9 "Microsoft YaHei","PingFang SC",sans-serif}h1{font-size:25px;color:#69414b;margin-bottom:12px}.intro{font-size:12px;color:#6f786b}.colors{display:flex;flex-wrap:wrap;gap:9px 18px;margin:22px 0;padding:16px;background:#f7f5ef;border-radius:8px}.color{display:inline-flex;align-items:center;gap:6px;font-size:12px}.color i{display:inline-block;width:18px;height:18px;border:1px solid #0002;border-radius:4px;print-color-adjust:exact;-webkit-print-color-adjust:exact}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}button{border:1px solid #d9d8ce;border-radius:6px;padding:8px 15px;background:#fff;cursor:pointer}@page{size:A4;margin:18mm}@media print{body{margin:0;max-width:none;padding:0;font-size:11pt;line-height:1.7}.print-controls{display:none}h1{font-size:18pt}.colors{break-inside:avoid}pre{orphans:3;widows:3}}
    </style></head><body><div class="print-controls"><button onclick="window.print()">打印 / 保存为 PDF</button><p class="intro">织间 · 文字编织图解。可在浏览器中阅读，或使用打印功能保存为 PDF。</p></div><h1>${esc(title)}</h1><div class="colors" aria-label="线色对照">${legend}</div><pre>${esc(text)}</pre></body></html>`;
}

/** Keep downloads independent of the project and preserve edits made in the preview. */
export function downloadWrittenFile(content,filename,format,env=globalThis){
  if(!['txt','html'].includes(format))throw new Error('请选择 TXT 或 HTML 文字图解格式。');
  const blob=new env.Blob([format==='txt'?'\uFEFF':'',content],{type:format==='txt'?'text/plain;charset=utf-8':'text/html;charset=utf-8'});
  const url=env.URL.createObjectURL(blob),a=env.document.createElement('a');
  a.href=url;a.download=(String(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,110)||'文字编织图解')+'.'+format;
  a.click();env.setTimeout(()=>env.URL.revokeObjectURL(url),3000);
}

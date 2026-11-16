import { inspectOutlineDrawing } from './core/outline-drawing.js';

export const DRAWING_TOOLS = [
  ['select','选择 / 移动'], ['line','直线'], ['arc','弧线（3 点）'], ['pen','自由画笔'], ['erase','删除线段'],
];
export const DRAWING_HINTS = {
  select:'点击线段选中，再拖动端点或绿色弧度点。Delete 删除选中线段。',
  line:'拖出一条直线，或依次点击起点、终点。靠近已有端点会自动连接。',
  arc:'依次点击起点、终点、弯曲控制点，绘制一段弧线。Esc 取消未画完的弧线。',
  pen:'按住鼠标自由绘制，松开完成一笔。靠近红色端点可连接，回到起点可闭合。',
  erase:'点击要删除的线段，会留下真实开口。用直线、弧线或画笔重新连接红色端点。',
};

export function drawingPanelHTML(drawing, selected, tool) {
  const status=inspectOutlineDrawing(drawing),count=drawing.segments.length,hasSelection=selected>=0&&selected<count;
  return `<div class="drawing-panel"><div class="drawing-tools" role="group" aria-label="轮廓绘图工具">${DRAWING_TOOLS.map(([id,label])=>`<button class="btn small ${tool===id?'soft selected':''}" data-drawing-tool="${id}" aria-pressed="${tool===id}">${label}</button>`).join('')}</div><p class="hint" id="drawing-tool-hint">${DRAWING_HINTS[tool]}</p><p class="drawing-status ${status.closed?'closed':''}" id="drawing-status" role="status">${count} 段 · ${status.message}</p><button class="btn full primary" id="drawing-apply" ${status.closed?'':'disabled'}>应用到裁片</button><div class="outline-actions drawing-actions"><button class="btn small" id="drawing-split" ${hasSelection?'':'disabled'}>分割选中线段</button><button class="btn small" id="drawing-delete" ${hasSelection?'':'disabled'}>删除选中线段</button><button class="btn small" id="drawing-clear" ${count?'':'disabled'}>清空线段重画</button><button class="btn small" id="drawing-reload">重载当前轮廓</button><button class="btn small" id="drawing-discard">放弃绘制草稿</button><button class="btn small" id="drawing-cancel">取消当前一笔</button></div><p class="hint">先删掉要改的旧边，再连接红色端点；也可以清空后从头画。绘制草稿自动保存，闭合后点击「应用到裁片」更新针数。线段上限 80 段。</p></div>`;
}

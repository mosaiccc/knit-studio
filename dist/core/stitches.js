import { getGarment } from './garments.js';

const SOURCE = 'https://craftyarncouncil.com/standards/knit-chart-symbols';
const HEX = /^#[0-9a-f]{6}$/i;
const POSITION = /^([1-9]\d{0,2}):([1-9]\d{0,2})$/;

/** Symbols describe the right-side appearance; the explicit legend governs symbol variants. They do not alter chart dimensions. */
export const STITCHES = Object.freeze([
  { id: 'knit', label: '下针', abbreviation: 'K', description: '正面织下针；反面织上针。' },
  { id: 'purl', label: '上针', abbreviation: 'P', description: '正面织上针；反面织下针。' },
  { id: 'yo', label: '空加针', abbreviation: 'YO', description: '绕线形成空加针；前后针数需结合实际织法安排。' },
  { id: 'k2tog', label: '右倾二并一', abbreviation: 'K2tog', description: '正面两针并织下针，向右倾斜；反面对应并织上针。' },
  { id: 'ssk', label: '左倾二并一', abbreviation: 'SSK', description: '正面依次以下针方式滑两针，再穿后针脚并织，向左倾斜。' },
  { id: 'slip', label: '滑针（线在后）', abbreviation: 'Sl 1', description: '以上针方式滑过一针；正面线在后，反面线在前。' },
  { id: 'ktbl', label: '扭下针', abbreviation: 'K1 tbl', description: '正面从后针脚织下针；反面从后针脚织上针。' },
  { id: 'ptbl', label: '扭上针', abbreviation: 'P1 tbl', description: '正面从后针脚织上针；反面从后针脚织下针。' },
].map(entry => Object.freeze({ ...entry, sourceUrl: SOURCE })));

// Retired symbols stay valid in saved projects and their exported legends, but are not offered by the picker.
export const ALL_STITCHES = Object.freeze([
  ...STITCHES,
  Object.freeze({ id: 'k3tog', label: '右倾三并一', abbreviation: 'K3tog', description: '正面三针并织下针，向右倾斜；反面对应三针并织上针。', sourceUrl: SOURCE }),
]);

export function getStitch(id) {
  const result = ALL_STITCHES.find(entry => entry.id === id);
  if (!result) throw new Error(`未知针法符号“${String(id)}”，请选择图例中的针法。`);
  return result;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function symbolEntries(symbols) {
  if (!record(symbols)) throw new Error('针法符号需按针行位置保存。');
  const entries = Object.entries(symbols);
  if (entries.length > 240000) throw new Error('每个版型最多保存 240000 个针法符号。');
  for (const [key, id] of entries) {
    const match = POSITION.exec(key);
    if (!match || Number(match[1]) > 600 || Number(match[2]) > 400) throw new Error('针法符号的位置应为 1–600 行、1–400 针。');
    getStitch(id);
  }
  return entries;
}

/** Validates a complete garment-keyed map; flat drawing operations use one garment's inner map. */
export function assertStitchSymbols(value) {
  if (!record(value)) throw new Error('针法符号记录格式无效。');
  for (const [garmentId, symbols] of Object.entries(value)) {
    getGarment(garmentId);
    symbolEntries(symbols);
  }
}

function checkGrid(grid) {
  if (!Array.isArray(grid) || grid.length < 1 || grid.length > 600 || !Array.isArray(grid[0]) || grid[0].length < 1 || grid[0].length > 400) throw new Error('针法画布需为 1–400 针 × 1–600 行。');
  const width = grid[0].length;
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== width || Array.from(row).some(cell => cell !== null && (typeof cell !== 'string' || !HEX.test(cell)))) throw new Error('针法画布需使用有效颜色，裁片外使用空值，各行长度必须一致。');
  }
}

function clipLine(x0, y0, x1, y1, width, height) {
  const dx = x1 - x0, dy = y1 - y0;
  let start = 0, end = 1;
  for (const [p, q] of [[-dx, x0], [dx, width - 1 - x0], [-dy, y0], [dy, height - 1 - y0]]) {
    if (p === 0) { if (q < 0) return null; }
    else {
      const t = q / p;
      if (p < 0) start = Math.max(start, t); else end = Math.min(end, t);
      if (start > end) return null;
    }
  }
  return [Math.round(x0 + start * dx), Math.round(y0 + start * dy), Math.round(x0 + end * dx), Math.round(y0 + end * dy)];
}

/** Paints a detached flat map, anchored to the bottom-right; null erases only the visible cloth cells. */
export function paintStitchLine(grid, symbols, x0, y0, x1, y1, idOrNull, mirror = false, mirrorVertical = false) {
  checkGrid(grid);
  if (![x0, y0, x1, y1].every(Number.isSafeInteger)) throw new Error('针法绘制位置必须是有限整数。');
  if (idOrNull !== null) getStitch(idOrNull);
  const result = Object.fromEntries(symbolEntries(symbols));
  const height = grid.length, width = grid[0].length;
  if (x0 > x1 || (x0 === x1 && y0 > y1)) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  const clipped = clipLine(x0, y0, x1, y1, width, height);
  if (!clipped) return result;
  [x0, y0, x1, y1] = clipped;
  const apply = (x, y) => {
    if (grid[y][x] === null) return;
    const key = `${height - y}:${width - x}`;
    if (idOrNull === null) delete result[key]; else result[key] = idOrNull;
  };
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    apply(x0, y0);
    if (mirror) apply(width - 1 - x0, y0);
    if (mirrorVertical) {
      apply(x0, height - 1 - y0);
      if (mirror) apply(width - 1 - x0, height - 1 - y0);
    }
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
  return result;
}

// One normalized vector definition feeds both renderers, avoiding font-dependent symbol substitutions.
const PATHS = {
  knit: [['M', .5, .22], ['L', .5, .78]],
  purl: [['M', .25, .5], ['L', .75, .5]],
  yo: [['M', .76, .5], ['C', .76, .3564, .6436, .24, .5, .24], ['C', .3564, .24, .24, .3564, .24, .5], ['C', .24, .6436, .3564, .76, .5, .76], ['C', .6436, .76, .76, .6436, .76, .5], ['Z']],
  k2tog: [['M', .25, .78], ['L', .75, .22]],
  ssk: [['M', .25, .22], ['L', .75, .78]],
  k3tog: [['M', .2, .78], ['L', .68, .22], ['M', .59, .48], ['C', .88, .35, .9, .61, .68, .62], ['C', .94, .62, .85, .87, .61, .77]],
  slip: [['M', .25, .23], ['L', .5, .77], ['L', .75, .23]],
  ktbl: [['M', .25, .78], ['L', .67, .23], ['Q', .5, .03, .33, .23], ['L', .75, .78]],
  ptbl: [['M', .25, .68], ['L', .67, .2], ['Q', .5, .02, .33, .2], ['L', .75, .68], ['M', .22, .88], ['L', .78, .88]],
};

function drawing(id, x, y, width, height, color) {
  getStitch(id);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('针法符号的绘制尺寸无效。');
  if (typeof color !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) throw new Error('针法符号颜色需为有效的十六进制颜色。');
  const commands = PATHS[id].map(([command, ...values]) => [command, ...values.map((value, index) => Math.round((index % 2 ? y + value * height : x + value * width) * 10000) / 10000)]);
  return { commands, strokeWidth: Math.max(.6, Math.min(width, height) * .085), color };
}

export function stitchSymbolSVG(id, x, y, width, height, color = '#343c36') {
  const definition = drawing(id, x, y, width, height, color);
  const path = definition.commands.map(([command, ...values]) => command + values.join(' ')).join(' ');
  return `<path d="${path}" fill="none" stroke="${definition.color}" stroke-width="${definition.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function drawStitchSymbol(ctx, id, x, y, width, height, color = '#343c36') {
  const definition = drawing(id, x, y, width, height, color);
  ctx.save();
  ctx.strokeStyle = definition.color;
  ctx.lineWidth = definition.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const methods = { M: 'moveTo', L: 'lineTo', C: 'bezierCurveTo', Q: 'quadraticCurveTo', Z: 'closePath' };
  for (const [command, ...values] of definition.commands) ctx[methods[command]](...values);
  ctx.stroke();
  ctx.restore();
}

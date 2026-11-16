import {trapezoidDimensionsSVG} from './sleeve-dimensions.js';
import { GARMENTS, getGarment, getOutline, resolveShoulderWidth, isHalfFront } from './core/garments.js';
import { getPieceProjects } from './core/pieces.js';
import { composeProjectChart } from './core/placements.js';
import { ALL_STITCHES, stitchSymbolSVG } from './core/stitches.js';

const FONT = "'Microsoft YaHei','PingFang SC',Arial,sans-serif";
const INK = '#2B2926';
const MUTED = '#6D675F';
const STITCH_IDS = new Set(ALL_STITCHES.map(stitch => stitch.id));
const STITCH_NOTE = '符号按正面效果表示，不自动改变针数；标记格的底色仍对应配色表。';

function escapeXML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function colorValue(value) {
  if (typeof value !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map(c => c + c).join('').toUpperCase()}`;
  return null;
}

function numberText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : '—';
}

function point(value) { return Math.round(value * 1000) / 1000; }

function letterAt(index) {
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
}

function chartData(chart, project) {
  const source = Array.isArray(chart.grid) ? chart.grid : [];
  const height = source.length;
  const width = source.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0);
  if (!width || !height) throw new Error('图解为空，请先绘制图案。');
  const grid = source.map((row, y) => Array.from({ length: width }, (_, x) => {
    if (chart.mask && !chart.mask[y]?.[x]) return null;
    return colorValue(row?.[x]);
  }));
  const palette = new Map();
  for (const row of grid) for (const color of row) {
    if (!color) continue;
    if (!palette.has(color)) palette.set(color, { color, letter: letterAt(palette.size), count: 0 });
    palette.get(color).count++;
  }
  const symbols = new Map();
  const counts = new Map();
  const scoped = project?.stitchSymbols?.[project.garmentId];
  if (scoped && typeof scoped === 'object' && !Array.isArray(scoped)) {
    for (const [key, id] of Object.entries(scoped)) {
      if (!/^[1-9]\d*:[1-9]\d*$/.test(key) || !STITCH_IDS.has(id)) continue;
      const [row, stitch] = key.split(':').map(Number);
      if (row > height || stitch > width || !grid[height - row]?.[width - stitch]) continue;
      symbols.set(key, id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const stitchLegend = ALL_STITCHES.filter(stitch => counts.has(stitch.id)).map(stitch => ({ ...stitch, count: counts.get(stitch.id) }));
  return { grid, width, height, palette, legend: [...palette.values()], symbols, stitchLegend };
}

function contrastText(color) {
  const channels = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
  const luminance = channels.reduce((sum, channel, i) => sum + [0.2126, 0.7152, 0.0722][i] * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4), 0);
  return luminance > 0.179 ? '#222222' : '#FFFFFF';
}

function text(x, y, value, attributes = '') {
  return `<text x="${point(x)}" y="${point(y)}" ${attributes}>${escapeXML(value)}</text>`;
}

function drawGrid(data, options = {}) {
  const x0 = options.x ?? 68;
  const y0 = options.y ?? 174;
  const cell = options.cell ?? 24;
  const startX = options.startX ?? 0;
  const startY = options.startY ?? 0;
  const endX = Math.min(options.endX ?? data.width, data.width);
  const endY = Math.min(options.endY ?? data.height, data.height);
  const columns = endX - startX;
  const rows = endY - startY;
  const gridWidth = columns * cell;
  const gridHeight = rows * cell;
  const pieces = [`<g data-role="chart-grid" font-size="${point(Math.max(7, Math.min(12, cell * 0.45)))}">`];
  for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
    const color = data.grid[y][x];
    if (!color) continue;
    const left = x0 + (x - startX) * cell;
    const top = y0 + (y - startY) * cell;
    const letter = data.palette.get(color).letter;
    pieces.push(`<rect data-cell="true" data-row="${data.height - y}" data-stitch="${data.width - x}" data-symbol="${letter}" x="${point(left)}" y="${point(top)}" width="${point(cell)}" height="${point(cell)}" fill="${color}"/>`);
    const stitchSymbol = data.symbols.get(`${data.height - y}:${data.width - x}`);
    if (stitchSymbol) pieces.push(`<g data-stitch-symbol="${stitchSymbol}" data-row="${data.height - y}" data-stitch="${data.width - x}" data-color="${contrastText(color)}" transform="translate(${point(left)} ${point(top)})">${stitchSymbolSVG(stitchSymbol, 0, 0, cell, cell, contrastText(color))}</g>`);
    else if (cell >= 11) pieces.push(text(left + cell / 2, top + cell * 0.67, letter, `text-anchor="middle" fill="${contrastText(color)}" font-size="${point(Math.min(13, cell * 0.53) / Math.max(1, letter.length * 0.7))}"`));
  }
  pieces.push('<g fill="none" stroke="#6F695F" stroke-opacity="0.42">');
  for (let x = startX; x <= endX; x++) {
    const heavy = (data.width - x) % 10 === 0;
    const coordinate = point(x0 + (x - startX) * cell);
    pieces.push(`<path${heavy ? ' data-guide="10"' : ''} d="M${coordinate} ${point(y0)}v${point(gridHeight)}" stroke-width="${heavy ? 1.45 : 0.45}"/>`);
  }
  for (let y = startY; y <= endY; y++) {
    const heavy = (data.height - y) % 10 === 0;
    const coordinate = point(y0 + (y - startY) * cell);
    pieces.push(`<path${heavy ? ' data-guide="10"' : ''} d="M${point(x0)} ${coordinate}h${point(gridWidth)}" stroke-width="${heavy ? 1.45 : 0.45}"/>`);
  }
  pieces.push('</g>');
  const labelEvery = cell >= 18 ? 1 : cell >= 9 ? 5 : 10;
  for (let y = startY; y < endY; y++) {
    const row = data.height - y;
    if (row % labelEvery && y !== startY && y !== endY - 1) continue;
    const lineY = y0 + (y - startY + 0.67) * cell;
    pieces.push(text(x0 + gridWidth + 10, lineY, row, `data-axis="row" data-number="${row}" fill="${INK}"`));
  }
  for (let x = startX; x < endX; x++) {
    const stitch = data.width - x;
    if (stitch % labelEvery && x !== startX && x !== endX - 1) continue;
    pieces.push(text(x0 + (x - startX + 0.5) * cell, y0 + gridHeight + 19, stitch, `data-axis="stitch" data-number="${stitch}" text-anchor="middle" fill="${INK}"`));
  }
  pieces.push(text(x0 + gridWidth + 10, y0 - 13, '行', `fill="${MUTED}" font-size="12"`));
  pieces.push(text(x0 + gridWidth + 10, y0 + gridHeight + 20, '针', `fill="${MUTED}" font-size="12"`));
  pieces.push('</g>');
  return pieces.join('');
}

function legendMarkup(legend, x, y, columns = 3, columnWidth = 205) {
  const parts = [text(x, y, '配色与用针统计', 'font-size="15" font-weight="700"')];
  legend.forEach((entry, i) => {
    const left = x + (i % columns) * columnWidth;
    const top = y + 17 + Math.floor(i / columns) * 30;
    parts.push(`<rect x="${point(left)}" y="${point(top)}" width="19" height="19" rx="3" fill="${entry.color}" stroke="#8D857B" stroke-width="0.6"/>`);
    parts.push(text(left + 28, top + 14, `${entry.letter} · ${entry.color} · ${entry.count} 针`, 'font-size="12"'));
  });
  if (!legend.length) parts.push(text(x, y + 33, '没有可编织的彩色单元', 'font-size="13"'));
  return parts.join('');
}

function stitchLegendMarkup(legend, x, y, width) {
  if (!legend.length) return { markup: '', height: 0 };
  const parts = [`<g data-role="stitch-legend">${text(x, y, '针法图例', 'font-size="15" font-weight="700"')}${text(x, y + 23, STITCH_NOTE, `font-size="12" fill="${MUTED}"`)}`];
  const lineLength = Math.max(12, Math.floor((width - 36) / 12));
  let top = y + 42;
  for (const entry of legend) {
    const chars = [...entry.description];
    const lines = Array.from({ length: Math.max(1, Math.ceil(chars.length / lineLength)) }, (_, index) => chars.slice(index * lineLength, (index + 1) * lineLength).join(''));
    parts.push(`<g data-stitch-legend="${entry.id}"><rect x="${point(x)}" y="${point(top)}" width="24" height="24" fill="#FFFFFF" stroke="#B6AEA4"/>${stitchSymbolSVG(entry.id, x, top, 24, 24, INK)}${text(x + 36, top + 17, `${entry.label} · ${entry.count} 格`, 'font-size="14" font-weight="700"')}`);
    lines.forEach((line, index) => parts.push(text(x + 36, top + 36 + index * 17, line, `font-size="12" fill="${MUTED}"`)));
    parts.push('</g>');
    top += 48 + (lines.length - 1) * 17;
  }
  parts.push('</g>');
  return { markup: parts.join(''), height: top - y + 12 };
}

function tileStitchLegend(data, startX, startY, endX, endY) {
  const counts = new Map();
  for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
    const id = data.symbols.get(`${data.height - y}:${data.width - x}`);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return data.stitchLegend.filter(entry => counts.has(entry.id)).map(entry => ({ ...entry, count: counts.get(entry.id) }));
}

function stitchLegendHTML(legend, compact = false) {
  if (!legend.length) return '';
  return `<div class="stitch-legend${compact ? ' compact' : ''}"><h3>针法图例</h3><p class="note">${STITCH_NOTE}</p><div class="stitch-legend-items">${legend.map(entry => `<div class="stitch-legend-item" data-stitch-legend="${entry.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-label="${escapeXML(entry.label)}"><rect width="24" height="24" fill="white"/>${stitchSymbolSVG(entry.id, 0, 0, 24, 24, INK)}</svg><span><strong>${escapeXML(entry.label)} · ${entry.count} 格</strong>${compact ? '' : `<br>${escapeXML(entry.description)}`}</span></div>`).join('')}</div></div>`;
}

function activeAnnotations(project) {
  return (Array.isArray(project.annotations) ? project.annotations : [])
    .filter(note => note?.garmentId === project.garmentId && typeof note.text === 'string' && note.text.length && Number.isFinite(note.x) && Number.isFinite(note.y))
    .map(note => ({ ...note, x: Math.max(0, Math.min(1, note.x)), y: Math.max(0, Math.min(1, note.y)), fontSize: Math.max(8, Math.min(28, Number(note.fontSize) || 12)), color: colorValue(note.color) || INK }));
}

function shoulderInfo(project) {
  if (!GARMENTS.find(garment => garment.id === project.garmentId)?.fields.includes('shoulderWidth')) return null;
  const width = resolveShoulderWidth(project.garmentId, project.measurements);
  if (width == null) return null;
  const stitches = Math.round(width * project.gauge.stitches / 10);
  return { width, stitches, label: `${project.customOutline ? '模板肩宽参考' : '肩宽'} ${numberText(width)} cm / ${stitches} 针` };
}

function annotatedShapePanel(project, data, garmentName, width, notes = activeAnnotations(project)) {
  const measurements = project.measurements;
  const scale = Math.min(173 / measurements.width, 216 / measurements.height);
  const w = measurements.width * scale;
  const h = measurements.height * scale;
  const left = (280 - w) / 2;
  const top = 35 + (216 - h) / 2;
  const outline = getOutline(project.garmentId, measurements, project.customOutline);
  const shoulder = shoulderInfo(project);
  const headerExtra = (shoulder ? 22 : 0) + (project.customOutline ? 22 : 0);
  const positioned = notes.map(note => ({ ...note, px: note.x * 280, py: note.y * 310, lines: note.text.split(/\r\n?|\n/) }));
  let minX = 0, minY = 0, maxX = 280, maxY = 310;
  for (const note of positioned) {
    // A conservative full-em bound works without browser text measurement, and
    // keeps CJK, emoji, blank lines, and edge-positioned text inside the SVG.
    const lineWidth = Math.max(...note.lines.map(line => Array.from(line.replace(/\t/g, '    ')).length)) * note.fontSize * 1.1;
    minX = Math.min(minX, note.px - lineWidth / 2 - 8);
    maxX = Math.max(maxX, note.px + lineWidth / 2 + 8);
    minY = Math.min(minY, note.py - note.fontSize * 1.2 - 8);
    maxY = Math.max(maxY, note.py + (note.lines.length - 1) * note.fontSize * 1.25 + note.fontSize * 0.4 + 8);
  }
  const viewWidth = maxX - minX;
  const viewHeight = maxY - minY;
  const diagramScale = Math.min(2, (width - 80) / viewWidth, 900 / viewHeight);
  const diagramHeight = Math.ceil(viewHeight * diagramScale);
  const height = diagramHeight + 94 + headerExtra;
  const pieces = [
    text(40, 25, '版型与文字标注', 'font-size="18" font-weight="700"'),
    text(40, 47, `${garmentName} · ${numberText(measurements.width)} × ${numberText(measurements.height)} cm · 文字标注不计入针数`, `font-size="12" fill="${MUTED}"`),
    ...(shoulder ? [text(40, 68, shoulder.label, `font-size="12" fill="${MUTED}"`)] : []),
    ...(project.customOutline ? [text(40, shoulder ? 90 : 68, '自定义轮廓；肩部、领口参数为模板参考，实际针位以图解为准', `font-size="12" fill="${MUTED}"`)] : []),
    `<svg data-role="annotated-shape" x="40" y="${59 + headerExtra}" width="${width - 80}" height="${diagramHeight}" viewBox="${point(minX)} ${point(minY)} ${point(viewWidth)} ${point(viewHeight)}" preserveAspectRatio="xMidYMid meet">`,
    `<g data-role="shape-colors" shape-rendering="crispEdges">`
  ];
  // Merge equal-colored cells horizontally; direct garment edits remain visible
  // without duplicating all chart cell metadata or counting notes as stitches.
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width;) {
      const color = data.grid[y][x];
      let end = x + 1;
      while (end < data.width && data.grid[y][end] === color) end++;
      if (color) pieces.push(`<rect x="${point(left + x * w / data.width)}" y="${point(top + y * h / data.height)}" width="${point((end - x) * w / data.width)}" height="${point(h / data.height)}" fill="${color}"/>`);
      x = end;
    }
  }
  pieces.push('</g>');
  pieces.push(`<path data-role="shape-outline" d="${outline.path}" transform="translate(${point(left)} ${point(top)}) scale(${point(w / 100)} ${point(h / 100)})" fill="none" stroke="#8E9685" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`);
  if (shoulder) {
    const span = shoulder.width * scale;
    const x1 = isHalfFront(project.garmentId) && project.garmentId.endsWith('-left') ? left + w - span : isHalfFront(project.garmentId) && project.garmentId.endsWith('-right') ? left : left + (w - span) / 2;
    const x2 = x1 + span;
    const y = top - 8;
    pieces.push(`<g data-role="shoulder-dimension"><path d="M${point(x1)} ${point(y + 4)}v-8M${point(x1)} ${point(y)}H${point(x2)}M${point(x2)} ${point(y + 4)}v-8" fill="none" stroke="#7E8973" stroke-width="0.7"/>${text((x1 + x2) / 2, y - 6, shoulder.label, 'text-anchor="middle" font-size="8" fill="#5F6B55" stroke="#FFFFFF" stroke-width="2" paint-order="stroke fill"')}</g>`);
  }
  if(project.garmentId==='trapezoid-sleeve')pieces.push(trapezoidDimensionsSVG(project,{x:left,y:top,width:w,height:h}));
  for (const note of positioned) {
    pieces.push(`<text data-annotation-id="${escapeXML(note.id)}" x="${point(note.px)}" y="${point(note.py)}" font-size="${note.fontSize}" fill="${note.color}" text-anchor="middle" stroke="#FFFFFF" stroke-width="3" stroke-opacity="0.94" stroke-linejoin="round" paint-order="stroke fill" xml:space="preserve">`);
    note.lines.forEach((line, index) => pieces.push(`<tspan x="${point(note.px)}" y="${point(note.py + index * note.fontSize * 1.25)}">${escapeXML(line)}</tspan>`));
    pieces.push('</text>');
  }
  pieces.push('</svg>');
  return { markup: pieces.join(''), height, notes };
}

function buildSVG(project, chart, garmentName, motif = false) {
  const data = chartData(chart, motif ? undefined : project);
  const cell = Math.min(24, 2400 / data.width, 3200 / data.height);
  const width = Math.max(720, Math.ceil(data.width * cell + 150));
  const shoulder = motif ? null : shoulderInfo(project);
  const sleeve = !motif && project.garmentId==='trapezoid-sleeve';
  const chartTop = motif ? 150 : (shoulder || sleeve) ? 214 : 190;
  const legendTop = chartTop + data.height * cell + 69;
  const legendColumns = Math.max(1, Math.floor((width - 100) / 220));
  const stitchLegendTop = legendTop + 54 + Math.ceil(data.legend.length / legendColumns) * 30;
  const stitchLegend = stitchLegendMarkup(data.stitchLegend, 40, stitchLegendTop, width - 80);
  const baseHeight = Math.ceil(legendTop + 68 + Math.ceil(data.legend.length / legendColumns) * 30 + stitchLegend.height);
  const annotations = motif ? [] : activeAnnotations(project);
  const panel = annotations.length ? annotatedShapePanel(project, data, garmentName, width, annotations) : null;
  const height = baseHeight + (panel ? panel.height + 10 : 0);
  const title = project.name || '未命名作品';
  const dimensionText = `${numberText(data.width)} 针 × ${numberText(data.height)} 行`;
  const metadata = {
    format: 'knit-studio-chart', version: 1, kind: motif ? 'motif' : 'garment',
    name: title, garmentId: project.garmentId, garmentName, measurements: project.measurements,
    gauge: project.gauge, placement: project.placement,
    width: data.width, height: data.height,
    actualWidth: chart.actualWidth, actualHeight: chart.actualHeight,
    coordinates: 'row 1 is bottom; stitch 1 is right; each colored rect is one stitch; absent cells are outside shape',
    legend: data.legend,
    ...(!motif && project.customOutline ? { customOutline: project.customOutline } : {}),
    ...(data.stitchLegend.length ? { stitchSymbols: Object.fromEntries(data.symbols), stitchLegend: data.stitchLegend, stitchConvention: STITCH_NOTE } : {}),
    ...(annotations.length ? { annotations } : {}),
    ...(shoulder ? { shoulderWidth: shoulder.width, shoulderStitches: shoulder.stitches } : {})
  };
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc">`,
    `<title id="chart-title">${escapeXML(title)} · ${motif ? '提花图案' : escapeXML(garmentName || '编织图解')}</title>`,
    '<desc id="chart-desc">每格代表一针。行号从下向上，针号从右向左；空白格不编织，粗线间隔十针或十行。</desc>',
    `<metadata>${escapeXML(JSON.stringify(metadata))}</metadata>`,
    `<rect data-role="background" width="${width}" height="${height}" fill="#FFFFFF"/>`,
    `<g font-family="${FONT}" fill="${INK}">`,
    text(40, 45, title, 'font-size="24" font-weight="700"'),
    text(40, 73, `${motif ? '提花图案' : garmentName || '编织图解'} · ${dimensionText}`, 'font-size="16"')
  ];
  if (!motif) {
    parts.push(text(40, 101, `目标尺寸 ${numberText(project.measurements?.width)} × ${numberText(project.measurements?.height)} cm · 取整后实际 ${numberText(chart.actualWidth)} × ${numberText(chart.actualHeight)} cm`, `font-size="13" fill="${MUTED}"`));
    parts.push(text(40, 125, `密度 ${numberText(project.gauge?.stitches)} 针 × ${numberText(project.gauge?.rows)} 行 / 10 cm · 图案${project.placement === 'center' ? '居中' : '重复'}铺放`, `font-size="13" fill="${MUTED}"`));
    if (sleeve) parts.push(text(40,149,`${project.customOutline?'模板袖口参考':'袖口宽'} ${numberText(project.measurements.cuffWidth ?? 18)} cm · 上端为袖根，下端为袖口`, `font-size="13" fill="${MUTED}"`));
    if (shoulder) parts.push(text(40, 149, shoulder.label, `font-size="13" fill="${MUTED}"`));
  }
  parts.push(text(40, motif ? 104 : (shoulder || sleeve) ? 178 : 154, '每格一针 · 从右下角开始读图 · 空白格不编织 · 每 10 针 / 行加粗', `font-size="12" fill="${MUTED}"`));
  parts.push(drawGrid(data, { cell, y: chartTop }));
  parts.push(legendMarkup(data.legend, 40, legendTop, legendColumns, (width - 80) / legendColumns));
  parts.push(stitchLegend.markup);
  if (panel) parts.push(`<g data-role="annotation-panel" transform="translate(0 ${baseHeight - 12})">${panel.markup}</g>`);
  parts.push(text(40, height - 19, '织间 Knit Studio · 平面裁片参考图；织法、缝合与塑形请结合实际试织确认。', `font-size="11" fill="${MUTED}"`));
  parts.push('</g></svg>');
  return parts.join('');
}

/** Portable chart: each colored cell retains its original row, stitch, and palette letter. */
export function buildChartSVG(project, chart, garmentName = '编织图解') {
  return buildSVG(project, chart, garmentName);
}

export function buildPatternSVG(project) {
  return buildSVG(project, { grid: project.grid }, '提花图案', true);
}

function namespaceSVG(svg, prefix) {
  const ids = new Map([...svg.matchAll(/\sid="([^"]+)"/g)].map((match, index) => [match[1], `${prefix}-${index}`]));
  return svg.replace(/(\s)id="([^"]+)"/g, (_, space, id) => `${space}id="${ids.get(id)}"`)
    .replace(/(aria-labelledby|aria-describedby)="([^"]+)"/g, (_, attribute, value) => `${attribute}="${value.split(/\s+/).map(id => ids.get(id) || id).join(' ')}"`)
    .replace(/((?:xlink:)?href)="#([^"]+)"/g, (_, attribute, id) => `${attribute}="#${ids.get(id) || id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${ids.get(id) || id})`);
}

function allPieceCharts(project) {
  return getPieceProjects(project).map(piece => ({ ...piece, chart: composeProjectChart(piece.project), garmentName: `${piece.label} · ${getGarment(piece.project.garmentId).name}` }));
}

function combinePieceSVGs(project, pieces, kind) {
  const artifacts = pieces.map((piece, index) => {
    const svg = kind === 'shape' ? buildAnnotatedShapeSVG(piece.project, piece.chart, piece.garmentName) : buildChartSVG(piece.project, piece.chart, piece.garmentName);
    const dimensions = /^<svg[^>]*\swidth="([\d.]+)" height="([\d.]+)"/.exec(svg);
    return { ...piece, width: Number(dimensions[1]), height: Number(dimensions[2]), svg: namespaceSVG(svg, `piece-${index + 1}`) };
  });
  const columns = Math.min(kind === 'shape' ? 3 : 2, artifacts.length);
  const columnWidth = Math.max(...artifacts.map(item => item.width));
  const gap = 24;
  const width = 48 + columns * columnWidth + (columns - 1) * gap;
  let y = 96;
  const panels = [];
  for (let row = 0; row < artifacts.length; row += columns) {
    const items = artifacts.slice(row, row + columns);
    items.forEach((item, column) => {
      const x = 24 + column * (columnWidth + gap) + (columnWidth - item.width) / 2;
      panels.push(`<g data-piece-id="${escapeXML(item.id)}" transform="translate(${point(x)} ${point(y)})">${text(20, 27, item.garmentName, 'font-size="22" font-weight="700"')}${item.svg.replace('<svg ', '<svg x="0" y="43" ')}</g>`);
    });
    y += Math.max(...items.map(item => item.height)) + 43 + gap;
  }
  const height = y + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${point(width)}" height="${point(height)}" viewBox="0 0 ${point(width)} ${point(height)}" role="img" aria-labelledby="all-pieces-title"><title id="all-pieces-title">${escapeXML(project.name || '未命名作品')} · 全部裁片</title><rect width="100%" height="100%" fill="#FFFFFF"/><g font-family="${FONT}" fill="${INK}">${text(44, 40, `${project.name || '未命名作品'} · 全部裁片`, 'font-size="26" font-weight="700"')}${text(44, 68, `${artifacts.length} 个裁片 · ${kind === 'shape' ? '独立尺寸与文字标注' : '各片针行编号、配色与手绘分别保留'}`, `font-size="14" fill="${MUTED}"`)}${panels.join('')}</g></svg>`;
}

/** Combines synchronized piece views; each piece keeps its own grid, notes, and dimensions. */
export function buildAllPiecesSVG(project, kind = 'chart') {
  if (!['chart', 'shape'].includes(kind)) throw new Error('导出类型应为 chart 或 shape。');
  return combinePieceSVGs(project, allPieceCharts(project), kind);
}

/** Shape positions use the same 280 × 310 coordinates as the editable preview. */
export function buildAnnotatedShapeSVG(project, chart, garmentName = '编织版型') {
  const width = 720;
  const panel = annotatedShapePanel(project, chartData(chart), garmentName, width);
  const height = panel.height + 55;
  const metadata = { format: 'knit-studio-chart', version: 1, kind: 'annotated-shape', garmentId: project.garmentId, measurements: project.measurements, annotations: panel.notes, ...(project.customOutline ? { customOutline: project.customOutline } : {}) };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXML(project.name || '未命名作品')} · 版型与文字标注"><title>${escapeXML(project.name || '未命名作品')} · 版型与文字标注</title><metadata>${escapeXML(JSON.stringify(metadata))}</metadata><rect width="100%" height="100%" fill="#FFFFFF"/><g font-family="${FONT}" fill="${INK}">${text(40, 30, project.name || '未命名作品', 'font-size="20" font-weight="700"')}<g transform="translate(0 40)">${panel.markup}</g></g></svg>`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadSVG(svg, filename = '编织图解.svg') {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function downloadPNG(svg, filename = '编织图解.png') {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const source = new Image();
    await new Promise((resolve, reject) => {
      source.onload = resolve;
      source.onerror = () => reject(new Error('图解图片生成失败，请尝试导出 SVG。'));
      source.src = url;
    });
    const canvas = document.createElement('canvas');
    const maximumPixels = 16000000;
    const scale = Math.min(2, 2400 / source.naturalWidth, 3600 / source.naturalHeight, Math.sqrt(maximumPixels / (source.naturalWidth * source.naturalHeight)));
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器暂时无法生成图片，请尝试导出 SVG。');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片导出失败，请尝试导出 SVG。')), 'image/png'));
    downloadBlob(blob, filename);
  } finally { URL.revokeObjectURL(url); }
}

function segmentsForRow(row) {
  return (Array.isArray(row.segments) ? row.segments : [])
    .map(segment => [Number(segment.start), Number(segment.end)])
    .filter(segment => segment.every(Number.isFinite));
}

function countRows(data) {
  return Array.from({ length: data.height }, (_, index) => {
    const row = data.height - index;
    const cells = data.grid[index];
    const segments = [];
    let start = null;
    for (let stitch = 1; stitch <= data.width + 1; stitch++) {
      const present = stitch <= data.width && cells[data.width - stitch] !== null;
      if (present && start === null) start = stitch;
      if (!present && start !== null) { segments.push({ start, end: stitch - 1 }); start = null; }
    }
    return { row, count: cells.filter(Boolean).length, segments };
  }).reverse();
}

function mergedRows(chart, data) {
  const source = Array.isArray(chart.rowCounts) && chart.rowCounts.length ? chart.rowCounts : countRows(data);
  const groups = [];
  for (const entry of [...source].sort((a, b) => a.row - b.row)) {
    const row = Number(entry.row);
    const count = Number(entry.count);
    const segments = segmentsForRow(entry);
    const key = JSON.stringify([count, segments]);
    const previous = groups.at(-1);
    if (previous && previous.key === key && previous.end + 1 === row) previous.end = row;
    else groups.push({ start: row, end: row, count, segments, key });
  }
  return groups;
}

function tileSVG(data, startX, startY, endX, endY, hasSymbols = false) {
  const width = 70 + (endX - startX) * 15;
  const height = 66 + (endY - startY) * 15;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"${hasSymbols ? ' style="max-height:215mm"' : ''} aria-label="局部详细图解"><rect width="100%" height="100%" fill="white"/><g font-family="${FONT}">${drawGrid(data, { x: 18, y: 25, cell: 15, startX, startY, endX, endY })}</g></svg>`;
}

function buildPrintSections(project, chart, garmentName, prefix = '') {
  const data = chartData(chart, project);
  const title = escapeXML(project.name || '未命名作品');
  const shoulder = shoulderInfo(project);
  const unique = svg => prefix ? namespaceSVG(svg, prefix) : svg;
  const annotations = activeAnnotations(project);
  const overview = unique(buildChartSVG(annotations.length ? { ...project, annotations: [] } : project, chart, garmentName));
  const annotationPage = annotations.length ? `<section class="annotation-page">${unique(buildAnnotatedShapeSVG(project, chart, garmentName))}</section>` : '';
  const palette = data.legend.map(entry => `<span class="legend-item"><b style="background:${entry.color};color:${contrastText(entry.color)}">${entry.letter}</b>${entry.color} · ${entry.count} 针</span>`).join('');
  const rows = mergedRows(chart, data).map(group => `<tr><td>第 ${group.start}${group.start === group.end ? '' : `–${group.end}`} 行</td><td>${group.count} 针</td><td>${group.segments.length ? group.segments.map(([start, end]) => start === end ? `第 ${start} 针` : `第 ${start}–${end} 针`).join('；') : '无编织单元'}</td></tr>`).join('');
  const pages = [];
  if (data.width > 60 || data.height > 80) {
    const across = Math.ceil(data.width / 60);
    const up = Math.ceil(data.height / 80);
    // Start at the bottom-right tile, matching the chart's reading direction.
    for (let tileRow = 0; tileRow < up; tileRow++) for (let tileColumn = 0; tileColumn < across; tileColumn++) {
      const endY = data.height - tileRow * 80;
      const startY = Math.max(0, endY - 80);
      const endX = data.width - tileColumn * 60;
      const startX = Math.max(0, endX - 60);
      const position = `第 ${data.height - endY + 1}–${data.height - startY} 行 · 第 ${data.width - endX + 1}–${data.width - startX} 针`;
      const symbols = tileStitchLegend(data, startX, startY, endX, endY);
      pages.push(`<section class="detail-page"><h2>${title} · ${escapeXML(garmentName)} · 详细图 ${tileRow * across + tileColumn + 1} / ${across * up}</h2><p>${position} · 分区位置：自下第 ${tileRow + 1} 排，自右第 ${tileColumn + 1} 列</p>${tileSVG(data, startX, startY, endX, endY, symbols.length > 0)}${stitchLegendHTML(symbols, true)}<p class="note">每格一针；颜色字母对应本裁片总览配色表。空白格不编织。页与页之间无重复针行。</p></section>`);
    }
  }
  return `<section class="overview">${overview}</section>${annotationPage}<section class="instructions"><h1>${title}</h1><h2>${escapeXML(garmentName)} · 逐行针数与配色</h2><p>目标尺寸 ${numberText(project.measurements?.width)} × ${numberText(project.measurements?.height)} cm；取整后实际 ${numberText(chart.actualWidth)} × ${numberText(chart.actualHeight)} cm</p><p>密度 ${numberText(project.gauge?.stitches)} 针 × ${numberText(project.gauge?.rows)} 行 / 10 cm；图解 ${data.width} 针 × ${data.height} 行</p>${shoulder ? `<p>${escapeXML(shoulder.label)}</p>` : ''}<div class="legend">${palette}</div>${stitchLegendHTML(data.stitchLegend)}<p class="note">针号从右向左，行号从下向上。相同针数及区间的连续行合并显示；不连续区间需分别处理。此表是裁片形状参考，不是加减针、缝合或完整织法教程。</p><table><thead><tr><th>行号</th><th>编织针数</th><th>编织区间（从右计数）</th></tr></thead><tbody>${rows}</tbody></table></section>${pages.join('')}`;
}

function openPrintDocument(name, createContents) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  let contents;
  try { contents = createContents(); }
  catch (error) { popup.close?.(); throw error; }
  const title = escapeXML(name || '未命名作品');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title} · 编织图解</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eeeae5;color:#2b2926;font:14px ${FONT}}main{max-width:980px;margin:24px auto}section{padding:26px;background:white;margin:20px 0}h1{font-size:25px;margin:0 0 8px}h2{font-size:17px;margin:0 0 10px}p{line-height:1.6;margin:6px 0}svg{display:block;width:100%;height:auto}.overview>svg{max-height:235mm}.note{font-size:11px;color:#6d675f}.toolbar{position:sticky;top:0;background:#2b2926;color:white;padding:14px 24px;z-index:2;display:flex;gap:18px;align-items:center}.toolbar button{font:inherit;border:0;border-radius:5px;background:white;padding:9px 16px;cursor:pointer}.legend{display:flex;flex-wrap:wrap;gap:10px 20px;margin:14px 0}.legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12px}.legend-item b{display:inline-flex;justify-content:center;align-items:center;min-width:24px;height:24px;border:1px solid #b6aea4;border-radius:3px}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:14px}th,td{text-align:left;padding:8px 10px;border:1px solid #d8d2ca}th{background:#f5f2ed}tr{break-inside:avoid}thead{display:table-header-group}.detail-page>svg{max-height:239mm}
    .stitch-legend{margin:14px 0}.stitch-legend h3{font-size:14px;margin:0 0 5px}.stitch-legend-items{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin-top:8px}.stitch-legend-item{display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.5;break-inside:avoid}.stitch-legend-item svg{width:24px;height:24px;flex:none;border:1px solid #b6aea4}.stitch-legend.compact{margin:8px 0}.compact h3{display:none}.compact .stitch-legend-items{display:flex;flex-wrap:wrap;gap:5px 16px}.compact .stitch-legend-item{align-items:center}
    .annotation-page>svg,.pieces-overview>svg{max-height:250mm}@page{size:A4 portrait;margin:10mm}@media print{body{background:white}main{max-width:none;margin:0}.toolbar{display:none}section{padding:0;margin:0}.overview,.annotation-page,.pieces-overview,.instructions,.detail-page{break-after: page;page-break-after:always}main>section:last-child{break-after:auto;page-break-after:auto}.legend-item{-webkit-print-color-adjust:exact;print-color-adjust:exact}svg{-webkit-print-color-adjust:exact;print-color-adjust:exact}.instructions{padding-top:2mm}h2{padding-top:2mm}.note{margin:4px 0}}
    </style></head><body><div class="toolbar"><button onclick="window.print()">打印 / 另存为 PDF</button><span>打印设置中选择彩色；图解针行保持完整。</span></div><main>${contents}</main><script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)})</script></body></html>`;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return true;
}

/** Opens one print-ready document; false means the browser blocked its popup. */
export function printChart(project, chart, garmentName = '编织图解') {
  return openPrintDocument(project.name, () => buildPrintSections(project, chart, garmentName));
}

/** One print window contains the comparison sheet and every piece's detailed instructions. */
export function printAllPieces(project) {
  return openPrintDocument(project.name, () => {
    const pieces = allPieceCharts(project);
    const comparisons = [];
    for (let index = 0; index < pieces.length; index += 6) {
      const comparison = namespaceSVG(combinePieceSVGs(project, pieces.slice(index, index + 6), 'shape'), `print-comparison-${index / 6 + 1}`);
      comparisons.push(`<section class="pieces-overview">${comparison}</section>`);
    }
    return comparisons.join('') + pieces.map((piece, index) => buildPrintSections(piece.project, piece.chart, piece.garmentName, `print-piece-${index + 1}`)).join('');
  });
}

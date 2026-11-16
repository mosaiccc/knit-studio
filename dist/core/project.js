import { validateGrid } from './pattern.js';
import { calculateDimensions, getGarment, getOutline, resolveShoulderWidth } from './garments.js';
import { assertMotifPlacements } from './placements.js';
import { MAX_PIECES, normalizePieces } from './pieces.js';
import { assertStitchSymbols } from './stitches.js';
import { sanitizeCustomOutline } from './outline-editing.js';
import { assertOutlineDrawing, sanitizeOutlineDrawing } from './outline-drawing.js';

const MEASUREMENTS = {
  width: '宽度',
  height: '高度',
  neckWidth: '领宽',
  neckDepth: '领深',
  armholeDepth: '袖窿深',
  shoulderWidth: '肩宽',
  cuffWidth: '袖口宽度',
};
const REQUIRED_KEYS = ['version', 'name', 'grid', 'palette', 'garmentId', 'measurements', 'gauge', 'placement'];
const HEX = /^#[0-9a-f]{6}$/i;
const EDIT_KEY = /^([1-9]\d{0,2}):([1-9]\d{0,2})$/;

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertChartEdits(chartEdits) {
  if (!isRecord(chartEdits)) throw new Error('编织图解的修改记录格式无效。');
  for (const [garmentId, edits] of Object.entries(chartEdits)) {
    getGarment(garmentId);
    if (!isRecord(edits)) throw new Error('每个版型的图解修改需使用针行位置保存。');
    const entries = Object.entries(edits);
    if (entries.length > 240000) throw new Error('每个版型最多保留 240000 个针位修改。');
    for (const [key, color] of entries) {
      const match = EDIT_KEY.exec(key);
      if (!match || Number(match[1]) > 600 || Number(match[2]) > 400) {
        throw new Error('图解修改的针行位置应为 1–600 行、1–400 针。');
      }
      if (typeof color !== 'string' || !HEX.test(color)) throw new Error('图解修改需使用有效的六位十六进制颜色。');
    }
  }
}

function assertAnnotations(annotations) {
  if (!Array.isArray(annotations) || annotations.length > 50) throw new Error('每个作品最多添加 50 条文字标注。');
  const ids = new Set();
  for (const entry of annotations) {
    if (!isRecord(entry)) throw new Error('文字标注格式无效。');
    if (typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 80 || ids.has(entry.id)) {
      throw new Error('文字标注的编号不能为空或重复，且不能超过 80 个字符。');
    }
    ids.add(entry.id);
    if (typeof entry.garmentId !== 'string') throw new Error('文字标注需指定有效的版型。');
    getGarment(entry.garmentId);
    for (const key of ['x', 'y']) {
      if (!isNumber(entry[key]) || entry[key] < 0 || entry[key] > 1) throw new Error('文字标注的位置需在画布范围内。');
    }
    if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 300) {
      throw new Error('标注文字不能为空，且不能超过 300 个字符。');
    }
    if (!isNumber(entry.fontSize) || entry.fontSize < 8 || entry.fontSize > 28) throw new Error('标注文字大小需在 8–28 之间。');
    if (typeof entry.color !== 'string' || !HEX.test(entry.color)) throw new Error('标注文字需使用有效的六位十六进制颜色。');
  }
}

function assertScopedData(value, gauge) {
  if (typeof value.garmentId !== 'string') throw new Error('裁片版型无效。');
  getGarment(value.garmentId);
  if (!isRecord(value.measurements)) throw new Error('项目缺少有效的裁片尺寸。');
  for (const [key, label] of Object.entries(MEASUREMENTS)) {
    const required = key === 'width' || key === 'height';
    if (!required && !Object.hasOwn(value.measurements, key)) continue;
    const measurement = value.measurements[key];
    const positive = required || key === 'shoulderWidth' || key === 'cuffWidth';
    if (!Object.hasOwn(value.measurements, key) || !isNumber(measurement) || (positive ? measurement <= 0 : measurement < 0)) {
      throw new Error(`${label}需为${positive ? '大于零' : '大于或等于零'}的有效数字。`);
    }
  }
  calculateDimensions(value.measurements, gauge);
  getOutline(value.garmentId, value.measurements, value.customOutline);
  assertOutlineDrawing(value.outlineDrawing);
  if (value.chartEdits !== undefined) assertChartEdits(value.chartEdits);
  if (value.stitchSymbols !== undefined) assertStitchSymbols(value.stitchSymbols);
  if (value.annotations !== undefined) assertAnnotations(value.annotations);
  if (value.motifPlacements !== undefined) assertMotifPlacements(value.motifPlacements);
  if (value.arrangement !== undefined && !['legacy', 'custom'].includes(value.arrangement)) {
    throw new Error('花样排列方式无效，请选择原有铺放或自由排列。');
  }
  if (value.placement !== undefined && !['repeat', 'center'].includes(value.placement)) {
    throw new Error('裁片图案放置方式无效，请选择重复铺满或居中放置。');
  }
  if (value.fabricColor !== undefined && (typeof value.fabricColor !== 'string' || !HEX.test(value.fabricColor))) {
    throw new Error('衣片底色需使用有效的六位十六进制颜色。');
  }
}

function assertPieceRecords(value) {
  if (!Array.isArray(value.pieces) || value.pieces.length < 1 || value.pieces.length > MAX_PIECES) throw new Error(`工程需包含 1–${MAX_PIECES} 个裁片。`);
  const ids = new Set();
  for (const piece of value.pieces) {
    if (!isRecord(piece)) throw new Error('裁片记录格式无效。');
    for (const key of ['id', 'label']) {
      if (typeof piece[key] !== 'string' || !piece[key].trim() || piece[key].length > 80) throw new Error('裁片编号和名称需为 1–80 个字符。');
    }
    if (ids.has(piece.id)) throw new Error('裁片编号不能重复。');
    ids.add(piece.id);
    if (!['chartEdits', 'annotations', 'motifPlacements'].every(key => Object.hasOwn(piece, key))) throw new Error('裁片缺少手绘、标注或花样放置信息。');
    assertScopedData(piece, value.gauge);
  }
  if (typeof value.activePieceId !== 'string' || !ids.has(value.activePieceId)) throw new Error('当前编辑裁片不存在。');
}

function assertProject(value) {
  if (!isRecord(value)) throw new Error('项目文件格式无效，请选择本工具导出的 JSON 项目。');
  if (value.version !== 1) throw new Error('项目版本不受支持，目前仅支持版本 1。');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) {
    throw new Error('项目名称不能为空，且不能超过 80 个字符。');
  }
  if (!validateGrid(value.grid)) throw new Error('图案网格无效：需为 4–200 针 × 4–240 行，所有格子使用六位十六进制颜色。');
  if (!Array.isArray(value.palette) || value.palette.length < 1 || value.palette.length > 32 ||
      !Array.from(value.palette).every(color => typeof color === 'string' && HEX.test(color))) {
    throw new Error('项目色板需包含 1–32 个有效的六位十六进制颜色。');
  }
  if (typeof value.garmentId !== 'string') throw new Error('项目版型无效，请选择列表中的版型。');
  getGarment(value.garmentId);
  if (!['repeat', 'center'].includes(value.placement)) throw new Error('图案放置方式无效，请选择重复铺满或居中放置。');
  if (!isRecord(value.gauge)) throw new Error('项目缺少有效的试织密度。');
  for (const [key, label] of [['stitches', '针数'], ['rows', '行数']]) {
    if (!Object.hasOwn(value.gauge, key) || !isNumber(value.gauge[key]) || value.gauge[key] < 0.1 || value.gauge[key] > 100) {
      throw new Error(`每 10 厘米${label}密度需为 0.1–100 之间的数字。`);
    }
  }
  if (!REQUIRED_KEYS.every(key => Object.hasOwn(value, key))) throw new Error('项目文件缺少必要信息，请重新导出后再导入。');
  assertScopedData(value, value.gauge);
  if (value.draftMotifId !== undefined && value.draftMotifId !== null &&
      (typeof value.draftMotifId !== 'string' || !value.draftMotifId.trim() || value.draftMotifId.length > 80)) {
    throw new Error('当前提花编号需为 1–80 个字符，或使用空值表示尚未保存。');
  }
  if (value.draftMotifName !== undefined &&
      (typeof value.draftMotifName !== 'string' || !value.draftMotifName.trim() || value.draftMotifName.length > 80)) {
    throw new Error('当前提花名称不能为空，且不能超过 80 个字符。');
  }
  assertPieceRecords(value.pieces === undefined ? normalizePieces(value) : value);
}

/** A non-throwing check for JSON project data. Unknown fields are ignored. */
export function validateProject(value) {
  try {
    assertProject(value);
    return true;
  } catch {
    return false;
  }
}

/** Validate imported data, then return an independent, minimal project record. */
function sanitizeScopedData(value, defaults = value) {
  const measurements = {};
  for (const key of Object.keys(MEASUREMENTS)) {
    if (Object.hasOwn(value.measurements, key)) measurements[key] = value.measurements[key];
  }
  if (getGarment(value.garmentId).fields.includes('cuffWidth') && measurements.cuffWidth === undefined) measurements.cuffWidth = getGarment(value.garmentId).defaults.cuffWidth;
  const shoulder = resolveShoulderWidth(value.garmentId, measurements);
  if (shoulder !== undefined) measurements.shoulderWidth = shoulder;
  else delete measurements.shoulderWidth;
  return {
    garmentId: value.garmentId,
    measurements,
    customOutline: sanitizeCustomOutline(value.customOutline),
    outlineDrawing: sanitizeOutlineDrawing(value.outlineDrawing),
    arrangement: value.arrangement ?? defaults.arrangement ?? 'legacy',
    placement: value.placement ?? defaults.placement ?? 'repeat',
    fabricColor: (value.fabricColor ?? defaults.fabricColor ?? defaults.palette[0]).toLowerCase(),
    motifPlacements: (value.motifPlacements ?? []).map(entry => ({
      id: entry.id,
      garmentId: entry.garmentId,
      motifId: entry.motifId,
      name: entry.name.trim(),
      grid: entry.grid.map(row => row.map(color => color.toLowerCase())),
      palette: entry.palette.map(color => color.toLowerCase()),
      row: entry.row,
      stitch: entry.stitch,
      transparentBackground: entry.transparentBackground,
      flipX: entry.flipX,
      flipY: entry.flipY,
    })),
    chartEdits: Object.fromEntries(Object.entries(value.chartEdits ?? {}).map(([garmentId, edits]) =>
      [garmentId, Object.fromEntries(Object.entries(edits).map(([key, color]) => [key, color.toLowerCase()]))])),
    stitchSymbols: Object.fromEntries(Object.entries(value.stitchSymbols ?? {}).map(([garmentId, symbols]) =>
      [garmentId, Object.fromEntries(Object.entries(symbols))])),
    annotations: (value.annotations ?? []).map(entry => ({
      id: entry.id,
      garmentId: entry.garmentId,
      x: entry.x,
      y: entry.y,
      text: entry.text,
      fontSize: entry.fontSize,
      color: entry.color.toLowerCase(),
    })),
  };
}

/** Validate the whole project, then synchronize and independently clone each saved piece. */
export function sanitizeProject(value) {
  assertProject(value);
  const result = {
    version: 1,
    name: value.name.trim(),
    grid: value.grid.map(row => row.map(color => color.toLowerCase())),
    palette: value.palette.map(color => color.toLowerCase()),
    gauge: { stitches: value.gauge.stitches, rows: value.gauge.rows },
    draftMotifId: value.draftMotifId ?? null,
    draftMotifName: value.draftMotifName?.trim() ?? '未命名提花',
    ...sanitizeScopedData(value),
  };
  if (value.pieces !== undefined) {
    result.pieces = value.pieces.map(piece => ({ id: piece.id, label: piece.label.trim(), ...sanitizeScopedData(piece, value) }));
    result.activePieceId = value.activePieceId;
  }
  return normalizePieces(result);
}

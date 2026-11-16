import { calculateDimensions, getGarment, getOutline, resolveShoulderWidth } from './garments.js';
import { sanitizeCustomOutline } from './outline-editing.js';
import { sanitizeOutlineDrawing } from './outline-drawing.js';

export const MAX_PIECES = 12;

const SCOPED_FIELDS = ['garmentId', 'measurements', 'customOutline', 'outlineDrawing', 'chartEdits', 'stitchSymbols', 'annotations', 'motifPlacements', 'arrangement', 'placement', 'fabricColor'];
const shortText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function scopedData(value, defaults = {}) {
  getGarment(value.garmentId);
  if (!record(value.measurements)) throw new Error('裁片缺少有效尺寸。');
  const measurements = structuredClone(value.measurements);
  const shoulder = resolveShoulderWidth(value.garmentId, measurements);
  if (shoulder !== undefined) measurements.shoulderWidth = shoulder;
  return {
    garmentId: value.garmentId,
    measurements,
    customOutline: sanitizeCustomOutline(value.customOutline),
    outlineDrawing: sanitizeOutlineDrawing(value.outlineDrawing),
    chartEdits: structuredClone(value.chartEdits ?? {}),
    stitchSymbols: structuredClone(value.stitchSymbols ?? {}),
    annotations: structuredClone(value.annotations ?? []),
    motifPlacements: structuredClone(value.motifPlacements ?? []),
    arrangement: value.arrangement ?? defaults.arrangement ?? 'legacy',
    placement: value.placement ?? defaults.placement ?? 'repeat',
    fabricColor: (value.fabricColor ?? defaults.fabricColor ?? value.palette?.[0] ?? defaults.palette?.[0] ?? '#f5efe3').toLowerCase(),
  };
}

function migrationLayout(garmentId) {
  switch (garmentId) {
    case 'round-front': case 'round-back':
      return { active: garmentId === 'round-back' ? 'back' : 'front', pieces: [['front', '前片', 'round-front'], ['back', '后片', 'round-back']] };
    case 'v-front':
      return { active: 'front', pieces: [['front', '前片', 'v-front'], ['back', '后片', 'round-back']] };
    case 'vest-back':
      return { active: 'back', pieces: [['front', '前片', 'round-front'], ['back', '后片', 'vest-back']] };
    case 'mock-neck': case 'camisole':
      return { active: 'front', pieces: [['front', '前片', garmentId], ['back', '后片', garmentId]] };
    case 'cardigan-left': case 'cardigan-right':
      return { active: garmentId === 'cardigan-right' ? 'right' : 'left', pieces: [['left', '左前片', 'cardigan-left'], ['right', '右前片', 'cardigan-right'], ['back', '后片', 'round-back']] };
    default:
      return { active: 'main', pieces: [['main', getGarment(garmentId).name, garmentId]] };
  }
}

function companionMeasurements(project, source, garmentId, pieceId) {
  const m = { ...getGarment(source.garmentId).defaults, ...source.measurements };
  const cardiganBack = source.garmentId.startsWith('cardigan-') && pieceId === 'back';
  if (cardiganBack) {
    m.width *= 2;
    m.neckWidth *= 2;
    m.shoulderWidth *= 2;
    // A generated reference must never make a previously valid half-front unloadable.
    const maxWidth = Math.floor(4000 / project.gauge.stitches * 1e6) / 1e6;
    m.width = Math.min(m.width, maxWidth);
    if (m.neckWidth >= m.width) m.neckWidth = m.width * .75;
    m.shoulderWidth = Math.min(m.shoulderWidth, m.width);
    if (m.shoulderWidth <= m.neckWidth) m.shoulderWidth = (m.neckWidth + m.width) / 2;
  }
  const sameMockNeck = garmentId === 'mock-neck' && source.garmentId === 'mock-neck';
  const oppositeCardigan = garmentId.startsWith('cardigan-') && source.garmentId.startsWith('cardigan-');
  if (!sameMockNeck && !oppositeCardigan) {
    const depth = pieceId === 'back' ? (garmentId === 'vest-back' ? 4 : 3) : getGarment(garmentId).defaults.neckDepth;
    m.neckDepth = depth < m.height ? depth : m.height / 2;
  }
  return m;
}

function migrate(project) {
  const source = scopedData(project);
  const layout = migrationLayout(source.garmentId);
  const pieces = layout.pieces.map(([id, label, garmentId]) => {
    if (id === layout.active) return { id, label, ...scopedData(source) };
    // Old garment-keyed archives may contain a different companion's earlier work.
    // A newly created same-template back starts independently from its front.
    const useArchive = garmentId !== source.garmentId;
    const edits = useArchive && Object.hasOwn(source.chartEdits, garmentId) ? { [garmentId]: source.chartEdits[garmentId] } : {};
    const symbols = useArchive && Object.hasOwn(source.stitchSymbols, garmentId) ? { [garmentId]: source.stitchSymbols[garmentId] } : {};
    return {
      id, label, garmentId,
      measurements: companionMeasurements(project, source, garmentId, id),
      chartEdits: structuredClone(edits),
      stitchSymbols: structuredClone(symbols),
      annotations: useArchive ? structuredClone(source.annotations.filter(note => note.garmentId === garmentId)) : [],
      motifPlacements: useArchive ? structuredClone(source.motifPlacements.filter(motif => motif.garmentId === garmentId)) : [],
      arrangement: source.arrangement,
      placement: source.placement,
      fabricColor: source.fabricColor,
    };
  });
  return { pieces, activePieceId: layout.active };
}

function assertDescriptors(project) {
  if (!Array.isArray(project.pieces) || project.pieces.length < 1 || project.pieces.length > MAX_PIECES) throw new Error(`工程需包含 1–${MAX_PIECES} 个裁片。`);
  const ids = new Set();
  for (const piece of project.pieces) {
    if (!record(piece) || !shortText(piece.id) || !shortText(piece.label)) throw new Error('裁片编号和名称需为 1–80 个字符。');
    if (ids.has(piece.id)) throw new Error('裁片编号不能重复。');
    ids.add(piece.id);
  }
  if (!shortText(project.activePieceId) || !ids.has(project.activePieceId)) throw new Error('当前编辑裁片不存在。');
}

/** Migrate old single-piece projects and synchronize authoritative active top-level fields. */
export function normalizePieces(project) {
  if (!record(project)) throw new Error('工程裁片数据无效。');
  const result = structuredClone(project);
  if (result.pieces === undefined) Object.assign(result, migrate(result));
  assertDescriptors(result);
  result.pieces = result.pieces.map(piece => ({ id: piece.id, label: piece.label.trim(), ...scopedData(piece, result) }));
  const index = result.pieces.findIndex(piece => piece.id === result.activePieceId);
  const active = scopedData(result);
  result.pieces[index] = { id: result.pieces[index].id, label: result.pieces[index].label, ...structuredClone(active) };
  Object.assign(result, active);
  return result;
}

/** Save pending active-piece measurements, drawings and annotations without mutating input. */
export function syncActivePiece(project) {
  return normalizePieces(project);
}

/** Synchronize the previous piece before presenting a detached copy of the next piece. */
export function switchActivePiece(project, id) {
  const result = syncActivePiece(project);
  const target = result.pieces.find(piece => piece.id === id);
  if (!target) throw new Error('未找到要编辑的裁片。');
  Object.assign(result, scopedData(target), { activePieceId: id });
  return result;
}

function assertPieceSizes(project) {
  for (const piece of project.pieces) {
    calculateDimensions(piece.measurements, project.gauge);
    getOutline(piece.garmentId, piece.measurements, piece.customOutline);
  }
}

function assertNewDescriptor(project, options) {
  if (!record(options) || !shortText(options.id) || !shortText(options.label)) throw new Error('裁片编号和名称需为 1–80 个字符。');
  if (project.pieces.some(piece => piece.id === options.id)) throw new Error('裁片编号不能重复。');
  if (project.pieces.length >= MAX_PIECES) throw new Error(`每个工程最多添加 ${MAX_PIECES} 个裁片。`);
}

function selectPiece(project, piece) {
  Object.assign(project, scopedData(piece), { activePieceId: piece.id });
  assertPieceSizes(project);
  return project;
}

/** Add one blank template using the current fabric color and the shared project gauge. */
export function addPiece(project, options) {
  const result = syncActivePiece(project);
  assertNewDescriptor(result, options);
  const garment = getGarment(options.garmentId);
  const piece = {
    id: options.id,
    label: options.label.trim(),
    ...scopedData({
      garmentId: options.garmentId,
      measurements: garment.defaults,
      arrangement: 'custom',
      placement: 'repeat',
      fabricColor: result.fabricColor,
    }),
  };
  result.pieces.push(piece);
  return selectPiece(result, piece);
}

/** Duplicate a synchronized piece immediately after its source, with independent nested data. */
export function duplicatePiece(project, id, options) {
  const result = syncActivePiece(project);
  const index = result.pieces.findIndex(piece => piece.id === id);
  if (index < 0) throw new Error('未找到要复制的裁片。');
  assertNewDescriptor(result, options);
  const piece = { ...structuredClone(result.pieces[index]), id: options.id, label: options.label.trim() };
  result.pieces.splice(index + 1, 0, piece);
  return selectPiece(result, piece);
}

/** Rename a piece without changing the active piece or losing pending edits. */
export function renamePiece(project, id, label) {
  const result = syncActivePiece(project);
  const piece = result.pieces.find(entry => entry.id === id);
  if (!piece) throw new Error('未找到要重命名的裁片。');
  if (!shortText(label)) throw new Error('裁片名称需为 1–80 个字符。');
  piece.label = label.trim();
  assertPieceSizes(result);
  return result;
}

/** Remove one piece; after removing the active piece prefer its next neighbor, then previous. */
export function removePiece(project, id) {
  const result = syncActivePiece(project);
  const index = result.pieces.findIndex(piece => piece.id === id);
  if (index < 0) throw new Error('未找到要删除的裁片。');
  if (result.pieces.length === 1) throw new Error('工程至少保留一个裁片，不能删除最后一个裁片。');
  result.pieces.splice(index, 1);
  if (result.activePieceId === id) return selectPiece(result, result.pieces[Math.min(index, result.pieces.length - 1)]);
  assertPieceSizes(result);
  return result;
}

/** Independent flat views for rendering/export; deliberately omit nested piece metadata. */
export function getPieceProjects(project) {
  const normalized = syncActivePiece(project);
  const { pieces, activePieceId, ...shared } = normalized;
  return pieces.map(piece => {
    const view = structuredClone(shared);
    for (const field of SCOPED_FIELDS) view[field] = structuredClone(piece[field]);
    return { id: piece.id, label: piece.label, project: view };
  });
}

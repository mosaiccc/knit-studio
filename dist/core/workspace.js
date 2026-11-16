import { validateGrid } from './pattern.js';
import { sanitizeProject } from './project.js';

const MAX_PROJECTS = 30;
const MAX_MOTIFS = 100;
const HEX = /^#[0-9a-f]{6}$/i;

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function identifier(value, kind) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80) throw new Error(`${kind}编号不能为空，且不能超过 80 个字符。`);
  return value;
}

function timestamp(value) {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') throw new Error('工程更新时间无效。');
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error('工程更新时间无效。');
  return result.toISOString();
}

/** Validates and independently copies a library motif without any project-specific fields. */
export function sanitizeMotif(value) {
  if (!isRecord(value)) throw new Error('提花数据格式无效。');
  const id = identifier(value.id, '提花');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('提花名称不能为空，且不能超过 80 个字符。');
  if (!validateGrid(value.grid)) throw new Error('提花网格无效：需为 4–200 针 × 4–240 行，使用六位十六进制颜色。');
  if (!Array.isArray(value.palette) || value.palette.length < 1 || value.palette.length > 32 ||
    !Array.from(value.palette).every(color => typeof color === 'string' && HEX.test(color))) throw new Error('提花色板需包含 1–32 个有效的六位十六进制颜色。');
  return { id, name: value.name.trim(), grid: value.grid.map(row => row.map(color => color.toLowerCase())), palette: value.palette.map(color => color.toLowerCase()) };
}

/** Imports the standalone .knit-motif.json format from an object or JSON text. */
export function parseMotifFile(value) {
  let raw = value;
  if (typeof value === 'string') {
    try { raw = JSON.parse(value); }
    catch { throw new Error('提花文件不是有效的 JSON 格式，请选择本工具导出的提花文件。'); }
  }
  if (!isRecord(raw) || raw.format !== 'knit-motif-v1') throw new Error('提花文件格式或版本不受支持，请选择 .knit-motif.json 文件。');
  return sanitizeMotif(raw.motif);
}

/** Migrates a single legacy project into a workspace; explicit id/time make the result reproducible. */
export function createWorkspace(initialProject, id = 'project-1', now = new Date().toISOString()) {
  return {
    version: 1,
    activeProjectId: identifier(id, '工程'),
    projects: [{ id, updatedAt: timestamp(now), project: sanitizeProject(initialProject) }],
    motifs: [],
  };
}

/** Validates the complete workspace and returns a detached minimal snapshot. Invalid entries are never silently discarded. */
export function sanitizeWorkspace(raw) {
  if (!isRecord(raw)) throw new Error('工程工作区格式无效。');
  if (raw.version !== 1) throw new Error('工程工作区版本不受支持，目前仅支持版本 1。');
  if (!Array.isArray(raw.projects) || raw.projects.length < 1 || raw.projects.length > MAX_PROJECTS) throw new Error(`工程工作区需包含 1–${MAX_PROJECTS} 个工程。`);
  if (!Array.isArray(raw.motifs) || raw.motifs.length > MAX_MOTIFS) throw new Error(`提花库最多保存 ${MAX_MOTIFS} 个提花。`);
  const projectIds = new Set();
  const projects = Array.from(raw.projects, entry => {
    if (!isRecord(entry)) throw new Error('工程记录格式无效。');
    const id = identifier(entry.id, '工程');
    if (projectIds.has(id)) throw new Error('工程编号不能重复。');
    projectIds.add(id);
    return { id, updatedAt: timestamp(entry.updatedAt), project: sanitizeProject(entry.project) };
  });
  const activeProjectId = identifier(raw.activeProjectId, '当前工程');
  if (!projectIds.has(activeProjectId)) throw new Error('当前工程不存在于工程工作区中。');
  const motifIds = new Set();
  const motifs = Array.from(raw.motifs, value => {
    const motif = sanitizeMotif(value);
    if (motifIds.has(motif.id)) throw new Error('提花编号不能重复。');
    motifIds.add(motif.id);
    return motif;
  });
  return { version: 1, activeProjectId, projects, motifs };
}

/** Saves a project without changing the currently active project. */
export function upsertProject(workspace, id, project, now = new Date().toISOString()) {
  const result = sanitizeWorkspace(workspace);
  identifier(id, '工程');
  const index = result.projects.findIndex(entry => entry.id === id);
  if (index < 0 && result.projects.length >= MAX_PROJECTS) throw new Error(`最多保存 ${MAX_PROJECTS} 个工程，请先导出备份并删除不需要的工程。`);
  const entry = { id, updatedAt: timestamp(now), project: sanitizeProject(project) };
  if (index < 0) result.projects.push(entry);
  else result.projects[index] = entry;
  return result;
}

export function activateProject(workspace, id) {
  const result = sanitizeWorkspace(workspace);
  identifier(id, '工程');
  if (!result.projects.some(entry => entry.id === id)) throw new Error('未找到要打开的工程。');
  result.activeProjectId = id;
  return result;
}

export function removeProject(workspace, id) {
  const result = sanitizeWorkspace(workspace);
  identifier(id, '工程');
  if (!result.projects.some(entry => entry.id === id)) throw new Error('未找到要删除的工程。');
  if (result.projects.length === 1) throw new Error('请至少保留一个工程，不能删除最后一个工程。');
  result.projects = result.projects.filter(entry => entry.id !== id);
  if (result.activeProjectId === id) result.activeProjectId = result.projects[0].id;
  return result;
}

export function upsertMotif(workspace, motif) {
  const result = sanitizeWorkspace(workspace);
  const next = sanitizeMotif(motif);
  const index = result.motifs.findIndex(entry => entry.id === next.id);
  if (index < 0 && result.motifs.length >= MAX_MOTIFS) throw new Error(`提花库最多保存 ${MAX_MOTIFS} 个提花，请先导出备份并删除不需要的提花。`);
  if (index < 0) result.motifs.push(next);
  else result.motifs[index] = next;
  return result;
}

export function removeMotif(workspace, id) {
  const result = sanitizeWorkspace(workspace);
  identifier(id, '提花');
  if (!result.motifs.some(entry => entry.id === id)) throw new Error('未找到要删除的提花。');
  result.motifs = result.motifs.filter(entry => entry.id !== id);
  return result;
}

import { validateGrid } from './pattern.js';
import { createGarmentChart, getGarment } from './garments.js';
import { applyChartEdits } from './chart-editing.js';

const HEX = /^#[0-9a-f]{6}$/i;
const shortText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;

function validPalette(palette) {
  return Array.isArray(palette) && palette.length >= 1 && palette.length <= 32 &&
    Array.from(palette).every(color => typeof color === 'string' && HEX.test(color));
}

/** Shared schema check for saved projects and standalone placement composition. */
export function assertMotifPlacements(placements) {
  if (!Array.isArray(placements) || placements.length > 100) throw new Error('每个工程最多放置 100 个花样。');
  const ids = new Set();
  for (const placement of placements) {
    if (!placement || typeof placement !== 'object' || Array.isArray(placement) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(placement))) throw new Error('花样放置记录格式无效。');
    for (const [key, label] of [['id', '放置编号'], ['motifId', '提花编号'], ['name', '花样名称']]) {
      if (!shortText(placement[key])) throw new Error(`${label}不能为空，且不能超过 80 个字符。`);
    }
    if (ids.has(placement.id)) throw new Error('花样放置编号不能重复。');
    ids.add(placement.id);
    if (typeof placement.garmentId !== 'string') throw new Error('花样需指定有效的版型。');
    getGarment(placement.garmentId);
    if (!validateGrid(placement.grid)) throw new Error('放置花样的网格需为 4–200 针 × 4–240 行，并使用有效的六位颜色。');
    if (!validPalette(placement.palette)) throw new Error('放置花样的色板需包含 1–32 个有效的六位颜色。');
    if (!Number.isInteger(placement.row) || placement.row < 1 || placement.row > 600 ||
        !Number.isInteger(placement.stitch) || placement.stitch < 1 || placement.stitch > 400) {
      throw new Error('花样右下角的位置需为 1–600 行、1–400 针之间的整数。');
    }
    for (const key of ['transparentBackground', 'flipX', 'flipY']) {
      if (typeof placement[key] !== 'boolean') throw new Error('花样的隐藏底色与翻转设置需为有效的开关值。');
    }
  }
}

/** Place detached motif snapshots in array order, clipped to the current garment. */
export function composePlacementChart(chart, placements = [], garmentId) {
  getGarment(garmentId);
  assertMotifPlacements(placements);
  const result = applyChartEdits(chart);
  const height = result.grid.length;
  const width = result.grid[0].length;
  for (const placement of placements) {
    if (placement.garmentId !== garmentId) continue;
    const tileHeight = placement.grid.length;
    const tileWidth = placement.grid[0].length;
    const left = width - placement.stitch - tileWidth + 1;
    const top = height - placement.row - tileHeight + 1;
    const background = placement.palette[0].toLowerCase();
    for (let y = Math.max(0, top); y < Math.min(height, top + tileHeight); y++) {
      for (let x = Math.max(0, left); x < Math.min(width, left + tileWidth); x++) {
        if (result.grid[y][x] === null) continue;
        const sourceY = placement.flipY ? tileHeight - 1 - (y - top) : y - top;
        const sourceX = placement.flipX ? tileWidth - 1 - (x - left) : x - left;
        const color = placement.grid[sourceY][sourceX].toLowerCase();
        if (!placement.transparentBackground || color !== background) result.grid[y][x] = color;
      }
    }
  }
  return result;
}

/** Garment plus motif placements, before hand-drawn edits; use as the edit capture base. */
export function createBaseChart(project) {
  if (!project || typeof project !== 'object') throw new Error('工程数据无效。');
  const arrangement = project.arrangement === undefined ? 'legacy' : project.arrangement;
  if (!['legacy', 'custom'].includes(arrangement)) throw new Error('花样排列方式无效，请选择原有铺放或自由排列。');
  if (!validateGrid(project.grid) || !validPalette(project.palette)) throw new Error('工程的提花网格或色板无效。');
  let pattern = project.grid;
  if (arrangement === 'custom') {
    const background = project.fabricColor ?? project.palette[0];
    if (typeof background !== 'string' || !HEX.test(background)) throw new Error('衣片底色需使用有效的六位颜色。');
    pattern = [[background.toLowerCase()]];
  }
  const base = createGarmentChart(project.garmentId, project.measurements, project.gauge, pattern, project.placement, project.customOutline);
  return composePlacementChart(base, project.motifPlacements ?? [], project.garmentId);
}

/** Complete output: garment background, ordered motifs, then hand-drawn stitches. */
export function composeProjectChart(project) {
  return applyChartEdits(createBaseChart(project), project.chartEdits?.[project.garmentId] ?? {});
}

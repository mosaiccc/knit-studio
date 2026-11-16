/** Garment chart edits use one-based rows from the bottom and stitches from the right. */
import {forEachBrushCell} from './brush.js';
const HEX = /^#[0-9a-f]{6}$/i;
const EDIT_KEY = /^([1-9]\d{0,2}):([1-9]\d{0,2})$/;

function checkGrid(grid) {
  if (!Array.isArray(grid) || grid.length < 1 || grid.length > 600 ||
      !Array.isArray(grid[0]) || grid[0].length < 1 || grid[0].length > 400) {
    throw new Error('编织图解需为 1–400 针 × 1–600 行。');
  }
  const width = grid[0].length;
  for (let y = 0; y < grid.length; y++) {
    if (!Array.isArray(grid[y]) || grid[y].length !== width) throw new Error('编织图解的各行长度必须一致。');
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      if (cell !== null && (typeof cell !== 'string' || !HEX.test(cell))) {
        throw new Error('编织图解格子需为六位十六进制颜色，裁片外使用空值。');
      }
    }
  }
}

function checkColor(color) {
  if (typeof color !== 'string' || !HEX.test(color)) throw new Error('请选择有效的六位十六进制颜色。');
  return color.toLowerCase();
}

function checkCoordinates(...values) {
  if (!values.every(Number.isSafeInteger)) throw new Error('针行位置必须是有限整数。');
}

function editEntries(edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(edits))) {
    throw new Error('编织图解的修改记录格式无效。');
  }
  const entries = Object.entries(edits);
  if (entries.length > 240000) throw new Error('每个版型最多保留 240000 个针位修改。');
  for (const [key, color] of entries) {
    const match = EDIT_KEY.exec(key);
    if (!match || Number(match[1]) > 600 || Number(match[2]) > 400) {
      throw new Error('图解修改的针行位置应为 1–600 行、1–400 针。');
    }
    checkColor(color);
  }
  return entries;
}

function checkedChart(chart) {
  if (!chart || typeof chart !== 'object' || Array.isArray(chart)) throw new Error('编织图解格式无效。');
  checkGrid(chart.grid);
  const width = chart.grid[0].length;
  const height = chart.grid.length;
  if ((chart.width !== undefined && chart.width !== width) ||
      (chart.height !== undefined && chart.height !== height)) throw new Error('编织图解的尺寸与网格不一致。');
  return { width, height };
}

/** Keep shape and metadata intact; edits hidden by the current shape remain dormant. */
export function applyChartEdits(chart, edits = {}) {
  const { width, height } = checkedChart(chart);
  const entries = editEntries(edits);
  const grid = chart.grid.map(row => row.slice());
  for (const [key, color] of entries) {
    const [row, stitch] = key.split(':').map(Number);
    const x = width - stitch;
    const y = height - row;
    if (x >= 0 && y >= 0 && grid[y][x] !== null) grid[y][x] = color.toLowerCase();
  }
  return { ...chart, grid };
}

/** Store only visible changes, while keeping previous edits outside this shape or size. */
export function captureChartEdits(baseChart, editedGrid, previous = {}) {
  const { width, height } = checkedChart(baseChart);
  checkGrid(editedGrid);
  if (editedGrid.length !== height || editedGrid[0].length !== width) throw new Error('修改后的图解尺寸必须与原图解一致。');
  const edits = Object.fromEntries(editEntries(previous).map(([key, color]) => [key, color.toLowerCase()]));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = baseChart.grid[y][x];
      const edited = editedGrid[y][x];
      if ((base === null) !== (edited === null)) throw new Error('绘制时不能改变裁片轮廓。');
      if (base === null) continue;
      const key = `${height - y}:${width - x}`;
      if (base.toLowerCase() === edited.toLowerCase()) delete edits[key];
      else edits[key] = edited.toLowerCase();
    }
  }
  return edits;
}

/** Draw a continuous Bresenham stroke, skipping every null cell independently. */
export function paintChartLine(grid, x0, y0, x1, y1, color, mirror = false, size = 1, mirrorVertical = false) {
  checkGrid(grid);
  checkCoordinates(x0, y0, x1, y1);
  color = checkColor(color);
  const result = grid.map(row => row.slice());
  const width = grid[0].length;
  const height = grid.length;
  forEachBrushCell(width, height, x0, y0, x1, y1, size, mirror, (x, y) => {
    if (grid[y][x] !== null) result[y][x] = color;
  }, mirrorVertical);
  return result;
}

/** Fill only four-connected cloth cells of the starting color; never cross cutouts. */
export function fillChartRegion(grid, x, y, color) {
  checkGrid(grid);
  checkCoordinates(x, y);
  color = checkColor(color);
  const result = grid.map(row => row.slice());
  const width = grid[0].length;
  const height = grid.length;
  if (x < 0 || x >= width || y < 0 || y >= height || grid[y][x] === null) return result;
  const target = grid[y][x].toLowerCase();
  if (target === color) return result;
  const stack = [y * width + x];
  result[y][x] = color;
  const visit = (nx, ny) => {
    if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
        result[ny][nx] !== null && result[ny][nx].toLowerCase() === target) {
      result[ny][nx] = color;
      stack.push(ny * width + nx);
    }
  };
  while (stack.length) {
    const point = stack.pop();
    const px = point % width;
    const py = Math.floor(point / width);
    visit(px - 1, py);
    visit(px + 1, py);
    visit(px, py - 1);
    visit(px, py + 1);
  }
  return result;
}

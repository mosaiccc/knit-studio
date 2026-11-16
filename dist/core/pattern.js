/** Pure stitch-chart operations. Rows run from the top of a chart to its bottom. */
import {forEachBrushCell} from './brush.js';
const CREAM = '#f5efe3';
const ROSE = '#bf6373';
const OLIVE = '#79836a';
const DARK_ROSE = '#824859';
const HEX = /^#[0-9a-f]{6}$/i;

function checkDimensions(width, height) {
  if (!Number.isInteger(width) || width < 4 || width > 200 ||
      !Number.isInteger(height) || height < 4 || height > 240) {
    throw new RangeError('Chart dimensions must be 4–200 stitches by 4–240 rows.');
  }
}

function normalizedColor(color) {
  if (typeof color !== 'string' || !HEX.test(color)) {
    throw new TypeError('A color must be a six-digit hex string.');
  }
  return color.toLowerCase();
}

export function validateGrid(grid) {
  if (!Array.isArray(grid) || grid.length < 4 || grid.length > 240) return false;
  if (!Array.isArray(grid[0]) || grid[0].length < 4 || grid[0].length > 200) return false;
  const width = grid[0].length;
  return Array.from(grid).every(row => Array.isArray(row) && row.length === width &&
    Array.from(row).every(color => typeof color === 'string' && HEX.test(color)));
}

function checkGrid(grid) {
  if (!validateGrid(grid)) throw new TypeError('Invalid stitch chart.');
}

function cloneGrid(grid) {
  return grid.map(row => row.map(color => color.toLowerCase()));
}

function checkCoordinates(...coordinates) {
  if (!coordinates.every(Number.isSafeInteger)) throw new TypeError('Stitch coordinates must be finite integers.');
}

export function createGrid(width, height, fill = CREAM) {
  checkDimensions(width, height);
  const color = normalizedColor(fill);
  return Array.from({ length: height }, () => Array(width).fill(color));
}

export function resizeGrid(grid, width, height, fill = CREAM) {
  checkGrid(grid);
  const result = createGrid(width, height, fill);
  for (let y = 0; y < Math.min(height, grid.length); y++) {
    for (let x = 0; x < Math.min(width, grid[0].length); x++) result[y][x] = grid[y][x].toLowerCase();
  }
  return result;
}

export function floodFill(grid, x, y, color) {
  checkGrid(grid);
  checkCoordinates(x, y);
  color = normalizedColor(color);
  const result = cloneGrid(grid);
  const height = result.length;
  const width = result[0].length;
  if (x < 0 || x >= width || y < 0 || y >= height || result[y][x] === color) return result;
  const target = result[y][x];
  const stack = [[x, y]];
  result[y][x] = color;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && result[ny][nx] === target) {
        result[ny][nx] = color;
        stack.push([nx, ny]);
      }
    }
  }
  return result;
}

export function drawLine(grid, x0, y0, x1, y1, color, mirror = false, size = 1) {
  checkGrid(grid);
  checkCoordinates(x0, y0, x1, y1);
  color = normalizedColor(color);
  const result = cloneGrid(grid);
  const width = result[0].length;
  const height = result.length;
  forEachBrushCell(width, height, x0, y0, x1, y1, size, mirror, (x, y) => { result[y][x] = color; });
  return result;
}

export function flipGrid(grid, axis = 'horizontal') {
  checkGrid(grid);
  if (axis !== 'horizontal' && axis !== 'vertical') throw new RangeError('Flip axis must be horizontal or vertical.');
  const result = cloneGrid(grid);
  return axis === 'horizontal' ? result.map(row => row.reverse()) : result.reverse();
}

export function colorCounts(grid) {
  checkGrid(grid);
  const counts = new Map();
  for (const row of grid) {
    for (const cell of row) {
      const color = cell.toLowerCase();
      counts.set(color, (counts.get(color) || 0) + 1);
    }
  }
  return [...counts].map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));
}

const rgbToHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function makeColorBox(points) {
  const lower = [255, 255, 255];
  const upper = [0, 0, 0];
  let weight = 0;
  for (const point of points) {
    weight += point.count;
    for (let channel = 0; channel < 3; channel++) {
      lower[channel] = Math.min(lower[channel], point.rgb[channel]);
      upper[channel] = Math.max(upper[channel], point.rgb[channel]);
    }
  }
  const ranges = upper.map((value, channel) => value - lower[channel]);
  const channel = ranges.indexOf(Math.max(...ranges));
  return { points, weight, channel, score: ranges[channel] * Math.sqrt(weight) };
}

/** Weighted median cut; input pixels have already been sampled to chart size. */
export function quantizePixels(rgba, width, height, maxColors = 6, background = CREAM) {
  checkDimensions(width, height);
  background = normalizedColor(background);
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > 32) {
    throw new RangeError('Palette size must be an integer from 1 to 32.');
  }
  if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) {
    throw new TypeError('Image pixels must be an RGBA byte array.');
  }
  if (rgba.length !== width * height * 4) throw new RangeError('Pixel data must exactly match chart dimensions.');
  const bg = hexToRgb(background);
  const pixels = [];
  const histogram = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255;
    const rgb = bg.map((value, channel) => Math.round(rgba[i + channel] * alpha + value * (1 - alpha)));
    const key = rgbToHex(rgb);
    pixels.push(key);
    const point = histogram.get(key);
    if (point) point.count++;
    else histogram.set(key, { key, rgb, count: 1 });
  }
  const points = [...histogram.values()].sort((a, b) => a.key.localeCompare(b.key));
  let palette;
  if (points.length <= maxColors) {
    palette = points.map(point => point.key);
  } else {
    const boxes = [makeColorBox(points)];
    while (boxes.length < maxColors) {
      let best = -1;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].points.length > 1 && (best < 0 || boxes[i].score > boxes[best].score)) best = i;
      }
      if (best < 0) break;
      const box = boxes[best];
      const sorted = [...box.points].sort((a, b) => a.rgb[box.channel] - b.rgb[box.channel] || a.key.localeCompare(b.key));
      let weight = 0;
      let split = 0;
      while (split < sorted.length - 1 && weight < box.weight / 2) weight += sorted[split++].count;
      boxes.splice(best, 1, makeColorBox(sorted.slice(0, split)), makeColorBox(sorted.slice(split)));
    }
    palette = [...new Set(boxes.map(box => {
      const mean = [0, 0, 0];
      for (const point of box.points) {
        for (let channel = 0; channel < 3; channel++) mean[channel] += point.rgb[channel] * point.count / box.weight;
      }
      return rgbToHex(mean);
    }))];
  }
  const paletteRgb = palette.map(hexToRgb);
  const nearest = new Map();
  for (const point of points) {
    let index = 0;
    let distance = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = paletteRgb[i].reduce((sum, value, channel) => sum + (value - point.rgb[channel]) ** 2, 0);
      if (d < distance) { distance = d; index = i; }
    }
    nearest.set(point.key, palette[index]);
  }
  const grid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => nearest.get(pixels[y * width + x])));
  return { grid, palette: colorCounts(grid).map(entry => entry.color) };
}

const TULIP = [
  '..r.....r..',
  '..rr.r.rr..',
  '..rrrrrrr..',
  '..rdrrrdr..',
  '...rrrrr...',
  '....rrr....',
  '.....g.....',
  '.....g.....',
  '..g..g..g..',
  '..gg.g.gg..',
  '...ggggg...',
  '....ggg....',
  '.....g.....',
  '.....g.....',
];

const STAR = [
  '....r....',
  '.r..r..r.',
  '..r.r.r..',
  '...rrr...',
  'rrrrdrrrr',
  '...rrr...',
  '..r.r.r..',
  '.r..r..r.',
  '....r....',
];

function stamp(grid, motif, left, top) {
  const colors = { r: ROSE, g: OLIVE, d: DARK_ROSE };
  motif.forEach((row, y) => [...row].forEach((cell, x) => {
    if (colors[cell] && grid[top + y]?.[left + x] !== undefined) grid[top + y][left + x] = colors[cell];
  }));
}

export function generateMotif(width = 32, height = 40, style = 'tulip') {
  const grid = createGrid(width, height);
  if (!['tulip', 'nordic', 'diamond', 'blank'].includes(style)) throw new RangeError('Unknown motif style.');
  if (style === 'blank') return grid;
  if (style === 'diamond') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.abs((x % 12) - 5.5) + Math.abs((y % 12) - 5.5);
        if (distance === 5) grid[y][x] = ROSE;
        else if (distance === 3) grid[y][x] = OLIVE;
        else if (distance === 1) grid[y][x] = DARK_ROSE;
      }
    }
    return grid;
  }
  const motif = style === 'tulip' ? TULIP : STAR;
  const columns = Math.max(1, Math.floor(width / (style === 'tulip' ? 16 : 14)));
  const rows = Math.max(1, Math.floor(height / (style === 'tulip' ? 20 : 16)));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const left = Math.floor((column + 0.5) * width / columns - motif[0].length / 2);
      const top = Math.floor((row + 0.5) * height / rows - motif.length / 2);
      stamp(grid, motif, left, top);
    }
  }
  if (style === 'nordic') {
    for (let row = 0; row < rows; row++) {
      const y = Math.floor((row + 1) * height / rows) - 2;
      for (let x = 1; x < width; x += 2) grid[y][x] = OLIVE;
    }
  }
  return grid;
}

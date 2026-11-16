/** Color extraction and stitch sampling from an already-cropped image. No DOM dependencies. */
const MAX_SOURCE_PIXELS = 1024 * 1024;
const hex = rgb => '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
const unpack = value => [value >>> 16, (value >>> 8) & 255, value & 255];
const pack = (r, g, b) => (r << 16) | (g << 8) | b;
const bucket = (r, g, b) => ((r >>> 3) << 10) | ((g >>> 3) << 5) | (b >>> 3);
const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const luminance = rgb => .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];

function closest(rgb, palette) {
  let chosen = 0, best = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const difference = distance(rgb, palette[i]);
    if (difference < best) { chosen = i; best = difference; }
  }
  return chosen;
}

function extractPalette(points, limit) {
  if (points.length <= limit) return points.map(point => [...point.rgb]);
  if (limit === 1) {
    const weight = points.reduce((sum, point) => sum + point.count, 0);
    return [[0, 1, 2].map(channel => points.reduce((sum, point) => sum + point.rgb[channel] * point.count, 0) / weight)];
  }
  // Color separation takes precedence over area: a small dark face needs a color of its own.
  // A modest frequency weight still favors supported image colors over individual outliers.
  let first = points[0];
  for (const point of points) if (point.count > first.count) first = point;
  let palette = [[...first.rgb]];
  const nearestDistance = new Float64Array(points.length).fill(Infinity);
  while (palette.length < limit) {
    let candidate = -1, best = -1;
    const latest = palette.at(-1);
    for (let i = 0; i < points.length; i++) {
      nearestDistance[i] = Math.min(nearestDistance[i], distance(points[i].rgb, latest));
      const score = nearestDistance[i] * Math.sqrt(Math.sqrt(points[i].count));
      if (score > best) { candidate = i; best = score; }
    }
    if (candidate < 0 || best <= 0) break;
    palette.push([...points[candidate].rgb]);
  }
  for (let iteration = 0; iteration < 10; iteration++) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    for (const point of points) {
      const sum = sums[closest(point.rgb, palette)], weight = Math.sqrt(point.count);
      for (let channel = 0; channel < 3; channel++) sum[channel] += point.rgb[channel] * weight;
      sum[3] += weight;
    }
    const next = sums.map((sum, i) => sum[3] ? sum.slice(0, 3).map(value => value / sum[3]) : palette[i]);
    const settled = next.every((color, i) => distance(color, palette[i]) < .01);
    palette = next;
    if (settled) break;
  }
  // Rounded duplicate centers must not count as separate yarn colors.
  return [...new Map(palette.map(color => [hex(color), color.map(Math.round)])).values()];
}

/**
 * Build a grid from high-resolution, already-cropped RGBA pixels.
 * Source images are limited to 1,048,576 pixels; callers downscale larger crops before reading RGBA.
 * Quantization precedes stitch sampling so browser downscale averaging cannot erase dark details.
 */
export function convertImagePixels(rgba, sourceWidth, sourceHeight, {
  width, height, maxColors = 6, background = '#f5efe3', preserveDetails = true,
} = {}) {
  if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1 || sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) {
    throw new RangeError('Source image must contain 1–1,048,576 pixels.');
  }
  if (!Number.isInteger(width) || width < 4 || width > 200 || !Number.isInteger(height) || height < 4 || height > 240) {
    throw new RangeError('Chart dimensions must be 4–200 stitches by 4–240 rows.');
  }
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > 32) throw new RangeError('Palette size must be an integer from 1 to 32.');
  if (typeof background !== 'string' || !/^#[0-9a-f]{6}$/i.test(background)) throw new TypeError('Background must be a six-digit hex color.');
  if (typeof preserveDetails !== 'boolean') throw new TypeError('Detail preservation must be true or false.');
  if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) throw new TypeError('Image pixels must be an RGBA byte array.');
  const pixelCount = sourceWidth * sourceHeight;
  if (rgba.length !== pixelCount * 4) throw new RangeError('Pixel data must exactly match source dimensions.');
  const bg = unpack(parseInt(background.slice(1), 16));
  const pixels = new Uint32Array(pixelCount), histogram = new Map();
  let exact = new Map();
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4, alpha = rgba[offset + 3] / 255;
    const r = Math.round(rgba[offset] * alpha + bg[0] * (1 - alpha));
    const g = Math.round(rgba[offset + 1] * alpha + bg[1] * (1 - alpha));
    const b = Math.round(rgba[offset + 2] * alpha + bg[2] * (1 - alpha));
    const packed = pack(r, g, b), key = bucket(r, g, b);
    pixels[i] = packed;
    if (exact) {
      exact.set(packed, (exact.get(packed) || 0) + 1);
      if (exact.size > maxColors) exact = null;
    }
    let point = histogram.get(key);
    if (!point) { point = { key, rgb: [0, 0, 0], count: 0 }; histogram.set(key, point); }
    point.rgb[0] += r; point.rgb[1] += g; point.rgb[2] += b; point.count++;
  }
  const points = exact
    ? [...exact].map(([key, count]) => ({ key, rgb: unpack(key), count }))
    : [...histogram.values()].map(point => ({ ...point, rgb: point.rgb.map(value => value / point.count) }));
  points.sort((a, b) => a.key - b.key);
  const paletteRgb = extractPalette(points, maxColors), palette = paletteRgb.map(hex);
  const assignments = new Map(points.map(point => [point.key, closest(point.rgb, paletteRgb)]));
  const labels = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const packed = pixels[i];
    const key = exact ? packed : bucket(packed >>> 16, (packed >>> 8) & 255, packed & 255);
    labels[i] = assignments.get(key);
  }
  const light = paletteRgb.map(luminance), counts = new Map();
  const grid = Array.from({ length: height }, () => Array(width));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const left = x * sourceWidth / width, right = (x + 1) * sourceWidth / width;
    const top = y * sourceHeight / height, bottom = (y + 1) * sourceHeight / height;
    const votes = new Float64Array(palette.length), support = new Uint32Array(palette.length);
    for (let sy = Math.floor(top); sy < Math.min(sourceHeight, Math.ceil(bottom)); sy++) {
      const vertical = Math.min(bottom, sy + 1) - Math.max(top, sy);
      for (let sx = Math.floor(left); sx < Math.min(sourceWidth, Math.ceil(right)); sx++) {
        const horizontal = Math.min(right, sx + 1) - Math.max(left, sx);
        if (horizontal <= 0 || vertical <= 0) continue;
        const label = labels[sy * sourceWidth + sx];
        votes[label] += horizontal * vertical;
        support[label]++;
      }
    }
    let winner = 0;
    for (let i = 1; i < votes.length; i++) if (votes[i] > votes[winner]) winner = i;
    if (preserveDetails) {
      const area = (right - left) * (bottom - top);
      let detail = -1;
      for (let i = 0; i < votes.length; i++) {
        // Require real local coverage and at least two source pixels, not a solitary noisy speck.
        if (light[i] <= 75 && light[winner] - light[i] >= 40 && votes[i] / area >= .18 && support[i] >= 2 &&
            (detail < 0 || votes[i] > votes[detail])) detail = i;
      }
      if (detail >= 0) winner = detail;
    }
    const color = palette[winner];
    grid[y][x] = color;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return { grid, palette: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([color]) => color) };
}

/** Shared square footprint for painting and its on-canvas preview. */
export const MAX_BRUSH_SIZE = 25;

export function brushBounds(x, y, size = 1) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_BRUSH_SIZE) throw new RangeError('画笔大小需为 1–25 格的整数。');
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new TypeError('画笔位置必须是有限整数。');
  const offset = Math.floor((size - 1) / 2);
  return { x: x - offset, y: y - offset, width: size, height: size };
}

// Clip the center path to all positions whose square footprint can touch a cell.
function clipLine(x0, y0, x1, y1, minX, minY, maxX, maxY) {
  const dx = x1 - x0, dy = y1 - y0;
  let from = 0, to = 1;
  for (const [p, q] of [[-dx, x0 - minX], [dx, maxX - x0], [-dy, y0 - minY], [dy, maxY - y0]]) {
    if (p === 0) { if (q < 0) return null; }
    else {
      const t = q / p;
      if (p < 0) from = Math.max(from, t); else to = Math.min(to, t);
      if (from > to) return null;
    }
  }
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
  return [clamp(x0 + from * dx, minX, maxX), clamp(y0 + from * dy, minY, maxY),
    clamp(x0 + to * dx, minX, maxX), clamp(y0 + to * dy, minY, maxY)];
}

/** Visits covered in-bounds cells; callers decide whether a garment cell is cloth. */
export function forEachBrushCell(width, height, x0, y0, x1, y1, size, mirror, visit, mirrorVertical = false) {
  const origin = brushBounds(0, 0, size), low = origin.x, high = low + size - 1;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 ||
      ![x0, y0, x1, y1].every(Number.isSafeInteger)) throw new TypeError('画笔网格尺寸和位置必须是有限整数。');
  if (x0 > x1 || (x0 === x1 && y0 > y1)) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  const clipped = clipLine(x0, y0, x1, y1, -high, -high, width - 1 - low, height - 1 - low);
  if (!clipped) return;
  [x0, y0, x1, y1] = clipped;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    const left = Math.max(0, x0 + low), right = Math.min(width - 1, x0 + high);
    const top = Math.max(0, y0 + low), bottom = Math.min(height - 1, y0 + high);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      visit(x, y);
      if (mirror) visit(width - 1 - x, y);
      if (mirrorVertical) {
        visit(x, height - 1 - y);
        if (mirror) visit(width - 1 - x, height - 1 - y);
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

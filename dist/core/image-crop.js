const clamp = (value, lower = 0, upper = 1) => Math.max(lower, Math.min(upper, value));
const HANDLES = new Set(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
const finite = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('裁剪坐标必须是有限数字。');
  return value;
};
function minimum(value) {
  finite(value);
  if (value <= 0 || value > 1) throw new RangeError('最小选区尺寸必须大于 0 且不超过 1。');
  return value;
}
function interval(start, length, min) {
  if (start >= 0 && length >= min && start + length <= 1) return [start, length];
  const low = clamp(Math.min(start, start + length)), high = clamp(Math.max(start, start + length));
  const size = Math.max(min, high - low);
  return [clamp(low, 0, 1 - size), size];
}

/** A detached, normalized crop in image-relative coordinates. */
export function normalizeCrop(crop = null, minWidth = .000001, minHeight = .000001) {
  minWidth = minimum(minWidth); minHeight = minimum(minHeight);
  if (crop == null) return { x: 0, y: 0, width: 1, height: 1 };
  const [x, width] = interval(finite(crop.x), finite(crop.width), minWidth);
  const [y, height] = interval(finite(crop.y), finite(crop.height), minHeight);
  return { x, y, width, height };
}

export function cropFromPoints(start, end, minWidth = .000001, minHeight = .000001) {
  const x1 = clamp(finite(start.x)), x2 = clamp(finite(end.x));
  const y1 = clamp(finite(start.y)), y2 = clamp(finite(end.y));
  return normalizeCrop({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x1 - x2), height: Math.abs(y1 - y2) }, minWidth, minHeight);
}

export function moveCrop(crop, dx, dy) {
  const original = normalizeCrop(crop);
  return { ...original, x: clamp(original.x + finite(dx), 0, 1 - original.width), y: clamp(original.y + finite(dy), 0, 1 - original.height) };
}

/** Resizing keeps the opposite side fixed; handles cannot cross or invert the crop. */
export function resizeCrop(crop, handle, point, minWidth = .000001, minHeight = .000001) {
  if (!HANDLES.has(handle)) throw new RangeError('未知的选区调整点。');
  const original = normalizeCrop(crop, minWidth, minHeight), px = clamp(finite(point.x)), py = clamp(finite(point.y));
  let left = original.x, right = original.x + original.width, top = original.y, bottom = original.y + original.height;
  if (handle.includes('w')) left = clamp(px, 0, right - minWidth);
  if (handle.includes('e')) right = clamp(px, left + minWidth, 1);
  if (handle.includes('n')) top = clamp(py, 0, bottom - minHeight);
  if (handle.includes('s')) bottom = clamp(py, top + minHeight, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Snap to the nearest source pixel boundaries, never selecting outside the image. */
export function cropToPixels(crop, sourceWidth, sourceHeight) {
  for (const dimension of [sourceWidth, sourceHeight]) {
    if (!Number.isSafeInteger(dimension) || dimension < 1) throw new RangeError('原图宽高必须是正整数。');
  }
  const value = normalizeCrop(crop, 1 / sourceWidth, 1 / sourceHeight);
  const x = clamp(Math.round(value.x * sourceWidth), 0, sourceWidth - 1), y = clamp(Math.round(value.y * sourceHeight), 0, sourceHeight - 1);
  const right = clamp(Math.round((value.x + value.width) * sourceWidth), x + 1, sourceWidth);
  const bottom = clamp(Math.round((value.y + value.height) * sourceHeight), y + 1, sourceHeight);
  return { x, y, width: right - x, height: bottom - y };
}

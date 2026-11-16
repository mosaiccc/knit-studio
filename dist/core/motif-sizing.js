import {validateGrid} from './pattern.js';

function checkDimensions(width, height) {
  if (!Number.isInteger(width) || width < 4 || width > 200 ||
      !Number.isInteger(height) || height < 4 || height > 240) {
    throw new RangeError('画布尺寸须为整数：横向 4–200 针，纵向 4–240 行；请调整尺寸后重试。');
  }
}

function checkGauge(gauge) {
  if (!gauge || typeof gauge !== 'object' ||
      ![gauge.stitches, gauge.rows].every(value =>
        Number.isFinite(value) && value >= 0.1 && value <= 100)) {
    throw new RangeError('试织密度须为每 10 厘米 0.1–100 针、0.1–100 行。');
  }
}

function checkAxis(axis) {
  if (axis !== 'width' && axis !== 'height') {
    throw new RangeError('请选择横向宽度或纵向高度。');
  }
}

/** Scale the entire chart using the nearest source cell to each output cell's center. */
export function scaleMotifGrid(grid, width, height) {
  if (!validateGrid(grid)) throw new TypeError('提花网格无效，请检查针数、行数和颜色。');
  checkDimensions(width, height);
  const sourceHeight = grid.length;
  const sourceWidth = grid[0].length;
  return Array.from({length: height}, (_, y) => {
    const sourceY = Math.floor((y + 0.5) * sourceHeight / height);
    return Array.from({length: width}, (_, x) => {
      const sourceX = Math.floor((x + 0.5) * sourceWidth / width);
      return grid[sourceY][sourceX].toLowerCase();
    });
  });
}

/** Physical dimensions are kept precise; display rounding belongs to the caller. */
export function calculateMotifSize(width, height, gauge) {
  checkDimensions(width, height);
  checkGauge(gauge);
  return {widthCm: width * 10 / gauge.stitches, heightCm: height * 10 / gauge.rows};
}

/** Pass a fixed original size while editing to avoid cumulative whole-cell rounding. */
export function resizeMotifDimensions(originalWidth, originalHeight, axis, value, lockRatio = true) {
  checkDimensions(originalWidth, originalHeight);
  checkAxis(axis);
  if (typeof lockRatio !== 'boolean') throw new TypeError('保持比例设置须为开启或关闭。');
  let width = axis === 'width' ? value : originalWidth;
  let height = axis === 'height' ? value : originalHeight;
  checkDimensions(width, height);
  if (lockRatio) {
    if (axis === 'width') height = Math.round(value * originalHeight / originalWidth);
    else width = Math.round(value * originalWidth / originalHeight);
    checkDimensions(width, height);
  }
  return {width, height};
}

/** Convert the edited centimeter dimension to whole cells before applying the ratio. */
export function dimensionsFromCentimeters(originalWidth, originalHeight, axis, cm, gauge, lockRatio = true) {
  checkAxis(axis);
  checkGauge(gauge);
  if (!Number.isFinite(cm) || cm <= 0) throw new RangeError('实际尺寸须为大于 0 的厘米数。');
  const density = axis === 'width' ? gauge.stitches : gauge.rows;
  const value = Math.round(cm * density / 10);
  return resizeMotifDimensions(originalWidth, originalHeight, axis, value, lockRatio);
}

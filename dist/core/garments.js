import { customOutlineGeometry } from './outline-editing.js';

/** Flat knitting references. Arrays use a top-left origin; knitting rows count from the bottom and stitches from the right. */
const FLAT_NOTE = '平面裁片参考；尺寸按单片平铺计算，需结合试织、缝合与收放针安排调整。';
const cream = '#F5F0E8';
const baseDefaults = { width: 48, height: 58, neckWidth: 18, neckDepth: 9, armholeDepth: 18 };
const fullFields = ['width', 'height', 'shoulderWidth', 'neckWidth', 'neckDepth', 'armholeDepth'];
const HALF_FRONTS = new Set(['cardigan-left', 'cardigan-right', 'cardigan-round-left', 'cardigan-round-right', 'vest-cardigan-left', 'vest-cardigan-right']);
const RAISED_NECKS = new Set(['mock-neck', 'mock-neck-back']);

export const isHalfFront = id => HALF_FRONTS.has(id);
export const isRaisedNeck = id => RAISED_NECKS.has(id);

function legacyShoulderWidth(id, width, neckWidth) {
  const neckRatio = neckWidth / width;
  if (isHalfFront(id)) return width * (1 - Math.min(id.startsWith('vest-') ? 0.27 : 0.22, (1 - neckRatio) * (id.startsWith('vest-') ? 0.36 : 0.25)));
  if (id === 'drop-front' || id === 'drop-back') return width;
  if (id === 'raglan-front' || id === 'raglan-back') return width * (1 - 2 * Math.min(0.255, (1 - neckRatio) * 0.45));
  const inset = id === 'camisole' ? (1 - neckRatio) * 0.3 : Math.min(id.startsWith('vest-') ? 0.21 : 0.14, (1 - neckRatio) * 0.32);
  return width * (1 - 2 * inset);
}

function template(id, name, category, defaults = {}, fields = fullFields, note = FLAT_NOTE) {
  const measurements = { ...baseDefaults, ...defaults };
  if (fields.includes('shoulderWidth')) measurements.shoulderWidth = legacyShoulderWidth(id, measurements.width, measurements.neckWidth);
  return Object.freeze({ id, name, category, defaults: Object.freeze(measurements), fields: Object.freeze([...fields]), note });
}

export const GARMENTS = Object.freeze([
  template('rectangle', '直筒矩形', '基础裁片', {}, ['width', 'height']),
  template('round-front', '圆领前片', '套衫前后片'),
  template('round-back', '圆领后片', '套衫前后片', { neckDepth: 3 }),
  template('v-front', 'V领前片', '套衫前后片', { neckWidth: 20, neckDepth: 20 }),
  template('cardigan-left', 'V领开衫左前片', '开衫前后片', { width: 26, neckWidth: 9, neckDepth: 20 }),
  template('cardigan-right', 'V领开衫右前片', '开衫前后片', { width: 26, neckWidth: 9, neckDepth: 20 }),
  template('vest-back', '马甲后片', '马甲前后片', { width: 46, height: 56, neckDepth: 4, armholeDepth: 22 }),
  template('sleeve', '直筒袖子', '袖片', { width: 32, height: 48, armholeDepth: 12 }, ['width', 'height', 'armholeDepth'], `直身袖片与弧形袖山参考；袖窿深用于袖山高度。${FLAT_NOTE}`),
  template('hat', '帽子', '配饰', { width: 26, height: 25 }, ['width', 'height'], `帽身平面参考；宽度为单片平铺宽，帽顶弧线提示收针范围，仍需设计合缝与帽顶收针。${FLAT_NOTE}`),
  template('raglan', '插肩袖', '袖片', { width: 36, height: 60, armholeDepth: 22 }, ['width', 'height', 'armholeDepth'], `插肩袖片参考；袖窿深用于上部斜线高度，需与衣身插肩线配对。${FLAT_NOTE}`),
  template('mock-neck', '半高领套头前片', '套衫前后片', { height: 64, neckDepth: 7 }, fullFields, `带半高领轮廓的前片参考；领深参数表示领部高度，领口弹性与领部织法需另行安排。${FLAT_NOTE}`),
  template('camisole', '吊带', '马甲前后片', { width: 42, height: 50, neckWidth: 22, neckDepth: 15, armholeDepth: 20 }),
  template('sock', '袜子（筒袜）', '配饰', { width: 10, height: 38 }, ['width', 'height'], `筒袜平面参考，不含足跟与转跟结构；宽度为单片平铺宽，袜头收针与筒身合缝需另行安排。${FLAT_NOTE}`),
  template('glove', '手套（五指筒款）', '配饰', { width: 15, height: 24 }, ['width', 'height'], `五指手套的掌片和手指筒平面参考；五个指筒需分别编织与连接，拇指位置、围度和分指加针需单独试织调整。${FLAT_NOTE}`),
  template('scarf', '围巾斜角款', '配饰', { width: 25, height: 150 }, ['width', 'height'], `两端斜角围巾平面参考；逐行针数显示斜角变化，边缘加减针与收边需另行安排。${FLAT_NOTE}`),
  template('vest-front', '圆领马甲前片', '马甲前后片', { width: 46, height: 56, neckDepth: 10, armholeDepth: 22 }),
  template('vest-v-front', 'V领马甲前片', '马甲前后片', { width: 46, height: 56, neckWidth: 20, neckDepth: 19, armholeDepth: 22 }),
  template('cardigan-round-left', '圆领开衫左前片', '开衫前后片', { width: 26, neckWidth: 9, neckDepth: 9 }),
  template('cardigan-round-right', '圆领开衫右前片', '开衫前后片', { width: 26, neckWidth: 9, neckDepth: 9 }),
  template('cardigan-back', '开衫后片', '开衫前后片', { neckDepth: 3 }),
  template('vest-cardigan-left', '开衫马甲左前片', '马甲前后片', { width: 23, height: 56, neckWidth: 9, neckDepth: 19, armholeDepth: 22 }),
  template('vest-cardigan-right', '开衫马甲右前片', '马甲前后片', { width: 23, height: 56, neckWidth: 9, neckDepth: 19, armholeDepth: 22 }),
  template('mock-neck-back', '半高领套衫后片', '套衫前后片', { height: 64, neckDepth: 7 }, fullFields, `带半高领轮廓的后片参考；领深参数表示领部高度，与前片的领部高度对应，领口弹性与缝合需另行安排。${FLAT_NOTE}`),
  template('drop-front', '落肩圆领前片', '套衫前后片', { width: 56, height: 58, armholeDepth: 20 }, fullFields, `宽松落肩前片参考；默认肩宽与身宽相同，配直筒落肩袖，袖口与袖窿需按实际尺寸配对。${FLAT_NOTE}`),
  template('drop-back', '落肩圆领后片', '套衫前后片', { width: 56, height: 58, neckDepth: 3, armholeDepth: 20 }, fullFields, `宽松落肩后片参考；默认肩宽与身宽相同，后领较浅，袖口与袖窿需按实际尺寸配对。${FLAT_NOTE}`),
  template('drop-sleeve', '落肩直筒袖子', '袖片', { width: 38, height: 42 }, ['width', 'height'], `无弧形袖山的独立直筒袖片参考，适合与落肩衣身配合；袖根宽度与袖窿长度需试织核对。${FLAT_NOTE}`),
  template('trapezoid-sleeve', '梯形袖子', '袖片', { width: 36, height: 48, cuffWidth: 18 }, ['width', 'height', 'cuffWidth'], `上端宽、袖口窄的直边梯形袖片，无袖山。上端宽度为展开袖片的袖根宽，袖口宽度为展开袖片的下端宽，袖长为垂直长度；两端均为单片尺寸，不是成衣对折后的宽度。${FLAT_NOTE}`),
  template('raglan-front', '插肩套衫前片', '套衫前后片', { armholeDepth: 22 }, fullFields, `带直线插肩收针区的衣身前片参考，配插肩袖；袖窿深表示插肩线垂直高度，拼接长度与收针节奏需分别核对。${FLAT_NOTE}`),
  template('raglan-back', '插肩套衫后片', '套衫前后片', { neckDepth: 3, armholeDepth: 22 }, fullFields, `带直线插肩收针区的衣身后片参考，后领较浅，配插肩袖；拼接长度与收针节奏需分别核对。${FLAT_NOTE}`),
  template('placket-left', '左门襟边', '门襟与收边', { width: 3, height: 58, neckWidth: 0, neckDepth: 0, armholeDepth: 0 }, ['width', 'height'], `开衫左侧独立直条门襟参考；长度按实际前片开口边调整，宽度按成品门襟宽计算。扣眼位置与织法需自行标注，未自动生成扣眼。${FLAT_NOTE}`),
  template('placket-right', '右门襟边', '门襟与收边', { width: 3, height: 58, neckWidth: 0, neckDepth: 0, armholeDepth: 0 }, ['width', 'height'], `开衫右侧独立直条门襟参考；长度按实际前片开口边调整，宽度按成品门襟宽计算。扣眼位置与织法需自行标注，未自动生成扣眼。${FLAT_NOTE}`),
]);

export function getGarment(id) {
  const garment = GARMENTS.find(entry => entry.id === id);
  if (!garment) throw new Error(`未找到版型“${String(id)}”。请选择列表中的版型。`);
  return garment;
}

function number(value, label, allowZero = false) {
  const result = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(result) || (allowZero ? result < 0 : result <= 0)) {
    throw new Error(`${label}必须是${allowZero ? '大于或等于零' : '大于零'}的有效数字。`);
  }
  return result;
}

/** Total shoulder span for symmetric bodies, half-front span for cardigans; undefined for other templates. */
export function resolveShoulderWidth(id, measurements = {}) {
  const garment = getGarment(id);
  if (!garment.fields.includes('shoulderWidth')) return undefined;
  const effective = { ...garment.defaults, ...measurements };
  const width = number(effective.width, '宽度');
  const neckWidth = number(effective.neckWidth, '领宽', true);
  if (neckWidth >= width) throw new Error('领宽应小于裁片宽度。');
  // Read only the supplied shoulder value: legacy custom sizes must not inherit an absolute catalog default.
  const explicit = measurements?.shoulderWidth;
  const shoulderWidth = explicit === undefined ? legacyShoulderWidth(id, width, neckWidth) : number(explicit, '肩宽');
  if (shoulderWidth > width) throw new Error('肩宽不能大于裁片宽度。');
  if (shoulderWidth <= neckWidth) throw new Error('肩宽必须大于领宽，请为肩部保留宽度。');
  return shoulderWidth;
}

export function calculateDimensions(measurements, gauge) {
  const width = number(measurements?.width, '宽度');
  const height = number(measurements?.height, '高度');
  const stitchGauge = number(gauge?.stitches, '每 10 厘米针数密度');
  const rowGauge = number(gauge?.rows, '每 10 厘米行数密度');
  const stitches = Math.round(width * stitchGauge / 10);
  const rows = Math.round(height * rowGauge / 10);
  if (stitches < 1 || rows < 1) throw new Error('当前尺寸与密度不足 1 针或 1 行，请增大尺寸或检查密度。');
  if (stitches > 400 || rows > 600) throw new Error(`当前需要 ${stitches} 针 × ${rows} 行；图解上限为 400 针 × 600 行。请减小尺寸或检查试织密度，系统不会自动缩放密度。`);
  return { stitches, rows, actualWidth: stitches * 10 / stitchGauge, actualHeight: rows * 10 / rowGauge };
}

function resolvedMeasurements(garment, measurements) {
  const result = { ...garment.defaults, ...measurements };
  result.width = number(result.width, '宽度');
  result.height = number(result.height, '高度');
  const labels = { neckWidth: '领宽', neckDepth: '领深', armholeDepth: '袖窿深' };
  for (const field of garment.fields) {
    if (!labels[field]) continue;
    result[field] = number(result[field], labels[field], true);
    const limit = field === 'neckWidth' ? result.width : result.height;
    if (result[field] >= limit) throw new Error(`${labels[field]}应小于${field === 'neckWidth' ? '裁片宽度' : '裁片高度'}。`);
  }
  if (garment.fields.includes('shoulderWidth')) result.shoulderWidth = resolveShoulderWidth(garment.id, measurements);
  if (garment.fields.includes('cuffWidth')) {
    result.cuffWidth = number(result.cuffWidth, '袖口宽度');
    if (result.cuffWidth > result.width) throw new Error('袖口宽度不能大于上端宽度（袖根宽度）。');
  }
  return result;
}

function quadratic(start, control, end, steps = 10) {
  return Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / steps;
    const s = 1 - t;
    return [s * s * start[0] + 2 * s * t * control[0] + t * t * end[0], s * s * start[1] + 2 * s * t * control[1] + t * t * end[1]];
  });
}

function roundNeck(width, depth) {
  return Array.from({ length: 25 }, (_, index) => {
    const angle = Math.PI * index / 24;
    return [0.5 - width * Math.cos(angle) / 2, depth * Math.sin(angle)];
  });
}

function halfRoundNeck(width, depth) {
  return Array.from({ length: 13 }, (_, index) => {
    const angle = Math.PI * index / 24;
    return [1 - width * Math.cos(angle), depth * Math.sin(angle)];
  });
}

function frontNeckline(id, neckWidth, neckDepth) {
  return id.startsWith('cardigan-round-') ? halfRoundNeck(neckWidth, neckDepth) : [[1 - neckWidth, 0], [1, neckDepth]];
}

/** Developed center-front opening length, in centimeters, before choosing a pickup/ease ratio. */
export function getFrontOpeningLength(id, measurements = {}) {
  const garment = getGarment(id);
  if (!isHalfFront(id)) throw new Error('门襟开口长度仅适用于开衫左、右前片。');
  const m = resolvedMeasurements(garment, measurements);
  const edge = [...frontNeckline(id, m.neckWidth, m.neckDepth), [1, m.height]];
  // Only displacements matter: use a constant horizontal origin for these centimeter coordinates.
  return edge.slice(1).reduce((length, point, index) => length + Math.hypot(point[0] - edge[index][0], point[1] - edge[index][1]), 0);
}

function bodyOutline(neckWidth, neckDepth, armhole, kind, shoulder) {
  const shoulderDrop = Math.min(0.04, armhole * 0.25);
  const armLeft = [
    [0, 1], [0, armhole],
    ...quadratic([0, armhole], [shoulder, armhole], [shoulder, shoulderDrop]),
  ];
  const neckline = kind === 'v-front' || kind === 'vest-v-front'
    ? [[(1 - neckWidth) / 2, 0], [0.5, neckDepth], [(1 + neckWidth) / 2, 0]]
    : roundNeck(neckWidth, neckDepth);
  return [...armLeft, ...neckline, [1 - shoulder, shoulderDrop],
    ...quadratic([1 - shoulder, shoulderDrop], [1 - shoulder, armhole], [1, armhole]), [1, 1]];
}

function outlinePoints(id, m) {
  const neckWidth = m.neckWidth / m.width;
  const neckDepth = m.neckDepth / m.height;
  const armhole = m.armholeDepth / m.height;
  switch (id) {
    case 'rectangle': case 'drop-sleeve': case 'placket-left': case 'placket-right': return [[0, 0], [1, 0], [1, 1], [0, 1]];
    case 'trapezoid-sleeve': {
      const inset = (1 - m.cuffWidth / m.width) / 2;
      return [[0, 0], [1, 0], [1 - inset, 1], [inset, 1]];
    }
    case 'round-front': case 'round-back': case 'v-front': case 'vest-back': case 'vest-front': case 'vest-v-front': case 'cardigan-back': case 'drop-front': case 'drop-back':
      return bodyOutline(neckWidth, neckDepth, armhole, id, (1 - m.shoulderWidth / m.width) / 2);
    case 'cardigan-left': case 'cardigan-right': case 'cardigan-round-left': case 'cardigan-round-right': case 'vest-cardigan-left': case 'vest-cardigan-right': {
      const shoulder = 1 - m.shoulderWidth / m.width;
      const drop = Math.min(0.035, armhole / 4);
      const points = [[0, 1], [0, armhole], ...quadratic([0, armhole], [shoulder, armhole], [shoulder, drop]), ...frontNeckline(id, neckWidth, neckDepth), [1, 1]];
      return id.endsWith('-right') ? points.map(([x, y]) => [1 - x, y]) : points;
    }
    case 'sleeve': {
      const cap = armhole;
      return [[0, 1], [0, cap], ...quadratic([0, cap], [0.1, 0], [0.5, 0]), ...quadratic([0.5, 0], [0.9, 0], [1, cap]), [1, 1]];
    }
    case 'hat':
      return [[0, 1], [0, 0.42], ...quadratic([0, 0.42], [0, 0], [0.5, 0], 16), ...quadratic([0.5, 0], [1, 0], [1, 0.42], 16), [1, 1]];
    case 'raglan': return [[0.16, 1], [0, armhole], [0.34, 0], [0.66, 0], [1, armhole], [0.84, 1]];
    case 'raglan-front': case 'raglan-back': {
      const shoulder = (1 - m.shoulderWidth / m.width) / 2;
      return [[0, 1], [0, armhole], [shoulder, 0], ...roundNeck(neckWidth, neckDepth), [1 - shoulder, 0], [1, armhole], [1, 1]];
    }
    case 'mock-neck': case 'mock-neck-back': {
      const shoulder = (1 - m.shoulderWidth / m.width) / 2;
      const upperArm = Math.max(armhole, neckDepth + 0.02 * (1 - neckDepth));
      const drop = Math.min(0.035, (upperArm - neckDepth) / 4);
      return [[0, 1], [0, upperArm], ...quadratic([0, upperArm], [shoulder, upperArm], [shoulder, neckDepth + drop]), [(1 - neckWidth) / 2, neckDepth], [(1 - neckWidth) / 2, 0], [(1 + neckWidth) / 2, 0], [(1 + neckWidth) / 2, neckDepth], [1 - shoulder, neckDepth + drop], ...quadratic([1 - shoulder, neckDepth + drop], [1 - shoulder, upperArm], [1, upperArm]), [1, 1]];
    }
    case 'camisole': {
      const outerStrap = (1 - m.shoulderWidth / m.width) / 2;
      return [[0, 1], [0, armhole], ...quadratic([0, armhole], [outerStrap, armhole], [outerStrap, 0]), ...roundNeck(neckWidth, neckDepth), [1 - outerStrap, 0], ...quadratic([1 - outerStrap, 0], [1 - outerStrap, armhole], [1, armhole]), [1, 1]];
    }
    case 'sock':
      return [[0, 0], [1, 0], [1, 0.88], ...quadratic([1, 0.88], [1, 1], [0.5, 1]), ...quadratic([0.5, 1], [0, 1], [0, 0.88])];
    case 'glove':
      return [[0.1, 1], [0.65, 1], [0.7, 0.70], [0.96, 0.49], [1, 0.39], [0.94, 0.34], [0.88, 0.39], [0.70, 0.54], [0.70, 0.18], ...quadratic([0.70, 0.18], [0.70, 0.02], [0.62, 0.10], 4), ...quadratic([0.62, 0.10], [0.54, 0.10], [0.54, 0.18], 4), [0.54, 0.45], [0.52, 0.45], [0.52, 0.08], ...quadratic([0.52, 0.08], [0.52, 0], [0.44, 0], 4), ...quadratic([0.44, 0], [0.36, 0], [0.36, 0.08], 4), [0.36, 0.42], [0.34, 0.42], [0.34, 0.14], ...quadratic([0.34, 0.14], [0.34, 0.06], [0.26, 0.06], 4), ...quadratic([0.26, 0.06], [0.18, 0.06], [0.18, 0.14], 4), [0.18, 0.47], [0.16, 0.47], [0.16, 0.28], ...quadratic([0.16, 0.28], [0.16, 0.20], [0.08, 0.20], 4), ...quadratic([0.08, 0.20], [0, 0.20], [0, 0.28], 4), [0, 0.75]];
    case 'scarf': return [[0, 0.10], [1, 0], [1, 0.90], [0, 1]];
    default: throw new Error('未找到对应的版型轮廓。');
  }
}

export function getOutline(id, measurements = {}, customOutline = null) {
  const garment = getGarment(id);
  const m = resolvedMeasurements(garment, measurements);
  if (customOutline != null) return { ...customOutlineGeometry(customOutline), note: `自绘轮廓，按当前尺寸和密度生成针行。${garment.note}` };
  // Bézier arithmetic can drift a fraction past 1 when a shoulder reaches the full piece width.
  const points = outlinePoints(id, m).map(point => point.map(value => Math.max(0, Math.min(1, value))));
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${(x * 100).toFixed(4)} ${(y * 100).toFixed(4)}`).join(' ') + ' Z';
  return { points, path, note: garment.note };
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [xi, yi] = points[index];
    const [xj, yj] = points[previous];
    // Include boundary points consistently, including reflected outlines.
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(xi, xj) - 1e-12 && x <= Math.max(xi, xj) + 1e-12 && y >= Math.min(yi, yj) - 1e-12 && y <= Math.max(yi, yj) + 1e-12) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Curves can have many samples; intersect once per row instead of once per stitch. */
function customMask(points, width, height) {
  return Array.from({ length: height }, (_, index) => {
    const row = Array(width).fill(false), y = (index + .5) / height, crossings = [];
    const fill = (left, right) => {
      const start = Math.max(0, Math.ceil(Math.min(left, right) * width - .5 - 1e-9));
      const end = Math.min(width - 1, Math.floor(Math.max(left, right) * width - .5 + 1e-9));
      for (let x = start; x <= end; x++) row[x] = true;
    };
    for (let i = 0, previous = points.length - 1; i < points.length; previous = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[previous];
      if (Math.abs(yi - yj) < 1e-14) {
        if (Math.abs(y - yi) < 1e-12) fill(xi, xj);
        continue;
      }
      if (y >= Math.min(yi, yj) - 1e-12 && y <= Math.max(yi, yj) + 1e-12) {
        const crossing = xi + (y - yi) * (xj - xi) / (yj - yi);
        // A tangent vertex belongs to the boundary even when it does not cross this scanline.
        fill(crossing, crossing);
        if ((yi > y) !== (yj > y)) crossings.push(crossing);
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) fill(crossings[i], crossings[i + 1]);
    return row;
  });
}

function patternOrDefault(patternGrid) {
  if (!patternGrid || (Array.isArray(patternGrid) && patternGrid.length === 0)) return [[cream]];
  if (!Array.isArray(patternGrid) || !Array.isArray(patternGrid[0]) || !patternGrid[0].length || patternGrid.some(row => !Array.isArray(row) || row.length !== patternGrid[0].length)) throw new Error('图案必须是每行长度一致的非空像素网格。');
  return patternGrid;
}

function countRow(mask, row) {
  const segments = [];
  let start = null;
  for (let stitch = 1; stitch <= mask.length + 1; stitch++) {
    const filled = stitch <= mask.length && mask[mask.length - stitch];
    if (filled && start === null) start = stitch;
    if (!filled && start !== null) {
      segments.push({ start, end: stitch - 1, count: stitch - start });
      start = null;
    }
  }
  return { row, count: segments.reduce((sum, segment) => sum + segment.count, 0), segments };
}

export function createGarmentChart(id, measurements, gauge, patternGrid, placement = 'repeat', customOutline = null) {
  const garment = getGarment(id);
  const m = resolvedMeasurements(garment, measurements);
  const dimensions = calculateDimensions(m, gauge);
  const { stitches: width, rows: height } = dimensions;
  const { points } = getOutline(id, m, customOutline);
  const pattern = patternOrDefault(patternGrid);
  const patternHeight = pattern.length;
  const patternWidth = pattern[0].length;
  const background = pattern[0][0] || cream;
  if (!['repeat', 'center'].includes(placement)) throw new Error('请选择重复铺满或居中放置图案。');
  const startX = Math.floor((width - patternWidth) / 2);
  const startY = placement === 'center' ? Math.floor((height - patternHeight) / 2) : height - patternHeight;
  const modulo = (value, modulus) => ((value % modulus) + modulus) % modulus;
  const mask = customOutline != null ? customMask(points, width, height) : Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => insidePolygon((x + 0.5) / width, (y + 0.5) / height, points)));
  const grid = mask.map((row, y) => row.map((filled, x) => {
    if (!filled) return null;
    const localX = x - startX;
    const localY = y - startY;
    if (placement === 'center' && (localX < 0 || localY < 0 || localX >= patternWidth || localY >= patternHeight)) return background;
    return pattern[modulo(localY, patternHeight)][modulo(localX, patternWidth)] || background;
  }));
  const rowCounts = Array.from({ length: height }, (_, index) => countRow(mask[height - 1 - index], index + 1));
  return { grid, mask, width, height, rowCounts, ...dimensions };
}

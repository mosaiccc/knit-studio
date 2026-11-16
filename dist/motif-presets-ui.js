import { MOTIF_PRESETS, getMotifPreset } from './core/motif-presets.js';
import { motifThumbnail } from './library-ui.js';

export function motifPresetsHTML() {
  const categories = [...new Set(MOTIF_PRESETS.map(item => item.category))];
  return `<p class="preset-guidance">选用后会按图案的原始针数、行数调整画布尺寸，完整保留花样。可继续改色、绘制并点击「保存提花」，再到图案放置中选择；当前画布的替换支持撤销。</p>${categories.map(category => `<section class="preset-category"><h3>${category}</h3><div class="motif-library-grid">${MOTIF_PRESETS.filter(item => item.category === category).map(item => `<article class="motif-card preset-card">${motifThumbnail(getMotifPreset(item.id))}<h3>${item.name}</h3><p>${item.width} 针 × ${item.height} 行</p><button class="btn soft small" data-preset-use="${item.id}" aria-label="选用${item.name}">选用图案</button></article>`).join('')}</div></section>`).join('')}`;
}

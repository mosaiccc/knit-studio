import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIF_PRESETS, getMotifPreset } from '../dist/core/motif-presets.js';
import { motifPresetsHTML } from '../dist/motif-presets-ui.js';
import { validateGrid } from '../dist/core/pattern.js';
import { sanitizeMotif } from '../dist/core/workspace.js';

test('built-in catalogue offers eight distinct sheep and four common motifs with complete natural sizes', () => {
  assert.equal(MOTIF_PRESETS.length, 12);
  assert.equal(MOTIF_PRESETS.filter(item => item.category === '小羊提花').length, 8);
  assert.equal(MOTIF_PRESETS.filter(item => item.category === '常见提花').length, 4);
  assert.equal(new Set(MOTIF_PRESETS.map(item => item.id)).size, 12);
  const sheepShapes = new Set();
  for (const entry of MOTIF_PRESETS) {
    const motif = getMotifPreset(entry.id);
    assert.equal(validateGrid(motif.grid), true, entry.id);
    assert.equal(motif.grid.length, entry.height);
    assert.equal(motif.grid[0].length, entry.width);
    assert.equal(motif.name, entry.name);
    assert.equal(motif.category, entry.category);
    assert.equal('grid' in entry, false, 'catalogue should not duplicate chart data');
    const colors = new Set(motif.grid.flat());
    assert.ok(colors.size >= 2 && colors.size <= 5);
    assert.deepEqual(new Set(motif.palette), colors, entry.id);
    const background = motif.palette[0];
    assert.ok(motif.grid.slice(0, 2).every(row => row.every(color => color === background)));
    assert.ok(motif.grid.slice(-2).every(row => row.every(color => color === background)));
    assert.ok(motif.grid.every(row => [...row.slice(0, 2), ...row.slice(-2)].every(color => color === background)), 'every drawing keeps its two-stitch background border');
    assert.equal(sanitizeMotif(motif).name, entry.name, 'built-ins use the existing save/export format');
    if (entry.category === '小羊提花') {
      assert.notEqual(background, '#fff8e8', 'white wool must survive transparent-background placement');
      assert.ok(colors.has('#fff8e8'));
      assert.ok(colors.has('#454745'));
      sheepShapes.add(JSON.stringify(motif.grid.map(row => row.map(color => color === background ? 0 : 1))));
    }
  }
  assert.equal(sheepShapes.size, 8);
});

test('additional sheep include sleeping, looking back, and a mother with her lamb', () => {
  const expected = [
    ['sheep-sleeping', '侧卧睡觉'],
    ['sheep-looking-back', '回头小羊'],
    ['sheep-and-lamb', '母子双羊'],
  ];
  for (const [id, name] of expected) {
    const motif = getMotifPreset(id);
    assert.equal(motif.name, name);
    assert.equal(motif.category, '小羊提花');
    assert.deepEqual(sanitizeMotif(motif).grid, motif.grid, `${id} can be saved as its own motif`);
  }
});

test('opening or recoloring a built-in returns an independent copy and rejects unknown identifiers', () => {
  for (const { id } of MOTIF_PRESETS) {
    const original = getMotifPreset(id);
    const changed = getMotifPreset(id);
    changed.grid[0][0] = '#123456';
    changed.palette[0] = '#123456';
    changed.name = 'edited';
    assert.deepEqual(getMotifPreset(id), original);
    assert.notEqual(original.grid[0], original.grid[1]);
  }
  assert.throws(() => getMotifPreset('__proto__'), /图案|Unknown/);
  assert.throws(() => getMotifPreset('missing'), /图案|Unknown/);
});

test('preset picker exposes every preview and natural size with canvas replacement guidance', () => {
  const html = motifPresetsHTML();
  assert.match(html, /小羊提花/);
  assert.match(html, /常见提花/);
  assert.match(html, /画布尺寸/);
  assert.match(html, /保存提花/);
  assert.equal((html.match(/data-preset-use=/g) || []).length, 12);
  for (const item of MOTIF_PRESETS) {
    assert.ok(html.includes(`data-preset-use="${item.id}"`));
    assert.ok(html.includes(`${item.width} 针 × ${item.height} 行`));
    assert.ok(html.includes(item.name));
  }
});

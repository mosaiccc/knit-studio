import test from 'node:test';
import assert from 'node:assert/strict';
import * as stitches from '../dist/core/stitches.js';
import { stitchPickerHTML } from '../dist/stitches-view.js';
import { sanitizeProject } from '../dist/core/project.js';

const CREAM = '#f5efe3';
const ids = ['knit', 'purl', 'yo', 'k2tog', 'ssk', 'slip', 'ktbl', 'ptbl'];

test('the eight stitch types have distinct Chinese legends and verified source attribution', () => {
  assert.deepEqual(stitches.STITCHES.map(stitch => stitch.id), ids);
  for (const entry of stitches.STITCHES) {
    assert.equal(stitches.getStitch(entry.id), entry);
    assert.ok(/[\u4e00-\u9fff]/.test(entry.label));
    assert.ok(entry.description.length > 5);
    assert.match(entry.sourceUrl, /^https:\/\/(www\.)?craftyarncouncil\.com\//);
  }
  assert.throws(() => stitches.getStitch('unknown'), /针法|符号/);
});

test('twisted purl is selectable with correct side instructions while retired k3tog stays readable', () => {
  const html = stitchPickerHTML({ garmentId: 'rectangle' }, 'ptbl', 'stitch');
  assert.match(html, /data-stitch="ptbl"[^>]*aria-pressed="true"/);
  assert.match(html, /扭上针/);
  assert.doesNotMatch(html, /data-stitch="k3tog"|右倾三并一/);
  assert.match(stitches.getStitch('ptbl').description, /正面从后针脚织上针.*反面从后针脚织下针/);
  assert.equal(stitches.getStitch('k3tog').label, '右倾三并一');
  assert.equal(stitches.ALL_STITCHES.length, 9);
  assert.deepEqual(stitches.ALL_STITCHES.filter(s => !ids.includes(s.id)).map(s => s.id), ['k3tog']);
  assert.notEqual(stitches.stitchSymbolSVG('ptbl', 0, 0, 24, 24), stitches.stitchSymbolSVG('ktbl', 0, 0, 24, 24));
  assert.match(stitches.stitchSymbolSVG('k3tog', 0, 0, 24, 24), /<path/);
});

test('twisted purl and retired symbols survive project JSON round trips without migration or loss', () => {
  const source = {
    version: 1, name: '扭针样片', grid: Array.from({ length: 4 }, () => Array(4).fill(CREAM)), palette: [CREAM], garmentId: 'rectangle',
    measurements: { width: 10, height: 10 }, gauge: { stitches: 20, rows: 30 }, placement: 'repeat',
    stitchSymbols: { rectangle: { '1:1': 'ptbl', '1:2': 'k3tog' } },
  };
  const clean = sanitizeProject(source);
  assert.deepEqual(clean.stitchSymbols, source.stitchSymbols);
  assert.deepEqual(sanitizeProject(JSON.parse(JSON.stringify(clean))), clean);
  const drawn = stitches.paintStitchLine([[CREAM, CREAM]], clean.stitchSymbols.rectangle, 1, 0, 1, 0, 'ptbl');
  assert.deepEqual(drawn, { '1:1': 'ptbl', '1:2': 'k3tog' });
});

test('complete symbol maps require known garments, canonical right-bottom coordinates and known stitch IDs', () => {
  assert.doesNotThrow(() => stitches.assertStitchSymbols({ 'round-front': { '1:1': 'knit', '600:400': 'ktbl' }, sock: {} }));
  for (const value of [null, [], new Date(), { unknown: {} }, { rectangle: null }, { rectangle: [] }, { rectangle: { '0:1': 'knit' } }, { rectangle: { '1:401': 'knit' } }, { rectangle: { '601:1': 'knit' } }, { rectangle: { '01:1': 'knit' } }, { rectangle: { '1:1': 'unknown' } }, { rectangle: { '1:1': null } }]) {
    assert.throws(() => stitches.assertStitchSymbols(value), /针法|符号|版型|针|行/);
  }
});

test('symbol painting clips each cell to the garment and never mutates the colored grid or source symbols', () => {
  const grid = [[CREAM, null, CREAM], [CREAM, CREAM, CREAM]];
  const beforeGrid = structuredClone(grid);
  const symbols = { '600:400': 'yo', '1:1': 'purl' };
  const next = stitches.paintStitchLine(grid, symbols, -50, 0, 50, 0, 'knit');
  assert.deepEqual(next, { '600:400': 'yo', '1:1': 'purl', '2:3': 'knit', '2:1': 'knit' });
  assert.deepEqual(grid, beforeGrid);
  assert.deepEqual(symbols, { '600:400': 'yo', '1:1': 'purl' });
});

test('mirrored stitch strokes reflect coordinates and independently skip holes', () => {
  const grid = [[null, CREAM, CREAM, CREAM, CREAM]];
  assert.deepEqual(stitches.paintStitchLine(grid, {}, 1, 0, 1, 0, 'k2tog', true), { '1:4': 'k2tog', '1:2': 'k2tog' });
  assert.deepEqual(stitches.paintStitchLine(grid, {}, 4, 0, 4, 0, 'ssk', true), { '1:1': 'ssk' });
});

test('vertical and four-way symbol strokes keep the symbol type and independently skip cutouts', () => {
  const grid=Array.from({length:6},()=>Array(5).fill(CREAM));grid[1][1]=null;
  const symbols={'600:400':'yo'};
  const next=stitches.paintStitchLine(grid,symbols,1,1,1,1,'ssk',true,true);
  assert.deepEqual(next,{'600:400':'yo','5:2':'ssk','2:4':'ssk','2:2':'ssk'});
  assert.deepEqual(stitches.paintStitchLine(grid,next,1,1,1,1,null,true,true),symbols);
  assert.deepEqual(symbols,{'600:400':'yo'});
  assert.equal(grid[1][1],null);
});

test('erasing removes only symbols on cloth and keeps hidden or out-of-size symbols', () => {
  const symbols = { '1:1': 'knit', '1:2': 'purl', '1:3': 'yo', '40:40': 'slip' };
  const grid = [[CREAM, null, CREAM]];
  assert.deepEqual(stitches.paintStitchLine(grid, symbols, 0, 0, 2, 0, null), { '1:2': 'purl', '40:40': 'slip' });
  assert.deepEqual(grid, [[CREAM, null, CREAM]]);
});

test('stored symbols stay anchored to bottom-right stitch coordinates when dimensions change', () => {
  const small = [[CREAM, CREAM], [CREAM, CREAM]];
  const first = stitches.paintStitchLine(small, {}, 1, 1, 1, 1, 'knit');
  assert.deepEqual(first, { '1:1': 'knit' });
  const expanded = Array.from({ length: 4 }, () => Array(5).fill(CREAM));
  assert.deepEqual(stitches.paintStitchLine(expanded, first, 0, 0, 0, 0, 'yo'), { '1:1': 'knit', '4:5': 'yo' });
});

test('continuous steep and reverse strokes select the same cells and retain independent snapshots for undo', () => {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(CREAM));
  const before = { '1:1': 'slip' };
  const forward = stitches.paintStitchLine(grid, before, 1, 1, 3, 6, 'purl');
  const reverse = stitches.paintStitchLine(grid, before, 3, 6, 1, 1, 'purl');
  assert.deepEqual(forward, reverse);
  assert.equal(Object.keys(forward).length, 7);
  assert.deepEqual(before, { '1:1': 'slip' });
  assert.throws(() => stitches.paintStitchLine(grid, before, NaN, 0, 0, 0, 'knit'), /位置|整数/);
  assert.throws(() => stitches.paintStitchLine(grid, before, 0, 0, 0, 0, 'invalid'), /针法|符号/);
});

test('SVG symbols are distinct safe vector paths without root SVG or text-dependent glyphs', () => {
  const drawings = ids.map(id => stitches.stitchSymbolSVG(id, 10, 20, 24, 18, '#ffffff'));
  assert.equal(new Set(drawings).size, 8);
  for (const svg of drawings) {
    assert.match(svg, /<path/);
    assert.doesNotMatch(svg, /<svg|<text|NaN|undefined/);
    assert.match(svg, /#ffffff/i);
  }
  assert.throws(() => stitches.stitchSymbolSVG('knit', 0, 0, 24, 24, '" onload="alert(1)'), /颜色/);
});

test('Canvas uses the same vector paths as SVG and restores caller drawing state', () => {
  for (const id of ids) {
    const operations = [];
    const ctx = { save() { operations.push(['save']); }, restore() { operations.push(['restore']); }, beginPath() {}, moveTo(...p) { operations.push(['M', ...p]); }, lineTo(...p) { operations.push(['L', ...p]); }, bezierCurveTo(...p) { operations.push(['C', ...p]); }, quadraticCurveTo(...p) { operations.push(['Q', ...p]); }, closePath() { operations.push(['Z']); }, stroke() { operations.push(['stroke', this.strokeStyle]); } };
    stitches.drawStitchSymbol(ctx, id, 0, 0, 100, 100, '#ffffff');
    assert.equal(operations[0][0], 'save');
    assert.equal(operations.at(-1)[0], 'restore');
    assert.ok(operations.some(operation => operation[0] === 'stroke' && operation[1] === '#ffffff'));
    const svg = stitches.stitchSymbolSVG(id, 0, 0, 100, 100, '#ffffff');
    const path = operations.filter(operation => ['M', 'L', 'C', 'Q', 'Z'].includes(operation[0])).map(([command, ...values]) => command + values.join(' ')).join(' ');
    assert.ok(svg.includes(`d="${path}"`), `${id}: Canvas/SVG paths differ`);
  }
});

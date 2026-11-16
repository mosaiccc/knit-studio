import test from 'node:test';
import assert from 'node:assert/strict';
import {GARMENTS} from '../dist/core/garments.js';
import {groupedGarmentOptions,garmentCategoryCards,miniGarmentSVG} from '../dist/garment-picker.js';

test('grouped options contain every garment once and keep exactly the selected piece',()=>{
  const html=groupedGarmentOptions('sleeve');
  assert.equal((html.match(/<option /g)||[]).length,GARMENTS.length);
  assert.equal((html.match(/ selected/g)||[]).length,1);
  assert.match(html,/<optgroup label="袖片">/);assert.match(html,/<option value="sleeve" selected>/);
});
test('piece categories expand only the current category and keep the current card marked',()=>{
  const html=garmentCategoryCards('sleeve');
  assert.equal((html.match(/<details[^>]* open/g)||[]).length,1);
  assert.match(html,/data-garment="sleeve"[^>]*aria-pressed="true"/);
  for(const g of GARMENTS)assert.ok(html.includes(`data-garment="${g.id}"`));
});
test('miniature proportions distinguish narrow bands from broad body pieces',()=>{
  const svg=miniGarmentSVG('rectangle',{width:3,height:60},60,70);
  assert.match(svg,/viewBox="0 0 60 70"/);assert.doesNotMatch(svg,/NaN|undefined/);
  assert.match(svg,/scale\(0\.031 0\.62\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildOffline} from '../scripts/build-offline.mjs';

test('shipped service worker exactly covers current app assets and release bytes',async()=>{
  const generated=await buildOffline({write:false});
  assert.equal(await readFile(new URL('../dist/sw.js',import.meta.url),'utf8'),generated.source,'Run npm run build:offline after changing app assets.');
  const manifest=JSON.parse(await readFile(new URL('../dist/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'./');
  for(const icon of manifest.icons)assert.ok(generated.assets.some(a=>a.path===icon.src.replace(/^\.\//,'')));
  for(const asset of generated.assets.filter(a=>a.path.endsWith('.png'))){
    const bytes=await readFile(new URL('../dist/'+asset.path,import.meta.url));
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  }
});

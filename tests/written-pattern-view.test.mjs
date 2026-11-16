import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWrittenHTML,downloadWrittenFile} from '../dist/written-pattern-view.js';

test('printable written tutorial preserves Chinese edits and line breaks while escaping user markup',()=>{
  const html=buildWrittenHTML({title:'前片 <测试>',text:'第 1 行：用 A 线织 8 针下针。\n自加备注：<script>alert(1)</script> & "文字"',colors:[{letter:'A',name:'米白',color:'#f5efe3'}]});
  assert.match(html,/<html lang="zh-CN">/);assert.match(html,/<meta charset="utf-8">/);
  assert.match(html,/前片 &lt;测试&gt;/);assert.match(html,/第 1 行：用 A 线织 8 针下针。\n自加备注：&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/@media print/);assert.match(html,/#f5efe3/);
});

test('printable color legend cannot inject styles or HTML',()=>{
  const html=buildWrittenHTML({title:'教程',text:'内容',colors:[{letter:'<A>',name:'"名称"',color:'red; background:url(https://example.com)'}]});
  assert.doesNotMatch(html,/background:url/);assert.match(html,/&lt;A&gt;/);assert.match(html,/&quot;名称&quot;/);
});

test('TXT uses UTF-8 BOM and downloads the edited text with a safe filename',()=>{
  const calls=[];let anchor;
  const env={Blob,URL:{createObjectURL:blob=>{calls.push(blob);return 'blob:test';},revokeObjectURL:url=>calls.push(url)},document:{createElement:()=>anchor={click:()=>calls.push('clicked')}},setTimeout:fn=>fn()};
  downloadWrittenFile('我修改后的教程\n第 1 行', '作品/测试', 'txt',env);
  assert.equal(anchor.download,'作品_测试.txt');assert.equal(anchor.href,'blob:test');
  assert.equal(calls[0].type,'text/plain;charset=utf-8');assert.equal(calls[1],'clicked');assert.equal(calls[2],'blob:test');
  return calls[0].arrayBuffer().then(buffer=>assert.deepEqual([...new Uint8Array(buffer).slice(0,3)],[239,187,191]));
});

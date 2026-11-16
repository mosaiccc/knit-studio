import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const workerURL=new URL('../dist/sw.js',import.meta.url);
async function retirement({brokenCache=false}={}){
  const listeners={},deleted=[],events=[];
  const scope='https://example.test/knit-studio/';
  const cacheKeys={
    'knit-studio-shell-old':[scope+'index.html',scope+'app.js'],
    'knit-studio-shell-other':['https://example.test/another/index.html'],
    'other-app-cache':[scope+'index.html'],
  };
  const context={URL,console,self:{registration:{scope,unregister:async()=>{events.push('unregister');return true;}},skipWaiting:async()=>events.push('skipWaiting'),clients:{claim:async()=>events.push('claim')},addEventListener:(type,fn)=>{listeners[type]=fn;}},caches:{keys:async()=>Object.keys(cacheKeys),open:async name=>({keys:async()=>{if(brokenCache&&name==='knit-studio-shell-old')throw Error('unavailable');return cacheKeys[name].map(url=>({url}));}}),delete:async name=>{deleted.push(name);return true;}}};
  vm.runInNewContext(await readFile(workerURL,'utf8'),context);
  async function emit(type){assert.equal(typeof listeners[type],'function');const work=[];listeners[type]({waitUntil:p=>work.push(p)});await Promise.all(work);}
  return {listeners,events,deleted,emit};
}

test('retired worker never intercepts requests or stores offline resources',async()=>{
  const worker=await retirement();assert.equal(worker.listeners.fetch,undefined);assert.equal(worker.listeners.message,undefined);
});
test('retirement takes over old cache worker without forcing any page reload',async()=>{
  const worker=await retirement();await worker.emit('install');await worker.emit('activate');
  assert.deepEqual(worker.events,['skipWaiting','claim','unregister']);
});
test('cache retirement is limited to Knit Studio caches within this path',async()=>{
  const worker=await retirement();await worker.emit('activate');assert.deepEqual(worker.deleted,['knit-studio-shell-old']);
});
test('an inaccessible legacy cache does not prevent worker unregistration',async()=>{
  const worker=await retirement({brokenCache:true});await worker.emit('activate');assert.ok(worker.events.includes('unregister'));
});
test('application entry no longer loads or registers offline features',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(html,/manifest\.webmanifest|offline\.css|apple-mobile-web-app/);
  assert.doesNotMatch(app,/offlineSupport|offline-status|offline\.js|serviceWorker\.register/);
  assert.match(html,/src="\.\/app\.js\?v=/,'A new entry URL avoids reusing the old offline script from the HTTP cache.');
});

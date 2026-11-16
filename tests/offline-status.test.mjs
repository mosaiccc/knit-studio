import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineSupport, offlinePresentation,queryOfflineStatus} from '../dist/offline.js';

function setup({controller=null,storage,registerError,readStatus}={}) {
  const events={};
  const workerEvents={};
  const registration={waiting:null,installing:null,update:async()=>{},addEventListener(){}};
  const sw={controller,addEventListener:(name,fn)=>{workerEvents[name]=fn;},register:async()=>{if(registerError)throw registerError;return registration;}};
  let latest;
  const support=createOfflineSupport({serviceWorker:sw,storage,secure:true,isOnline:()=>true,eventTarget:{addEventListener:(name,fn)=>{events[name]=fn;}},readStatus:readStatus??(async()=>({ready:true,version:'v1',assetCount:44})),onChange:value=>{latest=value;}});
  return {support,sw,registration,workerEvents,events,get state(){return latest;}};
}

test('registration alone does not claim offline readiness',async()=>{
  const t=setup();await t.support.prepare();assert.equal(t.support.state.ready,false);
  assert.notEqual(offlinePresentation(t.support.state).title,'离线已就绪');
});
test('controlling worker must confirm complete cache',async()=>{
  const t=setup({controller:{}});await t.support.prepare();assert.equal(t.support.state.ready,true);
  assert.equal(offlinePresentation(t.support.state).title,'离线已就绪');
});
test('incomplete or unreadable cache is not reported as ready',async()=>{
  for(const response of [null,{ready:false}]){const t=setup({controller:{},readStatus:async()=>response});await t.support.prepare();assert.equal(t.support.state.ready,false);}
});
test('permission denial does not block offline use',async()=>{
  const t=setup({controller:{},storage:{persisted:async()=>false,persist:async()=>false}});
  await t.support.prepare({persistent:true});assert.equal(t.support.state.ready,true);assert.equal(t.support.state.persistent,false);
});
test('storage API errors do not block editing or offline readiness',async()=>{
  const t=setup({controller:{},storage:{persisted:async()=>{throw Error('blocked');},persist:async()=>{throw Error('blocked');}}});
  await t.support.prepare({persistent:true});assert.equal(t.support.state.ready,true);
});
test('registration failure remains retryable and does not throw into editor',async()=>{
  const t=setup({registerError:Error('network')});await t.support.prepare();assert.equal(t.support.state.ready,false);assert.equal(t.support.state.phase,'error');
  t.sw.register=async()=>t.registration;t.sw.controller={};await t.support.prepare();assert.equal(t.support.state.ready,true);
});
test('waiting update keeps current ready release and never requests forced activation',async()=>{
  const t=setup({controller:{}});let activated=false;t.registration.waiting={postMessage(){activated=true;}};
  await t.support.prepare();assert.equal(t.support.state.ready,true);assert.equal(t.support.state.updateAvailable,true);assert.equal(activated,false);
});
test('unsupported or insecure browser shows instructions without registration',async()=>{
  let called=false;const support=createOfflineSupport({serviceWorker:{register(){called=true;}},secure:false,isOnline:()=>true,eventTarget:{addEventListener(){}}});
  await support.prepare();assert.equal(support.state.phase,'unsupported');assert.equal(called,false);
});
test('controller change rechecks readiness, cache loss removes readiness',async()=>{
  let ready=true;const t=setup({readStatus:async()=>({ready})});await t.support.prepare();
  t.sw.controller={};await t.workerEvents.controllerchange();assert.equal(t.support.state.ready,true);
  ready=false;await t.support.check();assert.equal(t.support.state.ready,false);
});
test('offline label requires readiness and reflects lost connection',()=>{
  assert.equal(offlinePresentation({ready:true,online:false}).title,'离线使用中');
  assert.notEqual(offlinePresentation({ready:false,online:false}).title,'离线使用中');
});
test('a complete installed cache stays ready when registration cannot reach server',async()=>{
  const t=setup({controller:{},registerError:Error('offline')});await t.support.prepare();assert.equal(t.support.state.ready,true);
});
test('explicit preparation during automatic startup retains repair and persistence intent',async()=>{
  let release,repairs=0,persistence=0;
  const t=setup({controller:{},readStatus:async(_worker,{repair})=>{if(repair)repairs++;return {ready:true};},storage:{persist:async()=>{persistence++;return true;}}});
  t.sw.register=()=>new Promise(resolve=>{release=()=>resolve(t.registration);});
  const automatic=t.support.prepare();const explicit=t.support.prepare({repair:true,persistent:true});release();await Promise.all([automatic,explicit]);
  assert.equal(repairs,1);assert.equal(persistence,1);
});
test('worker readiness query accepts only its protocol and times out safely',async()=>{
  const worker={postMessage(message,[port]){assert.equal(message.type,'KNIT_OFFLINE_PREPARE');port.postMessage({type:'KNIT_OFFLINE_STATUS',ready:true,assetCount:46,version:'v1'});}};
  assert.equal((await queryOfflineStatus(worker,{repair:true,timeout:1000})).ready,true);
  assert.equal(await queryOfflineStatus({postMessage(_message,[port]){port.postMessage({ready:true});}},{timeout:1000}),null);
  assert.equal(await queryOfflineStatus({postMessage(){}},{timeout:5}),null);
});

/** Readiness comes from the controlling worker's cache, never from registration alone. */
export function queryOfflineStatus(worker, {repair=false, timeout=repair?60000:5000}={}) {
  return new Promise(resolve=>{
    if(!worker || typeof MessageChannel==='undefined'){resolve(null);return;}
    const channel=new MessageChannel();
    let finished=false;
    const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value);};
    const timer=setTimeout(()=>finish(null),timeout);
    channel.port1.onmessage=event=>{
      const data=event.data;
      finish(data?.type==='KNIT_OFFLINE_STATUS' && typeof data.ready==='boolean' ? data : null);
    };
    try{worker.postMessage({type:repair?'KNIT_OFFLINE_PREPARE':'KNIT_OFFLINE_STATUS'},[channel.port2]);}
    catch{finish(null);}
  });
}

export function offlinePresentation(state) {
  if(state.ready)return {title:state.online===false?'离线使用中':'离线已就绪',detail:state.updateAvailable?'新版已下载。结束编辑后，关闭所有织间窗口，再重新打开即可使用新版。':'绘图、版型设计、工程保存和本地文件导入导出可在断网后使用。',tone:'ready'};
  if(state.phase==='unsupported')return {title:'此浏览器尚不能准备离线',detail:'请在 iPad 的 Safari 中打开 HTTPS 在线地址，并添加到主屏幕。',tone:'warning'};
  if(state.online===false)return {title:'离线尚未准备完成',detail:'请先联网打开，等到显示“离线已就绪”后再断网。当前页面中的修改仍可保存。',tone:'warning'};
  if(state.phase==='preparing')return {title:'正在准备离线…',detail:'正在将工具保存到这台设备。准备期间可以继续设计，请保持页面打开。',tone:'pending'};
  return {title:'离线尚未准备完成',detail:'请保持联网，点击“检查与准备离线”重试。工程保存不受此提示影响。',tone:'warning'};
}

export function createOfflineSupport({
  serviceWorker=globalThis.navigator?.serviceWorker,
  storage=globalThis.navigator?.storage,
  secure=globalThis.isSecureContext,
  isOnline=()=>globalThis.navigator?.onLine!==false,
  eventTarget=globalThis.window,
  readStatus=queryOfflineStatus,
  onChange=()=>{}
}={}) {
  let state={phase:'preparing',ready:false,online:isOnline(),updateAvailable:false,persistent:null};
  let registration=null,busy=null,checkRevision=0;
  const publish=values=>{state={...state,...values,online:isOnline()};onChange({...state});};
  const watched=new WeakSet();
  async function check({repair=false}={}) {
    if(!secure || !serviceWorker){publish({phase:'unsupported',ready:false});return;}
    const revision=++checkRevision;
    let result=null;
    const controller=serviceWorker?.controller;
    if(controller){try{result=await readStatus(controller,{repair});}catch{/* Keep the editor usable if the worker stops. */}}
    if(revision!==checkRevision)return;
    const ready=Boolean(result?.ready);
    publish({ready,phase:ready?'ready':registration?.installing?'preparing':'incomplete',version:result?.version??null,updateAvailable:Boolean(registration?.waiting)});
  }
  function watch(worker) {
    if(!worker || watched.has(worker))return;
    watched.add(worker);
    worker.addEventListener('statechange',()=>{void check();});
  }
  async function persistence() {
    try{
      const retained=await storage?.persisted?.();
      const persistent=retained===true?true:await storage?.persist?.();
      publish({persistent:typeof persistent==='boolean'?persistent:null});
    }catch{publish({persistent:null});}
  }
  async function prepare({persistent=false,repair=false}={}) {
    if(!secure || !serviceWorker){publish({phase:'unsupported',ready:false});return;}
    if(busy){await busy;if(persistent||repair)return prepare({persistent,repair});return;}
    busy=(async()=>{
      publish({phase:state.ready?'ready':'preparing'});
      try{
        if(!registration){
          registration=await serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
          registration.addEventListener('updatefound',()=>{watch(registration.installing);void check();});
        }else if(isOnline()){
          try{await registration.update();}catch{/* The installed version remains usable. */}
        }
        watch(registration.installing);
        await check({repair});
      }catch{
        if(serviceWorker.controller)await check({repair});
        if(!state.ready)publish({phase:'error',ready:false});
      }
      if(persistent)await persistence();
    })().finally(()=>{busy=null;});
    return busy;
  }
  serviceWorker?.addEventListener?.('controllerchange',()=>check());
  eventTarget?.addEventListener('online',()=>{publish({});void prepare();});
  eventTarget?.addEventListener('offline',()=>{publish({});void check();});
  eventTarget?.addEventListener('pageshow',()=>{void check();});
  return {get state(){return {...state};},prepare,check};
}

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderOfflineStatus(root,state,onOpen) {
  if(!root)return;
  const info=offlinePresentation(state);
  root.className='offline-strip '+info.tone;
  root.innerHTML=`<span class="offline-summary" role="status" aria-live="polite"><i aria-hidden="true"></i><span>${escape(info.title)}${state.updateAvailable?' · 有新版':''}</span></span><button class="btn text small" type="button">iPad 安装与离线使用</button>`;
  root.querySelector('button').onclick=onOpen;
}

export function openOfflineHelp({support,openModal,onBackup}) {
  openModal('把织间带在身边',`<div class="offline-help"><div id="offline-detail" class="offline-detail" role="status" aria-live="polite"></div><ol class="offline-steps"><li><b>先联网，在 Safari 打开在线版</b><span>使用同一个账号登录。点击分享，选择“添加到主屏幕”；若出现“作为网页 App 打开”，请保持开启。</span></li><li><b>从主屏幕图标再打开一次</b><span>保持联网，在这个窗口中等到显示“离线已就绪”。然后在“我的工程”导入电脑上的备份。</span></li><li><b>断网，也可以继续设计</b><span>出门前试一次飞行模式：关闭织间，再从主屏幕重新打开。能打开作品后，就可以放心带走。</span></li></ol><div class="offline-capabilities"><b>可离线使用</b><p>新建工程、手绘提花、图片框选转提花、版型编辑、针法绘制、密度换算，以及图解和文字教程导出。</p><p>要导入的照片、工程和其他文件，请先下载到 iPad 本机；仅存于 iCloud 的文件可能需要联网。</p></div><p class="offline-note">作品保存在当前设备，不会自动同步到电脑。请在“我的工程”定期下载“全部备份”，保存到 iPad 的“文件”App。清除网站数据或系统清理存储可能移除离线工具和作品。</p><p class="offline-note">新版本会先下载，等你关闭所有织间窗口后再启用，不会自动刷新正在编辑的页面。再次框选原始图片时，需要重新选取原图。</p><p id="offline-persistence" class="offline-note"></p></div>`,`<button class="btn" id="offline-backup">工程与备份</button><button class="btn primary" id="offline-prepare">检查与准备离线</button>`);
  const button=document.querySelector('#offline-prepare');
  button.onclick=async()=>{button.disabled=true;button.textContent='正在检查…';try{await support.prepare({persistent:true,repair:true});}finally{button.disabled=false;button.textContent='检查与准备离线';}};
  document.querySelector('#offline-backup').onclick=onBackup;
  updateOfflineHelp(support.state);
}

export function updateOfflineHelp(state) {
  const detail=document.querySelector('#offline-detail');
  if(!detail)return;
  const info=offlinePresentation(state);
  detail.className='offline-detail '+info.tone;
  detail.innerHTML=`<strong>${escape(info.title)}</strong><span>${escape(info.detail)}</span>`;
  document.querySelector('#offline-persistence').textContent=state.persistent===true?'已获准保留本机存储，仍建议定期下载备份。':'“检查与准备离线”也会尝试保留本机存储；是否允许由浏览器决定，不影响已准备好的离线功能。';
}

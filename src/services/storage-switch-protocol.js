// Only cooperating clients in the explicitly isolated build use this marker.
// Already published applications cannot be retroactively made to honor it.
export const SWITCH_KEY='todo-shard-switch-protocol',SWITCH_VERSION=1;
export function readSwitch(storage){
 const raw=storage.getItem(SWITCH_KEY);if(raw===null)return null;
 let value;try{value=JSON.parse(raw)}catch{throw Error('存储切换标志损坏，禁止写入')}
 if(value?.version!==SWITCH_VERSION||!['preparing','active','retired'].includes(value.phase)||typeof value.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceHash))throw Error('存储切换协议不兼容，禁止写入');
 return value;
}
export function setSwitch(storage,phase,sourceHash){
 if(!['preparing','active','retired'].includes(phase)||typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('无效存储切换状态');
 const old=readSwitch(storage);
 if(old&&old.sourceHash!==sourceHash)throw Error('切换源已变化');
 if(old&&old.phase!==phase&&!((old.phase==='preparing'&&phase==='active')||(old.phase==='active'&&phase==='retired')))throw Error('禁止逆向切换');
 const next={version:SWITCH_VERSION,phase,sourceHash};
 storage.setItem(SWITCH_KEY,JSON.stringify(next));return next;
}
export function assertShardWriter(storage,sourceHash){
 const marker=readSwitch(storage);
 if(!marker||marker.phase!=='active'||marker.sourceHash!==sourceHash)throw Error('存储切换状态已变化，请导出草稿后重新打开');
}
export function assertLegacyWriter(storage){
 if(readSwitch(storage))throw Error('已存在分片工作空间，请返回迁移管理页；旧模式禁止写入');
}

// A controlled page must not start the isolated migration while an older or
// unknown service worker can serve a different storage writer.
export async function requireCompatibleWorker(serviceWorker=globalThis.navigator?.serviceWorker,timeout=1500){
 if(!serviceWorker)return;
 const registration=await serviceWorker.getRegistration();
 const workers=[...new Set([serviceWorker.controller,registration?.active,registration?.waiting,registration?.installing].filter(Boolean))];
 for(const worker of workers){
  const answer=await new Promise(resolve=>{
   const channel=new MessageChannel();let timer;
   const finish=value=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value)};
   timer=setTimeout(()=>finish(null),timeout);channel.port1.onmessage=e=>finish(e.data);
   try{worker.postMessage({type:'TODO_STORAGE_PROTOCOL'},[channel.port2])}catch{finish(null)}
  });
  if(answer?.mode!=='shard-pilot'||answer.version!==SWITCH_VERSION)throw Error('PWA 工作线程版本不兼容；请关闭旧版并重新加载后再试验迁移');
 }
}

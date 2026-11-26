// Lab-only adapter, using the production native-store queue and receipt barriers.
// Never accepts an unaudited baseline, and never changes the UUID after unknown outcome.
import {createNativeStore} from '../../src/services/native-store.js';
import {canonical} from '../../src/services/cloud-core.js';
import {snapshotFingerprint} from '../../src/core/operation-history.js';
import {sameRecord} from '../../src/core/record-equality.js';
import {plan} from './changes.mjs';
const K='todo-workbench-v1';
const normalize=(key,value)=>key===K?canonical(JSON.parse(value)):value;
export async function createProductStore(values,scope,onStatus,invoke){
 const h=await invoke('r5_handshake');
 if(h.protocol!==1||h.scope!=='guest'||scope!==h.scope||!['row','snapshot'].includes(h.mode))throw Error('R5 protocol mismatch');
 let rev=h.revision,baseline={...values},pending=null,poison=false;
 if(normalize(K,baseline[K])!==baseline[K])throw Error('R5 initial canonical mismatch');
 const same=(a,b)=>sameRecord(a,b);
 async function transmit(){
  const p=pending;const ack=await invoke('r5_commit',{envelope:p.envelope});
  if(ack.id!==p.envelope.id||ack.scope!==scope||ack.revision!==(h.mode==='row'?rev+1:0)||ack.fingerprint!==await snapshotFingerprint(p.values[K])){poison=true;throw Error('R5 ambiguous acknowledgement; reload authority')}
  rev=ack.revision;baseline=p.values;pending=null;return p;
 }
 async function write(next,receipt=null){
  if(poison)throw Error('R5 requires authoritative reload');
  const before=performance.now();
  if(pending){const old=await transmit();if(same(old.values,next)&&same(old.envelope.receipt,receipt))return;}
  if(same(baseline,next)&&!receipt)return;
  const envelope={protocol:1,scope,mode:h.mode,id:crypto.randomUUID(),base:rev,receipt:receipt?structuredClone(receipt):null};
  if(h.mode==='snapshot')envelope.store=JSON.stringify(next);
  else{
   const p=plan(JSON.parse(baseline[K]),JSON.parse(next[K]));
   if(p.kind==='reject')throw Error(p.reason);
   const keys=Object.keys({...baseline,...next}).filter(k=>k!==K&&baseline[k]!==next[k]).map(key=>({key,before:baseline[key]??null,after:next[key]??null}));
   const patch=p.kind==='delta'?{...p.patch,keys}:null;
   envelope.patch=patch&&new TextEncoder().encode(JSON.stringify(patch)).length<=900000?patch:{kind:'snapshot',store:next};
  }
  const planned=performance.now()-before;pending={envelope,values:{...next}};
  const start=performance.now();await transmit();
  window.__r5Metrics?.push({planMs:planned,ipcMs:performance.now()-start,receipt:!!receipt});
 }
 window.__r5Metrics=[];
 const storage=createNativeStore(values,s=>write(s),onStatus,(s,r)=>write(s,r),normalize);
 storage.serializeWorkspace=canonical;
 return storage;
}

import {canonical} from './cloud-core.js';
export const SYNC_LOG_KEY='todo-sync-log-v1';
const eq=(a,b)=>canonical(a)===canonical(b);
export function readSyncLog(storage){try{const items=JSON.parse(storage.getItem(SYNC_LOG_KEY)||'[]');return Array.isArray(items)?items.filter(x=>x&&typeof x.kind==='string'&&typeof x.at==='string').slice(0,60):[]}catch{return []}}
export function appendSyncLog(storage,kind,revision=null,now=new Date().toISOString()){
 const prior=readSyncLog(storage);
 // Avoid flooding the log with repeated identical failure/offline signals.
 if(prior[0]?.kind===kind&&prior[0]?.revision===revision&&Date.parse(now)-Date.parse(prior[0].at)<60000)return prior;
 const next=[{kind,revision:Number.isSafeInteger(revision)?revision:null,at:now},...prior].slice(0,60);
 try{storage.setItem(SYNC_LOG_KEY,JSON.stringify(next))}catch{}return next;
}
export function compareWorkspace(local,remote){
 const a=new Map((local?.tasks||[]).map(t=>[t.id,t])),b=new Map((remote?.tasks||[]).map(t=>[t.id,t]));
 let localOnly=0,remoteOnly=0,changed=0;const details=[];
 for(const [id,t] of a){const other=b.get(id);if(!other){localOnly++;if(details.length<12)details.push({kind:'local',local:t.title,remote:''});continue}if(!eq(t,other)){changed++;if(details.length<12)details.push({kind:'changed',local:t.title,remote:other.title,fields:[...new Set([...Object.keys(t),...Object.keys(other)])].filter(k=>!eq(t[k],other[k])).slice(0,8)})}}
 for(const [id,t] of b)if(!a.has(id)){remoteOnly++;if(details.length<12)details.push({kind:'remote',local:'',remote:t.title})}
 const otherFields=[...new Set([...Object.keys(local||{}),...Object.keys(remote||{})])].filter(k=>k!=='tasks'&&!eq(local?.[k],remote?.[k]));
 return {localOnly,remoteOnly,changed,details,otherFields};
}

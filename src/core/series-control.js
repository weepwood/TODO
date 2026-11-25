// Compatibility fence: existing clients understand the occurrence cap and keep policy.
export function validHold(h){return h&&Number.isInteger(h.count)&&h.count>=0&&h.count<=100000&&['keep','skip'].includes(h.miss)}
export function seriesControl(tasks,id,action){
 const t=tasks.find(x=>x.id===id);
 if(!t||t.deletedAt||t.status!=='pending'||t.repeat==='none')return tasks;
 const rows=tasks.filter(x=>(x.seriesId||x.id)===(t.seriesId||t.id)&&!x.deletedAt);
 const index=t.occurrenceIndex||1;
 if(index>100000||rows.filter(x=>x.status==='pending').length!==1||rows.some(x=>(x.occurrenceIndex||1)>index||x.previousId===t.id))return tasks;
 const held=validHold(t.seriesHold),fence=t.repeatCount===index&&t.miss==='keep';
 let fields;
 if(action==='pause'&&!t.seriesHold&&(!t.repeatCount||t.repeatCount>index)){
  fields={seriesHold:{count:t.repeatCount||0,miss:t.miss},repeatCount:index,miss:'keep'};
 }else if(action==='resume'&&held&&fence){fields={seriesHold:null,repeatCount:t.seriesHold.count,miss:t.seriesHold.miss}}
 else if(action==='end'&&(!t.seriesHold||held&&fence)){fields={seriesHold:null,repeatCount:Math.min(t.repeatCount||index,index),miss:'keep'}}
 else return tasks;
 return tasks.map(x=>x.id===id?{...x,...fields}:x);
}
export function protectHeldRules(task,fields){
 if(!task.seriesHold)return fields;
 return Object.fromEntries(Object.entries(fields).filter(([k])=>!(k==='date'&&!fields.date)&&!['repeat','seriesStart','interval','weekdays','repeatUntil','repeatCount','miss','reset','seriesHold'].includes(k)));
}

export function seriesDirectory(tasks){
 const groups=new Map();
 for(const t of tasks){const key=t.seriesId||t.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}
 const rows=[];
 for(const [key,items] of groups){
  if(!items.some(t=>t.repeat!=='none'||t.seriesId||t.previousId||t.seriesHold))continue;
  const available=items.filter(t=>!t.deletedAt);if(!available.length)continue;
  const live=available.filter(t=>t.status==='pending'),held=available.filter(t=>t.seriesHold),last=[...available].sort((a,b)=>(b.occurrenceIndex||1)-(a.occurrenceIndex||1)||String(b.date).localeCompare(String(a.date)))[0];
  const t=live.length===1?live[0]:last,index=t.occurrenceIndex||1;
  const conflict=live.length>1||held.some(h=>h.status!=='pending'||h.repeat==='none'||!validHold(h.seriesHold)||h.repeatCount!==(h.occurrenceIndex||1)||h.miss!=='keep'||available.some(x=>x.id!==h.id&&(x.occurrenceIndex||1)>(h.occurrenceIndex||1)));
  const state=conflict?'conflict':t.seriesHold?'paused':!live.length||t.repeat==='none'||t.repeatCount>0&&t.repeatCount<=index?'ended':'running';
  rows.push({key,task:t,state,total:available.length,completed:available.filter(x=>x.status==='completed').length,skipped:available.filter(x=>x.status==='skipped').length,held,live});
 }
 return rows.sort((a,b)=>a.task.title.localeCompare(b.task.title)||a.key.localeCompare(b.key))
}
// Explicitly repair a broken fence only for one live instance with no successor.
// A completed legacy instance cannot be reopened automatically (points/history).
export function recoverSeries(tasks,seriesId,action){
 const row=seriesDirectory(tasks).find(r=>r.key===seriesId);
 if(!row||row.state!=='conflict')return tasks;
 if(action==='repair'&&row.live.length===1&&row.held.length===1&&row.held[0].id===row.live[0].id){
  const t=row.live[0],index=t.occurrenceIndex||1;
  if(t.repeat==='none'||!validHold(t.seriesHold)||index>100000||tasks.some(x=>(x.seriesId||x.id)===seriesId&&!x.deletedAt&&(x.occurrenceIndex||1)>index))return tasks;
  return tasks.map(x=>x.id===t.id?{...x,repeatCount:index,miss:'keep'}:x)
 }
 if(action==='acknowledge'&&row.held.length&&row.held.every(t=>t.status!=='pending')&&(!row.live.length||row.live.length===1&&!row.live[0].seriesHold&&row.held.every(h=>(h.occurrenceIndex||1)<(row.live[0].occurrenceIndex||1))))return tasks.map(t=>(t.seriesId||t.id)===seriesId&&t.seriesHold?{...t,seriesHold:null}:t);
 return tasks;
}

export function heldSeriesKeys(tasks){return new Set(tasks.filter(t=>!t.deletedAt&&t.seriesHold).map(t=>t.seriesId||t.id))}

export function seriesSafetyKeys(tasks){
 const keys=heldSeriesKeys(tasks),live=new Map();
 for(const t of tasks){if(t.deletedAt||t.status!=='pending')continue;const key=t.seriesId||t.id;live.set(key,(live.get(key)||0)+1)}
 for(const [key,count] of live)if(count>1)keys.add(key);
 return keys;
}
// Old clients can preserve unknown fields, but cannot safely erase a pause marker.
// When a known baseline loses a marker without an explicit compatible release,
// route the pull through the existing conflict review and backup mechanism.
export function unsafeSeriesPull(base,remote){
 if(!base||!remote)return false;
 const byId=new Map(remote.tasks.map(t=>[t.id,t]));
 for(const t of base.tasks){if(!t.seriesHold||t.deletedAt)continue;const next=byId.get(t.id);if(next?.seriesHold||next?.deletedAt)continue;
  if(!next||next.seriesHold!==null)return true;
  if(next.status==='pending'&&!(next.repeatCount===t.seriesHold.count&&next.miss===t.seriesHold.miss||next.repeatCount===(t.occurrenceIndex||1)&&next.miss==='keep'))return true;
 }
 return false;
}

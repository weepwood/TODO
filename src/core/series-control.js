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

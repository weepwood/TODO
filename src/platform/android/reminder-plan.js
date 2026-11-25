// Scheduling is a device-local projection of the committed workspace, not a
// second task database. Use generic notification text to protect lock-screen privacy.
export const MAX_ALARMS=200,ALARM_HORIZON=30*86400000,ALARM_GRACE=86400000;
export const reminderKey=(scope,taskId,at)=>JSON.stringify([scope,taskId,at]);
export function planAlarms(tasks,scope,now,previous=[]){
 const old=new Map(previous.map(r=>[r.key,r])),future=[],retained=[];
 for(const t of tasks){if(t.deletedAt||t.status!=='pending')continue;
  for(const r of [{at:t.reminderAt,sentAt:t.remindedAt},...(t.extraReminders||[])]){
   if(!r.at)continue;const epoch=Date.parse(r.at);if(!Number.isFinite(epoch))continue;
   const key=reminderKey(scope,t.id,r.at),prior=old.get(key);
   if(epoch>now&&epoch<=now+ALARM_HORIZON&&!r.sentAt)future.push({key,epoch,scope});
   else if(prior&&epoch<=now&&epoch>=now-ALARM_GRACE)retained.push(prior);
  }
 }
 const unique=new Map();for(const r of [...retained,...future.sort((a,b)=>a.epoch-b.epoch)])if(!unique.has(r.key))unique.set(r.key,r);
 return [...unique.values()].slice(0,MAX_ALARMS);
}

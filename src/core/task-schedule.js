import {dayKey,validDate,validTime} from './domain.js';
const keys=['date','time','anchor','reminderAt','extraReminders','repeat','seriesStart','interval','weekdays','repeatUntil','repeatCount','miss','reset'];
const rules=['repeat','seriesStart','interval','weekdays','repeatUntil','repeatCount','miss','reset'];
export const scheduleSnapshot=t=>Object.fromEntries(keys.map(k=>[k,t[k]]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validStamp=s=>typeof s==='string'&&s.length===16&&s[10]==='T'&&validDate(s.slice(0,10))&&validTime(s.slice(11));
export function reminderBefore(date,time,minutes){
 if(!validDate(date)||!validTime(time)||!Number.isInteger(minutes)||minutes<0)return '';
 const d=new Date(date+'T'+time);if(!Number.isFinite(d.getTime()))return '';
 if(dayKey(d)!==date||String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')!==time)return '';
 d.setTime(d.getTime()-minutes*60000);const key=dayKey(d);
 return validDate(key)?key+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'):'';
}
export function scheduleChanges(original,current,draft,{locked=false}={}){
 if(!current||current.deletedAt||current.status!=='pending'||!same(scheduleSnapshot(original),scheduleSnapshot(current)))return {error:'任务安排已变化，请关闭后重新打开。'};
 const next={...draft};
 if(next.date&&!validDate(next.date)||next.time&&!validTime(next.time))return {error:'日期或时间无效。'};
 if(next.repeat!=='none'&&!next.date)return {error:'重复任务必须设置日期。'};
 if(original.repeat!=='none'&&!next.date)return {error:'已有重复任务不能直接清除日期，请先处理重复规则。'};
 if((locked||original.seriesHold)&&rules.some(k=>!same(next[k],original[k])))return {error:'系列暂停或存在冲突，不能修改重复规则。'};
 if(next.repeatUntil&&next.repeat!=='none'&&next.repeatUntil<next.date)return {error:'重复截止日期不能早于计划日期。'};
 if(next.reminderAt&&!validStamp(next.reminderAt)||!Array.isArray(next.extraReminders)||next.extraReminders.length>20||next.extraReminders.some(r=>!validStamp(r.at)))return {error:'提醒日期或时间无效。'};
 if(next.date!==original.date)next.anchor=next.date?Number(next.date.slice(-2)):null;
 if(original.repeat==='none'&&next.repeat!=='none')next.seriesStart=next.date;
 return {fields:Object.fromEntries(keys.filter(k=>!same(next[k],original[k])).map(k=>[k,next[k]]))};
}

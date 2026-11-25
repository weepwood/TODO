import {dayKey,shiftDay,validDate} from './domain.js';
const timestampDay=value=>Number.isFinite(Date.parse(value))?dayKey(new Date(value)):'';
const ratio=(n,d)=>d?Math.round(n/d*1000)/10:null;
export const GOAL_KEY='todo-review-goals-v1';
export const defaultGoals=()=>({completed:0,focusMinutes:0,yearCompleted:0,yearFocusMinutes:0});
export function validGoals(g){return g&&Number.isInteger(g.completed)&&g.completed>=0&&g.completed<=100000&&Number.isInteger(g.focusMinutes)&&g.focusMinutes>=0&&g.focusMinutes<=44640&&(g.yearCompleted===undefined||Number.isInteger(g.yearCompleted)&&g.yearCompleted>=0&&g.yearCompleted<=1000000)&&(g.yearFocusMinutes===undefined||Number.isInteger(g.yearFocusMinutes)&&g.yearFocusMinutes>=0&&g.yearFocusMinutes<=527040)}
export function readGoals(storage){const raw=storage.getItem(GOAL_KEY);if(raw==null)return defaultGoals();const g=JSON.parse(raw);if(!validGoals(g))throw Error('目标配置无效，原数据保留');return {...defaultGoals(),...g}}
export function writeGoals(storage,g){if(!validGoals(g))throw Error('目标超出范围');storage.setItem(GOAL_KEY,JSON.stringify(g));return g}
// Keep the legacy preference intact; its original effective date is unknown.
export const GOAL_HISTORY_KEY='todo-review-goal-history-v1';
export const GOAL_HISTORY_LIMIT=366;
export function readGoalHistory(storage){
 const raw=storage.getItem(GOAL_HISTORY_KEY);if(raw==null)return [];
 const rows=JSON.parse(raw);
 if(!Array.isArray(rows)||rows.length>GOAL_HISTORY_LIMIT||!rows.every((r,i)=>r&&validDate(r.effectiveFrom)&&typeof r.savedAt==='string'&&Number.isFinite(Date.parse(r.savedAt))&&validGoals(r.goals)&&(!i||rows[i-1].effectiveFrom<=r.effectiveFrom)))throw Error('目标历史异常，原数据保留');
 return rows;
}
export function goalAt(rows,date){
 if(!validDate(date))return null;
 return rows.findLast(r=>r.effectiveFrom<=date)||null;
}
export function saveGoalVersion(storage,goals,today,now=new Date()){
 if(!validGoals(goals)||!validDate(today)||dayKey(now)!==today)throw Error('目标或生效日期无效，请重新打开报告');
 const rows=readGoalHistory(storage),last=rows.at(-1),value={...defaultGoals(),...goals};
 if(last&&last.effectiveFrom>today)throw Error('设备日期早于最近目标版本，不能覆盖历史');
 if(last&&Object.keys(defaultGoals()).every(k=>last.goals[k]===value[k]))return rows;
 if(rows.length>=GOAL_HISTORY_LIMIT)throw Error('目标历史已达366份上限，原记录保留');
 const next=[...rows,{effectiveFrom:today,savedAt:now.toISOString(),goals:value}];
 storage.setItem(GOAL_HISTORY_KEY,JSON.stringify(next));return next;
}
export function habitAssociation(days,counts){
 const n=days.length,yes=days.filter(d=>d.checked),no=days.filter(d=>!d.checked),mean=xs=>xs.reduce((s,d)=>s+(counts.get(d.date)||0),0)/xs.length;
 if(n<14||yes.length<3||no.length<3)return {days:n,checked:yes.length,unchecked:no.length,checkedMean:null,uncheckedMean:null,r:null};
 const a=mean(yes),b=mean(no),m=mean(days),variance=days.reduce((s,d)=>s+((counts.get(d.date)||0)-m)**2,0)/n;
 return {days:n,checked:yes.length,unchecked:no.length,checkedMean:a,uncheckedMean:b,r:variance>0?Math.max(-1,Math.min(1,(a-b)/Math.sqrt(variance)*Math.sqrt(yes.length*no.length)/n)):null}
}
export function goalProgressAt(data,until){
 const monthStart=until.slice(0,7)+'-01',yearStart=until.slice(0,4)+'-01-01';
 let monthlyCompleted=0,yearlyCompleted=0,monthlySeconds=0,yearlySeconds=0;
 for(const t of data.tasks){if(t.deletedAt||t.status!=='completed')continue;const date=timestampDay(t.completedAt);if(date>=yearStart&&date<=until){yearlyCompleted++;if(date>=monthStart)monthlyCompleted++}}
 for(const s of data.sessions){if(s.mode==='break'||!Number.isFinite(s.seconds)||s.seconds<0)continue;const date=timestampDay(s.startedAt);if(date>=yearStart&&date<=until){yearlySeconds+=s.seconds;if(date>=monthStart)monthlySeconds+=s.seconds}}
 return {month:until.slice(0,7),monthlyCompleted,yearlyCompleted,monthlyFocus:Math.round(monthlySeconds/60),yearlyFocus:Math.round(yearlySeconds/60)};
}
export function reviewInsights(data,r){
 const {since,until}=r,windowStart=shiftDay(until,-89),tasks=data.tasks.filter(t=>!t.deletedAt),counts=new Map(),boundSeconds=new Map(),completedIds=new Set(r.completed.map(t=>t.id));
 for(const t of tasks){if(t.status!=='completed')continue;const date=timestampDay(t.completedAt);if(date>=windowStart&&date<=until)counts.set(date,(counts.get(date)||0)+1)}
 const completionDays=new Map(r.completed.map(t=>[t.id,timestampDay(t.completedAt)]));
 for(const s of data.sessions){if(s.mode==='break'||!Number.isFinite(s.seconds)||s.seconds<0)continue;const date=timestampDay(s.startedAt);if(!date||date>until)continue;if(completedIds.has(s.taskId)&&date<=completionDays.get(s.taskId))boundSeconds.set(s.taskId,(boundSeconds.get(s.taskId)||0)+s.seconds)}
 const efficiency=efficiencySummary(data.tasks,since,until);
 const errors=[];let estimated=0,actual=0;
 for(const t of r.completed){if(!boundSeconds.has(t.id)||boundSeconds.get(t.id)<=0)continue;const minutes=boundSeconds.get(t.id)/60;estimated+=t.duration;actual+=minutes;errors.push(Math.abs(minutes-t.duration))}
 errors.sort((a,b)=>a-b);const mid=Math.floor(errors.length/2),median=errors.length?(errors[mid]+errors[(errors.length-1)>>1])/2:null;
 const habits=data.habits.slice(0,30).map(h=>{const recorded=h.days.filter(d=>d<=until).sort(),start=recorded.length?[recorded[0],windowStart].sort().at(-1):null,checked=new Set(recorded),days=[];if(start)for(let d=start;d<=until&&days.length<90;d=shiftDay(d,1))days.push({date:d,checked:checked.has(d)});return {id:h.id,name:h.name,...habitAssociation(days,counts)}});
 return {version:1,...goalProgressAt(data,until),...efficiency,matched:errors.length,estimated:Math.round(estimated),actual:Math.round(actual),bias:Math.round(actual-estimated),medianError:median===null?null:Math.round(median*10)/10,habits,habitTotal:data.habits.length};
}
export function validInsights(v){
 const nonnegative=['monthlyCompleted','monthlyFocus','planned','plannedDone','dated','onTime','matched','estimated','actual','habitTotal'];
 return !!v&&v.version===1&&/^\d{4}-\d{2}$/.test(v.month)&&nonnegative.every(k=>Number.isFinite(v[k])&&v[k]>=0)&&(v.yearlyCompleted===undefined||Number.isFinite(v.yearlyCompleted)&&v.yearlyCompleted>=v.monthlyCompleted)&&(v.yearlyFocus===undefined||Number.isFinite(v.yearlyFocus)&&v.yearlyFocus>=v.monthlyFocus)&&v.plannedDone<=v.planned&&v.onTime<=v.dated&&Number.isFinite(v.bias)&&['completionRate','onTimeRate'].every(k=>v[k]===null||Number.isFinite(v[k])&&v[k]>=0&&v[k]<=100)&&(v.medianError===null||Number.isFinite(v.medianError)&&v.medianError>=0)&&Array.isArray(v.habits)&&v.habits.length<=30&&v.habits.every(h=>h&&typeof h.id==='string'&&typeof h.name==='string'&&['days','checked','unchecked'].every(k=>Number.isInteger(h[k])&&h[k]>=0&&h[k]<=90)&&h.checked+h.unchecked===h.days&&['checkedMean','uncheckedMean'].every(k=>h[k]===null||Number.isFinite(h[k])&&h[k]>=0)&&(h.r===null||Number.isFinite(h.r)&&Math.abs(h.r)<=1));
}

export function insightsMarkdown(v){
 if(!validInsights(v))return '';
 const pct=x=>x===null?'暂无样本':x+'%';
 const name=value=>String(value??'').replace(/[\r\n]+/g,' ').replace(/[\\`*_{}\[\]<>#|!]/g,'\\$&');
 return ['','## 完成效率与计划偏差','- 当前计划完成率：'+pct(v.completionRate)+'（'+v.plannedDone+'/'+v.planned+'）','- 按时完成率：'+pct(v.onTimeRate)+'（'+v.onTime+'/'+v.dated+'）','- 有绑定专注的完成任务：'+v.matched+' 项；预计 '+v.estimated+' 分钟，实际 '+v.actual+' 分钟','- 总偏差：'+(v.matched?v.bias+' 分钟':'暂无样本')+'；绝对误差中位数：'+(v.medianError===null?'暂无样本':v.medianError+' 分钟'),'','## 月度实际进展 '+v.month,'- 完成 '+v.monthlyCompleted+' 项，专注 '+v.monthlyFocus+' 分钟',...(v.yearlyCompleted===undefined?[]:['- '+v.month.slice(0,4)+' 年累计完成 '+v.yearlyCompleted+' 项，专注 '+v.yearlyFocus+' 分钟']),'','## 习惯与完成任务关联（最多90天）',...v.habits.map(h=>'- '+name(h.name)+'：'+h.days+' 天，打卡 '+h.checked+' 天，未打卡 '+h.unchecked+' 天，r='+ (h.r===null?'不可计算':h.r.toFixed(2))), '', '> 当前计划而非历史原始计划；专注只统计绑定记录，不等同全部工时。习惯关联不代表因果，未打卡不代表未执行。月度与年度目标为本机参考，不冻结在报告内。',''].join('\n')
}

export function efficiencySummary(tasks,since,until,list='all'){
 let planned=0,plannedDone=0,dated=0,onTime=0;
 for(const t of tasks){if(t.deletedAt||list!=='all'&&t.listId!==list)continue;const done=t.status==='completed'?timestampDay(t.completedAt):'';if(t.status!=='skipped'&&t.date&&t.date>=since&&t.date<=until){planned++;if(done&&done<=until)plannedDone++}if(done>=since&&done<=until&&validDate(t.date)){dated++;if(done<=t.date)onTime++}}
 return {planned,plannedDone,dated,onTime,completionRate:ratio(plannedDone,planned),onTimeRate:ratio(onTime,dated)};
}

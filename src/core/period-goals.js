import {goalProgressAt} from './review-insights.js';
import {shiftDay} from './domain.js';
import {validDate} from './domain.js';
export const PERIOD_GOAL_KEY='todo-period-goals-v1';
export function validPeriod(key){return typeof key==='string'&&(/^\d{4}$/.test(key)&&validDate(key+'-01-01')||/^\d{4}-\d{2}$/.test(key)&&validDate(key+'-01'))}
export function validPeriodGoal(key,goal){
 return validPeriod(key)&&goal&&Number.isInteger(goal.completed)&&goal.completed>=0&&goal.completed<=(key.length===4?1000000:100000)&&Number.isInteger(goal.focusMinutes)&&goal.focusMinutes>=0&&goal.focusMinutes<=(key.length===4?527040:44640);
}
export function readPeriodGoals(storage){
 const raw=storage.getItem(PERIOD_GOAL_KEY);if(raw===null)return {};
 const value=JSON.parse(raw);
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>366||!Object.entries(value).every(([k,v])=>validPeriodGoal(k,v)))throw Error('独立周期目标无效，原记录保留');
 return value;
}
export function savePeriodGoal(storage,key,goal){
 const current=readPeriodGoals(storage);if(!validPeriod(key)||goal!==null&&!validPeriodGoal(key,goal))throw Error('目标无效');
 const next={...current};if(goal===null)delete next[key];else next[key]={completed:goal.completed,focusMinutes:goal.focusMinutes};
 if(Object.keys(next).length>366)throw Error('周期目标已达366份上限');
 storage.setItem(PERIOD_GOAL_KEY,JSON.stringify(next));return next;
}

export function periodComparison(data,rows,key,until){
 return Object.keys(rows).filter(k=>k.length===key.length&&k<=key).sort().slice(-12).map(period=>{
  const next=period.length===4?(Number(period)+1)+'-01-01':period.endsWith('-12')?(Number(period.slice(0,4))+1)+'-01-01':period.slice(0,5)+String(Number(period.slice(5))+1).padStart(2,'0')+'-01';
  const end=period===key?until:shiftDay(next,-1),p=goalProgressAt(data,end),target=rows[period];
  return {period,end,target,actual:{completed:period.length===4?p.yearlyCompleted:p.monthlyCompleted,focusMinutes:period.length===4?p.yearlyFocus:p.monthlyFocus}};
 });
}

export const PERIOD_SNAPSHOT_KEY='todo-period-snapshots-v1';
export function readPeriodSnapshots(storage){
 const raw=storage.getItem(PERIOD_SNAPSHOT_KEY);if(raw===null)return {};
 const rows=JSON.parse(raw);
 if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>366||!Object.entries(rows).every(([key,r])=>validPeriodGoal(key,r?.target)&&validDate(r.end)&&r.end.startsWith(key)&&Number.isFinite(Date.parse(r.capturedAt))&&Number.isInteger(r.actual?.completed)&&r.actual.completed>=0&&Number.isInteger(r.actual?.focusMinutes)&&r.actual.focusMinutes>=0))throw Error('周期快照无效，原记录保留');
 return rows;
}
export function freezePeriodSnapshot(storage,data,period,today,now=new Date()){
 if(!validPeriod(period)||!validDate(today)||period>=today.slice(0,period.length))throw Error('仅可冻结已经结束的周期');
 const snapshots=readPeriodSnapshots(storage);if(snapshots[period])return snapshots;
 const goals=readPeriodGoals(storage);
 // Use the exact period end, not the capture date.
 const next=period.length===4?(Number(period)+1)+'-01-01':period.endsWith('-12')?(Number(period.slice(0,4))+1)+'-01-01':period.slice(0,5)+String(Number(period.slice(5))+1).padStart(2,'0')+'-01';
 const end=shiftDay(next,-1),target=goals[period];if(!validPeriodGoal(period,target)||!validDate(end))throw Error('该周期没有有效目标');
 const p=goalProgressAt(data,end),actual={completed:period.length===4?p.yearlyCompleted:p.monthlyCompleted,focusMinutes:period.length===4?p.yearlyFocus:p.monthlyFocus};
 if(Object.keys(snapshots).length>=366)throw Error('周期快照已达上限');
 const result={...snapshots,[period]:{end,target,actual,capturedAt:now.toISOString()}};storage.setItem(PERIOD_SNAPSHOT_KEY,JSON.stringify(result));return result;
}

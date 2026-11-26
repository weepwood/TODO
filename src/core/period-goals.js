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

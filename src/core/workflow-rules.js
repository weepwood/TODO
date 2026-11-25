import {id,validDate,shiftDay} from './domain.js';
export const RULE_KEY='todo-workflow-rules-v1';
export function validRule(r){return !!r&&typeof r.id==='string'&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=80&&typeof r.list==='string'&&['overdue','unscheduled','today'].includes(r.condition)&&['today','tomorrow','high'].includes(r.action)&&typeof r.enabled==='boolean'}
export function readRules(storage){const raw=storage.getItem(RULE_KEY);if(!raw)return {rules:[],auto:false,lastRun:''};const s=JSON.parse(raw);if(!Array.isArray(s.rules)||s.rules.length>20||!s.rules.every(validRule)||new Set(s.rules.map(r=>r.id)).size!==s.rules.length||typeof s.auto!=='boolean'||typeof s.lastRun!=='string')throw Error('规则存储异常，保留原数据');return s}
export function writeRules(storage,state){storage.setItem(RULE_KEY,JSON.stringify(state));return state}
export const newRule=()=>({id:id(),name:'新规则',list:'all',condition:'overdue',action:'tomorrow',enabled:true});
export function previewRules(data,rules,today){
 if(!validDate(today))return [];
 const lists=new Set(data.lists.map(l=>l.id)),active=rules.filter(r=>validRule(r)&&r.enabled&&(r.list==='all'||lists.has(r.list)));
 const rows=[];
 for(const t of data.tasks){
  if(t.deletedAt||t.status!=='pending'||t.repeat!=='none'||t.seriesId||t.previousId||t.seriesHold)continue;
  const matches=active.filter(r=>(r.list==='all'||r.list===t.listId)&&(r.condition==='overdue'?validDate(t.date)&&t.date<today:r.condition==='unscheduled'?!t.date:t.date===today));
  const patch={},used=[];
  for(const r of matches){if(r.action==='high'){if(t.priority!==3&&!Object.hasOwn(patch,'priority')){patch.priority=3;used.push(r.name)}}else if(!Object.hasOwn(patch,'date')){const date=r.action==='today'?today:shiftDay(today,1);if(validDate(date)&&date!==t.date){patch.date=date;patch.anchor=Number(date.slice(-2));used.push(r.name)}}}
  if(used.length)rows.push({id:t.id,title:t.title,date:t.date,priority:t.priority,listId:t.listId,patch,rules:used});
 }
 return rows;
}
export function applyRules(data,rows,rules,today){
 if(!rows.length)return data;
 const current=new Map(previewRules(data,rules,today).map(r=>[r.id,r]));
 if(rows.some(r=>{const c=current.get(r.id);return !c||JSON.stringify(c)!==JSON.stringify(r)}))return data;
 const patches=new Map(rows.map(r=>[r.id,r.patch]));
 return {...data,tasks:data.tasks.map(t=>patches.has(t.id)?{...t,...patches.get(t.id)}:t)};
}

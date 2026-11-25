import {MAX_POINTS} from '../core/points.js';
import React,{useState} from 'react';
import {Field,NumberField} from '../ui.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {normalizeTaskDefaults} from '../core/task-defaults.js';
export function ListDefaults({lists,viewPrefs}){
 const [listId,setListId]=useState('inbox'),list=lists.find(l=>l.id===listId)||lists[0];
 if(!list)return null;
 const value=normalizeTaskDefaults(viewPrefs.taskDefaults[list.id]),save=patch=>viewPrefs.setTaskDefaults(list.id,{...value,...patch});
 return <div className="list-defaults"><h3>清单新任务默认属性</h3><p className="muted small">仅影响本机新建的普通任务；明确输入的日期、优先级与积分优先。不会修改历史任务或模板。</p><Field label="配置清单"><SmartSelect aria-label="配置清单" value={list.id} onValueChange={setListId}>{lists.map(l=><SelectOption key={l.id} value={l.id}>{l.name}</SelectOption>)}</SmartSelect></Field><Field label="默认预计分钟"><NumberField key={list.id+'duration'} label="默认预计分钟" min={1} max={1440} unit="分钟" value={value.duration} onCommit={duration=>save({duration})}/></Field><Field label="默认优先级"><SmartSelect aria-label="默认优先级" value={value.priority} onValueChange={v=>save({priority:+v})}>{['无优先级','低优先级','中优先级','高优先级'].map((n,i)=><SelectOption key={i} value={i}>{n}</SelectOption>)}</SmartSelect></Field><Field label="默认积分"><NumberField key={list.id+'points'} label="默认积分" min={-MAX_POINTS} max={MAX_POINTS} value={value.points} onCommit={points=>save({points})}/></Field><Field label="默认计划日期"><SmartSelect aria-label="默认计划日期" value={value.date} onValueChange={date=>save({date})}>{[['none','不安排'],['today','今天'],['tomorrow','明天']].map(([v,n])=><SelectOption key={v} value={v}>{n}</SelectOption>)}</SmartSelect></Field><Field label="默认分组"><SmartSelect aria-label="默认分组" value={list.sections?.some(s=>s.id===value.sectionId)?value.sectionId:'none'} onValueChange={v=>save({sectionId:v==='none'?null:v})}><SelectOption value="none">未分组</SelectOption>{(list.sections||[]).map(s=><SelectOption key={s.id} value={s.id}>{s.name}</SelectOption>)}</SmartSelect></Field><button className="secondary" onClick={()=>viewPrefs.setTaskDefaults(list.id,null)}>恢复此清单默认属性</button></div>
}

import React,{useState,useEffect,useMemo} from 'react';
import {SearchSelect} from '../../components/SearchSelect.jsx';
import {SelectOption} from '../../components/SmartSelect.jsx';
import {ArrowUp,ArrowDown,Trash2,Play} from 'lucide-react';
import {FOCUS_QUEUE_KEY,readFocusQueue,queueItems,moveQueue} from '../../core/focus-queue.js';
import {startFocusTimer} from '../../core/focus-engine.js';
import {durationText} from '../tasks/PomodoroPlan.jsx';
export function FocusQueue({data,update,today,storage,onBind}){
 const read=()=>{try{return {queue:readFocusQueue(storage,today),error:''}}catch{return {queue:{date:today,items:[]},error:'队列读取失败，原数据保留'}}};
 const [state,setState]=useState(read),[choice,setChoice]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{setState(read());setChoice('')},[storage,today]);
 const queue=state.queue,items=useMemo(()=>queueItems(queue,data),[queue,data.tasks,data.sessions,data.focusConfig,data.timer]);
 const save=next=>{try{storage.setItem(FOCUS_QUEUE_KEY,JSON.stringify(next));setState({queue:next,error:''});setMessage('')}catch{setMessage('队列保存失败，原队列保留')}};
 const choices=data.tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&!queue.items.some(i=>i.id===t.id));
 function add(ids){if(state.error)return;const unique=[...new Set([...queue.items.map(i=>i.id),...ids])];if(unique.length>100){setMessage('最多100项任务');return}save({...queue,items:unique.map(id=>queue.items.find(i=>i.id===id)||{id,skipped:false})});setChoice('')}
 function start(item){if(data.timer||!item.eligible)return;onBind(item.id);update(d=>{const current=queueItems({items:[item]},d)[0];return current?.eligible?startFocusTimer(d,{mode:'focus',minutes:d.focusConfig.focus,taskId:item.id,now:Date.now(),planned:true}):d})}
 const budget=items.reduce((n,i)=>n+i.budget,0),actual=items.reduce((n,i)=>n+Math.min(i.actual,i.budget),0),next=items.find(i=>i.eligible);
 return <section className="review-section" aria-label="今日专注队列"><h3>今日专注队列 <small>{today} · {items.filter(i=>i.done).length}/{items.length} 项预算已达</small></h3><p className="muted small">按任务已保存专注统计，切换任务需手动启动；不自动完成任务。队列仅本机保存。</p>
 {budget>0&&<><progress aria-label="队列预算进度" max={budget} value={actual}/><small>{durationText(actual)} / {durationText(budget)}</small></>}
 {state.error?<p role="alert">{state.error}</p>:<><div className="workspace-actions"><SearchSelect aria-label="选择队列任务" value={choice} onValueChange={setChoice}><SelectOption value="">选择任务</SelectOption>{choices.map(t=><SelectOption key={t.id} value={t.id}>{t.title}</SelectOption>)}</SearchSelect><button className="secondary" disabled={!choice} onClick={()=>add([choice])}>加入队列</button><button className="secondary" onClick={()=>add(choices.filter(t=>t.date&&t.date<=today).map(t=>t.id))}>加入今日与积压</button><button className="primary" disabled={!!data.timer||!next} onClick={()=>start(next)}>启动下一任务</button></div>
 {items.map((i,index)=><div className="record-row" key={i.id}><span><strong>{i.task?.title||'已移除任务'}</strong><small>{i.active?'当前计时':i.skipped?'已跳过':i.done?'预算已达':!i.eligible?'不可执行':i.plan?.segments.length+' 个待执行番茄'} · {durationText(i.actual)} / {durationText(i.budget)}</small></span><button className="icon-button" aria-label={'上移 '+i.task?.title} disabled={index===0} onClick={()=>save(moveQueue(queue,i.id,-1))}><ArrowUp size={14}/></button><button className="icon-button" aria-label={'下移 '+i.task?.title} disabled={index===items.length-1} onClick={()=>save(moveQueue(queue,i.id,1))}><ArrowDown size={14}/></button><button className="text-link" disabled={i.active} onClick={()=>save({...queue,items:queue.items.map(x=>x.id===i.id?{...x,skipped:!x.skipped}:x)})}>{i.skipped?'恢复':'跳过'}</button><button className="icon-button" aria-label={'开始队列任务 '+i.task?.title} disabled={!!data.timer||!i.eligible} onClick={()=>start(i)}><Play size={14}/></button><button className="icon-button" aria-label={'移出队列 '+i.task?.title} disabled={i.active} onClick={()=>save({...queue,items:queue.items.filter(x=>x.id!==i.id)})}><Trash2 size={14}/></button></div>)}
 {!items.length&&<p className="muted small">尚未加入任务。</p>}</>}{message&&<p role="alert">{message}</p>}</section>
}

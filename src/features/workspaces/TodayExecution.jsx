import React,{useMemo,useState} from 'react';
import {todayExecution} from '../../core/today-execution.js';
import {shiftDay} from '../../core/domain.js';
export function TodayExecution({data,today,select,complete,schedule,focus,blocked}){
 const [expanded,setExpanded]=useState(false),[filter,setFilter]=useState('all');
 const result=useMemo(()=>todayExecution(data,today),[data.tasks,data.sessions,today]);
 const items=result.items.filter(i=>filter==='all'||filter==='risk'&&['today','overdue'].includes(i.risk)||filter==='backlog'&&i.backlog);
 return <section className="review-section" aria-label="今日执行"><div className="record-row"><strong>今日执行 · {result.items.length} 项</strong><small>{result.risk} 项截止风险 · {result.backlog} 项积压</small><button className="secondary compact" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起执行清单':'展开执行清单'}</button></div>
 {result.next&&<div className="record-row"><span>下一项建议 · {result.next.task.title}</span><button className="secondary compact" onClick={()=>select(result.next.task.id)}>详情</button><button className="primary compact" disabled={blocked||!!data.timer} onClick={()=>focus(result.next.task)}>专注</button></div>}
 {expanded&&<><div className="workspace-actions">{[['all','全部'],['risk','截止风险'],['backlog','积压']].map(([k,label])=><button key={k} className="secondary compact" aria-pressed={filter===k} onClick={()=>setFilter(k)}>{label}</button>)}</div>{items.slice(0,100).map(i=><div className="record-row" key={i.task.id}><span><button className="text-link" onClick={()=>select(i.task.id)}>{i.task.title}</button><small>{i.blocked?'等待依赖或系列恢复':i.risk==='overdue'?'已超期':i.risk==='today'?'今日截止':i.backlog?'积压':'待执行'} · 剩余专注 {Math.ceil(i.remaining/60)} 分钟</small></span><button className="secondary compact" disabled={blocked||i.task.planLocked||i.task.repeat!=='none'||!!i.task.seriesId} onClick={()=>schedule(i.task.id,shiftDay(today,1))}>明天</button><button className="secondary compact" disabled={blocked||i.blocked} onClick={()=>complete(i.task.id)}>完成</button></div>)}{!items.length&&<p className="muted small">没有匹配的待执行任务。</p>}</>}
 </section>
}

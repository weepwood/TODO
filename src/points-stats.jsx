import React,{useMemo,useState} from 'react';
import {signedPoints,summarizePoints} from './points.js';
function Tone({value}){return <span className={value>0?'points-positive':value<0?'points-negative':'muted'}>{signedPoints(value)}</span>}
export function PointsStats({tasks,lists,days,today,list}){
 const [page,setPage]=useState(0),[kind,setKind]=useState('all');
 const stats=useMemo(()=>summarizePoints(tasks,{since:days[0],today,list}),[tasks,days[0],today,list]);
 const entries=stats.entries.filter(e=>kind==='all'||(kind==='positive'?e.points>0:e.points<0)),size=20,last=Math.max(0,Math.ceil(entries.length/size)-1),current=Math.min(page,last);
 const max=Math.max(1,...Array.from(stats.daily.values(),x=>Math.max(x.positive,-x.negative)));
 const label=id=>lists.find(l=>l.id===id)?.name||'收集箱';
 return <section className="points-dashboard" aria-label="积分统计">
 <header className="points-header"><div><h2>任务积分</h2><p className="muted small">按完成日期统计；撤销完成或删除任务将移除对应积分。</p></div><span className="points-total">累计净积分 <strong><Tone value={stats.total.net}/></strong></span></header>
 <div className="stat-grid points-metrics">{[['区间净积分',stats.period.net],['区间获得',stats.period.positive],['区间扣除',stats.period.negative]].map(([n,v])=><div key={n}><small>{n}</small><strong><Tone value={v}/></strong></div>)}<div><small>计分任务</small><strong>{stats.period.count}</strong></div></div>
 <section className="stat-card"><h3>每日积分趋势</h3><div className="points-legend"><span className="points-positive">● 获得</span><span className="points-negative">● 扣除</span><small>中线为 0</small></div>
 <div className="points-trend" aria-label="每日正负积分趋势">{days.map(day=>{const p=stats.daily.get(day)||{positive:0,negative:0,net:0};return <div key={day} className="points-day" title={day+' · 获得 '+signedPoints(p.positive)+' · 扣除 '+signedPoints(p.negative)+' · 净 '+signedPoints(p.net)} aria-label={day+' 净积分 '+signedPoints(p.net)}><div className="points-up"><i style={{height:p.positive/max*100+'%'}}/></div><div className="points-down"><i style={{height:-p.negative/max*100+'%'}}/></div><small>{days.length<=14?day.slice(5):day.slice(-2)}</small></div>})}</div>
 {!stats.period.count&&<p className="muted small">本区间暂无非零积分的已完成任务。</p>}</section>
 <section className="stat-card"><h3>清单积分分布</h3><div className="points-list-header"><span>清单</span><span>获得</span><span>扣除</span><span>净积分</span></div>{lists.filter(l=>list==='all'||l.id===list).map(l=>{const p=stats.byList.get(l.id)||{positive:0,negative:0,net:0};return <div className="points-list-row" key={l.id}><span>{l.name}</span><Tone value={p.positive}/><Tone value={p.negative}/><Tone value={p.net}/></div>})}</section>
 <section className="stat-card"><div className="points-header"><h3>积分明细 <small className="muted">({entries.length})</small></h3><select aria-label="积分明细筛选" value={kind} onChange={e=>{setKind(e.target.value);setPage(0)}}><option value="all">全部</option><option value="positive">获得积分</option><option value="negative">扣除积分</option></select></div>{entries.slice(current*size,(current+1)*size).map(e=><div className="points-entry" key={e.id}><span><strong>{e.title}</strong><small>{e.day} · {label(e.listId)}</small></span><Tone value={e.points}/></div>)}{!entries.length&&<p className="muted small">暂无匹配的积分记录。</p>}{last>0&&<div className="points-pagination"><button className="secondary compact" disabled={current===0} onClick={()=>setPage(current-1)}>上一页</button><span>{current+1} / {last+1}</span><button className="secondary compact" disabled={current===last} onClick={()=>setPage(current+1)}>下一页</button></div>}</section>
 </section>
}

import {ReviewVisual} from './ReviewVisual.jsx';
import {reviewMetricValues,makeVisual,previousComparablePeriod} from '../../core/review-visual.js';
import MarkdownPreview from '../../markdown-preview.jsx';
import {SmartSelect,SelectOption} from '../../components/SmartSelect.jsx';
import {readSnapshots,saveSnapshot,deleteSnapshot} from '../../core/archive-review.js';
import {CheckInput} from '../../design-system/Controls.jsx';
import {closeoutEligible,closeoutPreview} from '../../core/task-lifecycle.js';
import React,{useMemo,useState} from 'react';
import {CalendarDays,CheckCircle2,Clock,Flame,AlertCircle,Download,ChevronLeft,ChevronRight} from 'lucide-react';
import {Modal} from '../../ui.jsx';
import {DatePicker} from '../../components/DatePicker.jsx';
import {Segmented} from '../../design-system/Controls.jsx';
import {WorkspaceMetrics} from './WorkspaceMetrics.jsx';
import {buildReview,reviewPeriod,reviewMarkdown} from '../../core/task-review.js';
import {shiftDay,dayKey} from '../../core/domain.js';
import {signedPoints} from '../../core/points.js';

export function TaskReview({storage,open,onClose,data,today,select,schedule,closeout,blocked}){
 const [mode,setMode]=useState('day'),[anchor,setAnchor]=useState(today),[chosen,setChosen]=useState([]),[snapshotId,setSnapshotId]=useState(''),[snapshotMessage,setSnapshotMessage]=useState(''),[rawReport,setRawReport]=useState(false),[compareId,setCompareId]=useState('');
 const [saved,setSaved]=useState(()=>{try{return {rows:readSnapshots(storage),error:''}}catch(e){return {rows:[],error:e.message}}});
 const snapshot=saved.rows.find(s=>s.id===snapshotId);
 const period=reviewPeriod(anchor,today,mode==='month'?'month':mode==='week');
 const r=useMemo(()=>buildReview(data,period),[data,period.since,period.until]);
 const visual=useMemo(()=>makeVisual(data,r),[r,data,period.since,period.until]);
 const previous=useMemo(()=>({metrics:reviewMetricValues(buildReview(data,previousComparablePeriod(period,mode==='month'?'month':mode==='week')))}),[data,period.since,period.until,mode]);
 const comparable=saved.rows.filter(s=>s.id!==snapshotId&&s.visual&&s.mode===snapshot?.mode&&s.visual.trend.length===snapshot?.visual?.trend.length);
 const compare=comparable.find(s=>s.id===compareId);
 const closing=mode==='day'&&anchor===today,eligible=closing?[...r.outstanding,...r.overdue].filter(t=>closeoutEligible(t,today)):[],selected=closeoutPreview(data.tasks,eligible.filter(t=>chosen.includes(t.id)).map(t=>t.id),today);
 const step=mode==='week'?7:1;const movePeriod=direction=>mode==='month'?new Date(Number(anchor.slice(0,4)),Number(anchor.slice(5,7))-1+direction,1,12):null;const move=direction=>mode==='month'?dayKey(movePeriod(direction)):shiftDay(anchor,direction*step);
 const exportMd=()=>{
  const url=URL.createObjectURL(new Blob([snapshot?snapshot.markdown:reviewMarkdown(r)],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;const period=snapshot||r;a.download='TODO-'+(snapshot?'回顾快照-':'回顾-')+period.since+(period.since!==period.until?'至'+period.until:'')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const rows=(items,action=false)=>items.length?<div className="review-rows">{items.slice(0,100).map(t=><div className="review-task-row" key={t.id}><button type="button" className="review-task-link" onClick={()=>select(t.id)}><strong>{t.title||'未命名任务'}</strong><small>{t.date||'未安排'} · {t.duration} 分钟</small></button>{action&&<button className="secondary compact" disabled={blocked} onClick={()=>schedule(t.id,shiftDay(today,1))}>安排明天</button>}</div>)}{items.length>100&&<small className="muted">界面展示前100项，导出包含全部。</small>}</div>:<p className="muted small">暂无记录</p>;
 return <Modal open={open} onClose={onClose} title="任务回顾" className="task-review-dialog" description={snapshot?'保存时冻结的本机只读报告，不随任务变更重算。':'基于当前数据生成，不是历史计划快照。'}>
  <div className="snapshot-switch"><span>回顾记录</span><SmartSelect aria-label="回顾记录" value={snapshotId} onValueChange={value=>{setSnapshotId(value);setCompareId('');setRawReport(false);setSnapshotMessage('')}}><SelectOption value="">实时回顾</SelectOption>{saved.rows.map(s=><SelectOption key={s.id} value={s.id}>{s.since}{s.until!==s.since?' 至 '+s.until:''} · {new Date(s.savedAt).toLocaleString("zh-CN",{hour12:false})}</SelectOption>)}</SmartSelect><small className="muted">{saved.rows.length}/30 份 · 仅本机</small></div>
  {snapshot?<div className="review-scroll snapshot-content"><div className="record-row"><p className="muted small">保存于 {new Date(snapshot.savedAt).toLocaleString("zh-CN",{hour12:false})} · {snapshot.mode==='day'?'每日':snapshot.mode==='month'?'每月':'每周'}</p><button className="secondary compact" onClick={()=>setRawReport(v=>!v)}>{rawReport?'阅读模式':'Markdown 原文'}</button></div>{snapshot.visual?<><div className="snapshot-compare"><SmartSelect aria-label="比较快照" value={compareId} onValueChange={setCompareId}><SelectOption value="">不比较</SelectOption>{comparable.map(s=><SelectOption value={s.id} key={s.id}>{s.since} 至 {s.until} · {new Date(s.savedAt).toLocaleString("zh-CN",{hour12:false})}</SelectOption>)}</SmartSelect></div><ReviewVisual visual={snapshot.visual} comparison={compare?.visual} label={compare?'与 '+compare.since+' 至 '+compare.until+' 保存快照比较':''}/></>:<p className="muted small">旧版快照仅包含原始报告，未补造历史图表。</p>}{rawReport?<pre>{snapshot.markdown}</pre>:<article className="markdown-preview"><MarkdownPreview value={snapshot.markdown}/></article>}</div>:<>
  <div className="review-toolbar"><Segmented label="回顾周期" value={mode} onValueChange={setMode} options={[{value:'day',label:'每日'},{value:'week',label:'每周'},{value:'month',label:'每月'}]}/><div className="review-dates"><button className="icon-button" aria-label="上一周期" onClick={()=>setAnchor(move(-1))}><ChevronLeft size={16}/></button><DatePicker label="回顾日期" value={anchor} required onChange={d=>{if(d&&d<=today)setAnchor(d)}}/><button className="icon-button" aria-label="下一周期" disabled={r.until>=today} onClick={()=>setAnchor([move(1),today].sort()[0])}><ChevronRight size={16}/></button><button className="secondary compact" onClick={()=>setAnchor(today)}>今天</button></div></div>
  <p className="muted small">{r.since}{r.until!==r.since?' 至 '+r.until:''}{mode==='week'?' · 周一至周日，当周截至今天':''}</p>
  <div className="review-scroll"><WorkspaceMetrics className="stat-grid review-metrics" label="回顾指标" items={[{label:'已完成',value:r.completed.length,unit:'项',icon:CheckCircle2},{label:'当前计划',value:r.plannedMinutes,unit:'分钟',icon:CalendarDays},{label:'实际专注',value:r.focusMinutes,unit:'分钟',icon:Clock},{label:'习惯打卡',value:r.habitCount,unit:'次',icon:Flame},{label:'净任务积分',value:signedPoints(r.points)},{label:'当前待办冲突',value:r.conflictCount,unit:'项',icon:AlertCircle,tone:r.conflictCount?'warning':undefined}]}/>
   {closing&&<section className="review-section closeout-section"><h3>每日收尾 · {eligible.length} 项可重新安排</h3><p className="muted small">选择今天及更早的普通待办，统一安排明天；重复任务、无日期及历史任务不参与。独立提醒不移动。</p>{eligible.length>0&&<><button className="text-link" onClick={()=>setChosen(selected.length===eligible.length?[]:eligible.map(t=>t.id))}>{selected.length===eligible.length?'取消收尾全选':'选择全部可安排任务'}</button><div className="closeout-rows">{eligible.slice(0,100).map(t=><label key={t.id} className="closeout-row"><CheckInput checked={chosen.includes(t.id)} onChange={e=>setChosen(old=>e.target.checked?[...new Set([...old,t.id])]:old.filter(id=>id!==t.id))}/><span>{t.title}</span><small>{t.date}</small></label>)}</div>{eligible.length>100&&<p className="muted small">显示前100项；全选包含全部可安排任务。</p>}<button className="secondary compact" disabled={blocked||!selected.length} onClick={()=>{if(confirm('将 '+selected.length+' 项任务安排到明天？独立提醒不移动。')){closeout(selected,today);setChosen([])}}}>安排所选 {selected.length} 项到明天</button></>}</section>}
 <section className="review-section"><h3>已完成 · {r.completed.length}</h3>{rows(r.completed)}</section>
  <section className="review-section"><h3>当前未完成的区间计划 · {r.outstanding.length}</h3>{rows(r.outstanding,true)}</section>
  <section className="review-section"><h3>当前早于区间的积压 · {r.overdue.length}</h3>{rows(r.overdue,true)}</section>
  <ReviewVisual visual={visual} comparison={previous} label={mode==='month'?'上月对应天数（受月末限制）':mode==='week'?'上一周相同天数':'前一天'}/><section className="review-section"><h3>习惯记录</h3>{r.habits.length?r.habits.map(h=><div className="record-row" key={h.id}><span>{h.name}</span><small>{h.count} 次</small></div>):<p className="muted small">暂无习惯</p>}</section>
  <p className="muted small">专注按开始日期归属；净任务积分不扣除兑换支出。重新安排只改变计划日期及重复锚点，不移动独立提醒。</p>
  </div></>}{(saved.error||snapshotMessage)&&<p role="status" className="muted small">{saved.error||snapshotMessage}</p>}<div className="review-footer">{snapshot?<button className="secondary" onClick={()=>{if(!confirm('删除这份本机回顾快照？原任务不会改变。'))return;try{setSaved({rows:deleteSnapshot(storage,snapshot.id),error:''});setSnapshotId('');setSnapshotMessage('已删除快照')}catch(e){setSnapshotMessage(e.message)}}}>删除快照</button>:<button className="secondary" disabled={!!saved.error} onClick={()=>{try{const rows=saveSnapshot(storage,r,mode,new Date(),visual);setSaved({rows,error:''});setSnapshotId(rows[0].id);setRawReport(false);setCompareId('');setSnapshotMessage('已保存本机快照')}catch(e){setSnapshotMessage(e.message)}}}>保存快照</button>}<button className="primary" onClick={exportMd}><Download size={16}/> 导出 Markdown</button></div>
 </Modal>;
}

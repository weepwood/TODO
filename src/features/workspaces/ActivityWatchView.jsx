import React,{useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {desktopNative} from '../../platform/runtime.js';
import {activityPeriod,shiftActivityPeriod,activityChunks,readActivityPeriod,activityTrend,activityColor,activityPeriodExample,activityExample,activityTaskComparison} from '../../core/activitywatch-summary.js';
import {Segmented} from '../../design-system/Controls.jsx';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {WorkspaceMetrics} from './WorkspaceMetrics.jsx';
import './activitywatch-view.css';

function ActivityTrend({rows,mode,color,onDay}){
 const max=Math.max(1,...rows.map(r=>r.ms));
 return <><p className="muted">{mode==='year'?'按月':'按日'}汇总 · 未知为虚线空柱；覆盖不足时仅展示已确认时长。{mode!=='year'?'点击日柱进入单日查询（需重新授权）。':''}</p>
 <div className="aw-trend" role="group" aria-label="周期活动趋势" style={{'--aw-columns':rows.length}}>
 {rows.map(r=><div className="aw-trend-column" key={r.key}><button type="button" className="aw-trend-bar" disabled={mode==='year'} data-available={r.available} aria-label={r.key+' '+(r.available?duration(r.ms):'未知')+' · 应用与空闲共同覆盖 '+Math.round(100*r.known/r.range)+'% · '+r.missing+' 天无可确认数据'} title={r.key+' · '+(r.available?duration(r.ms):'未知')+' · 覆盖 '+Math.round(100*r.known/r.range)+'% · '+r.missing+' 天无可确认数据'} onClick={()=>onDay(r.key)}>
 <span style={{height:r.available?Math.max(2,r.ms/max*100)+'%':'100%',background:r.available?color:undefined}}/></button><small>{mode==='year'?Number(r.key.slice(5))+'月':Number(r.key.slice(-2))+'日'}</small>{mode==='year'&&<small>{Math.round(100*r.known/r.range)}%</small>}</div>)}
 </div><div className="aw-axis"><span>0</span><span>最高 {duration(max===1?0:max)}</span></div></>;
}
const duration=ms=>{const m=Math.floor(ms/60000);return ms>0&&m===0?'<1 分钟':(m>=60?Math.floor(m/60)+' 小时 ':'')+(m%60)+' 分钟'};
const time=ms=>new Date(ms).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
function Ranking({title,rows,total,available=true,onSelect,selected}){
 return <section className="module-card aw-card"><h2>{title}</h2>{!available?<p className="muted">数据源不可用，无法确定时长。</p>:!rows.length?<p className="muted">没有已识别的记录。</p>:<div className="aw-ranking">{rows.slice(0,20).map(r=><button type="button" className="aw-rank-button" key={r.subject} aria-pressed={selected===r.subject} onClick={()=>onSelect(r.subject)}><div className="aw-rank-label"><span><i className="aw-dot" style={{background:activityColor(r.subject)}}/>{r.subject}</span><strong>{duration(r.ms)}</strong></div><div className="aw-bar"><span style={{background:activityColor(r.subject),width:Math.min(100,r.ms/Math.max(1,total)*100)+'%'}}/></div></button>)}{rows.length>20&&<p className="muted">仅显示前 20 项，其余 {rows.length-20} 项仍计入总时长。</p>}</div>}</section>;
}
export function ActivityWatchView({data,today,connect=()=>invoke('native_activitywatch_status'),load=args=>invoke('native_activitywatch_report',args),supported=desktopNative}){
 const [day,setDay]=useState(today),[source,setSource]=useState(null),[report,setReport]=useState(null),[example,setExample]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [mode,setMode]=useState('day'),[kind,setKind]=useState('apps'),[subject,setSubject]=useState(''),[progress,setProgress]=useState(null);
 const period=activityPeriod(day,mode);
 const request=useRef(0),inFlight=useRef(false);const [pending,setPending]=useState(false);
 useEffect(()=>()=>{request.current++},[]);
 const reset=()=>{request.current++;setBusy(false);setReport(null);setExample(false);setError('');setProgress(null);setSubject('')};
 const run=async(operation,apply)=>{if(inFlight.current)return;inFlight.current=true;setPending(true);const id=++request.current;setBusy(true);setError('');try{const result=await operation();if(id===request.current)apply(result)}catch(e){if(id===request.current){setError(typeof e==='string'?e:'连接或读取失败');setReport(null);setSource(null)}}finally{inFlight.current=false;setPending(false);if(id===request.current)setBusy(false)}};
 const read=async()=>{
  if(!period||inFlight.current||!source?.app||!source?.afk)return;
  inFlight.current=true;setPending(true);
  const chunks=activityChunks(period.bounds),id=++request.current;
  setReport(null);setExample(false);setSubject('');setBusy(true);setError('');setProgress([0,chunks.length]);
  try{
   const result=await readActivityPeriod(period,mode,load,()=>id===request.current,(done,total)=>setProgress([done,total]));
   if(result&&id===request.current)setReport(result);
  }catch(e){if(id===request.current){setError(typeof e==='string'?e:e instanceof Error?e.message:'读取失败');setReport(null);setSource(null)}}
  finally{inFlight.current=false;setPending(false);if(id===request.current){setBusy(false);setProgress(null)}}
 };
 const demo=()=>{if(!period)return;reset();setSource(null);setExample(true);setReport(activityPeriodExample(period))};
 const compare=report&&mode==='day'?activityTaskComparison(example?activityExample(day).data:data,report,day):[];
 const trend=useMemo(()=>report?activityTrend(report,mode,kind,subject):[],[report,mode,kind,subject]);
 const rows=report?.[kind]||[];
 const events=useMemo(()=>report?(kind==='apps'?report.timeline:report.website_timeline).filter(r=>!subject||r.subject===subject):[],[report,kind,subject]);
 const select=(k,s='')=>{setKind(k);setSubject(s)};
 const move=delta=>{const next=shiftActivityPeriod(day,mode,delta);if(next!==day&&next<=today){reset();setDay(next)}};
 const coverage=report?Math.round(100*report.known_ms/(report.end-report.start)):0;
 return <div className="aw-view">
  <section className="module-card aw-card">
   <div className="aw-source-head"><div><h2>ActivityWatch 数据来源</h2><p className="muted">{example?'合成演示 · 非真实活动':source?'已检测 · '+source.version+(source.app&&source.afk?' · 应用与空闲数据源可用':' · 缺少必要数据源'):'尚未连接'}</p></div>
    {source?<button className="secondary compact" onClick={()=>{reset();setSource(null)}}>断开并清除结果</button>:<button className="secondary compact" disabled={pending||!supported} onClick={()=>{reset();run(connect,setSource)}}>检测本地连接</button>}
   </div>
   <p className="muted">仅桌面端通过 127.0.0.1:5600 读取。按下授权按钮会读取所示完整周期的本机应用、AFK 与可识别网页记录。不会启动采集、保存历史、修改 ActivityWatch 或上传数据。ActivityWatch 自身可能保留完整 URL 与窗口标题，请先检查其隐私配置。仅能排除明确标记的隐私浏览记录，旧记录缺少标记时无法确认。</p>
   {!supported&&<p className="muted">此平台不访问本机服务，可查看合成示例。</p>}
   {source&&<p className="muted">本机网页数据源：{source.browsers} 个{source.browsers===0?' · 网站时长未知':''}</p>}
   <Segmented label="活动统计周期" value={mode} options={[{value:'day',label:'日'},{value:'week',label:'周'},{value:'month',label:'月'},{value:'year',label:'年'}]} onValueChange={m=>{reset();setMode(m)}}/>
   <div className="aw-actions"><button type="button" className="icon-button" aria-label="上一周期" onClick={()=>move(-1)}><ChevronLeft size={16}/></button><label>日期 <input type="date" aria-label="活动日期" value={day} max={today} onChange={e=>{reset();setDay(e.target.value)}}/></label><button type="button" className="icon-button" aria-label="下一周期" disabled={shiftActivityPeriod(day,mode,1)>today} onClick={()=>move(1)}><ChevronRight size={16}/></button>
    <button type="button" className="secondary compact" onClick={()=>{reset();setDay(today)}}>今天</button>
    <button className="primary" disabled={pending||!source?.app||!source?.afk||!period} onClick={read}>{mode==='day'?'授权读取所选日期':'授权读取所选周期'}</button>
    <button className="secondary" disabled={!period||pending} onClick={demo}>查看合成示例</button>
   </div>
   {period&&<p className="muted" data-testid="aw-range">查询范围：{period.label}{period.partial?'（截至 '+new Date(period.end).toLocaleString('zh-CN')+'）':''}</p>}
   {pending&&!busy&&<p role="status" className="muted">已取消后续读取，等待当前请求结束。</p>}
   {busy&&<div className="aw-actions"><p role="status">{progress?'正在读取 '+progress[0]+'/'+progress[1]+' 个分段…':'正在请求本地服务…'}</p><button type="button" className="secondary compact" onClick={reset}>取消读取</button></div>}{error&&<p role="alert" className="task-warning">{error}</p>}
  </section>
  {report&&<>
    <WorkspaceMetrics className="aw-metrics" label="活动概览" items={[{label:'有效应用时间',value:report.known_ms?duration(report.active_ms):'未知'},{label:'已识别网站时间',value:report.website_available&&report.known_ms?duration(report.website_ms):'未知'},{label:'共同覆盖率',value:coverage+'%'}]}/>
    <section className="module-card aw-card"><div className="aw-source-head"><h2>{mode==='day'?'活动时间线':'活动趋势'}</h2><Segmented label="活动类型" value={kind} options={[{value:'apps',label:'软件'},{value:'websites',label:'网站'}]} onValueChange={k=>select(k)}/></div>
     <div className="aw-actions"><label>筛选{kind==='apps'?'软件':'网站'} <select aria-label="活动主体筛选" value={subject} onChange={e=>setSubject(e.target.value)}><option value="">全部</option>{rows.map(r=><option key={r.subject} value={r.subject}>{r.subject}</option>)}</select></label>{subject&&<button className="secondary compact" onClick={()=>setSubject('')}>清除筛选</button>}</div>
     {mode==='day'?<>
      <p className="muted">仅计入已确认的有效区间。空白不等于空闲。</p>
      <div className="aw-timeline" role="img" aria-label="有效活动时间线">{events.slice(0,2000).map((r,i)=><span key={i} title={r.subject+' · '+time(r.start)+'–'+time(r.end)} style={{background:activityColor(r.subject),left:(r.start-report.start)/(report.end-report.start)*100+'%',width:(r.end-r.start)/(report.end-report.start)*100+'%'}}/>)}</div>
      <div className="aw-axis"><span>{time(report.start)}</span><span>{new Date(report.start).getDate()!==new Date(report.end).getDate()?"次日 "+time(report.end):time(report.end)}</span></div>
      {events.length>2000&&<p className="muted">时间线仅绘制前 2000 个区间，统计包含全部记录。</p>}
      {!events.length&&<p className="muted">该筛选没有可确认的区间。</p>}
      <div className="aw-events">{events.slice(0,100).map((r,i)=><div key={i}><span>{time(r.start)}–{time(r.end)}</span><span><i className="aw-dot" style={{background:activityColor(r.subject)}}/>{r.subject}</span><strong>{duration(r.end-r.start)}</strong></div>)}{events.length>100&&<p className="muted">仅展示前 100 个区间。</p>}</div>
     </>:<ActivityTrend rows={trend} mode={mode} color={subject?activityColor(subject):'var(--accent)'} onDay={d=>{reset();setMode('day');setDay(d)}}/>}
    </section>
    <div className="aw-grid"><Ranking title="软件排行" rows={report.apps} total={report.active_ms} available={report.known_ms>0} selected={kind==='apps'?subject:''} onSelect={s=>select('apps',s)}/><Ranking title="网站排行" rows={report.websites} total={report.website_ms} available={report.website_available} selected={kind==='websites'?subject:''} onSelect={s=>select('websites',s)}/></div>
    {mode==='day'&&    <section className="module-card aw-card"><h2>任务、专注与规划对照</h2><p className="muted">只比较时间交集，不判断实际任务归属。预计时长为任务整体估计；专注起点与已记秒数用于近似区间，可能包含暂停误差。各任务交集不可直接相加。</p>
     {!compare.length?<p className="muted">该日没有可关联的任务或专注记录。</p>:<div className="aw-comparison">{compare.slice(0,100).map(t=><div key={t.id}><h3>{t.title}</h3><dl>{[['任务预计',t.estimate],['日内规划',t.plan],['日内专注',t.focus],['规划与活动重合',t.planOverlap],['专注与活动重合',t.focusOverlap]].map(([label,ms])=><div key={label}><dt>{label}</dt><dd>{duration(ms)}</dd></div>)}</dl></div>)}{compare.length>100&&<p className="muted">仅显示前 100 项。</p>}</div>}
    </section>}
    {report.days.some(d=>!d.website_available)&&<p className="muted">所选周期中 {report.days.filter(d=>!d.website_available).length} 天没有可确认的网站记录；已识别网站时长仅为已观测部分。</p>}
    {report.warnings.map((w,i)=><p className="muted" key={i}>{w}</p>)}
    <p className="muted">网站时间是有效应用时间的子集。统计仅覆盖当前设备与受支持的浏览器，缺失记录不会回填。覆盖率分母为所选周期已过去的查询区间。</p>
  </>}
 </div>;
}

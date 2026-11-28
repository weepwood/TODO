import React,{useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {desktopNative} from '../../platform/runtime.js';
import {activityPeriod,shiftActivityPeriod,activityChunks,readActivityPeriod,activityTrend,activityColor,activityPeriodExample,activityExample} from '../../core/activitywatch-summary.js';
import {Segmented} from '../../design-system/Controls.jsx';
import {ChevronLeft,ChevronRight,Monitor,Globe,Code2,Terminal,BookOpen,Folder,CalendarDays,Info,Link2} from 'lucide-react';
import {WorkspaceMetrics} from './WorkspaceMetrics.jsx';
import './activitywatch-view.css';
const ActivityWatchAnalysis=React.lazy(()=>import('./ActivityWatchAnalysis.jsx').then(m=>({default:m.ActivityWatchAnalysis})));

function ActivityTrend({rows,mode,color,onDay}){
 const max=Math.max(1,...rows.map(r=>r.ms));
 return <><p className="muted">{mode==='year'?'按月':'按日'}汇总 · 未知为虚线空柱；覆盖不足时仅展示已确认时长。{mode!=='year'?'点击日柱进入单日查询（需重新授权）。':''}</p>
 <div className="aw-trend" role="group" aria-label="周期活动趋势" style={{'--aw-columns':rows.length}}>
 {rows.map(r=><div className="aw-trend-column" key={r.key}><button type="button" className="aw-trend-bar" disabled={mode==='year'} data-available={r.available} aria-label={r.key+' '+(r.available?duration(r.ms):'未知')+' · 应用与空闲共同覆盖 '+Math.round(100*r.known/r.range)+'% · '+r.missing+' 天无可确认数据'} title={r.key+' · '+(r.available?duration(r.ms):'未知')+' · 覆盖 '+Math.round(100*r.known/r.range)+'% · '+r.missing+' 天无可确认数据'} onClick={()=>onDay(r.key)}>
 <span style={{height:r.available?r.ms===0?0:Math.max(1,r.ms/max*100)+'%':'100%',background:r.available?color:undefined}}/></button><small>{mode==='year'?Number(r.key.slice(5))+'月':Number(r.key.slice(-2))+'日'}</small>{mode==='year'&&<small>{Math.round(100*r.known/r.range)}%</small>}</div>)}
 </div><div className="aw-axis"><span>0</span><span>最高 {duration(max===1?0:max)}</span></div></>;
}
const duration=ms=>{const m=Math.floor(ms/60000);return ms>0&&m===0?'<1 分钟':(m>=60?Math.floor(m/60)+' 小时 ':'')+(m%60)+' 分钟'};
const time=ms=>new Date(ms).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
function SubjectIcon({subject,kind='apps'}){
 const key=subject.toLowerCase();
 const Icon=kind==='websites'?Globe:/chrome|edge|firefox|brave|safari|chromium/.test(key)?Globe:/code|xcode|intellij/.test(key)?Code2:/terminal|iterm|warp/.test(key)?Terminal:/obsidian|notes|notion/.test(key)?BookOpen:/finder|explorer/.test(key)?Folder:Monitor;
 return <span aria-hidden="true" className="aw-subject-icon" style={{'--aw-subject':activityColor(subject)}}><Icon size={15} strokeWidth={1.7}/></span>;
}
function Ranking({title,rows,total,available=true,onSelect,selected,kind='apps'}){
 return <section className="module-card aw-card"><div className="aw-source-head"><h2>{title}</h2>{available&&<small className="muted">{rows.length} 项</small>}</div>{!available?<p className="muted">数据源不可用，无法确定时长。</p>:!rows.length?<p className="muted">没有已识别的记录。</p>:<div className="aw-ranking">{rows.slice(0,20).map((r,i)=><button type="button" className="aw-rank-button" key={r.subject} aria-pressed={selected===r.subject} onClick={()=>onSelect(r.subject)}><span className="aw-rank-index" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><SubjectIcon subject={r.subject} kind={kind}/><div className="aw-rank-main"><div className="aw-rank-label"><span>{r.subject}</span><strong>{duration(r.ms)}</strong></div><div className="aw-rank-track"><div className="aw-bar"><span style={{background:activityColor(r.subject),width:Math.min(100,r.ms/Math.max(1,total)*100)+'%'}}/></div><small>{(r.ms/Math.max(1,total)*100).toFixed(1)}%</small></div></div></button>)}{rows.length>20&&<p className="muted">仅显示前 20 项，其余 {rows.length-20} 项仍计入总时长。</p>}</div>}</section>;
}
function TimelineAxis({start,end}){
 const length=end-start;
 return <div className="aw-axis aw-timeline-axis">{[0,.25,.5,.75,1].map((f,i)=><span key={i}>{i===4&&new Date(start).getDate()!==new Date(end).getDate()?'次日 ':''}{time(start+length*f)}</span>)}</div>
}
export function ActivityWatchView({data,today,connect=()=>invoke('native_activitywatch_status'),load=args=>invoke('native_activitywatch_report',args),supported=desktopNative,scope="guest",initialDay,onOpenReview}){
 const [day,setDay]=useState(initialDay||today),[source,setSource]=useState(null),[report,setReport]=useState(null),[example,setExample]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [includeWeb,setIncludeWeb]=useState(false);
 const [mode,setMode]=useState('day'),[kind,setKind]=useState('apps'),[subject,setSubject]=useState(''),[progress,setProgress]=useState(null);
 const period=activityPeriod(day,mode);
 const request=useRef(0),inFlight=useRef(false);const [pending,setPending]=useState(false);
 useEffect(()=>()=>{request.current++},[]);
 const reset=()=>{request.current++;setBusy(false);setReport(null);setExample(false);setError('');setProgress(null);setSubject('')};
 useEffect(()=>{
  const pause=()=>{reset();setSource(null);setIncludeWeb(false)};
  window.addEventListener('todo-native-pause',pause);
  return()=>window.removeEventListener('todo-native-pause',pause);
 },[]);
 const run=async(operation,apply)=>{if(inFlight.current)return;inFlight.current=true;setPending(true);const id=++request.current;setBusy(true);setError('');try{const result=await operation();if(id===request.current)apply(result)}catch(e){if(id===request.current){setError(typeof e==='string'?e:'连接或读取失败');setReport(null);setSource(null);setIncludeWeb(false)}}finally{inFlight.current=false;setPending(false);if(id===request.current)setBusy(false)}};
 const read=async()=>{
  if(!period||inFlight.current||!source?.app||!source?.afk)return;
  inFlight.current=true;setPending(true);
  const chunks=activityChunks(period.bounds),id=++request.current;
  setReport(null);setExample(false);setSubject('');setBusy(true);setError('');setProgress([0,chunks.length]);
  try{
   const result=await readActivityPeriod(period,mode,load,()=>id===request.current,(done,total)=>setProgress([done,total]),includeWeb);
   if(result&&id===request.current)setReport(result);
  }catch(e){if(id===request.current){setError(typeof e==='string'?e:e instanceof Error?e.message:'读取失败');setReport(null);setSource(null);setIncludeWeb(false)}}
  finally{inFlight.current=false;setPending(false);if(id===request.current){setBusy(false);setProgress(null)}}
 };
 const demo=()=>{if(!period)return;reset();setSource(null);setExample(true);setReport(activityPeriodExample(period))};
 const trend=useMemo(()=>report?activityTrend(report,mode,kind,subject):[],[report,mode,kind,subject]);
 const rows=report?.[kind]||[];
 const events=useMemo(()=>report?(kind==='apps'?report.timeline:report.website_timeline).filter(r=>!subject||r.subject===subject):[],[report,kind,subject]);
 const select=(k,s='')=>{setKind(k);setSubject(s)};
 const move=delta=>{const next=shiftActivityPeriod(day,mode,delta);if(next!==day&&next<=today){reset();setDay(next)}};
 const coverage=report?Math.round(100*report.known_ms/(report.end-report.start)):0;
 return <div className="aw-view">
  <section className="module-card aw-card">
   <div className="aw-source-head"><div className="aw-source-identity"><Link2 size={18}/><div><h2>ActivityWatch 数据来源</h2><p className="muted">{example?'合成演示 · 非真实活动':source?'已检测 · '+source.version+(source.app&&source.afk?' · 应用与空闲数据源可用':' · 缺少必要数据源'):'尚未连接'}</p></div></div>
    {source?<button className="secondary compact" onClick={()=>{reset();setSource(null);setIncludeWeb(false)}}>断开并清除结果</button>:<button className="secondary compact" disabled={pending||!supported} onClick={()=>{reset();run(connect,setSource)}}>检测本地连接</button>}
   </div>
   <details className="aw-privacy"><summary><Info size={14}/> 数据范围与隐私说明</summary><p className="muted">仅桌面端通过 127.0.0.1:5600 读取。按下授权按钮会读取所示完整周期的本机应用与 AFK 记录；仅勾选后才读取网站记录。不会启动采集、保存历史、修改 ActivityWatch 或上传数据。ActivityWatch 自身可能保留完整 URL 与窗口标题，请先检查其隐私配置。仅能排除明确标记的隐私浏览记录，旧记录缺少标记时无法确认。</p></details>
   {!supported&&<p className="muted">此平台不访问本机服务，可查看合成示例。</p>}
   {source&&<p className="muted">本机网页数据源：{source.browsers} 个{source.browsers===0?' · 网站时长未知':''}</p>}
   {source&&source.browsers===0&&<p className="aw-source-hint muted">如需网站统计，请先在浏览器中启用 ActivityWatch 官方 aw-watcher-web 扩展，再检测连接。当前仅识别本机数据桶。</p>}
   <label className="aw-scope"><input type="checkbox" checked={includeWeb} onChange={e=>{reset();setIncludeWeb(e.target.checked)}}/> 同时授权网站使用记录</label>
   <div className="aw-date-toolbar"><Segmented label="活动统计周期" value={mode} options={[{value:'day',label:'日'},{value:'week',label:'周'},{value:'month',label:'月'},{value:'year',label:'年'}]} onValueChange={m=>{reset();setMode(m)}}/>
   <div className="aw-actions aw-date-navigation"><button type="button" className="icon-button" aria-label="上一周期" onClick={()=>move(-1)}><ChevronLeft size={16}/></button><label className="aw-date-field"><CalendarDays size={15}/><input type="date" aria-label="活动日期" value={day} max={today} onChange={e=>{reset();setDay(e.target.value)}}/></label><button type="button" className="icon-button" aria-label="下一周期" disabled={shiftActivityPeriod(day,mode,1)>today} onClick={()=>move(1)}><ChevronRight size={16}/></button>
    <button type="button" className="secondary compact" onClick={()=>{reset();setDay(today)}}>今天</button></div></div>
   <div className="aw-actions aw-read-actions"><button className="primary" disabled={pending||!source?.app||!source?.afk||!period} onClick={read}>{mode==='day'?'授权读取所选日期':'授权读取所选周期'}</button>
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
      <TimelineAxis start={report.start} end={report.end}/>
      {events.length>2000&&<p className="muted">时间线仅绘制前 2000 个区间，统计包含全部记录。</p>}
      {!events.length&&<p className="muted">该筛选没有可确认的区间。</p>}
      <div className="aw-events">{events.slice(0,100).map((r,i)=><div key={i}><span>{time(r.start)}–{time(r.end)}</span><span className="aw-event-subject"><SubjectIcon subject={r.subject} kind={kind}/>{r.subject}</span><strong>{duration(r.end-r.start)}</strong></div>)}{events.length>100&&<p className="muted">仅展示前 100 个区间。</p>}</div>
     </>:<ActivityTrend rows={trend} mode={mode} color={subject?activityColor(subject):'var(--accent)'} onDay={d=>{reset();setMode('day');setDay(d)}}/>}
    </section>
    <div className="aw-grid"><Ranking title="软件排行" rows={report.apps} total={report.active_ms} available={report.known_ms>0} selected={kind==='apps'?subject:''} onSelect={s=>select('apps',s)}/><Ranking kind="websites" title="网站排行" rows={report.websites} total={report.website_ms} available={report.website_available} selected={kind==='websites'?subject:''} onSelect={s=>select('websites',s)}/></div>
    <React.Suspense fallback={<p className="muted">加载活动分析…</p>}><ActivityWatchAnalysis key={String(example)+':'+report.start+':'+report.end} report={report} day={day} mode={mode} kind={kind} example={example} scope={scope} data={example?activityExample(day).data:data} load={load} includeWeb={includeWeb} onOpenReview={onOpenReview}/></React.Suspense>
    {(example||includeWeb)&&report.days.some(d=>!d.website_available)&&<p className="muted">所选周期中 {report.days.filter(d=>!d.website_available).length} 天没有可确认的网站记录；已识别网站时长仅为已观测部分。</p>}
    {report.warnings.map((w,i)=><p className="muted" key={i}>{w}</p>)}
    <p className="muted">网站时间是有效应用时间的子集。统计仅覆盖当前设备与受支持的浏览器，缺失记录不会回填。覆盖率分母为所选周期已过去的查询区间。</p>
  </>}
 </div>;
}

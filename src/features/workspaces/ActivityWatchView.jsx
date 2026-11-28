import React,{useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {desktopNative} from '../../platform/runtime.js';
import {activityDayRange,activityExample,activityTaskComparison} from '../../core/activitywatch-summary.js';
import {WorkspaceMetrics} from './WorkspaceMetrics.jsx';
import './activitywatch-view.css';

const duration=ms=>{const m=Math.floor(ms/60000);return ms>0&&m===0?'<1 分钟':(m>=60?Math.floor(m/60)+' 小时 ':'')+(m%60)+' 分钟'};
const time=ms=>new Date(ms).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
function Ranking({title,rows,total,available=true}){
 return <section className="module-card aw-card"><h2>{title}</h2>{!available?<p className="muted">数据源不可用，无法确定时长。</p>:!rows.length?<p className="muted">没有已识别的记录。</p>:<div className="aw-ranking">{rows.slice(0,20).map(r=><div key={r.subject}><div className="aw-rank-label"><span>{r.subject}</span><strong>{duration(r.ms)}</strong></div><div className="aw-bar"><span style={{width:Math.min(100,r.ms/Math.max(1,total)*100)+'%'}}/></div></div>)}{rows.length>20&&<p className="muted">仅显示前 20 项，其余 {rows.length-20} 项仍计入总时长。</p>}</div>}</section>;
}
export function ActivityWatchView({data,today,connect=()=>invoke('native_activitywatch_status'),load=args=>invoke('native_activitywatch_report',args),supported=desktopNative}){
 const [day,setDay]=useState(today),[source,setSource]=useState(null),[report,setReport]=useState(null),[example,setExample]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(0);
 useEffect(()=>()=>{request.current++},[]);
 const reset=()=>{request.current++;setBusy(false);setReport(null);setExample(false);setError('')};
 const run=async(operation,apply)=>{const id=++request.current;setBusy(true);setError('');try{const result=await operation();if(id===request.current)apply(result)}catch(e){if(id===request.current){setError(typeof e==='string'?e:'连接或读取失败');setReport(null);setSource(null)}}finally{if(id===request.current)setBusy(false)}};
 const read=()=>{const range=activityDayRange(day);if(!range){setError('该日期没有可查询的已过去时间');return}setReport(null);setExample(false);run(()=>load({...range,consent:true}),setReport)};
 const demo=()=>{reset();setSource(null);setExample(true);setReport(activityExample(day).report)};
 const compare=report?activityTaskComparison(example?activityExample(day).data:data,report,day):[];
 const coverage=report?Math.round(100*report.known_ms/(report.end-report.start)):0;
 return <div className="aw-view">
  <section className="module-card aw-card">
   <div className="aw-source-head"><div><h2>ActivityWatch 数据来源</h2><p className="muted">{example?'合成演示 · 非真实活动':source?'已检测 · '+source.version+(source.app&&source.afk?' · 应用与空闲数据源可用':' · 缺少必要数据源'):'尚未连接'}</p></div>
    {source?<button className="secondary compact" onClick={()=>{reset();setSource(null)}}>断开并清除结果</button>:<button className="secondary compact" disabled={busy||!supported} onClick={()=>{reset();run(connect,setSource)}}>检测本地连接</button>}
   </div>
   <p className="muted">仅桌面端通过 127.0.0.1:5600 读取。不会启动采集、保存历史、修改 ActivityWatch 或上传数据。ActivityWatch 自身可能保留完整 URL 与窗口标题，请先检查其隐私配置。仅能排除明确标记的隐私浏览记录，旧记录缺少标记时无法确认。</p>
   {!supported&&<p className="muted">此平台不访问本机服务，可查看合成示例。</p>}
   <div className="aw-actions"><label>日期 <input type="date" aria-label="活动日期" value={day} max={today} onChange={e=>{reset();setDay(e.target.value)}}/></label>
    <button className="primary" disabled={busy||!source?.app||!source?.afk||!activityDayRange(day)} onClick={read}>授权读取所选日期</button>
    <button className="secondary" disabled={!activityDayRange(day)||busy} onClick={demo}>查看合成示例</button>
   </div>
   {busy&&<p role="status">正在请求本地服务…</p>}{error&&<p role="alert" className="task-warning">{error}</p>}
  </section>
  {report&&<>
    <WorkspaceMetrics className="aw-metrics" label="活动概览" items={[{label:'有效应用时间',value:report.known_ms?duration(report.active_ms):'未知'},{label:'已识别网站时间',value:report.website_available&&report.known_ms?duration(report.website_ms):'未知'},{label:'共同覆盖率',value:coverage+'%'}]}/>
    <section className="module-card aw-card"><h2>应用活动时间线</h2><p className="muted">仅计入应用前台与非空闲状态相交的区间。空白不等于空闲。</p>
     <div className="aw-timeline" role="img" aria-label="有效应用活动时间线">{report.timeline.map((r,i)=><span key={i} title={r.subject+' · '+time(r.start)+'–'+time(r.end)} style={{left:(r.start-report.start)/(report.end-report.start)*100+'%',width:(r.end-r.start)/(report.end-report.start)*100+'%'}}/>)}</div>
     <div className="aw-axis"><span>{time(report.start)}</span><span>{new Date(report.start).getDate()!==new Date(report.end).getDate()?"次日 "+time(report.end):time(report.end)}</span></div>
     <div className="aw-events">{report.timeline.slice(0,100).map((r,i)=><div key={i}><span>{time(r.start)}–{time(r.end)}</span><span>{r.subject}</span><strong>{duration(r.end-r.start)}</strong></div>)}{report.timeline.length>100&&<p className="muted">仅展示前 100 个区间。</p>}</div>
    </section>
    <div className="aw-grid"><Ranking title="软件排行" rows={report.apps} total={report.active_ms}/><Ranking title="网站排行" rows={report.websites} total={report.website_ms} available={report.website_available}/></div>
    <section className="module-card aw-card"><h2>任务、专注与规划对照</h2><p className="muted">只比较时间交集，不判断实际任务归属。预计时长为任务整体估计；专注起点与已记秒数用于近似区间，可能包含暂停误差。各任务交集不可直接相加。</p>
     {!compare.length?<p className="muted">该日没有可关联的任务或专注记录。</p>:<div className="aw-comparison">{compare.slice(0,100).map(t=><div key={t.id}><h3>{t.title}</h3><dl>{[['任务预计',t.estimate],['日内规划',t.plan],['日内专注',t.focus],['规划与活动重合',t.planOverlap],['专注与活动重合',t.focusOverlap]].map(([label,ms])=><div key={label}><dt>{label}</dt><dd>{duration(ms)}</dd></div>)}</dl></div>)}{compare.length>100&&<p className="muted">仅显示前 100 项。</p>}</div>}
    </section>
    {report.warnings.map((w,i)=><p className="muted" key={i}>{w}</p>)}
    <p className="muted">网站时间是有效应用时间的子集。统计仅覆盖当前设备与受支持的浏览器，缺失记录不会回填。覆盖率分母为所选日期已过去的查询区间（合成示例为完整示例日）。</p>
  </>}
 </div>;
}

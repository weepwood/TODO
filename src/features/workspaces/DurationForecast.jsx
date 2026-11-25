import React,{useMemo,useState} from 'react';
import {NumberField} from '../../ui.jsx';
import {durationSamples,durationForecast,durationDiagnostics} from '../../core/duration-forecast.js';
export const DurationForecast=React.memo(function DurationForecast({data,today,list}){
 const [estimate,setEstimate]=useState(30);
 const samples=useMemo(()=>durationSamples(data,today,list),[data.tasks,data.sessions,today,list]);
 const d=useMemo(()=>durationDiagnostics(samples),[samples]),f=useMemo(()=>durationForecast(samples,estimate),[samples,estimate]);
 const weeks=d.weeks.slice(-8),maxWeek=Math.max(1,...weeks.flatMap(r=>[r.estimated,r.actual]));
 return <section className="stat-card duration-forecast" id="duration-forecast">
 <div className="stat-card-heading"><h3>效率趋势与时长参考</h3><small className="muted">近180天 · 当前清单范围</small></div>
 <p className="muted small">仅使用已完成、预计时长大于0且具有完成前绑定专注记录的任务。预测的是已记录专注时间，并非全部工作时间；预计值使用当前记录。</p>
 <div className="insight-metrics"><div><small>有效任务样本</small><strong>{d.count} 项</strong></div><div><small>预计绝对误差中位数</small><strong>{d.medianError===null?'—':d.medianError+' 分钟'}</strong></div></div>
 <div className="forecast-input"><NumberField label="参考任务预计分钟" min={1} max={1440} value={estimate} onCommit={setEstimate} unit="分钟"/></div>
 {f?<div className="forecast-result"><div><small>历史比例中位数参考</small><strong>{f.median} 分钟</strong></div><div><small>历史比例 P10–P90 参考范围</small><strong>{f.low}–{f.high} 分钟</strong></div></div>:<p role="status" className="muted small">有效样本不足10项，暂不提供时长预测。</p>}
 <p className="muted small">使用最近最多500项有效样本的实际/预计比例经验分位数；范围不是经过校准的概率保证，不自动修改任务。</p>
 <h4>时间顺序回测</h4><p className="muted small">仅用更早完成日的任务预测后续任务，最多回测最近200项，每次取最多500项训练样本，至少10项；当前预计值可能经过事后修改，因此不是严格前瞻验证。</p>
 <div className="forecast-backtest"><span>回测 {d.evaluated} 项</span><span>范围覆盖 {d.coverage===null?'—':d.coverage+'%'}</span><span>参考 MAE {d.mae===null?'—':d.mae+' 分钟'}</span><span>原预计 MAE {d.baselineMae===null?'—':d.baselineMae+' 分钟'}</span></div>
 <h4>最近八个有记录的周</h4><p className="muted small">同一尺度比较预计与实际专注分钟，周一为起点。</p>{d.weeks.length?<div className="forecast-weeks">{weeks.map(w=><div className="record-row" key={w.week}><span>{w.week} · {w.count} 项</span><div className="forecast-week-bars"><div><span>预计 {w.estimated}</span><i style={{width:w.estimated/maxWeek*100+'%'}}/></div><div><span>专注 {w.actual}</span><i className="actual" style={{width:w.actual/maxWeek*100+'%'}}/></div></div></div>)}</div>:<p className="muted small">暂无匹配记录。</p>}
 </section>
});

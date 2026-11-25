import React from 'react';
import {signedPoints} from '../../core/points.js';
export const metricLabels=[['completed','完成任务','项'],['plannedMinutes','计划时长','分钟'],['focusMinutes','实际专注','分钟'],['habitCount','习惯打卡','次'],['points','净任务积分','分'],['conflicts','当前待办冲突','项']];
export function ReviewVisual({visual,comparison,label}){
 const rows=visual.trend,series=[['completed','完成任务','项'],['focusMinutes','专注时长','分钟'],['points','净积分','分']];
 return <section className="review-section review-visual"><h3>周期趋势</h3><p className="muted small">完成按实际完成日期，专注按开始日期；每日分钟数独立取整。</p>
 <div className="review-trend-grid">{series.map(([key,name,unit])=>{const max=Math.max(1,...rows.map(r=>Math.abs(r[key])));return <div className="review-trend" key={key}><strong>{name}</strong><div className="trend-columns" role="group" aria-label={name+'每日趋势'}>{rows.map(r=><div key={r.date} className="trend-column"><small>{key==='points'?signedPoints(r[key]):r[key]}</small><div className="trend-track" aria-hidden="true"><i className={r[key]<0?'negative':''} style={{height:Math.abs(r[key])/max*100+'%'}}/></div><small>{r.date.slice(5)}</small></div>)}</div><small className="muted">{unit} · {key==='points'?'红色为负积分，柱高为绝对值':'独立纵轴'}</small></div>})}</div>
 {comparison&&<><h3>指标比较</h3><p className="muted small">{label} · 变化为本期减对照期，不同指标不共用纵轴。</p><div className="review-comparison"><div className="record-row muted small"><span>指标</span><span>本期 / 对照期</span><span>差额</span></div>{metricLabels.map(([key,name,unit])=><div className="record-row" key={key}><span>{name}</span><span>{visual.metrics[key]} / {comparison.metrics[key]} {unit}</span><strong>{signedPoints(visual.metrics[key]-comparison.metrics[key])}</strong></div>)}</div></>}
 </section>
}

import React from 'react';
import {heatmapCells} from '../../core/workspace-visual.js';
export function ActivityHeatmap({today,counts,mode='completed',selected,onSelect}){
 const focus=mode==='focus',unit=focus?'分钟':'项',label=focus?'专注':'完成';
 const cells=heatmapCells(today,counts,364,focus?v=>v===0?0:v<30?1:v<60?2:v<120?3:4:v=>Math.min(4,Math.max(0,v))),columns=cells.at(-1).column,months=new Map();
 const focusDate=cells.some(x=>x.date===selected)?selected:today;
 for(const cell of cells){const month=cell.date.slice(0,7);if(!months.has(month))months.set(month,cell.column)}
 return <><div className="activity-heatmap-scroll" tabIndex={0} role="region" aria-label={'最近52周'+label+'热力图，可横向滚动'}>
  <div className="activity-heatmap-layout" style={{'--heat-columns':columns}}>
   <div className="heatmap-months" aria-hidden="true">{[...months].filter(([,column],i,all)=>i===0||column-all[i-1][1]>=2).map(([month,column])=><span key={month} style={{gridColumn:column}}>{month.slice(5)+'月'}</span>)}</div>
   <div className="heatmap-weekdays" aria-hidden="true">{['日','一','二','三','四','五','六'].map(d=><span key={d}>{d}</span>)}</div>
   <div className="heatmap" role={onSelect?'group':'img'} aria-label={'最近364天，共'+label+' '+cells.reduce((n,c)=>n+c.count,0)+' '+unit+'，有 '+cells.filter(c=>c.count>0).length+' 天有记录'}> {cells.map(c=>onSelect?<button type="button" key={c.date} data-day={c.date} data-level={c.level} aria-pressed={selected===c.date} aria-label={c.date+'：'+c.count+' '+unit} title={c.date+'：'+c.count+' '+unit} style={{gridRow:c.row,gridColumn:c.column}} tabIndex={c.date===focusDate?0:-1} onClick={()=>onSelect(c.date)} onKeyDown={e=>{const delta={ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1}[e.key];if(delta===undefined)return;e.preventDefault();const next=cells[cells.indexOf(c)+delta];if(next){onSelect(next.date);e.currentTarget.parentElement.querySelector('[data-day="'+next.date+'"]')?.focus()}}}/>:<i key={c.date} data-day={c.date} data-level={c.level} title={c.date+'：'+c.count+' '+unit} style={{gridRow:c.row,gridColumn:c.column}}/>)}</div>
  </div>
 </div><div className="heatmap-legend"><span>{focus?'专注分钟':'完成数量'}</span>{[0,1,2,3,4].map(n=><span className="heatmap-key" key={n}><i data-level={n}/>{focus?['0','1–29','30–59','60–119','120+'][n]:n===4?'4+':n}</span>)}</div></>
}

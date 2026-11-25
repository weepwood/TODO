import React from 'react';
import {heatmapCells} from '../../core/workspace-visual.js';
export function ActivityHeatmap({today,counts}){
 const cells=heatmapCells(today,counts),columns=cells.at(-1).column,months=new Map();
 for(const cell of cells){const month=cell.date.slice(0,7);if(!months.has(month))months.set(month,cell.column)}
 return <><div className="activity-heatmap-scroll" tabIndex={0} role="region" aria-label="最近52周完成热力图，可横向滚动">
  <div className="activity-heatmap-layout" style={{'--heat-columns':columns}}>
   <div className="heatmap-months" aria-hidden="true">{[...months].filter(([,column],i,all)=>i===0||column-all[i-1][1]>=2).map(([month,column])=><span key={month} style={{gridColumn:column}}>{month.slice(5)+'月'}</span>)}</div>
   <div className="heatmap-weekdays" aria-hidden="true">{['日','一','二','三','四','五','六'].map(d=><span key={d}>{d}</span>)}</div>
   <div className="heatmap" role="img" aria-label={'最近364天，共完成 '+cells.reduce((n,c)=>n+c.count,0)+' 项任务，有 '+cells.filter(c=>c.count>0).length+' 天有完成记录'}>{cells.map(c=><i key={c.date} data-day={c.date} data-level={c.level} title={c.date+'：'+c.count+' 项'} style={{gridRow:c.row,gridColumn:c.column}}/>)}</div>
  </div>
 </div><div className="heatmap-legend"><span>完成数量</span>{[0,1,2,3,4].map(n=><span className="heatmap-key" key={n}><i data-level={n}/>{n===4?'4+':n}</span>)}</div></>
}

import React,{useId} from 'react';
// Small static, accessible SVG: independent scales, signed values include zero.
export function TrendLine({rows,keyName,label,unit}){
 const id=useId(),values=rows.map(r=>r[keyName]),lo=Math.min(0,...values),hi=Math.max(0,...values),span=hi-lo||1;
 const x=i=>30+i*178/Math.max(1,rows.length-1),y=v=>90-(v-lo)/span*64;
 const points=values.map((v,i)=>x(i)+','+y(v)).join(' ');
 return <figure className="review-line"><figcaption>{label}<small>{unit}</small></figcaption><svg viewBox="0 0 224 116" role="img" aria-labelledby={id}><title id={id}>{label}：{rows.map((r,i)=>r.month+' '+values[i]+unit).join('；')}</title>{[lo,hi].filter((v,i,a)=>a.indexOf(v)===i).map(v=><g key={v}><line x1="30" x2="208" y1={y(v)} y2={y(v)} className="chart-gridline"/><text x="26" y={y(v)+3} textAnchor="end">{v}</text></g>)}{lo<0&&hi>0&&<line x1="30" x2="208" y1={y(0)} y2={y(0)} className="chart-gridline"/>}<polyline points={points} className="trend-line-stroke"/>{rows.map((r,i)=><g key={r.month}><circle cx={x(i)} cy={y(values[i])} r="3" className="trend-line-dot"><title>{r.month}：{values[i]} {unit}</title></circle><text x={x(i)} y="107" textAnchor="middle">{r.month.slice(5)}月</text></g>)}</svg></figure>
}

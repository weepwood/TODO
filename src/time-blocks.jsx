import React,{useMemo,useState,useRef} from 'react';
import {layoutTimeline,snapTimelineMinute,minuteClock} from './timeline-layout.js';
export default function TimeBlocks({segments,start,end,date,tasks,patch,select,conflicts,lists}){
 const from=start*60,to=end*60,height=(end-start)*56;
 const blocks=useMemo(()=>layoutTimeline(segments,from,to),[segments,from,to]);
 const [target,setTarget]=useState(null);const body=useRef(null);
 const at=e=>{const rect=body.current.getBoundingClientRect();return snapTimelineMinute(e.clientY-rect.top,rect.height,from,to)};
 function drop(e){e.preventDefault();const id=e.dataTransfer.getData('text/todo'),minute=at(e);setTarget(null);if(minute===null||!tasks.some(t=>t.id===id))return;patch(id,{date,time:minuteClock(minute),anchor:Number(date.slice(-2))})}
 return <div className="time-block-layout"><div className="time-labels" aria-hidden="true">{Array.from({length:end-start},(_,i)=><span key={i} style={{top:i*56}}>{minuteClock((start+i)*60)}</span>)}</div><div ref={body} className="time-block-body" style={{height}} onDragOver={e=>{e.preventDefault();setTarget(at(e))}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setTarget(null)}} onDrop={drop}>
 {blocks.map(t=>{const color=t.external?'#8d93a4':lists.find(l=>l.id===t.listId)?.color||'#5276d6';const style={top:(t.startMinute-from)/60*56,height:Math.max(3,(t.endMinute-t.startMinute)/60*56-2),left:'calc('+t.lane/t.columns*100+'% + 2px)',width:'calc('+100/t.columns+'% - 4px)','--block-color':/^#[0-9a-f]{6}$/i.test(color)?color:'#5276d6'};const label=t.title+' '+t.time+'–'+t.endTime+(t.carryIn?' · 跨日延续':'')+(conflicts.has(t.id)?' · 时间重叠':'');return t.external?<div className={'time-block external '+(t.endMinute-t.startMinute<45?'short':'')} key={t.id} style={style} title={label}><strong>{t.title}</strong><small>{t.time}–{t.endTime}</small></div>:<button key={t.id} className={'time-block '+(t.endMinute-t.startMinute<45?'short ':'')+(conflicts.has(t.id)?'conflict':'')} style={style} title={label} aria-label={label} draggable={!t.carryIn} onDragStart={e=>e.dataTransfer.setData('text/todo',t.id)} onClick={()=>select(t.id)}><strong>{t.title}</strong><small>{t.time}–{t.endTime}{t.carryIn?' · 延续':''}</small></button>})}
 {target!==null&&<div className="time-drop-guide" style={{top:(target-from)/60*56}}><span>{minuteClock(target)}</span></div>}
 </div></div>
}

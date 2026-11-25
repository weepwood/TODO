import React from 'react';
import {CalendarDays,Clock,Flag,Plus,Hash} from 'lucide-react';
import {quickParse} from '../core/advanced.js';
import {signedPoints} from '../core/points.js';
export function CapturePreview({text,today,defaultDate='',onChange,expanded=false}){
 const p=quickParse(text,today),date=p.date||defaultDate;
 const append=token=>onChange(text.trimEnd()+' '+token);
 if(!text.trim())return null;
 if(!expanded&&!p.date&&!p.time&&!p.priority&&p.points===undefined)return null;
 return <div className={'capture-preview capture-structured '+(expanded?'expanded':'inline')} aria-label="录入解析预览">
  <strong>{p.title||'请输入任务标题'}</strong>
  <div className="capture-properties">
   <span><CalendarDays size={13}/>{date||'未安排'}</span>
   {p.time&&<span><Clock size={13}/>{p.time}</span>}
   {p.priority>0&&<span><Flag size={13}/>{['','低优先级','中优先级','高优先级'][p.priority]}</span>}
   {p.points!==undefined&&<span><Hash size={13}/>{signedPoints(p.points)} 分</span>}
  </div>
  {expanded&&p.title&&(!p.date||!p.priority)&&<div className="capture-suggestions" aria-label="快速添加属性">
   {!p.date&&['今天','明天','后天'].map(token=><button type="button" key={token} onClick={()=>append(token)}><Plus size={12}/>{token}</button>)}
   {!p.priority&&<button type="button" onClick={()=>append('!3')}><Flag size={12}/>高优先级</button>}
  </div>}
 </div>
}

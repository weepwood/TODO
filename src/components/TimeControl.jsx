import {useTransientPopover,popoverGeometry} from "../design-system/popover.js";
import React,{useEffect,useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {Clock} from 'lucide-react';
import {validTime} from '../core/domain.js';
const pad=n=>String(n).padStart(2,'0');
export function TimeControl({label,value,onChange,required=false}){
 const [draft,setDraft]=useState(value||''),[open,setOpen]=useState(false),[hour,setHour]=useState('09'),[minute,setMinute]=useState('00');
 useEffect(()=>setDraft(value||''),[value]);
 useTransientPopover(open,()=>setOpen(false));
 const valid=validTime(draft)||(!required&&!draft);
 const choose=next=>{if(!validTime(next)&&(required||next!==''))return;setDraft(next);if(next!==value)onChange(next);setOpen(false)};
 return <div className="time-control" data-invalid={!valid||undefined}>
  <input type="text" aria-label={label} aria-invalid={!valid||undefined} value={draft} placeholder="HH:mm" maxLength={5} autoComplete="off" spellCheck={false} onChange={e=>{const next=e.target.value;setDraft(next);if(validTime(next)||(!required&&!next))onChange(next)}} onBlur={()=>{if(!valid)setDraft(value||'')}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();if(valid)e.currentTarget.blur()}if(e.key==='Escape'&&!valid){e.stopPropagation();setDraft(value||'')}}}/>
  <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next){const [h,m]=(validTime(value)?value:'09:00').split(':');setHour(h);setMinute(m)}}}>
   <Popover.Trigger asChild><button type="button" className="time-picker-trigger" aria-label={label+'选择器'}><Clock size={15}/></button></Popover.Trigger>
   <Popover.Portal><Popover.Content className="time-picker-popover" {...popoverGeometry} aria-label={label+'选择器'}>
    <div className="time-picker-head"><strong>选择时间</strong><span>{hour}:{minute}</span></div>
    <div className="time-picker-label">小时</div><div className="time-picker-grid hours">{Array.from({length:24},(_,n)=>pad(n)).map(h=><button type="button" key={h} aria-pressed={hour===h} aria-label={h+'时'} onClick={()=>setHour(h)}>{h}</button>)}</div>
    <div className="time-picker-label">分钟</div><div className="time-picker-grid minutes">{[...new Set(['00','15','30','45',minute])].sort().map(m=><button type="button" key={m} aria-pressed={minute===m} aria-label={m+'分'} onClick={()=>setMinute(m)}>{m}</button>)}</div>
    <div className="time-picker-actions">{!required&&<button type="button" className="secondary" onClick={()=>choose('')}>清除</button>}<button type="button" className="primary" onClick={()=>choose(hour+':'+minute)}>应用时间</button></div>
    <small>任意分钟可直接输入 HH:mm。</small>
   </Popover.Content></Popover.Portal>
  </Popover.Root>
 </div>
}

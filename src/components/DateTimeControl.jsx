import {FieldMessage,useFieldControl,FieldControlBoundary} from '../design-system/FieldFeedback.jsx';
import {useTransientPopover,popoverGeometry} from "../design-system/popover.js";
import React,{useEffect,useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {CalendarClock} from 'lucide-react';
import {DatePicker} from './DatePicker.jsx';
import {dayKey,validDate,validTime} from '../core/domain.js';
import {TimeControl} from './TimeControl.jsx';
const valid=value=>typeof value==='string'&&value.length===16&&value[10]==='T'&&validDate(value.slice(0,10))&&validTime(value.slice(11));
export function DateTimeControl({label,value,onChange,required=false,defaultDate}){
 const feedback=useFieldControl();
 const [open,setOpen]=useState(false),[date,setDate]=useState(''),[time,setTime]=useState('09:00'),[original,setOriginal]=useState(value);
 useTransientPopover(open,()=>setOpen(false));
 const changed=original!==value;
 const apply=next=>{if(changed||(!valid(next)&&(required||next!=='')))return;if(next!==value)onChange(next);setOpen(false)};
 return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next){setOriginal(value);setDate(valid(value)?value.slice(0,10):validDate(defaultDate)?defaultDate:dayKey());setTime(valid(value)?value.slice(11):'09:00')}}}>
  <Popover.Trigger asChild><button {...feedback} type="button" className="datetime-trigger" aria-label={label}><CalendarClock size={16}/><span>{valid(value)?value.replace('T',' '):'设置提醒'}</span></button></Popover.Trigger>
  <Popover.Portal><Popover.Content className="datetime-popover" {...popoverGeometry} aria-label={label+'编辑'}>
   <header><strong>{label}</strong><small>日期与时间使用本地时区</small></header>
   <FieldControlBoundary><div className="datetime-date-label"><span>日期</span><DatePicker label={label+'日期'} value={date} required onChange={setDate}/></div>
   <div className="datetime-time-label"><span>时间</span><TimeControl label={label+'时间'} value={time} required onChange={setTime}/></div></FieldControlBoundary>
   <FieldMessage error={changed?"提醒已在其他操作中修改，请关闭后重试。":undefined}/>
   <div className="datetime-actions">{!required&&<button type="button" className="secondary" disabled={changed} onClick={()=>apply('')}>清除提醒</button>}<button type="button" className="secondary" onClick={()=>setOpen(false)}>取消</button><button type="button" className="primary" disabled={changed||!validDate(date)||!validTime(time)} onClick={()=>apply(date+'T'+time)}>应用提醒</button></div>
  </Popover.Content></Popover.Portal>
 </Popover.Root>
}

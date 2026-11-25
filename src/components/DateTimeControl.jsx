import React,{useEffect,useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {CalendarClock,CalendarDays} from 'lucide-react';
import {DayPicker} from 'react-day-picker';
import {zhCN} from 'react-day-picker/locale';
import {dayKey,shiftDay,validDate,validTime} from '../core/domain.js';
import {TimeControl} from './TimeControl.jsx';
const valid=value=>typeof value==='string'&&value.length===16&&value[10]==='T'&&validDate(value.slice(0,10))&&validTime(value.slice(11));
export function DateTimeControl({label,value,onChange,required=false,defaultDate}){
 const [open,setOpen]=useState(false),[date,setDate]=useState(''),[time,setTime]=useState('09:00'),[original,setOriginal]=useState(value),[calendar,setCalendar]=useState(false);
 useEffect(()=>{if(!open)return;const close=()=>setOpen(false);window.addEventListener('todo-close-transient',close);return()=>window.removeEventListener('todo-close-transient',close)},[open]);
 const changed=original!==value;
 const apply=next=>{if(changed||(!valid(next)&&(required||next!=='')))return;if(next!==value)onChange(next);setOpen(false)};
 return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next){setCalendar(false);setOriginal(value);setDate(valid(value)?value.slice(0,10):validDate(defaultDate)?defaultDate:dayKey());setTime(valid(value)?value.slice(11):'09:00')}}}>
  <Popover.Trigger asChild><button type="button" className="datetime-trigger" aria-label={label}><CalendarClock size={16}/><span>{valid(value)?value.replace('T',' '):'设置提醒'}</span></button></Popover.Trigger>
  <Popover.Portal><Popover.Content className="datetime-popover" sideOffset={6} align="end" collisionPadding={12} aria-label={label+'编辑'}>
   <header><strong>{label}</strong><small>日期与时间使用本地时区</small></header>
   <label className="datetime-date-label">日期<input type="text" aria-label={label+'日期'} placeholder="YYYY-MM-DD" maxLength={10} value={date} aria-invalid={!validDate(date)||undefined} onChange={e=>setDate(e.target.value)}/></label>
   <button type="button" className="secondary datetime-calendar-toggle" aria-expanded={calendar} onClick={()=>setCalendar(v=>!v)}><CalendarDays size={14}/> {calendar?'收起日历':'展开日历'}</button>
   {calendar&&<DayPicker mode="single" required locale={zhCN} defaultMonth={validDate(date)?new Date(date+'T12:00:00'):new Date()} selected={validDate(date)?new Date(date+'T12:00:00'):undefined} onSelect={d=>{if(d){setDate(dayKey(d));setCalendar(false)}}} weekStartsOn={1}/>}
   <div className="date-presets">{[['今天',dayKey()],['明天',shiftDay(dayKey(),1)],['下周',shiftDay(dayKey(),7)]].map(([name,next])=><button type="button" key={name} onClick={()=>setDate(next)}>{name}</button>)}</div>
   <div className="datetime-time-label"><span>时间</span><TimeControl label={label+'时间'} value={time} required onChange={setTime}/></div>
   {changed&&<small role="alert">提醒已在其他操作中修改，请关闭后重试。</small>}
   <div className="datetime-actions">{!required&&<button type="button" className="secondary" disabled={changed} onClick={()=>apply('')}>清除提醒</button>}<button type="button" className="secondary" onClick={()=>setOpen(false)}>取消</button><button type="button" className="primary" disabled={changed||!validDate(date)||!validTime(time)} onClick={()=>apply(date+'T'+time)}>应用提醒</button></div>
  </Popover.Content></Popover.Portal>
 </Popover.Root>
}

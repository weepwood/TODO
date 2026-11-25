import {useTransientPopover,popoverGeometry} from "../design-system/popover.js";
import React,{useEffect,useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {DayPicker} from 'react-day-picker';
import {zhCN} from 'react-day-picker/locale';
import {CalendarDays,ChevronDown} from 'lucide-react';
import {dayKey,shiftDay,validDate} from '../core/domain.js';
import 'react-day-picker/style.css';
export function DatePicker({value,onChange,label='计划日期',required=false}){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(value||''),[error,setError]=useState(false);const today=dayKey();
 const choose=date=>{if(required&&!date)return;onChange(date);setOpen(false)};
 useTransientPopover(open,()=>setOpen(false));
 return <Popover.Root open={open} onOpenChange={v=>{setOpen(v);if(v){setDraft(value||'');setError(false)}}}><Popover.Trigger asChild><button type="button" className="date-trigger" aria-label={label}><CalendarDays size={15}/>{value||'设置日期'}<ChevronDown size={13}/></button></Popover.Trigger><Popover.Portal><Popover.Content className="date-popover" aria-label={label+"选择器"} {...popoverGeometry}><form className="date-direct" onSubmit={e=>{e.preventDefault();if((!required&&!draft)||validDate(draft))choose(draft);else setError(true)}}><input aria-label={label+'直接输入'} type="text" placeholder="YYYY-MM-DD" autoComplete="off" maxLength={10} aria-invalid={error||undefined} value={draft} onChange={e=>{setDraft(e.target.value);setError(false)}}/><button type="submit" className="secondary compact">应用</button>{error&&<small role="alert">日期无效</small>}</form><div className="date-presets">{[['今天',today],['明天',shiftDay(today,1)],['下周',shiftDay(today,7)],['清除','']].filter(([,d])=>!required||d).map(([n,d])=><button type="button" key={n} onClick={()=>choose(d)}>{n}</button>)}</div><DayPicker mode="single" required={required} locale={zhCN} defaultMonth={value?new Date(value+'T12:00:00'):new Date()} selected={value?new Date(value+'T12:00:00'):undefined} onSelect={date=>choose(date?dayKey(date):'')} showOutsideDays weekStartsOn={1}/></Popover.Content></Popover.Portal></Popover.Root>
}
export function DateControl({value,onChange,label}){
 const [draft,setDraft]=useState(value);
 useEffect(()=>setDraft(value),[value]);
 const invalid=!validDate(draft);
 const change=text=>{setDraft(text);if(validDate(text)&&text!==value)onChange(text)};
 return <div className="date-control" data-invalid={invalid||undefined}><input type="text" aria-label={label} aria-invalid={invalid||undefined} placeholder="YYYY-MM-DD" autoComplete="off" spellCheck={false} maxLength={10} value={draft} onChange={e=>change(e.target.value)} onBlur={()=>{if(invalid)setDraft(value)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!invalid)e.currentTarget.blur()}else if(e.key==='Escape'&&invalid){e.stopPropagation();setDraft(value)}}}/><DatePicker label={label.replace('日期','')+'日历选择器'} required value={value} onChange={onChange}/></div>
}

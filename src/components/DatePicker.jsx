import {FieldMessage,useFieldControl,FieldControlBoundary} from '../design-system/FieldFeedback.jsx';
import {useTransientPopover,popoverGeometry} from "../design-system/popover.js";
import React,{useEffect,useState,useId,useRef} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {CalendarDays,ChevronDown} from 'lucide-react';
import {dayKey,shiftDay,validDate} from '../core/domain.js';
import {CalendarNavigation,asCalendarDate as asDate} from './CalendarNavigation.jsx';
export function DatePicker({value,onChange,label='计划日期',required=false,inline=false,selectionOnly=false,confirm=false}){
 const feedback=useFieldControl(),today=dayKey(),errorId=useId();
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(value||''),[error,setError]=useState(false),[month,setMonth]=useState(()=>asDate(value)||new Date()),[picked,setPicked]=useState(value||'');
 const original=useRef(value),[commitError,setCommitError]=useState('');
 const choose=date=>{if(required&&!date)return;if(confirm&&value!==original.current){setCommitError('日期已变化，请重新打开选择器。');return}const result=onChange(date);if(typeof result==='string'&&result){setCommitError(result);return}setOpen(false)};
 const selectDate=date=>{if(inline||confirm){setCommitError('');setPicked(date);setDraft(date);setError(false);if(date)setMonth(asDate(date));if(selectionOnly)onChange(date)}else choose(date)};
 const applyTyped=()=>{if((!required&&!draft)||validDate(draft))selectDate(draft);else setError(true)};
 useEffect(()=>{if(selectionOnly){setDraft(value||'');setPicked(value||'');setError(false);if(validDate(value))setMonth(asDate(value))}},[selectionOnly,value]);
 useTransientPopover(open,()=>setOpen(false));
 const direct=<form className="date-direct" onSubmit={e=>{e.preventDefault();applyTyped()}}><input aria-label={label+'直接输入'} type="text" placeholder="YYYY-MM-DD" autoComplete="off" maxLength={10} aria-invalid={error||undefined} aria-describedby={error?errorId:undefined} value={draft} onChange={e=>{setDraft(e.target.value);setError(false)}}/><button type="submit" className="secondary compact">应用</button><FieldMessage id={errorId} error={error?"日期无效，请使用 YYYY-MM-DD":undefined}/></form>;
 const presets=<div className="date-presets">{[['今天',today],['明天',shiftDay(today,1)],['下周',shiftDay(today,7)]].map(([n,d])=><button type="button" key={n} aria-pressed={inline||confirm?(selectionOnly?value:picked)===d:undefined} onClick={()=>selectDate(d)}>{n}</button>)}{!inline&&!confirm&&!required&&<button type="button" onClick={()=>choose('')}>清除</button>}</div>;
 const calendar=<CalendarNavigation key={inline?'inline':String(open)} month={month} onMonthChange={setMonth} value={selectionOnly?value:inline||confirm?picked:value} onSelect={selectDate} required={required} today={today}/>;
 const content=inline||confirm?<>{calendar}{presets}<details className="date-manual"><summary>手动输入日期</summary>{direct}</details>{commitError&&<p role="alert" className="sync-error">{commitError}</p>}{!selectionOnly&&<div className="date-confirm-actions"><button type="button" className="secondary" disabled={required} onClick={()=>choose('')}>清除</button><button type="button" className="primary" disabled={required?!validDate(picked):!!picked&&!validDate(picked)} onClick={()=>choose(picked)}>确定</button></div>}</>:<>{direct}{presets}{calendar}</>;
 if(inline)return <div className="date-popover date-picker-inline" aria-label={label+"选择器"}>{content}</div>;
 return <Popover.Root open={open} onOpenChange={v=>{setOpen(v);if(v){original.current=value;setCommitError('');setDraft(value||'');setPicked(value||'');setError(false);setMonth(asDate(value)||asDate(today))}}}><Popover.Trigger asChild><button {...feedback} type="button" className="date-trigger" aria-label={label}><CalendarDays size={15}/>{value||'设置日期'}<ChevronDown size={13}/></button></Popover.Trigger><Popover.Portal><Popover.Content className="date-popover" aria-label={label+"选择器"} {...popoverGeometry}>{content}</Popover.Content></Popover.Portal></Popover.Root>
}
export function DateControl({value,onChange,label}){
 const feedback=useFieldControl();
 const [draft,setDraft]=useState(value);
 useEffect(()=>setDraft(value),[value]);
 const invalid=!validDate(draft);
 const change=text=>{setDraft(text);if(validDate(text)&&text!==value)onChange(text)};
 return <div className="date-control" data-invalid={invalid||undefined}><input type="text" aria-label={label} id={feedback.id} aria-describedby={feedback['aria-describedby']} aria-invalid={invalid||feedback['aria-invalid']||undefined} placeholder="YYYY-MM-DD" autoComplete="off" spellCheck={false} maxLength={10} value={draft} onChange={e=>change(e.target.value)} onBlur={()=>{if(invalid)setDraft(value)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!invalid)e.currentTarget.blur()}else if(e.key==='Escape'&&invalid){e.stopPropagation();setDraft(value)}}}/><FieldControlBoundary><DatePicker label={label.replace('日期','')+'日历选择器'} required value={value} onChange={onChange}/></FieldControlBoundary></div>
}

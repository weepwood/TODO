import React,{useState} from 'react';
import {DayPicker} from 'react-day-picker';
import {zhCN} from 'react-day-picker/locale';
import {ChevronLeft,ChevronRight,LocateFixed} from 'lucide-react';
import {dayKey,validDate} from '../core/domain.js';
import 'react-day-picker/style.css';
export const asCalendarDate=key=>validDate(key)?new Date(key+'T12:00:00'):undefined;
export function CalendarNavigation({month,onMonthChange,value,onSelect,required=false,today=dayKey()}){
 const [mode,setMode]=useState('days'),year=month.getFullYear(),index=month.getMonth(),months=mode==='months';
 const resetLabel=months?'返回当前月份':'回到今天';
 const reset=()=>{onMonthChange(asCalendarDate(today));if(!months)onSelect(today)};
 const shift=n=>onMonthChange(new Date(year+(months?n:0),index+(months?0:n),1,12));
 return <><div className="date-month-toolbar"><button type="button" className="date-month-title" aria-label={months?'返回日期选择':'选择月份'} aria-expanded={months} onClick={()=>setMode(v=>v==='days'?'months':'days')}><strong aria-live="polite">{year}年{months?'':index+1+'月'}</strong></button><div className="date-month-actions"><button type="button" className="icon-button" aria-label={months?'上一年':'上个月'} disabled={months?year<=1900:year<=1900&&index===0} onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><button type="button" className="icon-button" aria-label={resetLabel} title={resetLabel} onClick={reset}><LocateFixed size={16}/></button><button type="button" className="icon-button" aria-label={months?'下一年':'下个月'} disabled={months?year>=9998:year>=9998&&index===11} onClick={()=>shift(1)}><ChevronRight size={18}/></button></div></div>
 {months?<div className="date-month-grid" role="group" aria-label="选择月份">{Array.from({length:12},(_,i)=><button key={i} type="button" aria-pressed={i===index} onClick={()=>{onMonthChange(new Date(year,i,1,12));setMode('days')}}><span>{i+1}月</span></button>)}</div>:<DayPicker mode="single" required={required} locale={zhCN} month={month} onMonthChange={onMonthChange} hideNavigation selected={asCalendarDate(value)} onSelect={date=>{const key=date?dayKey(date):'';if(!key||validDate(key))onSelect(key)}} startMonth={new Date(1900,0,1,12)} endMonth={new Date(9998,11,1,12)} showOutsideDays fixedWeeks weekStartsOn={1}/>}</>
}

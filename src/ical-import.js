import ICAL from 'ical.js';
import {dayKey} from './domain.js';
export function parseCalendar(text,source,from=new Date(),days=180){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>1000000)throw Error('日历文件超过 1 MB');
 const component=new ICAL.Component(ICAL.parse(text));if(component.name!=='vcalendar')throw Error('不是有效的 ICS 日历');
 const start=new Date(from.getTime()-86400000*30),end=new Date(from.getTime()+days*86400000);
 const events=[];const seen=new Set();
 function add(event,occurrence,suffix){
  if(events.length>=1000)return;
  const s=occurrence.startDate,e=occurrence.endDate,allDay=s.isDate;
  const startDate=s.toJSDate(),endDate=e.toJSDate();if(endDate<start||startDate>end)return;
  const id=source+':'+event.uid+':'+suffix;if(seen.has(id))return;seen.add(id);
  events.push({id,title:String(event.summary||'未命名日程').slice(0,300),start:allDay?s.toString():startDate.toISOString(),end:allDay?e.toString():endDate.toISOString(),allDay,source})
 }
 for(const c of component.getAllSubcomponents('vevent')){
  if(events.length>=1000)break;
  const event=new ICAL.Event(c);if(event.isRecurrenceException())continue;
  if(!event.startDate||!event.uid)continue;
  if(!event.isRecurring()){add(event,{startDate:event.startDate,endDate:event.endDate},'single');continue}
  // Bounded expansion prevents pathological feeds. Historical series may require a later import range.
  const iterator=event.iterator();for(let i=0;i<20000&&events.length<1000;i++){const time=iterator.next();if(!time||time.toJSDate()>end)break;const occurrence=event.getOccurrenceDetails(time);add(event,occurrence,time.toString())}
 }
 return events
}

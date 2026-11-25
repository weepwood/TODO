import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhLocale from '@fullcalendar/core/locales/zh-cn';
import {dayKey} from './domain.js';
const pending=d=>d.tasks.filter(t=>!t.deletedAt&&t.status==='pending');
export default function CalendarView({data,patch,select,add,today}){
 const events=pending(data).filter(t=>t.date).map(t=>({id:t.id,title:t.title,start:t.date+(t.time?'T'+t.time:''),allDay:!t.time,end:t.time?new Date(new Date(t.date+'T'+t.time).getTime()+t.duration*60000):undefined,backgroundColor:data.lists.find(l=>l.id===t.listId)?.color||'#5276d6',borderColor:'transparent'}));
 return <div className="calendar-wrap"><FullCalendar plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} locale={zhLocale} initialView="dayGridMonth" initialDate={today} headerToolbar={{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,timeGridDay'}} events={events} editable eventDurationEditable={false} height="auto" dayMaxEvents={4} nowIndicator dateClick={e=>add(e.dateStr.slice(0,10),e.allDay?'':e.dateStr.slice(11,16))} eventClick={e=>select(e.event.id)} eventDrop={e=>{const date=dayKey(e.event.start);const time=e.event.allDay?'':e.event.start.toTimeString().slice(0,5);patch(e.event.id,{date,time,anchor:Number(date.slice(-2))})}}/></div>
}

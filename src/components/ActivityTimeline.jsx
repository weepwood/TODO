import React from 'react';
import {Plus,Check,Trash2,Repeat,SkipForward,Circle,Clock,Pencil,Flag,CalendarDays,Tag,Link,FileText,ArrowRight,Paperclip,RotateCcw,ListChecks} from 'lucide-react';
import {groupTimeline} from '../core/activity-timeline.js';

const icons={created:Plus,completed:Check,deleted:Trash2,generated:Repeat,skipped:SkipForward,pending:Circle,neutral:Clock,title:Pencil,priority:Flag,date:CalendarDays,time:Clock,tags:Tag,notes:FileText,links:Link,checklist:ListChecks,repeat:Repeat,attachmentAdded:Paperclip,attachmentRemoved:Paperclip,reopened:RotateCcw,restored:RotateCcw,updated:Pencil,focus:Clock};
export function ActivityTimeline({entries,label,empty='暂无记录',dateKind='event'}){
 if(!entries.length)return <p className="timeline-empty muted small">{empty}</p>;
 return <div className="activity-timeline" aria-label={label} role="group">
 {groupTimeline(entries).map(({day,items})=><div key={day||'unknown'} className="activity-timeline-group">
  <div className="activity-timeline-date">{day?<time dateTime={day}>{day}</time>:dateKind==='schedule'?'未安排日期':'时间未知'}</div>
  <ol className="activity-timeline-list">{items.map(entry=>{const Icon=icons[entry.kind]||icons.neutral;return <li className="activity-timeline-item" data-kind={entry.kind} key={entry.id}>
   <span className="activity-timeline-node" aria-hidden="true"><Icon size={12}/></span>
   <div className="activity-timeline-content"><span className="activity-timeline-label">{entry.label}</span>{entry.detail&&<small>{entry.detail}</small>}{entry.sourceLabel&&entry.source!=='legacy'&&<small className="activity-source">{entry.sourceLabel}</small>}
   {!!entry.changes?.length&&<div className="activity-changes">{entry.changes.map(c=><div className="activity-change" key={c.field}>{entry.changes.length>1&&<small>{c.label}</small>}<div className="activity-change-values"><span className="activity-before">{c.before||'—'}</span><ArrowRight size={11} aria-hidden="true"/><span>{c.after||'—'}</span></div></div>)}</div>}</div>
   {entry.time&&<time className="activity-timeline-time" dateTime={entry.dateTime} title={entry.dateTime}>{entry.time}</time>}
  </li>})}</ol>
 </div>)}
 </div>
}

import React from 'react';
import {Bell} from 'lucide-react';
import {Modal} from '../ui.jsx';
export default function ReminderHistory({notifications,tasks,onOpen,onClose}){
 const active=new Map(tasks.filter(t=>!t.deletedAt).map(t=>[t.id,t]));
 return <Modal open onClose={onClose} title="提醒记录">{!notifications.length&&<p className="muted">暂无提醒</p>}{[...notifications].reverse().map(n=><div className="record-row" key={n.id}><Bell size={15}/><span>{n.title}</span><small>{new Date(n.at).toLocaleString()}</small>{active.has(n.taskId)&&<button type="button" className="text-link" onClick={()=>onOpen(active.get(n.taskId))}>打开任务</button>}</div>)}</Modal>
}

import React,{useState} from 'react';
import {Modal} from '../ui.jsx';
import {Segmented} from '../design-system/Controls.jsx';
import {previewPostpone} from '../core/task-defaults.js';
export function BulkPostpone({tasks,ids,onClose,onApply}){
 const [days,setDays]=useState(1),p=previewPostpone(tasks,ids,days);
 return <Modal open onClose={onClose} title="批量延期" className="bulk-postpone-dialog" description="仅移动有计划日期的普通待办，保留原时刻、时长及独立提醒。重复任务和历史记录不参与。"><Segmented label="延期天数" value={String(days)} onValueChange={v=>setDays(+v)} options={[{value:'1',label:'一天'},{value:'3',label:'三天'},{value:'7',label:'一周'}]}/><p className="muted small">可延期 {p.rows.length} 项 · 跳过 {p.skipped} 项 · 延期后有冲突 {p.conflicts} 项（仅任务间）</p><div className="postpone-preview">{p.rows.slice(0,100).map(r=><div className="record-row" key={r.id}><span>{r.title}</span><small>{r.from} → {r.to}</small></div>)}{p.rows.length>100&&<p>其余 {p.rows.length-100} 项将一起处理。</p>}</div><div className="dialog-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!p.rows.length} onClick={()=>onApply(p,days)}>应用延期</button></div></Modal>
}

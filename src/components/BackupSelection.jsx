import React,{useMemo,useState} from 'react';
import {backupTaskChanges} from '../core/backup-selection.js';
import {CheckInput,SearchField} from '../design-system/Controls.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
const kinds={added:'归档新增',changed:'内容变化',removed:'归档缺失'};
const labels={title:'标题',notes:'备注',listId:'清单',sectionId:'分组',date:'日期',time:'时刻',duration:'预计',deadline:'截止',priority:'优先级',status:'状态',deletedAt:'删除状态',parentId:'父任务',dependsOn:'依赖',checklist:'检查项',links:'链接',planMinutes:'占位',planSegments:'补充段',planLocked:'锁定',tags:'标签',repeat:'重复',seriesHold:'暂停',other:'其他记录'};
export default function BackupSelection({current,incoming}){
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[ids,setIds]=useState([]),[limit,setLimit]=useState(50);
 const rows=useMemo(()=>backupTaskChanges(current,incoming),[current.tasks,incoming.tasks]),visible=rows.filter(r=>(filter==='all'||r.kind===filter)&&r.title.toLowerCase().includes(query.toLowerCase())),selected=rows.filter(r=>ids.includes(r.id));
 return <section className="review-section"><h3>选择性恢复预览</h3><p className="muted small">仅列出差异并标记候选项，不执行部分恢复；完整恢复仍走独立确认流程。</p><SearchField aria-label="搜索备份差异" placeholder="按任务标题搜索" value={query} onValueChange={v=>{setQuery(v);setLimit(50)}}/><SmartSelect aria-label="备份差异类型" value={filter} onValueChange={v=>{setFilter(v);setLimit(50)}}><SelectOption value="all">全部差异</SelectOption>{Object.entries(kinds).map(([v,n])=><SelectOption key={v} value={v}>{n}</SelectOption>)}</SmartSelect><div className="professional-preview" aria-label="选择性恢复任务预览">{visible.slice(0,limit).map(r=><div key={r.id} className="record-row"><label className="compact-checkbox"><CheckInput checked={ids.includes(r.id)} onChange={e=>setIds(old=>e.target.checked?[...old,r.id]:old.filter(x=>x!==r.id))}/>{r.title}</label><small>{kinds[r.kind]} {r.fields.map(k=>labels[k]).join('、')}</small></div>)}{!visible.length&&<p className="muted">没有匹配差异。</p>}</div>{limit<visible.length&&<button className="text-link" onClick={()=>setLimit(v=>v+50)}>加载更多</button>}<p role="status">已标记 {selected.length} 项（仅预览）</p></section>
}

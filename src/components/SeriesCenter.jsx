import React,{useMemo,useState} from 'react';
import {Modal} from '../ui.jsx';
import {Segmented,SearchField,CheckInput} from '../design-system/Controls.jsx';
import {seriesDirectory,recoverSeries,previewSeriesBatch,applySeriesBatch} from '../core/series-control.js';
const names={running:'运行中',paused:'已暂停',ended:'已结束/最后一次',conflict:'待处理冲突'};
export function SeriesCenter({tasks,onClose,onOpen,onRepair,onBatch,blocked}){
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState([]),[review,setReview]=useState(null);
 const rows=useMemo(()=>seriesDirectory(tasks),[tasks]),visible=rows.filter(r=>(filter==='all'||r.state===filter)&&r.task.title.toLowerCase().includes(query.toLowerCase()));
 return <Modal open onClose={onClose} title="重复系列管理中心" className="workflow-dialog" description="按系列而不是单次任务归纳。历史保留；冲突不自动覆盖。">
 <Segmented className="series-center-filters" label="系列状态筛选" value={filter} onValueChange={setFilter} options={[{value:'all',label:'全部 '+rows.length},...Object.entries(names).map(([value,label])=>({value,label:label+' '+rows.filter(r=>r.state===value).length}))]}/>
 <SearchField aria-label="搜索重复系列" placeholder="搜索系列名称" value={query} onValueChange={setQuery}/>
 <div className="workspace-actions"><span>已选 {selected.length} 个系列</span>{['pause','resume'].map(a=><button key={a} className="secondary compact" disabled={blocked||!selected.length} onClick={()=>setReview({action:a,rows:previewSeriesBatch(tasks,selected,a)})}>{a==='pause'?'预览批量暂停':'预览批量恢复'}</button>)}</div>
 {review&&<div className="professional-preview" aria-label="系列批量预览"><p>可操作 {review.rows.length} 个系列；其余保持原状。</p>{review.rows.map(r=><div className="record-row" key={r.key}>{r.title}</div>)}<button className="secondary compact" onClick={()=>setReview(null)}>取消</button><button className="primary compact" disabled={blocked||!review.rows.length||JSON.stringify(previewSeriesBatch(tasks,review.rows.map(r=>r.key),review.action))!==JSON.stringify(review.rows)} onClick={()=>{onBatch(review.rows,review.action,applySeriesBatch);setReview(null);setSelected([])}}>确认批量{review.action==='pause'?'暂停':'恢复'}</button></div>}
 <div className="workflow-config-scroll series-center-results">
 {visible.map(r=><section className="review-section" key={r.key}><div className="record-row"><label className="compact-checkbox"><CheckInput aria-label={"选择系列 "+r.task.title} checked={selected.includes(r.key)} disabled={r.state==="conflict"||r.state==="ended"} onChange={e=>{setSelected(old=>e.target.checked?[...old,r.key].slice(0,100):old.filter(k=>k!==r.key));setReview(null)}}/><strong>{r.task.title}</strong></label><small>{names[r.state]}</small></div><p className="muted small">{r.total} 个实例 · 完成 {r.completed} · 跳过 {r.skipped} · {r.task.date||'未安排'}</p><div className="dialog-actions"><button className="secondary" onClick={()=>onOpen(r.task.id)}>查看系列</button>{r.state==='conflict'&&<>{recoverSeries(tasks,r.key,'repair')!==tasks&&<button className="secondary" disabled={blocked} onClick={()=>{if(confirm('修复暂停次数围栏，保留原规则和当前任务？'))onRepair(r.key,'repair')}}>修复暂停保护</button>}{recoverSeries(tasks,r.key,'acknowledge')!==tasks&&<button className="secondary" disabled={blocked} onClick={()=>{if(confirm('旧客户端已完成此实例，确认接纳现有记录并清理历史暂停标记？不会重开或生成任务。'))onRepair(r.key,'acknowledge')}}>{r.live.length?'接纳现有后续实例':'确认已结束'}</button>}</>}</div>{r.state==='conflict'&&<p className="muted small">请检查多活动实例或旧客户端写入。无法安全修复时保留原记录。</p>}</section>)}
 {!visible.length&&<p className="muted">暂无匹配系列</p>}</div>
 </Modal>
}

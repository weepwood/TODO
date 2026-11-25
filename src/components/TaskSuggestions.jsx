import React,{useMemo} from 'react';
import {Modal} from '../ui.jsx';
import {taskSuggestions} from '../core/task-lifecycle.js';
const labels={overdue:'过期任务',unscheduled:'长期未安排（至少7天）',ready:'依赖已解除',blocked:'等待前置任务'};
export function TaskSuggestions({tasks,today,onClose,onSelect,onSchedule,blocked}){
 const groups=useMemo(()=>taskSuggestions(tasks,today),[tasks,today]);
 return <Modal open onClose={onClose} title="任务建议" description="基于本地日期与依赖关系的规则建议；同一任务可能出现在多个分类，不自动修改。" className="task-suggestions-dialog">
 {Object.entries(groups).map(([key,rows])=><section className="review-section" key={key}><h3>{labels[key]} · {rows.length}</h3>{rows.length?rows.slice(0,30).map(({task,reason})=><div className="review-task-row" key={task.id}><button className="review-task-link" onClick={()=>onSelect(task)}><strong>{task.title}</strong><small>{reason}</small></button>{['overdue','unscheduled'].includes(key)&&<button className="secondary compact" disabled={blocked||task.repeat!=='none'||!!task.seriesId||!!task.previousId} onClick={()=>onSchedule(task.id,today)}>安排今天</button>}</div>):<p className="muted small">暂无建议</p>}{rows.length>30&&<small className="muted">显示前30项，可通过原清单查看其余任务。</small>}</section>)}
 </Modal>
}

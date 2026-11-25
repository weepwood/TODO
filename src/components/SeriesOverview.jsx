import React from 'react';
import {Modal} from '../ui.jsx';
import {seriesOverview} from '../core/task-lifecycle.js';
export function SeriesOverview({tasks,taskId,today,onClose,onSelect}){
 const r=seriesOverview(tasks,taskId,today);if(!r)return null;
 return <Modal open onClose={onClose} title="重复任务系列" className="series-overview-dialog" description="按已有实例统计；预计日期不是已创建任务。完成后由原重复引擎生成。">
 <div className="series-summary"><span>当前待办 <strong>{r.live.length}</strong></span><span>已完成 <strong>{r.completed}</strong></span><span>已跳过 <strong>{r.skipped}</strong></span></div>
 <div className="series-next"><strong>下一实例</strong><span>{r.next?r.next.date+' · 第 '+r.next.index+' 次':'暂无预计日期'}</span><small>{r.next?.conditional?'假设今天完成；实际日期随完成日变化。':r.reason}</small></div>
 <h3>实例记录 · {r.rows.length}</h3><div className="series-records">{r.rows.slice(0,100).map(t=><button className="review-task-link series-record" key={t.id} disabled={!!t.deletedAt} onClick={()=>onSelect(t)}><strong>{t.date||'未安排'} · {t.title}</strong><small>第 {t.occurrenceIndex||1} 次 · {t.deletedAt?'已删除':{pending:'待处理',completed:'已完成',skipped:'已跳过'}[t.status]}{t.id===taskId?' · 当前实例':''}</small></button>)}</div>{r.rows.length>100&&<p className="muted small">显示最近100条实例。</p>}
 <p className="muted small">修改未来规则请打开当前待办的提醒与重复区块；历史实例保持只读。</p>
 </Modal>
}

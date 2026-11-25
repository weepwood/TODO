import React from 'react';
import {Modal} from '../ui.jsx';
import {seriesControl} from '../core/series-control.js';
import {seriesOverview} from '../core/task-lifecycle.js';
export function SeriesOverview({tasks,taskId,today,onClose,onSelect,onControl,blocked}){
 const r=seriesOverview(tasks,taskId,today);if(!r)return null;
 const t=r.active.length===1&&r.live.length===1?r.active[0]:null,ended=t&&!t.seriesHold&&t.repeatCount>0&&t.repeatCount<=(t.occurrenceIndex||1);
 return <Modal open onClose={onClose} title="重复任务系列" className="series-overview-dialog" description="按已有实例统计；预计日期不是已创建任务。完成后由原重复引擎生成。">
 <div className="series-summary"><span>当前待办 <strong>{r.live.length}</strong></span><span>已完成 <strong>{r.completed}</strong></span><span>已跳过 <strong>{r.skipped}</strong></span></div>
 <div className="series-next"><strong>下一实例</strong><span>{r.next?r.next.date+' · 第 '+r.next.index+' 次':'暂无预计日期'}</span><small>{r.next?.conditional?'假设今天完成；实际日期随完成日变化。':r.reason}</small></div>
 {t&&<section className="series-management"><strong>{t.seriesHold?'已暂停':ended?'当前实例为最后一次':'系列运行中'}</strong><p className="muted small">暂停保留当前待办和提醒，停止自动跳过及完成生成；恢复前不可完成当前实例。结束系列保留当前待办，完成后不再生成。</p><div className="dialog-actions">{t.seriesHold?<button className="secondary" disabled={blocked||seriesControl(tasks,t.id,'resume')===tasks} onClick={()=>onControl(t.id,'resume')}>恢复系列</button>:!ended&&<button className="secondary" disabled={blocked||seriesControl(tasks,t.id,'pause')===tasks} onClick={()=>{if(confirm('暂停重复系列？当前待办和提醒保留。'))onControl(t.id,'pause')}}>暂停系列</button>}{!ended&&<button className="secondary" disabled={blocked||seriesControl(tasks,t.id,'end')===tasks} onClick={()=>{if(confirm('结束系列？当前待办保留，完成后不再生成。'))onControl(t.id,'end')}}>结束系列</button>}</div></section>}
 <h3>实例记录 · {r.rows.length}</h3><div className="series-records">{r.rows.slice(0,100).map(t=><button className="review-task-link series-record" key={t.id} disabled={!!t.deletedAt} onClick={()=>onSelect(t)}><strong>{t.date||'未安排'} · {t.title}</strong><small>第 {t.occurrenceIndex||1} 次 · {t.deletedAt?'已删除':{pending:'待处理',completed:'已完成',skipped:'已跳过'}[t.status]}{t.id===taskId?' · 当前实例':''}</small></button>)}</div>{r.rows.length>100&&<p className="muted small">显示最近100条实例。</p>}
 <p className="muted small">修改未来规则请打开当前待办的提醒与重复区块；历史实例保持只读。</p>
 </Modal>
}

import {blockMinutes} from '../../core/plan-block.js';
import {DeadlineProperty} from './DeadlineProperty.jsx';
import {DndContext,closestCenter,PointerSensor,useSensor,useSensors} from '@dnd-kit/core';
import {SortableContext,verticalListSortingStrategy} from '@dnd-kit/sortable';
import {useDetailDensity} from '../../components/useDetailDensity.js';
import {taskFocusSummary} from '../../core/task-defaults.js';
import React from 'react';
import {CheckInput} from "../../design-system/Controls.jsx";
import {EditableProperty,PropertyGrid,PropertyPopover,EditableText} from '../../components/EditableProperty.jsx';
import {InlineFocus} from './InlineFocus.jsx';
import {ScheduleProperty} from './ScheduleProperty.jsx';
import {ListIcon} from '../../components/ListIcon.jsx';
import {scheduleChanges,scheduleSnapshot} from '../../core/task-schedule.js';
import {seriesSafetyKeys} from '../../core/series-control.js';
import {DetailSection} from "../../components/DetailSection.jsx";
import {DetailNavigation} from "../../components/DetailNavigation.jsx";
import {TimeControl} from "../../components/TimeControl.jsx";
import {TaskTitle} from "../../components/TaskTitle.jsx";
import {SearchSelect} from '../../components/SearchSelect.jsx';
import {SmartSelect,SelectOption} from "../../components/SmartSelect.jsx";
import {MAX_POINTS,taskPoints} from "../../core/points.js";
import {useState,useRef,useMemo} from "react";
import {CalendarDays,Layers,CheckCircle2,Plus,Trash2,X,Clock,Copy,Pencil,Paperclip,FileText,History,ListChecks,Repeat,ChevronRight,Tag,ListTree,Link2} from "lucide-react";
import {id} from "../../core/domain.js";
import {NumberField} from "../../ui.jsx";
import {DatePicker} from "../../components/DatePicker.jsx";
import {Relations,ChildTasks} from "../../task-fields.jsx";
import {descendants} from "../../core/advanced.js";
import {MarkdownNotes,TaskLinks} from "../../detail-tools.jsx";
import {Attachments} from "../../attachments-ui.jsx";
import {activityTimeline,seriesTimeline} from '../../core/activity-timeline.js';
import {InfoTip} from '../../design-system/InfoTip.jsx';
import {activityMatches,ACTIVITY_LIMIT,ACTIVITY_BYTES} from '../../core/task-activity.js';
import {ActivityTimeline} from '../../components/ActivityTimeline.jsx';
import {priorityNames} from "../../design-system/Controls.jsx";
import {PriorityValue,GroupValue,StatusValue} from "../../design-system/Controls.jsx";
const verticalOnly=({transform})=>({...transform,x:0,scaleX:1,scaleY:1});
export function TaskDetail({compactLayout,scope,storage,task,data,updateFocus,onAttachmentActivity,openSeries,patch,remove,finish,restore,reopen,saveTemplate,select,addChild,onCreateGroup,onRenameGroup,onClose}){
 const [item,setItem]=useState(''),[historyOpen,setHistoryOpen]=useState(false),[activityFilter,setActivityFilter]=useState("all"),[activityCount,setActivityCount]=useState(10);
 const [densities,changeDensity,sectionOrder,reorderSection]=useDetailDensity(storage);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}));
 const locked=task.status!=='pending'||!!task.deletedAt;const list=data.lists.find(l=>l.id===task.listId);
 const seriesLocked=useMemo(()=>seriesSafetyKeys(data.tasks).has(task.seriesId||task.id),[data.tasks,task.seriesId,task.id]);
 const detailRef=useRef(null),titleSession=useRef(null);
 const moveSection=(id,delta)=>{const target=sectionOrder[sectionOrder.indexOf(id)+delta];if(target)reorderSection(id,target)};
 const section=(id,title,icon,children,meta)=><DetailSection key={id} id={id} title={title} icon={icon} meta={meta} density={densities[id]||"full"} onDensityChange={mode=>changeDensity(id,mode)} onMove={delta=>moveSection(id,delta)}>{children}</DetailSection>;
 const property=(label,value,editor)=><EditableProperty label={label} value={value} readOnly={locked}>{editor}</EditableProperty>;
 const reminderDates=[task.reminderAt,...(task.extraReminders||[]).map(r=>r.at)].filter(Boolean);
 const reminderGroups=[...new Map(reminderDates.slice().sort().map(v=>[v,reminderDates.filter(x=>x===v).length])).entries()];
 const recurrenceLabels={none:'不重复',daily:'每天',weekly:'每周',monthly:'每月',weekdays:'指定星期',workdays:'工作日',completion:'完成后按天'};
 const chosenTags=data.tags.filter(t=>task.tags.includes(t.id)),children=descendants(data.tasks,task.id).filter(t=>!t.deletedAt);
 const historyItems=activityTimeline(task),filteredActivity=historyItems.filter(e=>activityMatches(e,activityFilter)),hasSeries=!!(task.seriesId||task.repeat!=='none'||data.tasks.some(t=>t.previousId===task.id));
 const seriesItems=useMemo(()=>hasSeries?seriesTimeline(data.tasks,task):[],[data.tasks,task.id,task.seriesId,hasSeries]);
 const focusSummary=taskFocusSummary(data.sessions,task.id);
 const focusDetails=<InlineFocus task={task} data={data} update={updateFocus} locked={locked} summary={focusSummary}/>;
 const taskGroup=list?.sections?.find(s=>s.id===task.sectionId);
 const status=task.deletedAt?'trash':task.status==='completed'?'completed':task.status==='skipped'?'skipped':task.stage==='doing'?'doing':'todo';
 const priorityValue=i=><PriorityValue value={i}/>;
 const listValue=l=><span className="property-list-value"><ListIcon list={l} size={15}/>{l?.name||"未归属"}</span>;
 const groupValue=g=><GroupValue group={g}/>;
 const statusValue=(key)=><StatusValue status={key}/>;
 const checkDone=task.checklist.filter(c=>c.done).length,checkTotal=task.checklist.length;
 const checkMeta=<span className="inspector-check-count">{checkTotal>0&&<span className="inspector-check-ring" role="progressbar" aria-label="检查清单进度" aria-valuemin={0} aria-valuemax={checkTotal} aria-valuenow={checkDone} style={{'--check-progress':(checkDone/checkTotal*100)+'%'}}/>}<span>{checkDone}/{checkTotal}</span></span>;

 function revealPlan(action){
  changeDensity('plan','full');
  requestAnimationFrame(()=>{const host=detailRef.current?.querySelector('[data-detail-section=plan]');if(!host)return;if(action==='date')host.querySelector('.date-trigger')?.click();else{const el=host.querySelector('.inline-focus');el?.scrollIntoView({block:'nearest'});el?.querySelector('button:not([disabled])')?.focus({preventScroll:true})}});
 }

 const sectionCards=[
 section("plan","时间、提醒与计划",CalendarDays,<><PropertyGrid>
 {property('计划日期',task.date||'未安排',task.planLocked?<span>{task.date||'未安排'} · 已锁定</span>:<DatePicker confirm required={task.repeat!=='none'||!!task.seriesHold} value={task.date} onChange={date=>{const result=scheduleChanges(task,task,{...scheduleSnapshot(task),date},{locked:seriesLocked});if(result.error)return result.error;if(Object.keys(result.fields).length)patch(result.fields)}}/>)}
 {property('计划时间',task.time||'未设置',task.planLocked?<span>{task.time||'未设置'} · 已锁定</span>:<TimeControl commitOnBlur label="计划时间" value={task.time} onChange={time=>patch({time})}/>)}
 {property('截止期限',task.deadline?.replace('T',' ')||'未设置',<DeadlineProperty task={task} patch={patch} locked={locked}/>)}
 {property('预计时长',task.duration+' 分钟',<NumberField label="预计分钟" unit="分钟" min={1} max={1440} value={task.duration} onCommit={duration=>patch({duration})}/>)}
 {property('规划占位',blockMinutes(task)+' 分钟',task.planLocked?<span>{blockMinutes(task)} 分钟 · 已锁定</span>:<NumberField label="规划占位分钟" unit="分钟" min={1} max={1440} value={blockMinutes(task)} onCommit={planMinutes=>patch({planMinutes})}/>)}
 {property('时间块锁定',task.planLocked?'已锁定':'未锁定',<button type="button" className="secondary compact" aria-pressed={!!task.planLocked} onClick={()=>patch({planLocked:!task.planLocked})}>{task.planLocked?'解除锁定':'锁定时间块'}</button>)}
 {property('任务积分',taskPoints(task)+' 分',<NumberField label="任务积分" unit="分" min={-MAX_POINTS} max={MAX_POINTS} value={taskPoints(task)} onCommit={points=>patch({points})}/>)}

 {property('提醒',reminderDates.length?reminderDates.length+' 项':'未设置',<ScheduleProperty kind="reminder" task={task} patch={patch} seriesLocked={seriesLocked} value={reminderDates.length?reminderDates.length+' 项':'未设置'}/>)}
 {property('重复',recurrenceLabels[task.repeat]||'不重复',<ScheduleProperty kind="repeat" task={task} patch={patch} seriesLocked={seriesLocked} value={recurrenceLabels[task.repeat]||'不重复'}/>)}
  </PropertyGrid>{reminderGroups.length>0&&<div className="detail-reminder-summary">{reminderGroups.map(([v,n])=><div className="inspector-reminder-row" key={v}><Clock size={13}/><span>{v.replace('T',' ')}</span>{n>1&&<small title="同一时间有多个独立提醒">×{n}</small>}</div>)}</div>}{task.repeat!=='none'&&(task.repeat!=='workdays'||task.repeatUntil||task.repeatCount>0)&&<div className="inspector-repeat-summary"><Repeat size={13}/><span>{task.repeat==='workdays'?'工作日':('间隔 '+(task.interval||1))}{task.repeatUntil?' · 截止 '+task.repeatUntil:''}{task.repeatCount?' · 最多 '+task.repeatCount+' 次':''}</span></div>}{focusDetails}</>),
 section("organization","组织与状态",Layers,<><PropertyGrid>
 {property('优先级',priorityValue(task.priority),<SmartSelect aria-label="优先级" value={task.priority} onValueChange={value=>patch({priority:+value})}>{priorityNames.map((n,i)=><SelectOption key={i} value={i}>{priorityValue(i)}</SelectOption>)}</SmartSelect>)}
 {property('清单',listValue(list),<SearchSelect aria-label="清单" value={task.listId} onValueChange={value=>patch({listId:value,sectionId:null})}>{data.lists.map(l=><SelectOption key={l.id} value={l.id} searchText={l.name}>{listValue(l)}</SelectOption>)}</SearchSelect>)}
 {property('分组',groupValue(taskGroup),<div className="property-inline-actions"><SearchSelect aria-label="分组" value={task.sectionId||''} onValueChange={value=>patch({sectionId:value||null})}><SelectOption value="" searchText="未分组">{groupValue(null)}</SelectOption>{list?.sections.map(s=><SelectOption key={s.id} value={s.id} searchText={s.name}>{groupValue(s)}</SelectOption>)}</SearchSelect>{list&&<button type="button" className="icon-button group-inline-action" aria-label="新建分组" title="新建分组" onClick={()=>onCreateGroup(list.id)}><Plus size={14}/></button>}{taskGroup&&<button type="button" className="icon-button group-inline-action" aria-label="重命名当前分组" title="重命名当前分组" onClick={()=>onRenameGroup(taskGroup,list.id)}><Pencil size={14}/></button>}</div>)}
 {property('状态',statusValue(status),<SmartSelect aria-label="状态" value={task.stage} onValueChange={value=>patch({stage:value})}><SelectOption value="todo">{statusValue("todo")}</SelectOption><SelectOption value="doing">{statusValue("doing")}</SelectOption></SmartSelect>)}
 </PropertyGrid></>),
 section("notes","备注与标签",FileText,<><div className="inspector-tag-row"><div className="detail-tags">{chosenTags.map(t=><span className="tag-chip chosen" key={t.id}>#{t.name}</span>)}{!chosenTags.length&&<small className="muted"><Tag size={13}/> 添加标签</small>}</div>{!locked&&<PropertyPopover label="编辑标签" chevron={false} triggerClassName="inspector-add-action" value={<Plus size={15}/>}>{close=><><h4>选择标签</h4><div className="detail-tags">{data.tags.map(t=><button type="button" key={t.id} className={'tag-chip '+(task.tags.includes(t.id)?'chosen':'')} aria-pressed={task.tags.includes(t.id)} onClick={()=>patch({tags:task.tags.includes(t.id)?task.tags.filter(x=>x!==t.id):[...task.tags,t.id]})}>#{t.name}</button>)}{!data.tags.length&&<small>先在侧栏创建标签</small>}</div><button type="button" className="secondary" onClick={close}>完成</button></>}</PropertyPopover>}</div><MarkdownNotes value={task.notes} onChange={notes=>patch({notes})} locked={locked}/></>),
 section("checklist","检查清单",ListChecks,<div className="inspector-checklist">
 {task.checklist.map(c=><div className="check-item" data-done={c.done} key={c.id}><CheckInput aria-label={c.text} checked={c.done} disabled={locked} onChange={e=>patch({checklist:task.checklist.map(x=>x.id===c.id?{...x,done:e.target.checked}:x)})}/>{locked?<span className="inspector-check-text">{c.text}</span>:<><EditableText value={c.text} label={"编辑检查项 "+c.text} onCommit={text=>patch({checklist:task.checklist.map(x=>x.id===c.id?{...x,text}:x)})}/><button type="button" className="icon-button inspector-check-remove" aria-label="删除检查项" onClick={()=>patch({checklist:task.checklist.filter(x=>x.id!==c.id)})}><X size={14}/></button></>}</div>)}
 {locked&&!checkTotal&&<p className="muted small inspector-empty">暂无检查项</p>}
 {!locked&&<form className="check-add" onSubmit={e=>{e.preventDefault();if(item.trim()){patch({checklist:[...task.checklist,{id:id(),text:item.trim(),done:false}]});setItem('')}}}><Plus size={16}/><input aria-label="新检查项" placeholder="添加检查项" value={item} onChange={e=>setItem(e.target.value)}/></form>}
 </div>,checkMeta),
 section("children","子任务",ListTree,<ChildTasks task={task} children={children} select={select} addChild={addChild} locked={locked}/>,<span>{children.length} 项</span>),
 section("relations","关联任务",Link2,<Relations task={task} data={data} patch={patch} select={select} locked={locked}/>,<span>{(task.dependsOn||[]).length} 前置</span>),
 <DetailSection key="resources" id="resources" title="链接与附件" icon={Paperclip} density={densities.resources||"full"} onDensityChange={mode=>changeDensity("resources",mode)} onMove={delta=>moveSection("resources",delta)}><TaskLinks task={task} patch={patch} locked={locked} compact/><Attachments scope={scope} taskId={task.id} locked={locked} compact onActivity={onAttachmentActivity}/></DetailSection>,
 <DetailSection key="activity" id="activity" title="活动与系列历史" icon={History} density={densities.activity||"full"} onDensityChange={mode=>changeDensity("activity",mode)} onMove={delta=>moveSection("activity",delta)}>
 <div className="inspector-subhead"><h3>活动记录 <small>{historyItems.length} 项</small><InfoTip label="活动记录说明">每项任务最多保留最近 {ACTIVITY_LIMIT} 条活动，且不超过 {ACTIVITY_BYTES/1024} KiB。超过容量后淘汰最早的事件。旧任务仅补充已有时间字段可证明的记录。</InfoTip></h3><div className="activity-filter"><SmartSelect className="activity-filter-trigger" aria-label="筛选活动记录" value={activityFilter} onValueChange={v=>{setActivityFilter(v);setActivityCount(10)}}>{[['all','全部'],['property','属性修改'],['schedule','时间安排'],['content','内容变更'],['relation','关联任务'],['lifecycle','生命周期'],['focus','专注']].map(([v,n])=><SelectOption key={v} value={v}>{n}</SelectOption>)}</SmartSelect></div></div>
 <ActivityTimeline entries={filteredActivity.slice(0,activityCount)} label="任务活动时间线" empty="暂无此类记录"/>
 {filteredActivity.length>activityCount&&<button type="button" className="text-link detail-history-toggle" onClick={()=>setActivityCount(n=>n+20)}>查看更多活动（剩余 {filteredActivity.length-activityCount} 项）</button>}
 {activityCount>10&&<button type="button" className="text-link detail-history-toggle" onClick={()=>setActivityCount(10)}>收起活动</button>}

 {hasSeries&&<div className="inspector-series-history"><div className="inspector-subhead"><h3>系列历史 <InfoTip label="系列历史说明">系列实例按照计划日期排列，并非实际完成时间。</InfoTip></h3><small>{seriesItems.length} 个实例</small></div>

 <ActivityTimeline entries={seriesItems.slice(0,historyOpen?12:3)} label="重复系列计划时间线" dateKind="schedule" empty="暂无其他实例"/>
 {seriesItems.length>3&&<button type="button" className="text-link detail-history-toggle" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?'收起历史':'查看更多历史（'+Math.min(seriesItems.length,12)+' 项）'}</button>}
 <button type="button" className="inspector-series-link" onClick={openSeries}><Repeat size={14}/><span>查看重复系列</span><ChevronRight size={14}/></button></div>}
 </DetailSection>
 ];

 return <><div className="detail-content" data-inspector="true" ref={detailRef}><div className="detail-title"><button className={'task-check p'+task.priority} disabled={!!task.deletedAt||task.status==='skipped'} aria-label={task.status==='completed'?'取消完成任务':'完成任务'} aria-pressed={task.status==='completed'} onClick={task.status==='completed'?reopen:finish}>{task.status==='completed'?'✓':''}</button><TaskTitle value={task.title} readOnly={locked} onFocus={()=>{titleSession.current="title:"+crypto.randomUUID()}} onChange={e=>patch({title:e.target.value},{typingSession:titleSession.current})} onBlur={()=>{if(!locked&&!task.title.trim())patch({title:'未命名任务'},{typingSession:titleSession.current});titleSession.current=null}}/></div>
 <div className="detail-mode-bar"><span className="detail-mode-summary">{locked?'只读详情':'任务概览'}</span>{!locked&&<small className="property-edit-hint">点击属性直接修改</small>}</div>
 {compactLayout&&<DetailNavigation order={sectionOrder}/>}
 <DndContext sensors={sensors} modifiers={[verticalOnly]} collisionDetection={closestCenter} onDragEnd={({active,over})=>{if(over)reorderSection(active.id,over.id)}}><SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}><div className="detail-section-stack">{sectionOrder.map(id=>sectionCards.find(card=>card.key===id))}</div></SortableContext></DndContext>
 <div className="detail-actions">{task.deletedAt?<button className="secondary" onClick={restore}>恢复任务</button>:<>{locked?<button className="secondary" onClick={reopen}>恢复为普通待办</button>:<button className="secondary" onClick={saveTemplate}><Copy size={15}/> 保存模板</button>}<button className="danger" onClick={remove}><Trash2 size={15}/> 移入回收站</button></>}</div></div>{compactLayout&&<nav className="mobile-detail-actions" aria-label="详情快捷操作"><button type="button" onClick={onClose}><X size={18}/><span>返回列表</span></button>{!locked&&<><button type="button" onClick={()=>revealPlan('date')}><CalendarDays size={18}/><span>安排</span></button><button type="button" onClick={()=>revealPlan("focus")}><Clock size={18}/><span>专注</span></button><button type="button" className="mobile-detail-primary" onClick={finish}><CheckCircle2 size={18}/><span>完成</span></button></>}{task.status==='completed'&&!task.deletedAt&&<button type="button" className="mobile-detail-primary" onClick={reopen}><CheckCircle2 size={18}/><span>取消完成</span></button>}{task.deletedAt&&<button type="button" className="mobile-detail-primary" onClick={restore}><CheckCircle2 size={18}/><span>恢复</span></button>}</nav>}</>
}

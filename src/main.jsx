import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Inbox,CalendarDays,CalendarRange,Layers,Repeat,AlertCircle,CheckCircle2,SkipForward,Plus,Search,PanelRightClose,PanelRightOpen,Settings,Trash2,Flag,ChevronDown,Menu,Sun,Moon,Monitor,Download,Undo2,X,ListTodo} from 'lucide-react';
import {STORAGE_KEY,id,dayKey,newTask,completeTask,reconcile,matches,readState,initialState} from './domain.js';
import './styles.css';

const views=[['today','今天',CalendarDays],['upcoming','最近七天',CalendarRange],['all','所有任务',Layers],['overdue','已过期',AlertCircle],['recurring','重复任务',Repeat],['completed','已完成',CheckCircle2],['skipped','已跳过',SkipForward]];
const priorityNames=['无优先级','低优先级','中优先级','高优先级'];
function bootstrap(){try{return {data:readState(localStorage),error:''}}catch(e){return {data:initialState(),error:'无法读取本地数据，已禁止自动覆盖。请先备份原始数据。'}}}
function App(){
 const [boot]=useState(bootstrap);
 const [data,setData]=useState(()=>({...boot.data,tasks:reconcile(boot.data.tasks)}));
 const [storageError,setStorageError]=useState(boot.error);
 const [view,setView]=useState('today'),[selected,setSelected]=useState(null),[query,setQuery]=useState(''),[draft,setDraft]=useState(''),[sort,setSort]=useState('date');
 const [detail,setDetail]=useState(true),[sidebar,setSidebar]=useState(false),[settings,setSettings]=useState(false),[listDraft,setListDraft]=useState(null),[undo,setUndo]=useState(null),[today,setToday]=useState(dayKey);
 const inputRef=useRef(null),searchRef=useRef(null);
 useEffect(()=>{if(boot.error)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));setStorageError('')}catch{setStorageError('本地保存失败，请立即导出备份。')}},[data,boot.error]);
 useEffect(()=>{document.documentElement.dataset.theme=data.theme},[data.theme]);
 useEffect(()=>{const tick=()=>{setToday(dayKey());setData(d=>{const tasks=reconcile(d.tasks);return tasks===d.tasks?d:{...d,tasks}})};const timer=setInterval(tick,30000);window.addEventListener('focus',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick)}},[]);
 useEffect(()=>{const handler=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();inputRef.current?.focus()}if(e.key==='Escape'){setQuery('');setSettings(false)}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[]);
 const tasks=data.tasks;
 const selectedTask=tasks.find(t=>t.id===selected);
 const currentList=data.lists.find(l=>l.id===view);
 const title=currentList?.name||views.find(v=>v[0]===view)?.[1]||'任务';
 const visible=useMemo(()=>tasks.filter(t=>query.trim()?t.status==='pending'&&(t.title+' '+t.notes).toLowerCase().includes(query.trim().toLowerCase()):matches(t,view,today)).sort((a,b)=>sort==='priority'?b.priority-a.priority:sort==='created'?b.createdAt.localeCompare(a.createdAt):(a.date||'9999').localeCompare(b.date||'9999')||b.priority-a.priority),[tasks,query,view,today,sort]);
 const count=v=>tasks.filter(t=>matches(t,v,today)).length;
 const patch=(taskId,fields)=>setData(d=>({...d,tasks:d.tasks.map(t=>t.id===taskId?{...t,...fields}:t)}));
 const changeView=v=>{setView(v);setQuery('');setSelected(null);setSidebar(false)};
 function add(e){e.preventDefault();if(!draft.trim())return;const task=newTask(draft,currentList?.id||'inbox',view==='today'?today:view==='upcoming'?new Date(Date.now()+86400000).toLocaleDateString('sv-SE'):'');setData(d=>({...d,tasks:[...d.tasks,task]}));setDraft('');if(!matches(task,view,today))setView(task.listId);setSelected(task.id);setDetail(true)}
 function finish(task){if(task.status!=='pending')return;setData(d=>({...d,tasks:completeTask(d.tasks,task.id,today)}));setSelected(null)}
 function remove(task){setUndo(task);setData(d=>({...d,tasks:d.tasks.filter(t=>t.id!==task.id)}));setSelected(null)}
 function restore(){if(!undo)return;setData(d=>({...d,tasks:d.tasks.some(t=>t.id===undo.id)?d.tasks:[...d.tasks,undo]}));setUndo(null)}
 function addList(e){e.preventDefault();const name=listDraft?.trim();if(!name)return;const list={id:id(),name,color:'#6784da'};setData(d=>({...d,lists:[...d.lists,list]}));setListDraft(null);changeView(list.id)}
 function exportData(){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='todo-'+today+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 const nav=(key,label,Icon,color)=> <button key={key} className={'nav-row '+(view===key&&!query?'active':'')} onClick={()=>changeView(key)}><Icon size={17} style={color?{color}:undefined}/><span>{label}</span><small>{count(key)||''}</small></button>;
 return <div className="app">
  <aside className={'sidebar '+(sidebar?'mobile-open':'')}>
   <div className="brand"><div className="brand-icon"><ListTodo size={23}/></div><div><strong>TODO</strong><small>个人工作空间</small></div></div>
   <div className="search"><Search size={15}/><input ref={searchRef} placeholder="搜索任务" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div>
   <nav aria-label="智能清单">{nav('inbox','收集箱',Inbox)}{views.slice(0,5).map(v=>nav(...v))}</nav>
   <div className="section-label"><span>我的清单</span><button className="icon-button" title="新建清单" aria-label="新建清单" onClick={()=>setListDraft('')}><Plus size={16}/></button></div>
   {data.lists.filter(l=>l.id!=='inbox').map(l=>nav(l.id,l.name,Layers,l.color))}
   {listDraft!==null&&<form className="list-form" onSubmit={addList}><input autoFocus aria-label="清单名称" placeholder="清单名称" value={listDraft} onChange={e=>setListDraft(e.target.value)}/><button type="submit" title="保存清单"><CheckCircle2 size={17}/></button><button type="button" onClick={()=>setListDraft(null)} title="取消"><X size={17}/></button></form>}
   <div className="section-label">历史记录</div>{views.slice(5).map(v=>nav(...v))}
   <div className="sidebar-bottom"><button className="nav-row" onClick={()=>setSettings(s=>!s)}><Settings size={17}/><span>设置</span></button><small>本地工作空间 · v0.1</small></div>
  </aside>
  <main className="workspace">
   <header className="toolbar"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={()=>setSidebar(s=>!s)}><Menu size={20}/></button><span className="breadcrumb">任务中心 <span>/</span> {query?'搜索':title}</span><div className="grow"/><button className="icon-button" aria-label="切换详情面板" onClick={()=>setDetail(d=>!d)}>{detail?<PanelRightClose size={19}/>:<PanelRightOpen size={19}/>}</button></header>
   {storageError&&<div role="alert" className="error">{storageError}<button onClick={exportData}>导出当前数据</button></div>}
   <section className="task-content">
    <div className="heading"><div><p className="eyebrow">WORKSPACE / TASKS</p><h1>{query?'搜索结果':title}</h1><p className="muted">{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date(today+'T12:00:00'))} · {visible.length} 项任务</p></div><label className="sort">排序 <select value={sort} onChange={e=>setSort(e.target.value)}><option value="date">日期</option><option value="priority">优先级</option><option value="created">创建时间</option></select></label></div>
    <form className="quick-add" onSubmit={add}><Plus size={20}/><input ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="添加任务，按 Enter 保存" aria-label="新任务名称"/><button type="submit" disabled={!draft.trim()}>添加</button></form>
    <div className="list-caption"><ChevronDown size={15}/><span>{['completed','skipped'].includes(view)?'历史任务':'任务列表'}</span><small>{visible.length}</small></div>
    {visible.length===0?<div className="empty"><div className="empty-icon"><CheckCircle2 size={30}/></div><h3>这里很清爽</h3><p>{query?'没有匹配的任务':'暂时没有任务，添加一项开始吧。'}</p></div>:<div className="tasks">{visible.map(t=><div key={t.id} className={'task-row '+(selected===t.id?'selected ':'')+(t.status!=='pending'?'historical':'')}><button className={'task-check p'+t.priority} disabled={t.status!=='pending'} aria-label={'完成 '+t.title} onClick={()=>finish(t)}>{t.status==='completed'?'✓':t.status==='skipped'?'–':''}</button><button className="task-body" onClick={()=>{setSelected(t.id);setDetail(true)}}><span>{t.title}</span><small>{data.lists.find(l=>l.id===t.listId)?.name||'收集箱'}{t.checklist.length?' · '+t.checklist.filter(c=>c.done).length+'/'+t.checklist.length:''}</small></button>{t.repeat!=='none'&&<Repeat size={14} className="muted"/>}{t.date&&<span className={'task-date '+(t.date<today&&t.status==='pending'?'late':'')}>{t.date===today?'今天':t.date.slice(5)}</span>}<button className="icon-button delete" title="删除任务" aria-label={'删除 '+t.title} onClick={()=>remove(t)}><Trash2 size={15}/></button></div>)}</div>}
   </section>
   <footer><span className="status-dot"/> {storageError?'未保存':'本地数据已保存'}<div className="grow"/> {count('today')} 项今日待办</footer>
  </main>
  {detail&&<aside className="details"><div className="detail-header"><span>任务详情</span><button className="icon-button" aria-label="关闭详情" onClick={()=>setDetail(false)}><X size={17}/></button></div>
   {selectedTask?<TaskDetail key={selectedTask.id} task={selectedTask} lists={data.lists} patch={p=>patch(selectedTask.id,p)} remove={()=>remove(selectedTask)} finish={()=>finish(selectedTask)}/>:<div className="detail-empty"><ListTodo size={28}/><p>选择任务查看详情</p></div>}</aside>}
  {undo&&<div className="toast" role="status">任务已删除 <button onClick={restore}><Undo2 size={15}/> 撤销</button><button className="icon-button" onClick={()=>setUndo(null)} aria-label="关闭撤销"><X size={16}/></button></div>}
  {settings&&<div className="modal-overlay" onClick={()=>setSettings(false)}><section className="modal" role="dialog" aria-modal="true" aria-label="设置" onClick={e=>e.stopPropagation()}><div className="detail-header"><h2>设置</h2><button className="icon-button" onClick={()=>setSettings(false)} aria-label="关闭设置"><X size={20}/></button></div><p className="muted">外观主题</p><div className="theme-options">{[['system','跟随系统',Monitor],['light','浅色',Sun],['dark','深色',Moon]].map(([v,n,Icon])=><button key={v} className={data.theme===v?'chosen':''} onClick={()=>setData(d=>({...d,theme:v}))}><Icon size={18}/>{n}</button>)}</div><hr/><h3>本地数据</h3><p className="muted">数据保存在此浏览器中。清除浏览器数据会删除任务，请定期导出。</p><button className="secondary" onClick={exportData}><Download size={16}/> 导出 JSON 备份</button>{boot.error&&<button className="secondary" onClick={()=>{try{const raw=localStorage.getItem(STORAGE_KEY);const url=URL.createObjectURL(new Blob([raw||''],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='todo-original-backup.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch{setStorageError('无法读取原始存储')}}}>下载原始存储</button>}</section></div>}
 </div>
}
function TaskDetail({task,lists,patch,remove,finish}){
 const [item,setItem]=useState('');
 const locked=task.status!=='pending';
 return <div className="detail-content"><div className="detail-title"><button className={'task-check p'+task.priority} disabled={locked} aria-label="完成任务" onClick={finish}>{task.status==='completed'?'✓':''}</button><textarea aria-label="任务标题" rows={2} value={task.title} readOnly={locked} onChange={e=>patch({title:e.target.value})} onBlur={()=>{if(!task.title.trim())patch({title:'未命名任务'})}}/></div>
 <fieldset disabled={locked}><label><span><CalendarDays size={16}/> 计划日期</span><input type="date" value={task.date} onChange={e=>patch({date:e.target.value,anchor:e.target.value?Number(e.target.value.slice(-2)):null,repeat:e.target.value?task.repeat:'none'})}/></label><label><span><Flag size={16}/> 优先级</span><select value={task.priority} onChange={e=>patch({priority:Number(e.target.value)})}>{priorityNames.map((n,i)=><option key={i} value={i}>{n}</option>)}</select></label><label><span><Layers size={16}/> 清单</span><select value={task.listId} onChange={e=>patch({listId:e.target.value})}>{lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label><span><Repeat size={16}/> 重复</span><select value={task.repeat} onChange={e=>patch({repeat:e.target.value,date:task.date||dayKey(),anchor:task.anchor||Number((task.date||dayKey()).slice(-2))})}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label>{task.repeat!=='none'&&<label><span>过期策略</span><select value={task.miss} onChange={e=>patch({miss:e.target.value})}><option value="keep">保留过期</option><option value="skip">跳过过期</option></select></label>}<hr/><h3>备注</h3><textarea className="notes" aria-label="任务备注" placeholder="添加任务描述…" value={task.notes} onChange={e=>patch({notes:e.target.value})}/><h3>检查清单 <small>{task.checklist.filter(c=>c.done).length}/{task.checklist.length}</small></h3>{task.checklist.map(c=><div className="check-item" key={c.id}><input type="checkbox" aria-label={c.text} checked={c.done} onChange={e=>patch({checklist:task.checklist.map(x=>x.id===c.id?{...x,done:e.target.checked}:x)})}/><span>{c.text}</span><button className="icon-button" aria-label="删除检查项" onClick={()=>patch({checklist:task.checklist.filter(x=>x.id!==c.id)})}><X size={14}/></button></div>)}<form className="check-add" onSubmit={e=>{e.preventDefault();if(item.trim()){patch({checklist:[...task.checklist,{id:id(),text:item.trim(),done:false}]});setItem('')}}}><Plus size={16}/><input aria-label="新检查项" placeholder="添加检查项" value={item} onChange={e=>setItem(e.target.value)}/></form></fieldset>
 <div className="detail-actions"><button className="danger" onClick={remove}><Trash2 size={15}/> 删除任务</button></div></div>
}
createRoot(document.getElementById('root')).render(<App/>);

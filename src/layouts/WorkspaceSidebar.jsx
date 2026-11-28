import React from 'react';
import {Inbox,Plus,X,Folder,Tag,Copy,ChevronRight,Filter,Workflow,FileText,Target} from 'lucide-react';
import {Disclosure} from '../design-system/Disclosure.jsx';
import {SidebarRow} from '../components/SidebarRow.jsx';
import {SidebarSortable} from './SidebarSortable.jsx';
import {Menu} from '../ui.jsx';
import {PanelHandle} from '../panel-layout.jsx';
import pkg from '../../package.json';
import './sidebar-sort.css';

function SidebarSection({id,title,open,toggle,bindings,actions,empty,children}){
 const contentId='sidebar-section-'+id;
 return <><div className="section-label sidebar-section-heading" data-empty-section={empty||undefined}>
  <button type="button" className="sidebar-section-toggle" {...bindings} aria-expanded={open} aria-controls={contentId} onClick={toggle} title="点击展开或收起，长按拖动排序；Alt+方向键移动"><ChevronRight className="disclosure-chevron" size={13}/><span>{title}</span></button>{actions}
 </div><Disclosure open={open} id={contentId}><div className="sidebar-section-content">{children}</div></Disclosure></>;
}
export function WorkspaceSidebar({sidebarOrder,setSidebarOrder,hiddenDesktop,favorites=[],archivedIds=[],changeView,collapsed,data,deleteEntity,editEntity,history,layout,legacySmartLists,listRow,nav,saveSmart,setCollapsed,setDialog,setSidebar,setSmartEditor,setToast,sidebar,smartLists,uid,view,views,module,onOpenWorkspace}){
 const toggle=id=>setCollapsed(c=>c.includes(id)?c.filter(x=>x!==id):[...c,id]);
 const listItems=lists=>lists.map(l=>({id:'list:'+l.id,label:l.name,render:()=>listRow(l)}));
 const rows=(scope,items,label)=> <SidebarSortable scope={scope} items={items} order={sidebarOrder} onOrder={setSidebarOrder} label={label}/>;
 const viewItems=items=>items.map(v=>({id:'view:'+v[0],label:v[1],render:()=>nav(...v)}));
 const available=l=>l.id!=='inbox'&&!favorites.some(x=>x.id===l.id)&&!archivedIds.includes(l.id);
 const inbox=data.lists.find(l=>l.id==='inbox');
 const mine=[
  {id:'list:inbox',label:inbox?.name||'收集箱',render:()=>nav('inbox',inbox?.name||'收集箱',Inbox,undefined,inbox,[{label:'编辑清单',run:()=>editEntity('list',inbox)}],'收集箱操作')},
  ...data.folders.map(f=>({id:'folder:'+f.id,label:f.name,render:()=> <>
   <SidebarRow label={f.name} icon={Folder} expanded={!collapsed.includes(f.id)} controls={'folder-content-'+f.id} leading={<ChevronRight className="disclosure-chevron" size={14}/>} onClick={()=>toggle(f.id)} items={[{label:'在此新建清单',run:()=>editEntity('list',null,f.id)},{label:'编辑文件夹',run:()=>editEntity('folder',f)},{label:'删除文件夹',run:()=>deleteEntity('folder',f),danger:true}]}/>
   <Disclosure open={!collapsed.includes(f.id)} id={'folder-content-'+f.id}><div className="nested">{rows('folder:'+f.id,listItems(data.lists.filter(l=>available(l)&&l.folderId===f.id)))}</div></Disclosure>
  </>})),
  ...listItems(data.lists.filter(l=>available(l)&&!l.folderId))
 ];
 const archived=data.lists.filter(l=>archivedIds.includes(l.id));
 const sections=[];
 const add=(id,title,children,actions=null,empty=false)=>sections.push({id,label:title,render:bindings=><SidebarSection id={id} title={title} open={!collapsed.includes('sidebar-section:'+id)} toggle={()=>toggle('sidebar-section:'+id)} bindings={bindings} actions={actions} empty={empty}>{children}</SidebarSection>});
 add('filters','任务筛选',rows('filters',viewItems(views)));
 add('smart','智能清单',<>{rows('smart',smartLists.map(f=>({id:'smart:'+f.id,label:f.name,render:()=>nav('smart:'+f.id,f.name,Filter,undefined,undefined,[{label:'编辑智能清单',run:()=>setSmartEditor(f)},{label:'删除智能清单',run:()=>{if(saveSmart(smartLists.filter(x=>x.id!==f.id))&&view==='smart:'+f.id)changeView('today')},danger:true}])})))}{legacySmartLists.some(f=>!data.smartLists?.some(x=>x.id===f.id))&&<button className="text-link save-search" onClick={()=>{const merged=[...smartLists,...legacySmartLists.filter(f=>!smartLists.some(x=>x.id===f.id))];if(saveSmart(merged,true))setToast('旧智能清单已纳入工作空间，原本机副本保留')}}>迁移本机智能清单</button>}</>,<><button className="icon-button" title="高级任务筛选" aria-label="高级任务筛选" onClick={()=>setSmartEditor({temporary:true,status:'all'})}><Filter size={15}/></button><button className="icon-button" aria-label="新建智能清单" onClick={()=>setSmartEditor({})}><Plus size={16}/></button></>,!smartLists.length);
 if(favorites.length)add('favorites','收藏清单',rows('favorites',listItems(favorites)));
 add('lists','我的清单',<>{rows('lists',mine,'我的清单')}{archived.length>0&&<><button className="nav-row archive-toggle" aria-expanded={!collapsed.includes('local-archive')} aria-controls="archive-content" onClick={()=>toggle('local-archive')}><ChevronRight className="disclosure-chevron" size={14}/><span>本机归档</span></button><Disclosure open={!collapsed.includes('local-archive')} id="archive-content"><div className="nested">{rows('archive',listItems(archived))}<small className="muted">仅收纳导航，任务仍参与计划与提醒。</small></div></Disclosure></>}</>,<Menu trigger={<button className="icon-button" aria-label="新建分类"><Plus size={16}/></button>} items={[{label:'新建清单',run:()=>editEntity('list')},{label:'新建文件夹',run:()=>editEntity('folder')}]}/>);
 add('tags','标签',rows('tags',data.tags.map(t=>({id:'tag:'+t.id,label:t.name,render:()=>nav('tag:'+t.id,t.name,Tag,t.color,undefined,[{label:'编辑标签',run:()=>editEntity('tag',t)},{label:'删除标签',run:()=>deleteEntity('tag',t),danger:true}])}))),<button className="icon-button" aria-label="新建标签" onClick={()=>editEntity('tag')}><Plus size={16}/></button>,!data.tags.length);
 add('history','历史记录',<nav className="history-nav" aria-label="历史记录">{rows('history',viewItems(history))}</nav>);
 add('tools','工作台工具',<nav aria-label="工作台工具">{rows('tools',[['workflow','自动化工作台',Workflow],['report','回顾报告',FileText],['goals','目标管理',Target]].map(([key,label,Icon])=>({id:key,label,render:()=> <button type="button" aria-label={'打开'+label} aria-current={module===key?'page':undefined} className={'nav-row '+(module===key?'active':'')} onClick={()=>onOpenWorkspace(key)}><Icon size={16}/><span>{label}</span></button>})))}</nav>);
 return <aside inert={hiddenDesktop||undefined} className={'sidebar '+(sidebar?'mobile-open':'')}><div className="brand"><div><strong>我的工作空间</strong><small>TODO · 个人计划</small></div><button className="icon-button mobile-menu" onClick={()=>setSidebar(false)} aria-label="关闭导航"><X size={18}/></button></div>
 <SidebarSortable items={sections} scope="sections" order={sidebarOrder} onOrder={setSidebarOrder} section className="sidebar-sections"/>
 <div className="sidebar-bottom"><SidebarRow label="任务模板" icon={Copy} count={data.templates.length} onClick={()=>setDialog('templates')}/><small>{uid?'云端账号空间':'本地访客空间'} · v{pkg.version}</small></div><PanelHandle kind="sidebar" value={layout.size.sidebar} onChange={v=>layout.change('sidebar',v)}/></aside>;
}

import React,{useEffect,useRef,useState} from 'react';
import {UserRound,RefreshCw,Palette,ListTodo,Timer,PanelsTopLeft,Keyboard,Database,Monitor,Bell} from 'lucide-react';
import './settings-layout.css';
const icons={account:UserRound,updates:RefreshCw,appearance:Palette,tasks:ListTodo,focus:Timer,components:PanelsTopLeft,shortcuts:Keyboard,data:Database,platform:Monitor,notifications:Bell};
const descriptions={account:'账号、同步状态和跨设备偏好',updates:'当前版本、更新渠道与安装状态',appearance:'主题、文字、密度与工作台布局',tasks:'任务默认值及清单显示方式',focus:'专注记录和智能番茄规划',components:'查看公共控件与交互状态',shortcuts:'应用操作与任务列表快捷键',data:'导入、导出、备份及本机附件',platform:'本机系统能力与后台行为',notifications:'系统提醒及权限'};
export function SettingsSection({id,title,children}){
 return <section id={'settings-'+id} className="settings-section" aria-label={id==='updates'?undefined:title}>
  <header className="settings-section-heading"><h2>{title}</h2><p>{descriptions[id]}</p></header>
  <div className="settings-section-body">{children}</div>
 </section>
}
export function SettingsGroup({title,children,description}){
 return <section className="settings-group"><h3>{title}</h3>{description&&<p className="muted small">{description}</p>}{children}</section>
}
export function SettingsLayout({children}){
 const sections=React.Children.toArray(children).filter(React.isValidElement),root=useRef(null),content=useRef(null);
 const [active,setActive]=useState(sections[0]?.props.id);
 const go=id=>{
  const pane=content.current,target=root.current?.querySelector('#settings-'+id);if(!pane||!target)return;
  pane.scrollTo({top:pane.scrollTop+target.getBoundingClientRect().top-pane.getBoundingClientRect().top-16,behavior:'instant'});
  setActive(id);
 };
 useEffect(()=>{
  const pane=content.current;if(!pane)return;
  const update=()=>{
   const top=pane.getBoundingClientRect().top+20;
   const groups=[...pane.querySelectorAll('.settings-section')];
   const current=groups.filter(g=>g.getBoundingClientRect().top<=top).at(-1)||groups[0];
   if(current)setActive(current.id.replace('settings-',''));
  };
  pane.addEventListener('scroll',update,{passive:true});update();
  return()=>pane.removeEventListener('scroll',update)
 },[]);
 useEffect(()=>{
  const nav=root.current?.querySelector('.settings-navigation'),button=nav?.querySelector('[aria-current="location"]');
  if(!nav||!button)return;
  const b=button.getBoundingClientRect(),n=nav.getBoundingClientRect();
  if(matchMedia('(max-width:860px)').matches){if(b.left<n.left)nav.scrollLeft-=n.left-b.left;else if(b.right>n.right)nav.scrollLeft+=b.right-n.right}
  else{if(b.top<n.top)nav.scrollTop-=n.top-b.top;else if(b.bottom>n.bottom)nav.scrollTop+=b.bottom-n.bottom}
 },[active]);
 return <div className="settings-layout" ref={root}>
  <nav className="settings-navigation" aria-label="设置分类">{sections.map(({props:{id,title}})=>{const Icon=icons[id];return <button type="button" key={id} aria-current={id===active?'location':undefined} className={id===active?'active':''} onClick={()=>go(id)}>{Icon&&<Icon size={16} aria-hidden="true"/>}<span>{title}</span></button>})}</nav>
  <div className="settings-sections" ref={content} role="region" aria-label="设置内容" tabIndex={0}>{sections}</div>
 </div>
}

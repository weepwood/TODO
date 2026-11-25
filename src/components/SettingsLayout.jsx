import React,{useEffect,useRef,useState} from 'react';
export function SettingsSection({id,title,children}){
 return <section id={'settings-'+id} className="settings-section" aria-label={id==='updates'?undefined:title}>{children}</section>
}
export function SettingsLayout({children}){
 const sections=React.Children.toArray(children).filter(React.isValidElement),root=useRef(null);
 const [active,setActive]=useState(sections[0]?.props.id);
 useEffect(()=>{
  const dialog=root.current?.closest('.dialog');if(!dialog)return;
  const update=()=>{
   const nav=root.current.querySelector('.settings-navigation'),header=dialog.querySelector('.dialog-head');
   const top=dialog.getBoundingClientRect().top+(header?.offsetHeight||0)+(matchMedia('(max-width:860px)').matches?(nav?.offsetHeight||0):0)+16;
   const groups=[...root.current.querySelectorAll('.settings-section')];
   const current=groups.filter(g=>g.getBoundingClientRect().top<=top).at(-1)||groups[0];
   if(current)setActive(current.id.replace('settings-',''));
  };
  dialog.addEventListener('scroll',update,{passive:true});update();
  return()=>dialog.removeEventListener('scroll',update)
 },[]);
 return <div className="settings-layout" ref={root}>
  <nav className="settings-navigation" aria-label="设置分类">{sections.map(({props:{id,title}})=><button type="button" key={id} aria-current={id===active?'location':undefined} className={id===active?'active':''} onClick={()=>{setActive(id);root.current?.querySelector('#settings-'+id)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}}>{title}</button>)}</nav>
  <div className="settings-sections">{sections}</div>
 </div>
}

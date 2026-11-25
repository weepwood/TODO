import React,{useEffect,useRef,useState} from 'react';
export function SettingsSection({id,title,children}){
 return <section id={'settings-'+id} className="settings-section" aria-label={id==='updates'?undefined:title}>{children}</section>
}
export function SettingsLayout({children}){
 const sections=React.Children.toArray(children).filter(React.isValidElement),root=useRef(null);
 const [active,setActive]=useState(sections[0]?.props.id);
 const offset=dialog=>{const header=dialog.querySelector('.dialog-head'),nav=root.current?.querySelector('.settings-navigation');return (header?.offsetHeight||0)+(matchMedia('(max-width:860px)').matches?(nav?.offsetHeight||0):0)+12};
 const go=id=>{
  const dialog=root.current?.closest('.dialog'),target=root.current?.querySelector('#settings-'+id);if(!dialog||!target)return;
  setActive(id);
  // Scroll only the dialog, not its outer document or horizontal navigation.
  dialog.scrollTo({top:dialog.scrollTop+target.getBoundingClientRect().top-dialog.getBoundingClientRect().top-offset(dialog),behavior:'instant'});
 };
 useEffect(()=>{
  const dialog=root.current?.closest('.dialog');if(!dialog)return;
  const update=()=>{
   const top=dialog.getBoundingClientRect().top+offset(dialog)+3;
   const groups=[...root.current.querySelectorAll('.settings-section')];
   const current=groups.filter(g=>g.getBoundingClientRect().top<=top).at(-1)||groups[0];
   if(current)setActive(current.id.replace('settings-',''));
  };
  dialog.addEventListener('scroll',update,{passive:true});update();
  return()=>dialog.removeEventListener('scroll',update)
 },[]);
 useEffect(()=>{
  const nav=root.current?.querySelector('.settings-navigation'),button=nav?.querySelector('[aria-current="location"]');
  if(nav&&button&&matchMedia('(max-width:860px)').matches){
   const left=button.getBoundingClientRect().left-nav.getBoundingClientRect().left+nav.scrollLeft;
   if(left<nav.scrollLeft)nav.scrollLeft=left;
   else if(left+button.offsetWidth>nav.scrollLeft+nav.clientWidth)nav.scrollLeft=left+button.offsetWidth-nav.clientWidth;
  }
 },[active]);
 return <div className="settings-layout" ref={root}>
  <nav className="settings-navigation" aria-label="设置分类">{sections.map(({props:{id,title}})=><button type="button" key={id} aria-current={id===active?'location':undefined} className={id===active?'active':''} onClick={()=>go(id)}>{title}</button>)}</nav>
  <div className="settings-sections">{sections}</div>
 </div>
}

import React,{useState,useLayoutEffect,useRef} from 'react';
import {springStep} from '../../design-system/motion.js';
import {Ellipsis,Settings,Bell,Command,Workflow,FileText,Target,Activity} from 'lucide-react';
import {Modal} from '../../ui.jsx';
const primary=['tasks','calendar','planner','stats'];
export function MobileNav({modules,module,onModule,onDialog}){
 const [more,setMore]=useState(false);
 const index=Math.max(0,primary.includes(module)?primary.indexOf(module):4),indicator=useRef(null),state=useRef({position:index,velocity:0});
 useLayoutEffect(()=>{
  const el=indicator.current;if(!el)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,last=performance.now();
  const paint=()=>el.style.setProperty('--nav-position',String(state.current.position));
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;state.current={position:index,velocity:0};paint()};
  const tick=now=>{frame=0;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
   state.current=springStep(state.current.position,state.current.velocity,index,dt);paint();
   if(Math.abs(state.current.position-index)<.001&&Math.abs(state.current.velocity)<.01){stop();return}frame=requestAnimationFrame(tick);
  };
  const change=()=>{if(media.matches)stop()};
  if(media.matches)stop();else{paint();frame=requestAnimationFrame(tick)}
  media.addEventListener('change',change);
  return()=>{if(frame)cancelAnimationFrame(frame);media.removeEventListener('change',change)};
 },[index]);

 return <nav className="rail mobile-nav" aria-label="移动端主导航" style={{"--nav-index":index}}><span ref={indicator} className="mobile-nav-indicator" aria-hidden="true"/>
 {primary.map(key=>{const [,label,Icon]=modules.find(m=>m[0]===key);return <button key={key} className={module===key?'active':''} aria-label={label} aria-pressed={module===key} onClick={()=>onModule(key)}><Icon size={21}/><span>{label}</span></button>})}
 <button aria-label="更多" aria-haspopup="dialog" aria-expanded={more} aria-pressed={!primary.includes(module)} className={!primary.includes(module)?'active':''} onClick={()=>setMore(true)}><Ellipsis size={21}/><span>更多</span></button>
 <Modal open={more} title="工作空间" sheet className="mobile-more-sheet" onClose={()=>setMore(false)}><div className="mobile-more-grid">{modules.filter(m=>!primary.includes(m[0])).map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} aria-pressed={module===key} onClick={()=>{setMore(false);onModule(key)}}><Icon size={21}/>{label}</button>)}{[['workflow','自动化工作台',Workflow],['report','回顾报告',FileText],['goals','目标管理',Target],['activity','活动分析',Activity]].map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} aria-pressed={module===key} onClick={()=>{setMore(false);onModule(key)}}><Icon size={21}/>{label}</button>)}{[['settings','设置',Settings],['notifications','提醒',Bell],['command','命令面板',Command]].map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} onClick={()=>{setMore(false);onDialog(key)}}><Icon size={21}/>{label}</button>)}</div></Modal>
 </nav>
}

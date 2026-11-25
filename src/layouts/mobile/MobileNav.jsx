import React,{useState} from 'react';
import {Ellipsis,Settings,Bell,Command} from 'lucide-react';
import {Modal} from '../../ui.jsx';
const primary=['tasks','calendar','planner','stats'];
export function MobileNav({modules,module,onModule,onDialog}){
 const [more,setMore]=useState(false);
 return <nav className="rail mobile-nav" aria-label="移动端主导航">
 {primary.map(key=>{const [,label,Icon]=modules.find(m=>m[0]===key);return <button key={key} className={module===key?'active':''} aria-label={label} aria-pressed={module===key} onClick={()=>onModule(key)}><Icon size={21}/><span>{label}</span></button>})}
 <button aria-label="更多" className={!primary.includes(module)?'active':''} onClick={()=>setMore(true)}><Ellipsis size={21}/><span>更多</span></button>
 <Modal open={more} title="工作空间" className="mobile-more-sheet" onClose={()=>setMore(false)}><div className="mobile-more-grid">{modules.filter(m=>!primary.includes(m[0])).map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} onClick={()=>{setMore(false);onModule(key)}}><Icon size={21}/>{label}</button>)}{[['settings','设置',Settings],['notifications','提醒',Bell],['command','命令面板',Command]].map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} onClick={()=>{setMore(false);onDialog(key)}}><Icon size={21}/>{label}</button>)}</div></Modal>
 </nav>
}

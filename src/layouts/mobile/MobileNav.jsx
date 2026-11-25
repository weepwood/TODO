import React,{useState} from 'react';
import {Ellipsis,Settings,Bell,Command,Workflow,FileText} from 'lucide-react';
import {Modal} from '../../ui.jsx';
const primary=['tasks','calendar','planner','stats'];
export function MobileNav({modules,module,onModule,onDialog}){
 const [more,setMore]=useState(false);
 return <nav className="rail mobile-nav" aria-label="移动端主导航" style={{"--nav-index":Math.max(0,primary.includes(module)?primary.indexOf(module):4)}}><span className="mobile-nav-indicator" aria-hidden="true"/>
 {primary.map(key=>{const [,label,Icon]=modules.find(m=>m[0]===key);return <button key={key} className={module===key?'active':''} aria-label={label} aria-pressed={module===key} onClick={()=>onModule(key)}><Icon size={21}/><span>{label}</span></button>})}
 <button aria-label="更多" aria-haspopup="dialog" aria-expanded={more} aria-pressed={!primary.includes(module)} className={!primary.includes(module)?'active':''} onClick={()=>setMore(true)}><Ellipsis size={21}/><span>更多</span></button>
 <Modal open={more} title="工作空间" sheet className="mobile-more-sheet" onClose={()=>setMore(false)}><div className="mobile-more-grid">{modules.filter(m=>!primary.includes(m[0])).map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} aria-pressed={module===key} onClick={()=>{setMore(false);onModule(key)}}><Icon size={21}/>{label}</button>)}{[['workflow','自动化工作台',Workflow],['report','回顾报告',FileText]].map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} aria-pressed={module===key} onClick={()=>{setMore(false);onModule(key)}}><Icon size={21}/>{label}</button>)}{[['settings','设置',Settings],['notifications','提醒',Bell],['command','命令面板',Command]].map(([key,label,Icon])=><button className="secondary" key={key} aria-label={label} onClick={()=>{setMore(false);onDialog(key)}}><Icon size={21}/>{label}</button>)}</div></Modal>
 </nav>
}

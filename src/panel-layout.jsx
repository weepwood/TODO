import React,{useState,useRef,useEffect} from 'react';
const KEY='todo-panel-layout-v1';
const DEFAULT={sidebar:228,detail:350};
export function clampPanel(kind,value,viewport=1440,other=228){
 const min=kind==='sidebar'?176:280,max=Math.max(min,Math.min(kind==='sidebar'?340:540,viewport-52-320-other));
 return Math.round(Math.min(max,Math.max(min,Number.isFinite(value)?value:DEFAULT[kind])));
}
export function usePanelLayout(storage,{module='tasks',detailVisible=true,sidebarVisible=true}={}){
 const [layouts,setLayouts]=useState(()=>{try{const raw=JSON.parse(storage.getItem(KEY)||'{}'),normalize=v=>({sidebar:clampPanel('sidebar',v?.sidebar,2000,350),detail:clampPanel('detail',v?.detail,2000,228)});return {tasks:normalize(raw),...Object.fromEntries(Object.entries(raw.modules||{}).filter(([key])=>['calendar','board','matrix','planner','focus','habits','stats','workflow','goals','report'].includes(key)).map(([key,v])=>[key,normalize(v)]))}}catch{return {tasks:DEFAULT}}});
 const size=layouts[module]||layouts.tasks||DEFAULT;
 const [viewport,setViewport]=useState(()=>window.innerWidth);
 useEffect(()=>{const update=()=>setViewport(window.innerWidth);window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update)},[]);
 const update=fn=>setLayouts(all=>({...all,[module]:fn(all[module]||all.tasks||DEFAULT)}));
 const change=(kind,value)=>update(s=>({...s,[kind]:clampPanel(kind,value,viewport,kind==='sidebar'?(detailVisible?s.detail:0):(sidebarVisible?s.sidebar:0))}));
 const latest=useRef(layouts);latest.current=layouts;
 const persist=all=>{try{const {tasks,...modules}=all;storage.setItem(KEY,JSON.stringify({...tasks,modules}))}catch{}};
 useEffect(()=>{const save=()=>persist(latest.current);window.addEventListener('pagehide',save);return()=>{window.removeEventListener('pagehide',save);save()}},[storage]);
 useEffect(()=>{const timer=setTimeout(()=>persist(layouts),180);return()=>clearTimeout(timer)},[layouts,storage]);
 const effective={sidebar:clampPanel('sidebar',size.sidebar,viewport,detailVisible?size.detail:0),detail:clampPanel('detail',size.detail,viewport,sidebarVisible?size.sidebar:0)};return {size:effective,storedSize:size,restoreSize:(target,value)=>setLayouts(all=>({...all,[target]:{sidebar:clampPanel("sidebar",value.sidebar,2000,350),detail:clampPanel("detail",value.detail,2000,228)}})),change,applyPreset:id=>update(()=>id==="wide"?{sidebar:228,detail:540}:DEFAULT),reset:()=>update(()=>DEFAULT),style:{'--user-sidebar':effective.sidebar+'px','--user-detail':effective.detail+'px'}};
}
export function PanelHandle({kind,value,onChange}){
 const drag=useRef(null),frame=useRef(0),sign=kind==='sidebar'?1:-1;const latest=useRef(onChange);latest.current=onChange;
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);if(drag.current)document.body.classList.remove('resizing-panels')},[]);
 const finish=(e,cancel=false)=>{const active=drag.current;if(!active||e?.pointerId!==active.pointerId)return;cancelAnimationFrame(frame.current);frame.current=0;drag.current=null;latest.current(cancel?active.value:active.value+(e.clientX-active.x)*sign);document.body.classList.remove('resizing-panels')};
 return <div className={'panel-handle handle-'+kind} role="separator" aria-orientation="vertical" aria-label={kind==='sidebar'?'调整清单栏宽度':'调整详情栏宽度'} aria-valuemin={kind==='sidebar'?176:280} aria-valuemax={kind==='sidebar'?340:540} aria-valuenow={value} tabIndex={0}
 onPointerDown={e=>{if(e.button!==0||drag.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,value,pointerId:e.pointerId};document.body.classList.add('resizing-panels')}}
 onPointerMove={e=>{if(drag.current?.pointerId===e.pointerId){drag.current.next=drag.current.value+(e.clientX-drag.current.x)*sign;if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;if(drag.current)latest.current(drag.current.next)})}}}
 onPointerUp={e=>finish(e)} onLostPointerCapture={e=>finish(e,true)} onPointerCancel={e=>finish(e,true)}
 onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onChange(value+(e.key==='ArrowRight'?16:-16)*sign)}else if(e.key==='Home'||e.key==='End'){e.preventDefault();onChange(e.key==='Home'?0:9999)}}}
 onDoubleClick={()=>onChange(DEFAULT[kind])}/>;
}

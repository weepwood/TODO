import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {Search,ChevronRight,Command,ListTodo,Layers,X} from 'lucide-react';
import {Modal} from './ui.jsx';
import {rankCommands,readRecentCommands,rememberCommand,commandKind,scopeCommands} from './command-search.js';
export function CommandPalette({open,onClose,entries,storage}){
 const [query,setQuery]=useState(''),[scope,setScope]=useState('all'),[active,setActive]=useState(0),[recent,setRecent]=useState(()=>readRecentCommands(storage));const list=useId(),ref=useRef(null);
 const results=useMemo(()=>rankCommands(scopeCommands(entries,scope),query,60,recent),[entries,query,recent,scope]),index=Math.min(active,Math.max(0,results.length-1)),selected=results[index];
 useEffect(()=>{if(open){setQuery('');setActive(0);setScope('all')}},[open]);
 useEffect(()=>{ref.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'})},[index,query,scope]);
 function run(entry){if(entry){setRecent(rememberCommand(storage,entry,recent));onClose();entry.run()}}
 return <Modal open={open} onClose={onClose} title="命令面板" className="command-palette" description="搜索操作、清单与任务，支持非连续字符；最近使用优先。">
 <div className="palette-search"><Search size={17}/><input autoFocus role="combobox" aria-label="搜索命令与任务" aria-expanded="true" aria-controls={list} aria-autocomplete="list" aria-activedescendant={selected?list+'-'+index:undefined} value={query} placeholder="搜索命令、任务或清单…" onChange={e=>{setQuery(e.target.value);setActive(0)}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();setActive(e.key==='Home'?0:e.key==='End'?Math.max(0,results.length-1):Math.max(0,Math.min(results.length-1,index+(e.key==='ArrowDown'?1:-1))))}else if(e.key==='Enter'){e.preventDefault();run(selected)}}}/>{query&&<button type="button" className="icon-button" aria-label="清空命令搜索" onClick={()=>{setQuery('');setActive(0)}}><X size={16}/></button>}</div>
 <nav className="palette-scopes" aria-label="命令搜索范围">{[['all','全部'],['task','任务'],['list','清单'],['command','操作']].map(([id,label])=><button type="button" key={id} aria-pressed={scope===id} onClick={()=>{setScope(id);setActive(0)}}>{label}</button>)}</nav>
 <div className="palette-results" role="listbox" id={list} ref={ref}>{results.map((entry,i)=><div id={list+'-'+i} key={entry.id||entry.name} role="option" aria-selected={i===index} data-active={i===index} className="palette-option" onPointerMove={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>run(entry)}>{commandKind(entry)==='task'?<ListTodo size={16}/>:commandKind(entry)==='list'?<Layers size={16}/>:<Command size={16}/>}<span><strong>{entry.name}</strong>{(entry.detail||(!query&&recent.includes(entry.id||entry.name)))&&<small>{entry.detail}{!query&&recent.includes(entry.id||entry.name)?' · 最近使用':''}</small>}</span><ChevronRight size={14}/></div>)}{!results.length&&<p className="muted palette-empty">没有匹配结果</p>}</div>
 <div className="palette-footer"><span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span><span>{results.length} 项结果（最多 60 项）</span></div></Modal>
}

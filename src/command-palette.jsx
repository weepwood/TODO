import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {Search,ChevronRight,Command,ListTodo} from 'lucide-react';
import {Modal} from './ui.jsx';
import {rankCommands,readRecentCommands,rememberCommand} from './command-search.js';
export function CommandPalette({open,onClose,entries,storage}){
 const [query,setQuery]=useState(''),[active,setActive]=useState(0),[recent,setRecent]=useState(()=>readRecentCommands(storage));const list=useId(),ref=useRef(null);
 const results=useMemo(()=>rankCommands(entries,query,60,recent),[entries,query,recent]),index=Math.min(active,Math.max(0,results.length-1)),selected=results[index];
 useEffect(()=>{if(open){setQuery('');setActive(0)}},[open]);
 useEffect(()=>{ref.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'})},[index,query]);
 function run(entry){if(entry){setRecent(rememberCommand(storage,entry,recent));onClose();entry.run()}}
 return <Modal open={open} onClose={onClose} title="命令面板" className="command-palette" description="搜索操作、清单与任务，支持非连续字符；最近使用优先。">
 <div className="palette-search"><Search size={17}/><input autoFocus role="combobox" aria-label="搜索命令与任务" aria-expanded="true" aria-controls={list} aria-autocomplete="list" aria-activedescendant={selected?list+'-'+index:undefined} value={query} placeholder="搜索命令、任务或清单…" onChange={e=>{setQuery(e.target.value);setActive(0)}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();setActive(e.key==='Home'?0:e.key==='End'?Math.max(0,results.length-1):Math.max(0,Math.min(results.length-1,index+(e.key==='ArrowDown'?1:-1))))}else if(e.key==='Enter'){e.preventDefault();run(selected)}}}/></div>
 <div className="palette-results" role="listbox" id={list} ref={ref}>{results.map((entry,i)=><div id={list+'-'+i} key={entry.id||entry.name} role="option" aria-selected={i===index} data-active={i===index} className="palette-option" onPointerMove={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>run(entry)}>{entry.kind==='task'?<ListTodo size={16}/>:<Command size={16}/>}<span><strong>{entry.name}</strong>{(entry.detail||(!query&&recent.includes(entry.id||entry.name)))&&<small>{entry.detail}{!query&&recent.includes(entry.id||entry.name)?' · 最近使用':''}</small>}</span><ChevronRight size={14}/></div>)}{!results.length&&<p className="muted palette-empty">没有匹配结果</p>}</div>
 <div className="palette-footer"><span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span><span>{results.length} 项结果（最多 60 项）</span></div></Modal>
}

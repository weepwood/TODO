import React,{useState,useRef,useId,useEffect,useMemo} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {Check,ChevronDown,Search} from 'lucide-react';
import {useFieldControl} from '../design-system/FieldFeedback.jsx';
import {useTransientPopover,popoverGeometry} from '../design-system/popover.js';
import {filterOptions} from '../core/search-options.js';

// Same value contract as SmartSelect; Radix supplies positioning and dismissal.
// Explicit searchText keeps filtering independent of icon/rendered JSX.
export function SearchSelect({value,onValueChange,children,disabled=false,'aria-label':label,id,className=''}){
 const feedback=useFieldControl(),uid=useId(),input=useRef(null),list=useRef(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const options=useMemo(()=>React.Children.toArray(children).filter(React.isValidElement).map(o=>({value:String(o.props.value??''),label:o.props.children,searchText:o.props.searchText??(typeof o.props.children==='string'?o.props.children:''),disabled:!!o.props.disabled})),[children]);
 const selected=options.find(o=>o.value===String(value??''));
 const matches=useMemo(()=>filterOptions(options,query),[options,query]);
 const visible=matches.slice(0,100),selectable=visible.filter(o=>!o.disabled);
 const current=selectable[Math.min(active,Math.max(0,selectable.length-1))];
 const optionId=o=>uid+'-option-'+visible.indexOf(o);
 const toggle=next=>{if(next){setQuery('');setActive(0)}setOpen(next)};
 useTransientPopover(open,()=>toggle(false));
 useEffect(()=>{if(open&&current)list.current?.querySelector('[data-active=true]')?.scrollIntoView({block:'nearest'})},[open,active,query]);
 function choose(o){if(!o||o.disabled)return;if(o.value!==String(value??''))onValueChange?.(o.value);toggle(false)}
 function keys(e){
  if(e.nativeEvent.isComposing||e.keyCode===229)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,Math.min(selectable.length-1,i+(e.key==='ArrowDown'?1:-1))))}
  else if(e.key==='Enter'){e.preventDefault();choose(current)}
 }
 return <Popover.Root open={open} onOpenChange={toggle}>
 <Popover.Trigger asChild><button {...feedback} id={id??feedback.id} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?uid:undefined} disabled={disabled} className={'smart-select-trigger search-select-trigger '+className} data-value={String(value??'')} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();toggle(true)}}}><span className="search-select-value">{selected?.label??'请选择'}</span><ChevronDown className="smart-select-chevron" size={15}/></button></Popover.Trigger>
 <Popover.Portal><Popover.Content {...popoverGeometry} aria-label={label+"搜索选择"} className="smart-select-content search-select-content" onOpenAutoFocus={e=>{e.preventDefault();input.current?.focus()}}>
 <div className="search-select-input"><Search size={15} aria-hidden="true"/><input ref={input} role="searchbox" aria-label={'搜索'+label} aria-controls={uid} aria-activedescendant={current?optionId(current):undefined} placeholder={'搜索'+label+'…'} value={query} onChange={e=>{setQuery(e.target.value);setActive(0)}} onKeyDown={keys}/></div>
 <div ref={list} id={uid} role="listbox" aria-label={label+'选项'} className="smart-select-viewport search-select-options">{visible.map(o=><div key={o.value} id={optionId(o)} role="option" aria-selected={o.value===String(value??'')} aria-disabled={o.disabled||undefined} className="smart-select-option" data-option-value={o.value} data-active={o===current||undefined} onPointerMove={e=>{if(e.pointerType==="mouse"&&!o.disabled)setActive(selectable.indexOf(o))}} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(o)}><span>{o.label}</span>{o.value===String(value??'')&&<Check className="smart-select-check" size={15}/>}</div>)}</div>
 {!matches.length&&<div className="search-select-empty" role="status">未找到匹配项</div>}
 {matches.length>visible.length&&<div className="search-select-empty" role="status">显示前 100 项，请继续搜索缩小范围</div>}
 </Popover.Content></Popover.Portal></Popover.Root>
}

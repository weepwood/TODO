import React,{useState,useId,useEffect,useRef} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {ChevronDown} from 'lucide-react';
import {useTransientPopover,popoverGeometry} from '../design-system/popover.js';

// The label and value occupy the same grid cell throughout interaction.
export function EditableProperty({label,value,readOnly=false,children}){
 const labelId=useId();
 return <div className="editable-property" data-readonly={readOnly||undefined}>
  <span className="property-label" id={labelId}>{label}</span>
  <div className="property-value" aria-labelledby={labelId}>{readOnly?<span className="property-readonly">{value??'—'}</span>:children}</div>
 </div>
}
export function PropertyGrid({children}){return <div className="property-grid">{children}</div>}
export function PropertyPopover({label,value,children,className='',chevron=true,triggerClassName='',dialogLabel}){
 const [open,setOpen]=useState(false);
 useTransientPopover(open,()=>setOpen(false));
 return <Popover.Root open={open} onOpenChange={setOpen}>
  <Popover.Trigger asChild><button type="button" className={'property-trigger '+triggerClassName} aria-label={label}><span>{value}</span>{chevron&&<ChevronDown size={14} aria-hidden="true"/>}</button></Popover.Trigger>
  <Popover.Portal><Popover.Content className={'property-popover '+className} aria-label={dialogLabel||label+'设置'} {...popoverGeometry}>{open&&children(()=>setOpen(false))}</Popover.Content></Popover.Portal>
 </Popover.Root>
}

// A quiet editable text value; valid blur/Enter commits, Escape discards.
export function EditableText({value,onCommit,label}){
 const [draft,setDraft]=useState(value),[editing,setEditing]=useState(false);
 const initial=useRef(value),cancelled=useRef(false);
 useEffect(()=>{if(!editing)setDraft(value)},[value,editing]);
 return <input type="text" className="property-text-input" aria-label={label} value={draft}
 onFocus={()=>{initial.current=value;cancelled.current=false;setEditing(true)}}
 onChange={e=>setDraft(e.target.value)}
 onBlur={()=>{setEditing(false);const next=draft.trim();if(!cancelled.current&&next&&initial.current===value&&next!==value)onCommit(next);else setDraft(value)}}
 onKeyDown={e=>{if(e.nativeEvent.isComposing||e.keyCode===229)return;if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelled.current=true;e.currentTarget.blur()}}}/>
}

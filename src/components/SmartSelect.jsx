import React,{useEffect,useState} from 'react';
import * as Select from '@radix-ui/react-select';
import {Check,ChevronDown,ChevronUp} from 'lucide-react';

// Declarative options are consumed by SmartSelect, never rendered as native options.
export function SelectOption(){return null}
const encode=value=>'v:'+String(value??'');
export function SmartSelect({value,onValueChange,children,disabled=false,'aria-label':label,'aria-labelledby':labelledBy,className='',id}){
 const options=React.Children.toArray(children).filter(React.isValidElement);
 const selected=options.find(o=>String(o.props.value??'')===String(value??''));
 const placeholder=selected?.props.disabled&&String(value??'')==='';
 const [open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const close=()=>setOpen(false);window.addEventListener('todo-close-select',close);return()=>window.removeEventListener('todo-close-select',close)},[open]);
 return <Select.Root value={selected&&!placeholder?encode(value):''} onValueChange={v=>onValueChange?.(v.slice(2))} disabled={disabled} open={open} onOpenChange={setOpen}>
  <Select.Trigger id={id} className={'smart-select-trigger '+className} aria-label={label} aria-labelledby={labelledBy} data-value={String(value??'')}>
   <Select.Value placeholder={selected?.props.children??'请选择'}/><Select.Icon asChild><ChevronDown className="smart-select-chevron" size={15}/></Select.Icon>
  </Select.Trigger>
  <Select.Portal><Select.Content className="smart-select-content" position="popper" sideOffset={6} collisionPadding={12}>
   <Select.ScrollUpButton className="smart-select-scroll"><ChevronUp size={16}/></Select.ScrollUpButton>
   <Select.Viewport className="smart-select-viewport">{options.map(o=><Select.Item key={encode(o.props.value)} value={encode(o.props.value)} disabled={o.props.disabled} className="smart-select-option" data-option-value={String(o.props.value??'')}>
    <Select.ItemText>{o.props.children}</Select.ItemText><Select.ItemIndicator className="smart-select-check"><Check size={16}/></Select.ItemIndicator>
   </Select.Item>)}</Select.Viewport>
   <Select.ScrollDownButton className="smart-select-scroll"><ChevronDown size={16}/></Select.ScrollDownButton>
  </Select.Content></Select.Portal>
 </Select.Root>
}

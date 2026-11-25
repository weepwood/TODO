import {useTransientPopover,popoverGeometry} from "../design-system/popover.js";
import React,{useEffect,useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {Check,ChevronDown} from 'lucide-react';
const palette=['#6784da','#5276d6','#8b74d5','#c467a0','#d45b5b','#d39531','#4d9a79','#3b91a0','#758197','#5e6674'];
const valid=s=>/^#[0-9a-f]{6}$/i.test(s);
export function ColorControl({label='颜色',value,onChange}){
 const [draft,setDraft]=useState(value),[open,setOpen]=useState(false);
 useEffect(()=>setDraft(value),[value]);
 useTransientPopover(open,()=>setOpen(false));
 const choose=next=>{if(!valid(next))return;onChange(next.toLowerCase());setOpen(false)};
 return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next)setDraft(value)}}>
  <Popover.Trigger asChild><button type="button" className="color-picker-trigger" aria-label={label}><i style={{background:valid(value)?value:palette[0]}}/><span>{value}</span><ChevronDown size={14}/></button></Popover.Trigger>
  <Popover.Portal><Popover.Content className="color-picker-popover" {...popoverGeometry} aria-label="颜色选择器">
   <strong>选择颜色</strong><div className="color-picker-grid">{palette.map(color=><button type="button" key={color} aria-label={color} aria-pressed={value.toLowerCase()===color} style={{background:color}} onClick={()=>choose(color)}>{value.toLowerCase()===color&&<Check size={18}/>}</button>)}</div>
   <div className="color-picker-input"><input aria-label="十六进制颜色" value={draft} maxLength={7} aria-invalid={!valid(draft)||undefined} onChange={e=>setDraft(e.target.value)}/><button type="button" className="primary" disabled={!valid(draft)} onClick={()=>choose(draft)}>应用颜色</button></div>
  </Popover.Content></Popover.Portal>
 </Popover.Root>
}

import React,{useEffect,useState} from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {ArrowDownUp,ListFilter,Layers,ChevronRight,Check,Plus} from 'lucide-react';
import {SORTS,GROUPS,ORDERS} from '../core/task-list-interaction.js';
export function TaskViewMenu({sort,group,order,onSort,onGroup,onOrder,onAddGroup}){
 const [open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const close=()=>setOpen(false);window.addEventListener('todo-close-transient',close);return()=>window.removeEventListener('todo-close-transient',close)},[open]);
 const submenu=(label,Icon,options,value,change,disabled=false)=><Dropdown.Sub>
  <Dropdown.SubTrigger className="dropdown-item task-view-sub" disabled={disabled}><Icon size={16}/><span>{label}</span><small>{disabled?'手动':options.find(([id])=>id===value)?.[1]}</small><ChevronRight size={14}/></Dropdown.SubTrigger>
  <Dropdown.Portal><Dropdown.SubContent className="dropdown task-view-options" sideOffset={5} alignOffset={-4} collisionPadding={8}><Dropdown.RadioGroup value={value} onValueChange={change}>{options.map(([id,name])=><Dropdown.RadioItem key={id} value={id} className="dropdown-item task-view-option"><span>{name}</span><Dropdown.ItemIndicator><Check size={15}/></Dropdown.ItemIndicator></Dropdown.RadioItem>)}</Dropdown.RadioGroup></Dropdown.SubContent></Dropdown.Portal>
 </Dropdown.Sub>;
 return <Dropdown.Root open={open} onOpenChange={setOpen}><Dropdown.Trigger asChild><button type="button" className="icon-button task-view-trigger" aria-label="分组、排序与顺序" title="分组、排序与顺序"><ArrowDownUp size={19}/></button></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown task-view-menu" align="end" sideOffset={7} collisionPadding={8}>{submenu('分组',Layers,GROUPS,group,onGroup)}{submenu('排序',ListFilter,SORTS,sort,onSort)}{submenu('顺序',ArrowDownUp,ORDERS,order,onOrder,sort==='manual')}{onAddGroup&&<><Dropdown.Separator className="dropdown-separator"/><Dropdown.Item className="dropdown-item task-view-sub" onSelect={onAddGroup}><Plus size={16}/><span>新建分组</span></Dropdown.Item></>}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>
}

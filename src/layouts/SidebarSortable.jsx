import React,{useState} from 'react';
import {DndContext,MouseSensor,TouchSensor,useSensor,useSensors,pointerWithin} from '@dnd-kit/core';
import {SortableContext,useSortable,verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {orderSidebarItems,moveSidebarItem} from '../core/sidebar-order.js';

function SortableEntry({item,onMove,section}){
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id:item.id});
 // Only the actual navigation/title button starts a drag. Menus and creation
 // controls remain independent, and nested sort contexts cannot activate parents.
 const bindings={...listeners,ref:setActivatorNodeRef,'aria-describedby':attributes['aria-describedby'],
  'aria-keyshortcuts':'Alt+ArrowUp Alt+ArrowDown',
  onKeyDown:e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();onMove(item.id,e.key==='ArrowUp'?-1:1)}}};
 const guard=fn=>e=>{if(e.target.closest('[data-sidebar-sort-id]')!==e.currentTarget||!e.target.closest('button.nav-row'))return;fn?.(e)};
 return <div ref={setNodeRef} data-sidebar-sort-id={item.id} data-sidebar-dragging={isDragging||undefined} className={section?'sidebar-sort-section':'sidebar-sort-item'} style={{transform:CSS.Translate.toString(transform),transition,zIndex:isDragging?2:undefined}}
  {...(!section?{onMouseDown:guard(listeners?.onMouseDown),onTouchStart:guard(listeners?.onTouchStart),onKeyDown:guard(bindings.onKeyDown)}:{})}>
  {section?item.render(bindings):item.render()}
 </div>;
}
export function SidebarSortable({items,scope,order,onOrder,section=false,className='',label}){
 const ordered=orderSidebarItems(items,order?.[scope]),ids=ordered.map(i=>i.id);
 const [announcement,setAnnouncement]=useState('');
 const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{delay:300,tolerance:6}}),useSensor(TouchSensor,{activationConstraint:{delay:350,tolerance:8}}));
 const move=(id,to)=>{const next=moveSidebarItem(ids,id,to);if(next===ids)return;onOrder(scope,next);setAnnouncement((ordered.find(i=>i.id===id)?.label||'项目')+' 已移至第 '+(next.indexOf(id)+1)+' 位')};
 return <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={{threshold:{x:0,y:.05},acceleration:8}} onDragEnd={({active,over})=>{if(over)move(active.id,over.id)}}>
  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
   <div className={'sidebar-sort-stack '+className} role={label?'group':undefined} aria-label={label}>
    {ordered.map(item=><SortableEntry key={item.id} item={item} section={section} onMove={(id,dir)=>move(id,ids[ids.indexOf(id)+dir])}/>)}
   </div>
  </SortableContext>
  <span className="sidebar-sort-announcement" role="status" aria-live="polite">{announcement}</span>
 </DndContext>;
}

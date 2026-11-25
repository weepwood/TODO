import React,{useRef} from 'react';
import {useVirtualizer} from '@tanstack/react-virtual';
import {useDroppable} from '@dnd-kit/core';
export function SectionGroup({id,children,enabled}){const {setNodeRef,isOver}=useDroppable({id:'section-drop:'+id,disabled:!enabled});return <section ref={setNodeRef} className={'task-group '+(isOver?'drop-active':'')}>{children}</section>}
export function VirtualTaskList({items,render}){const parent=useRef(null);const v=useVirtualizer({count:items.length,getScrollElement:()=>parent.current,estimateSize:()=>48,overscan:12,getItemKey:i=>items[i].id});return <div ref={parent} className="virtual-task-list" aria-label="虚拟任务列表"><div style={{height:v.getTotalSize(),position:'relative'}}>{v.getVirtualItems().map(row=><div key={row.key} data-index={row.index} ref={v.measureElement} style={{position:'absolute',top:0,left:0,width:'100%',transform:'translateY('+row.start+'px)'}}>{render(items[row.index])}</div>)}</div></div>}

import React,{useLayoutEffect,useRef} from 'react';
// Preserve controlled editing and existing save semantics; resize only the field.
export function TaskTitle({value,readOnly,onChange,onBlur}){
 const ref=useRef(null);
 const fit=()=>{
  const node=ref.current;if(!node)return;
  node.style.height='0px';
  const style=getComputedStyle(node);
  const border=(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0);
  node.style.height=Math.min(180,node.scrollHeight+border)+'px';
  node.style.overflowY=node.scrollHeight>node.clientHeight?'auto':'hidden';
 };
 useLayoutEffect(fit,[value]);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  let width=node.clientWidth;
  const observer=new ResizeObserver(()=>{if(node.clientWidth!==width){width=node.clientWidth;fit()}});
  observer.observe(node);return()=>observer.disconnect()
 },[]);
 return <textarea ref={ref} className="task-title-editor" aria-label="任务标题" rows={1} value={value} readOnly={readOnly} onChange={onChange} onBlur={onBlur}/>;
}

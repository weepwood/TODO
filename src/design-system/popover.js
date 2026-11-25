import {useEffect,useRef} from 'react';
// One transient popup consumes one native Back action. Nested popups close
// from the innermost outward, rather than discarding their parent draft.
const opened=[];
export const popoverGeometry=Object.freeze({sideOffset:6,align:'end',collisionPadding:12});
export function useTransientPopover(open,close){
 const current=useRef(close);current.current=close;
 useEffect(()=>{
  if(!open)return;
  const entry={close:()=>current.current()};opened.push(entry);
  const handler=e=>{if(!e.defaultPrevented&&opened.at(-1)===entry){e.preventDefault();entry.close()}};
  window.addEventListener('todo-close-transient',handler);
  return()=>{const i=opened.indexOf(entry);if(i>=0)opened.splice(i,1);window.removeEventListener('todo-close-transient',handler)};
 },[open]);
}

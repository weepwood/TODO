import {useTouchGesture} from './components/useTouchGesture.js';
import {FeedbackField,FieldMessage} from './design-system/FieldFeedback.jsx';
import {NumberControl} from "./design-system/Controls.jsx";
import {useTransientPopover,popoverGeometry} from "./design-system/popover.js";
import React,{useEffect,useRef,useState,useId} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Context from '@radix-ui/react-context-menu';
import {X,MoreHorizontal,ChevronRight,Check} from "lucide-react";
export function Modal({open,onClose,title,children,description,className='',sheet=false}){const gesture=useTouchGesture({enabled:open&&sheet,kind:'sheet',onAction:onClose});return <Dialog.Root open={open} onOpenChange={v=>!v&&onClose()}><Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className={'dialog '+className} style={sheet?{'--sheet-drag':gesture.offset+'px','--gesture-release':gesture.release+'px'}:undefined} data-sheet={sheet||undefined} data-sheet-dragging={sheet&&gesture.phase==='dragging'||undefined} {...(!description?{'aria-describedby':undefined}:{})}>{sheet&&<div className="sheet-grabber" aria-hidden="true" {...gesture.handlers}><span/></div>}<div className="dialog-head"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="关闭"><X size={18}/></Dialog.Close></div>{description&&<Dialog.Description className="dialog-description">{description}</Dialog.Description>}{children}</Dialog.Content></Dialog.Portal></Dialog.Root>}
// Shared menu descriptors: plain actions, labelled groups, and real Radix submenus.
function MenuItems({api:Api,items}){
 return items.map((item,i)=>{
  const Icon=item.icon,content=<>{Icon&&<Icon size={16} aria-hidden="true" data-priority={item.priority}/>}<span className="menu-action-label">{item.label}</span>{item.checked&&<Check className="menu-action-check" size={14} aria-hidden="true"/>}</>;
  if(item.separator)return <Api.Separator key={i} className="dropdown-separator"/>;
  if(item.group)return <Api.Group key={i} className="menu-action-group"><Api.Label className="menu-action-heading">{item.group}</Api.Label><div className={item.quick?'menu-quick-grid':''} data-columns={item.quick?item.items.length:undefined}><MenuItems api={Api} items={item.items}/></div></Api.Group>;
  if(item.items)return <Api.Sub key={i}><Api.SubTrigger className="dropdown-item menu-action" disabled={item.disabled}>{content}<ChevronRight className="menu-action-arrow" size={14}/></Api.SubTrigger><Api.Portal><Api.SubContent className="dropdown menu-action-sub" sideOffset={5} collisionPadding={12}><MenuItems api={Api} items={item.items}/></Api.SubContent></Api.Portal></Api.Sub>;
  if(!item.icon&&item.checked===undefined)return <Api.Item key={i} className={'dropdown-item '+(item.danger?'danger':'')} disabled={item.disabled} onSelect={item.run}>{item.label}</Api.Item>;
  return <Api.Item key={i} className={'dropdown-item menu-action '+(item.danger?'danger':'')} data-checked={item.checked||undefined} disabled={item.disabled} onSelect={item.run} aria-label={typeof item.label==='string'?item.label:undefined} title={item.tooltip||(typeof item.label==='string'?item.label:undefined)}>{content}</Api.Item>;
 });
}
export function Menu({items,trigger,open,onOpenChange,className=''}){
 const [local,setLocal]=useState(false),shown=open??local,change=onOpenChange??setLocal;
 useTransientPopover(shown,()=>change(false));
 return <Dropdown.Root open={shown} onOpenChange={change}><Dropdown.Trigger asChild>{trigger||<button className="icon-button" aria-label="更多操作"><MoreHorizontal size={18}/></button>}</Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className={'dropdown '+className} {...popoverGeometry}><MenuItems api={Dropdown} items={items}/></Dropdown.Content></Dropdown.Portal></Dropdown.Root>
}
export function Empty({title='暂无任务',hint='添加一项任务开始吧。',Icon}){return <div className="empty">{Icon&&<div className="empty-icon"><Icon size={28}/></div>}<h3>{title}</h3><p>{hint}</p></div>}
export function Field({label,children,...feedback}){if(Object.keys(feedback).length)return <FeedbackField label={label} {...feedback}>{children}</FeedbackField>;return <label className="field"><span>{label}</span>{children}</label>}

export function ContextMenu({items,children,disabled=false,className=''}){const [open,setOpen]=useState(false);useTransientPopover(open,()=>setOpen(false));return <Context.Root open={open} onOpenChange={setOpen}><Context.Trigger asChild disabled={disabled}>{children}</Context.Trigger><Context.Portal><Context.Content className={'dropdown '+className} collisionPadding={12}><MenuItems api={Context} items={items}/></Context.Content></Context.Portal></Context.Root>}

export function ActionButton({variant='secondary',compact=false,icon:Icon,children,className='',type='button',...props}){return <button type={type} className={[variant,compact?'compact':'',className].filter(Boolean).join(' ')} {...props}>{Icon&&<Icon size={16} aria-hidden="true"/>}{children}</button>}
export function InlineTitle({value,onCommit,onClose}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('');const initial=useRef(value),input=useRef(null),errorId=useId();
 useEffect(()=>{input.current?.focus();input.current?.select()},[]);
 function save(){const title=draft.trim();if(!title){setError('标题不能为空');return}if(value!==initial.current){setError('标题已发生变化，请取消后重新编辑');return}onCommit(title,initial.current)}
 return <form className="inline-title-editor" onSubmit={e=>{e.preventDefault();save()}} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();onClose()}}}>
 <input ref={input} aria-label="行内任务标题" value={draft} onChange={e=>{setDraft(e.target.value);setError('')}} aria-invalid={!!error} aria-describedby={error?errorId:undefined} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault()}}/>
 <ActionButton compact type="submit" variant="primary">保存</ActionButton><ActionButton compact onClick={onClose}>取消</ActionButton><FieldMessage id={errorId} error={error}/>
 </form>
}

export function NumberField({label,value,min,max,onCommit,unit}){
 const [draft,setDraft]=useState(String(value)),[editing,setEditing]=useState(false),original=useRef(value);
 useEffect(()=>{if(!editing)setDraft(String(value))},[value,editing]);
 function commit(){setEditing(false);if(value!==original.current||!draft.trim()||!Number.isFinite(Number(draft))){setDraft(String(value));return}const next=Math.max(min,Math.min(max,Math.round(Number(draft))));setDraft(String(next));if(next!==value)onCommit(next)}
 function step(delta){const current=editing&&value===original.current&&draft.trim()&&Number.isFinite(Number(draft))?Number(draft):value;const next=Math.max(min,Math.min(max,Math.round(current)+delta));original.current=next;setEditing(false);setDraft(String(next));if(next!==value)onCommit(next)}
 return <NumberControl label={label} min={min} max={max} unit={unit} minusDisabled={value<=min} plusDisabled={value>=max} onStep={step} onStepPointerDown={e=>e.preventDefault()} inputProps={{value:draft,onFocus:()=>{original.current=value;setEditing(true)},onChange:e=>setDraft(e.target.value),onBlur:commit,onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();original.current=NaN;setDraft(String(value));e.currentTarget.blur()}}}}/>
}

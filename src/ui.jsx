import React,{useEffect,useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Context from '@radix-ui/react-context-menu';
import {X,MoreHorizontal} from 'lucide-react';
export function Modal({open,onClose,title,children,description,className=''}){return <Dialog.Root open={open} onOpenChange={v=>!v&&onClose()}><Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className={'dialog '+className} {...(!description?{'aria-describedby':undefined}:{})}><div className="dialog-head"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="关闭"><X size={18}/></Dialog.Close></div>{description&&<Dialog.Description className="dialog-description">{description}</Dialog.Description>}{children}</Dialog.Content></Dialog.Portal></Dialog.Root>}
export function Menu({items,trigger,open,onOpenChange}){
 const [local,setLocal]=useState(false),shown=open??local,change=onOpenChange??setLocal;
 useEffect(()=>{if(!shown)return;const close=()=>change(false);window.addEventListener('todo-close-transient',close);return()=>window.removeEventListener('todo-close-transient',close)},[shown,change]);
 return <Dropdown.Root open={shown} onOpenChange={change}><Dropdown.Trigger asChild>{trigger||<button className="icon-button" aria-label="更多操作"><MoreHorizontal size={18}/></button>}</Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown" sideOffset={5} align="end">{items.map((item,i)=>item.separator?<Dropdown.Separator key={i} className="dropdown-separator"/>:<Dropdown.Item key={i} className={'dropdown-item '+(item.danger?'danger':'')} disabled={item.disabled} onSelect={item.run}>{item.label}</Dropdown.Item>)}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>}
export function Empty({title='暂无任务',hint='添加一项任务开始吧。',Icon}){return <div className="empty">{Icon&&<div className="empty-icon"><Icon size={28}/></div>}<h3>{title}</h3><p>{hint}</p></div>}
export function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}

export function ContextMenu({items,children}){const [open,setOpen]=useState(false);useEffect(()=>{if(!open)return;const close=()=>setOpen(false);window.addEventListener('todo-close-transient',close);return()=>window.removeEventListener('todo-close-transient',close)},[open]);return <Context.Root open={open} onOpenChange={setOpen}><Context.Trigger asChild>{children}</Context.Trigger><Context.Portal><Context.Content className="dropdown">{items.map((item,i)=>item.separator?<Context.Separator key={i} className="dropdown-separator"/>:<Context.Item key={i} className={'dropdown-item '+(item.danger?'danger':'')} disabled={item.disabled} onSelect={item.run}>{item.label}</Context.Item>)}</Context.Content></Context.Portal></Context.Root>}

export function ActionButton({variant='secondary',compact=false,icon:Icon,children,className='',type='button',...props}){return <button type={type} className={[variant,compact?'compact':'',className].filter(Boolean).join(' ')} {...props}>{Icon&&<Icon size={16} aria-hidden="true"/>}{children}</button>}
export function InlineTitle({value,onCommit,onClose}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('');const initial=useRef(value),input=useRef(null);
 useEffect(()=>{input.current?.focus();input.current?.select()},[]);
 function save(){const title=draft.trim();if(!title){setError('标题不能为空');return}if(value!==initial.current){setError('标题已发生变化，请取消后重新编辑');return}onCommit(title,initial.current)}
 return <form className="inline-title-editor" onSubmit={e=>{e.preventDefault();save()}} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();onClose()}}}>
 <input ref={input} aria-label="行内任务标题" value={draft} onChange={e=>{setDraft(e.target.value);setError('')}} aria-invalid={!!error} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault()}}/>
 <ActionButton compact type="submit" variant="primary">保存</ActionButton><ActionButton compact onClick={onClose}>取消</ActionButton>{error&&<small role="alert">{error}</small>}
 </form>
}

export function NumberField({label,value,min,max,onCommit}){
 const [draft,setDraft]=useState(String(value)),[editing,setEditing]=useState(false),original=useRef(value);
 useEffect(()=>{if(!editing)setDraft(String(value))},[value,editing]);
 function commit(){setEditing(false);if(value!==original.current||!draft.trim()||!Number.isFinite(Number(draft))){setDraft(String(value));return}const next=Math.max(min,Math.min(max,Math.round(Number(draft))));setDraft(String(next));if(next!==value)onCommit(next)}
 return <input className="number-field" inputMode="numeric" aria-label={label} type="number" min={min} max={max} step="1" value={draft} onFocus={()=>{original.current=value;setEditing(true)}} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();original.current=NaN;setDraft(String(value));e.currentTarget.blur()}}}/>
}

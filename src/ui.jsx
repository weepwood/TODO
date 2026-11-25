import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Context from '@radix-ui/react-context-menu';
import {X,MoreHorizontal} from 'lucide-react';
export function Modal({open,onClose,title,children}){return <Dialog.Root open={open} onOpenChange={v=>!v&&onClose()}><Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className="dialog" aria-describedby={undefined}><div className="dialog-head"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="关闭"><X size={18}/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>}
export function Menu({items,trigger}){return <Dropdown.Root><Dropdown.Trigger asChild>{trigger||<button className="icon-button" aria-label="更多操作"><MoreHorizontal size={18}/></button>}</Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown" sideOffset={5} align="end">{items.map((item,i)=>item.separator?<Dropdown.Separator key={i} className="dropdown-separator"/>:<Dropdown.Item key={i} className={'dropdown-item '+(item.danger?'danger':'')} disabled={item.disabled} onSelect={item.run}>{item.label}</Dropdown.Item>)}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>}
export function Empty({title='暂无任务',hint='添加一项任务开始吧。',Icon}){return <div className="empty">{Icon&&<div className="empty-icon"><Icon size={28}/></div>}<h3>{title}</h3><p>{hint}</p></div>}
export function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}

export function ContextMenu({items,children}){return <Context.Root><Context.Trigger asChild>{children}</Context.Trigger><Context.Portal><Context.Content className="dropdown">{items.map((item,i)=>item.separator?<Context.Separator key={i} className="dropdown-separator"/>:<Context.Item key={i} className={'dropdown-item '+(item.danger?'danger':'')} disabled={item.disabled} onSelect={item.run}>{item.label}</Context.Item>)}</Context.Content></Context.Portal></Context.Root>}

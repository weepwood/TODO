import React from 'react';
import {ArrowLeft} from 'lucide-react';
import {Modal} from '../../ui.jsx';
// Shared content and mutations for the compact dialog and full workspace.
export function WorkspaceSurface({page,open=true,onClose,title,description,className,children}){
 if(!page)return <Modal open={open} onClose={onClose} title={title} description={description} className={className}>{children}</Modal>;
 return <section className={'workspace-surface '+className} aria-label={title}><header className="workspace-surface-header"><button className="secondary compact" onClick={onClose}><ArrowLeft size={15}/> 返回</button><p className="muted">{description}</p></header>{children}</section>;
}

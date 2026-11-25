import React from 'react';
import {Pencil,Check} from 'lucide-react';
export function DetailSection({id,title,icon:Icon,editing=false,editable=true,onToggle,summary,children}){
 return <section className="detail-group detail-section-card" data-detail-section={id} data-editing={editing}>
  <header className="detail-section-heading"><h3><Icon size={16}/>{title}</h3>{editable&&<button type="button" className="detail-section-toggle" aria-label={(editing?'完成编辑 ':'编辑 ')+title} aria-expanded={editing} onClick={onToggle}>{editing?<Check size={15}/>:<Pencil size={14}/>}<span>{editing?'完成':'编辑'}</span></button>}</header>
  {summary!==undefined&&<div className="detail-section-summary" hidden={editing}>{summary}</div>}
  <div className="detail-section-editor" hidden={summary!==undefined&&!editing}>{children}</div>
 </section>
}
export function DetailFacts({items}){
 return <dl className="detail-facts">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
}

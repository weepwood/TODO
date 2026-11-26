import {validListIcon} from './list-appearance.js';
// Shared with the existing organization dialog. Callers validate names and
// permissions; edits preserve unrelated list fields and task assignments.
export function saveOrganizationEntity(d,{kind,existing,entity,parent,color,icon,assignTaskId}){
 if(kind==='section'){
  if(!d.lists.some(l=>l.id===parent))return d;
  return {...d,lists:d.lists.map(l=>l.id===parent?{...l,sections:existing?l.sections.map(s=>s.id===entity.id?entity:s):[...l.sections,entity]}:l),tasks:!existing&&assignTaskId?d.tasks.map(t=>t.id===assignTaskId&&t.listId===parent&&t.status==='pending'&&!t.deletedAt?{...t,sectionId:entity.id}:t):d.tasks};
 }
 const key={list:'lists',folder:'folders',tag:'tags'}[kind];
 if(!key)return d;
 const item=kind==='list'?{...existing,...entity,folderId:parent||null,sections:existing?.sections||[],icon:validListIcon(icon)?icon:existing?.icon||''}:entity;
 return {...d,[key]:existing?d[key].map(x=>x.id===item.id?item:x):[...d[key],item]};
}

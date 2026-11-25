export const SORTS=[['manual','手动'],['title','标题'],['date','日期'],['priority','优先级'],['created','创建时间']];
export const GROUPS=[['section','清单分组'],['list','清单'],['date','日期'],['none','无']];
export const ORDERS=[['asc','升序'],['desc','降序']];
export const defaultOrder=sort=>['priority','created'].includes(sort)?'desc':'asc';
export function sortTasks(tasks,sort,order){
 if(sort==='manual')return tasks;
 const direction=order==='desc'?-1:1;
 return [...tasks].sort((a,b)=>{
  if(sort==='date'&&(!a.date||!b.date)){
   if(!a.date!==!b.date)return a.date?-1:1;
   return b.priority-a.priority;
  }
  const cmp=sort==='title'?a.title.localeCompare(b.title,'zh-CN',{numeric:true}):sort==='priority'?a.priority-b.priority:sort==='created'?a.createdAt.localeCompare(b.createdAt):a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'');
  return direction*cmp||(sort==='date'?b.priority-a.priority:0);
 });
}
export function desktopSelection({ids,checked,selected,anchor,clicked,range,toggle}){
 const visible=new Set(ids),base=checked.filter(id=>visible.has(id));
 if(!range&&!toggle)return {checked:[],anchor:clicked,selected:clicked};
 if(range){
  const a=ids.indexOf(visible.has(anchor)?anchor:visible.has(selected)?selected:clicked),b=ids.indexOf(clicked);
  const span=ids.slice(Math.min(a,b),Math.max(a,b)+1);
  return {checked:toggle?[...new Set([...base,...span])]:span,anchor:ids[a],selected:clicked};
 }
 const next=base.length?base:visible.has(selected)?[selected]:[];
 const result=next.includes(clicked)?next.filter(id=>id!==clicked):[...next,clicked];
 return {checked:result,anchor:clicked,selected:result.includes(clicked)?clicked:result.at(-1)||null};
}

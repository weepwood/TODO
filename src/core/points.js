// An absent points field is semantically zero. Keep legacy snapshots byte-compatible
// at the field level; no migration writes are needed just to add this feature.
export const MAX_POINTS=99999;
export const validPoints=value=>Number.isInteger(value)&&Math.abs(value)<=MAX_POINTS;
export const taskPoints=task=>validPoints(task?.points)?task.points:0;
export const signedPoints=value=>value>0?'+'+value:String(value);
export function summarizePoints(tasks,{since,today,list='all'}){
 const zero=()=>({positive:0,negative:0,net:0,count:0});
 const total=zero(),period=zero(),daily=new Map(),byList=new Map(),entries=[];
 const add=(s,p)=>{s.positive+=Math.max(0,p);s.negative+=Math.min(0,p);s.net+=p;s.count++};
 for(const task of tasks){
  if(task.deletedAt||task.status!=='completed'||!task.completedAt||list!=='all'&&task.listId!==list)continue;
  const date=new Date(task.completedAt);if(!Number.isFinite(date.getTime()))continue;
  const day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const p=taskPoints(task);if(!p||day>today)continue;
  add(total,p);if(day<since)continue;add(period,p);
  if(!daily.has(day))daily.set(day,zero());add(daily.get(day),p);
  if(!byList.has(task.listId))byList.set(task.listId,zero());add(byList.get(task.listId),p);
  entries.push({id:task.id,title:task.title,listId:task.listId,day,completedAt:task.completedAt,points:p});
 }
 entries.sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)||a.id.localeCompare(b.id));
 return {total,period,daily,byList,entries};
}

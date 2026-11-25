export const STORAGE_KEY='todo-workbench-v1';
export const id=()=>globalThis.crypto.randomUUID();
export function dayKey(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function shiftDay(key, days){
  const [y,m,d]=key.split('-').map(Number);
  const date=new Date(y,m-1,d,12); date.setDate(date.getDate()+days);
  return dayKey(date);
}
export function nextDate(key,repeat,anchor=Number(key.slice(-2))){
  if(repeat==='daily')return shiftDay(key,1);
  if(repeat==='weekly')return shiftDay(key,7);
  if(repeat==='monthly'){
    const [y,m]=key.split('-').map(Number);
    const next=new Date(y,m,1,12);
    const last=new Date(next.getFullYear(),next.getMonth()+1,0,12).getDate();
    next.setDate(Math.min(anchor,last));return dayKey(next);
  }
  return null;
}
export function initialState(){
  return {version:1,theme:'system',lists:[{id:'inbox',name:'收集箱',color:'#778396'},{id:'work',name:'工作',color:'#6784da'},{id:'personal',name:'个人',color:'#47a58d'}],tasks:[]};
}
export function newTask(title,listId='inbox',date=''){
  return {id:id(),title:title.trim(),notes:'',listId,date,priority:0,repeat:'none',miss:'keep',anchor:date?Number(date.slice(-2)):null,seriesId:null,checklist:[],status:'pending',createdAt:new Date().toISOString(),completedAt:null};
}
export function addOccurrence(tasks,task,date){
  if(!date)return tasks;
  const seriesId=task.seriesId||task.id;
  if(tasks.some(t=>(t.seriesId||t.id)===seriesId&&t.date===date))return tasks;
  return [...tasks,{...task,id:id(),seriesId,date,status:'pending',createdAt:new Date().toISOString(),completedAt:null,checklist:task.checklist.map(c=>({...c,done:false}))}];
}
export function completeTask(tasks,taskId,today=dayKey()){
  const task=tasks.find(t=>t.id===taskId);
  if(!task||task.status!=='pending')return tasks;
  let result=tasks.map(t=>t.id===taskId?{...t,status:'completed',completedAt:new Date().toISOString()}:t);
  if(task.repeat==='none'||!task.date)return result;
  let next=nextDate(task.date,task.repeat,task.anchor||Number(task.date.slice(-2)));
  if(task.miss==='skip')while(next&&next<today)next=nextDate(next,task.repeat,task.anchor||Number(task.date.slice(-2)));
  return addOccurrence(result,task,next);
}
export function reconcile(tasks,today=dayKey()){
  let result=tasks;
  for(const task of tasks){
    if(task.status!=='pending'||task.repeat==='none'||task.miss!=='skip'||!task.date||task.date>=today)continue;
    let next=task.date;
    while(next<today)next=nextDate(next,task.repeat,task.anchor||Number(task.date.slice(-2)));
    result=result.map(t=>t.id===task.id?{...t,status:'skipped'}:t);
    result=addOccurrence(result,task,next);
  }
  return result;
}
export function matches(task,view,today=dayKey()){
  if(view==='completed')return task.status==='completed';
  if(view==='skipped')return task.status==='skipped';
  if(task.status!=='pending')return false;
  if(view==='today')return !!task.date&&task.date<=today;
  if(view==='upcoming')return task.date>today&&task.date<=shiftDay(today,7);
  if(view==='all')return true;
  if(view==='overdue')return !!task.date&&task.date<today;
  if(view==='recurring')return task.repeat!=='none';
  return task.listId===view;
}
export function readState(storage){
  const raw=storage.getItem(STORAGE_KEY);
  if(!raw)return initialState();
  const value=JSON.parse(raw);
  if(value.version!==1||!Array.isArray(value.tasks)||!Array.isArray(value.lists))throw new Error('不支持的数据格式');
  return value;
}

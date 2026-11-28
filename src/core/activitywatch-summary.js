import {expandPlanBlocks,blockMinutes} from './plan-block.js';
import {uniqueWallInstant} from './wall-time.js';

export function activityDayRange(day,now=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const start=new Date(day+'T00:00:00');if(!Number.isFinite(+start))return null;
 const localKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 if(localKey(start)!==day)return null;
 const end=new Date(start);end.setDate(end.getDate()+1);
 const last=Math.min(+end,now);return last>+start?{start:+start,end:last}:null;
}
export function unionIntervals(rows){
 const result=[];
 for(const [start,end] of rows.filter(r=>r.every(Number.isFinite)&&r[1]>r[0]).sort((a,b)=>a[0]-b[0])){
  const p=result.at(-1);if(p&&start<=p[1])p[1]=Math.max(p[1],end);else result.push([start,end]);
 }
 return result;
}
const sum=rows=>rows.reduce((n,[a,b])=>n+b-a,0);
const intersect=(a,b)=>{
 let i=0,j=0,total=0;while(i<a.length&&j<b.length){const [x,y]=a[i],[u,v]=b[j];total+=Math.max(0,Math.min(y,v)-Math.max(x,u));if(y<=v)i++;else j++;}return total;
};
// Temporal overlap is not proof of task work. No task or focus record is written.
export function activityTaskComparison(data,report,day){
 const clip=(a,b)=>[Math.max(a,report.start),Math.min(b,report.end)];
 const activity=unionIntervals(report.timeline.map(r=>clip(r.start,r.end)));
 const tasks=data.tasks.filter(t=>!t.deletedAt);
 const sessions=new Map(),plans=new Map();
 for(const s of data.sessions||[]){
  if(s.mode!=='focus'||!s.taskId||!Number.isFinite(s.seconds)||s.seconds<=0)continue;
  const start=Date.parse(s.startedAt),r=clip(start,start+s.seconds*1000);
  if(r[1]>r[0]){if(!sessions.has(s.taskId))sessions.set(s.taskId,[]);sessions.get(s.taskId).push(r)}
 }
 for(const b of expandPlanBlocks(tasks)){
  if(!b.date||!b.time)continue;
  const start=uniqueWallInstant(b.date,b.time),minutes=blockMinutes(b);
  if(start===null||!Number.isFinite(start)||!Number.isFinite(minutes)||minutes<=0)continue;
  const r=clip(start,start+minutes*60000),id=b.ownerId||b.id;
  if(r[1]>r[0]){if(!plans.has(id))plans.set(id,[]);plans.get(id).push(r)}
 }
 return tasks.filter(t=>t.date===day||sessions.has(t.id)||plans.has(t.id)).map(t=>{
  const focus=unionIntervals(sessions.get(t.id)||[]),plan=unionIntervals(plans.get(t.id)||[]);
  return {id:t.id,title:t.title,estimate:Math.max(0,Number(t.duration)||0)*60000,focus:sum(focus),plan:sum(plan),focusOverlap:intersect(focus,activity),planOverlap:intersect(plan,activity)};
 });
}
export function activityExample(day){
 const start=new Date(day+'T00:00:00').getTime(),end=new Date(new Date(start).setDate(new Date(start).getDate()+1)).getTime();
 const h=3600000,at=n=>start+n*h;
 const timeline=[{start:at(9),end:at(11),subject:'VS Code'},{start:at(11),end:at(12),subject:'Microsoft Edge'},{start:at(13),end:at(14.5),subject:'Obsidian'},{start:at(15),end:at(16),subject:'Microsoft Edge'}];
 return {report:{start,end,known_ms:8*h,active_ms:5.5*h,website_ms:1.5*h,website_available:true,apps:[{subject:'VS Code',ms:2*h},{subject:'Microsoft Edge',ms:2*h},{subject:'Obsidian',ms:1.5*h}],websites:[{subject:'github.com',ms:h},{subject:'developer.mozilla.org',ms:.5*h}],timeline,warnings:[]},
 data:{tasks:[{id:'demo-1',title:'工程开发（示例）',date:day,time:'09:00',duration:120},{id:'demo-2',title:'知识整理（示例）',date:day,time:'13:00',duration:90}],sessions:[{taskId:'demo-1',mode:'focus',startedAt:new Date(at(9)).toISOString(),seconds:5400},{taskId:'demo-2',mode:'focus',startedAt:new Date(at(13)).toISOString(),seconds:3600}]}};
}

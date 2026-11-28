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

// Calendar arithmetic is local-time based, including 23/25-hour DST days.
// Periods are calendar periods rather than rolling 7/30/365-day windows.
const localKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export function activityPeriod(day,mode,now=Date.now()){
 if(!activityDayRange(day,now)||!['day','week','month','year'].includes(mode))return null;
 const start=new Date(day+'T00:00:00'),end=new Date(start);
 if(mode==='week')start.setDate(start.getDate()-(start.getDay()+6)%7);
 if(mode==='month'||mode==='year')start.setDate(1);
 if(mode==='year')start.setMonth(0);
 end.setTime(+start);
 if(mode==='day')end.setDate(end.getDate()+1);
 if(mode==='week')end.setDate(end.getDate()+7);
 if(mode==='month')end.setMonth(end.getMonth()+1);
 if(mode==='year')end.setFullYear(end.getFullYear()+1);
 const stop=Math.min(+end,now),bounds=[+start],cursor=new Date(start);
 while(+cursor<stop){cursor.setDate(cursor.getDate()+1);bounds.push(Math.min(+cursor,stop));}
 if(bounds.length<2||bounds.length>367||bounds[0]<0)return null;
 const lastDay=new Date(end);lastDay.setDate(lastDay.getDate()-1);
 return {start:+start,end:stop,bounds,label:mode==='day'?day:localKey(start)+' 至 '+localKey(lastDay),partial:stop<+end};
}
export function shiftActivityPeriod(day,mode,delta){
 const p=activityPeriod(day,mode,Number.MAX_SAFE_INTEGER);if(!p)return day;
 const d=new Date(p.start);
 if(mode==='day'||mode==='week')d.setDate(d.getDate()+delta*(mode==='week'?7:1));
 if(mode==='month')d.setMonth(d.getMonth()+delta);
 if(mode==='year')d.setFullYear(d.getFullYear()+delta);
 return localKey(d);
}
export function activityChunks(bounds){
 const chunks=[];for(let i=0;i<bounds.length-1;i+=7)chunks.push(bounds.slice(i,i+8));return chunks;
}
const sumTotals=(days,key)=>{
 const totals=new Map();for(const d of days)for(const r of d[key])totals.set(r.subject,(totals.get(r.subject)||0)+r.ms);
 return [...totals].map(([subject,ms])=>({subject,ms})).sort((a,b)=>b.ms-a.ms||a.subject.localeCompare(b.subject));
};
export function combineActivityReports(reports,period){
 const days=reports.flatMap(r=>r.days||[]),bounds=period.bounds;
 if(days.length!==bounds.length-1||days.some((d,i)=>d.start!==bounds[i]||d.end!==bounds[i+1]||
  ![d.known_ms,d.active_ms,d.website_ms].every(n=>Number.isSafeInteger(n)&&n>=0)||d.known_ms>d.end-d.start||d.active_ms>d.known_ms||d.website_ms>d.active_ms||
  d.apps.reduce((n,r)=>n+r.ms,0)!==d.active_ms||d.websites.reduce((n,r)=>n+r.ms,0)!==d.website_ms))throw Error('日期分段不完整');
 if(days.reduce((n,d)=>n+d.apps.length+d.websites.length,0)>100000)throw Error('分类记录过多，请缩小日期范围');
 const apps=sumTotals(days,'apps'),websites=sumTotals(days,'websites');
 if(apps.length+websites.length>2000)throw Error('活动分类过多，请缩小日期范围');
 const total=key=>days.reduce((n,d)=>n+d[key],0);
 return {start:period.start,end:period.end,days,known_ms:total('known_ms'),active_ms:total('active_ms'),website_ms:total('website_ms'),website_available:days.some(d=>d.website_available),apps,websites,
  timeline:days.length===1?(reports[0].timeline||[]):[],website_timeline:days.length===1?(reports[0].website_timeline||[]):[],warnings:[...new Set(reports.flatMap(r=>r.warnings||[]))]};
}
// One user action authorizes exactly the captured bounds. Stop before issuing
// another request after cancellation; never publish a partial aggregate.
export async function readActivityPeriod(period,mode,load,isCurrent=()=>true,onProgress=()=>{},includeWeb=false){
 const chunks=activityChunks(period.bounds),results=[];let rows=0;
 for(const bounds of chunks){
  if(!isCurrent())return null;
  const r=await load({start:bounds[0],end:bounds.at(-1),bounds,detail:mode==='day',consent:true,includeWeb});
  if(!isCurrent())return null;
  if(r.days?.length!==bounds.length-1||r.days.some((d,i)=>d.start!==bounds[i]||d.end!==bounds[i+1]))throw Error('日期分段不完整');
  rows+=r.days.reduce((n,d)=>n+d.apps.length+d.websites.length,0);
  if(rows>100000)throw Error('分类记录过多，请缩小日期范围');
  results.push(r);onProgress(results.length,chunks.length);
 }
 return isCurrent()?combineActivityReports(results,period):null;
}
export function activityTrend(report,mode,kind,subject){
 const groups=new Map();
 for(const d of report.days){
  const day=localKey(new Date(d.start)),key=mode==='year'?day.slice(0,7):day;
  const row=groups.get(key)||{key,ms:0,known:0,range:0,available:false};
  const available=kind==='apps'?d.known_ms>0:d.website_available;
  const value=subject?d[kind].find(r=>r.subject===subject)?.ms||0:kind==='apps'?d.active_ms:d.website_ms;
  row.ms+=value;row.known+=d.known_ms;row.range+=d.end-d.start;row.available||=available;row.missing=(row.missing||0)+(available?0:1);groups.set(key,row);
 }
 return [...groups.values()];
}
export function activityColor(subject){
 let hash=0;for(const c of subject)hash=(Math.imul(hash,31)+c.codePointAt(0))>>>0;
 return ['#6886bb','#448e7d','#b1824b','#997cb8','#be788e','#568fa7','#82935b','#9a8270'][hash%8];
}
export function activityPeriodExample(period){
 const days=period.bounds.slice(0,-1).map((start,i)=>{
  const end=period.bounds[i+1],example=activityExample(localKey(new Date(start))).report;
  const clip=rows=>rows.map(r=>({...r,start:Math.max(start,r.start),end:Math.min(end,r.end)})).filter(r=>r.end>r.start);
  const h=3600000,web=clip([{start:start+11*h,end:start+12*h,subject:'github.com'},{start:start+15*h,end:start+15.5*h,subject:'developer.mozilla.org'}]);
  const timeline=clip(example.timeline),apps=sumTotals([{apps:timeline.map(r=>({subject:r.subject,ms:r.end-r.start}))}],'apps'),websites=sumTotals([{websites:web.map(r=>({subject:r.subject,ms:r.end-r.start}))}],'websites');
  const active_ms=apps.reduce((n,r)=>n+r.ms,0),website_ms=websites.reduce((n,r)=>n+r.ms,0);
  // Deterministic missing days for trend/coverage demonstration, never imply zero.
  const missing=period.bounds.length>2&&i%7===5;
  return {start,end,known_ms:missing?0:Math.max(0,Math.min(end,start+17*h)-Math.max(start,start+9*h)),active_ms:missing?0:active_ms,website_ms:missing?0:website_ms,website_available:!missing&&web.length>0,apps:missing?[]:apps,websites:missing?[]:websites,timeline:missing?[]:timeline,website_timeline:missing?[]:web};
 });
 const reports=days.map(d=>({days:[(({timeline,website_timeline,...summary})=>summary)(d)],timeline:d.timeline,website_timeline:d.website_timeline,warnings:[]}));
 return combineActivityReports(reports,period);
}

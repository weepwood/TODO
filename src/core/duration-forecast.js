import {dayKey,shiftDay,validDate} from './domain.js';
import {deadlineEnd,validDeadline} from './deadline.js';
const dateOf=value=>Number.isFinite(Date.parse(value))?dayKey(new Date(value)):'';
const q=(sorted,p)=>{const i=(sorted.length-1)*p,lo=Math.floor(i);return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo)};
const round=n=>Math.round(n*10)/10;
export function durationSamples(data,today,list='all'){
 if(!validDate(today))return [];
 const since=shiftDay(today,-179),eligible=new Map();
 for(const t of data.tasks){const date=dateOf(t.completedAt);if(!t.deletedAt&&t.status==='completed'&&date>=since&&date<=today&&(list==='all'||t.listId===list)&&Number.isFinite(t.duration)&&t.duration>0)eligible.set(t.id,{id:t.id,date,completedAt:Date.parse(t.completedAt),estimate:t.duration,actual:0,intervals:[]})}
 for(const s of data.sessions){const t=eligible.get(s.taskId),start=Date.parse(s.startedAt);if(t&&(s.mode==='focus'||s.mode==='stopwatch')&&Number.isFinite(s.seconds)&&s.seconds>0&&Number.isFinite(start)&&start<=t.completedAt&&start+s.seconds*1000<=t.completedAt)t.intervals.push([start,start+s.seconds*1000])}
 return [...eligible.values()].flatMap(({intervals,...t})=>{
  intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let end=-Infinity;
  // Overlapping session records cannot safely identify elapsed focus time.
  for(const [a,b] of intervals){if(a<end)return [];end=b;t.actual+=(b-a)/60000}
  return t.actual>0&&Number.isFinite(t.actual)?[{...t,firstFocus:intervals[0][0]}]:[];
 }).sort((a,b)=>a.completedAt-b.completedAt||a.id.localeCompare(b.id));
}
export function durationForecast(samples,estimate){
 if(!Number.isFinite(estimate)||estimate<=0)return null;
 const ratios=samples.slice(-500).map(s=>s.actual/s.estimate).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
 if(ratios.length<10)return null;
 return {count:ratios.length,median:round(estimate*q(ratios,.5)),low:round(estimate*q(ratios,.1)),high:round(estimate*q(ratios,.9))};
}
export function durationDiagnostics(samples){
 const errors=samples.map(s=>Math.abs(s.actual-s.estimate)).sort((a,b)=>a-b);
 const weeks=[];
 for(const s of samples){const monday=shiftDay(s.date,-((new Date(s.date+'T12:00:00').getDay()+6)%7));let row=weeks.at(-1);if(!row||row.week!==monday){row={week:monday,count:0,estimated:0,actual:0};weeks.push(row)}row.count++;row.estimated+=s.estimate;row.actual+=s.actual}
 // Expanding chronological evaluation; exclude same-day observations to avoid leakage.
 let evaluated=0,covered=0,modelError=0,baselineError=0;
 for(let i=Math.max(0,samples.length-200);i<samples.length;i++){const s=samples[i];let lo=0,hi=i;while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].date<s.date)lo=mid+1;else hi=mid}const prior=samples.slice(Math.max(0,lo-500),lo),f=durationForecast(prior,s.estimate);if(!f)continue;evaluated++;covered+=Number(s.actual>=f.low&&s.actual<=f.high);modelError+=Math.abs(s.actual-f.median);baselineError+=Math.abs(s.actual-s.estimate)}
 return {count:samples.length,medianError:errors.length?round(q(errors,.5)):null,weeks:weeks.map(w=>({...w,estimated:round(w.estimated),actual:round(w.actual)})),evaluated,coverage:evaluated?round(100*covered/evaluated):null,mae:evaluated?round(modelError/evaluated):null,baselineMae:evaluated?round(baselineError/evaluated):null};
}

// Reconstruct pre-first-recorded-focus estimates only from retained, coherent
// task-owned activity. This does not certify absence of unrecorded work or edits.
export function planningEvidence(data,today,list='all',samples=durationSamples(data,today,list)){
 const byId=new Map(data.tasks.map(t=>[t.id,t])),traced=[];let deadlineTotal=0,deadlineMet=0,adjustmentRecords=0,adjustmentTasks=0;
 const normalize=(field,value)=>field==='duration'&&typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value)?Number(value):field==='deadline'&&value==='未设置'?'':value;
 for(const s of samples){
  const t=byId.get(s.id),logs=(t?.activity||[]).filter(e=>e.taskId===undefined||e.taskId===s.id).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.id.localeCompare(a.id));
  if(!logs.some(e=>e.kind==='created'&&e.at===t.createdAt&&Date.parse(e.at)<=s.firstFocus)||!logs.some(e=>e.kind==='completed'&&Date.parse(e.at)===s.completedAt)||logs.some(e=>['restored','reopened','generated'].includes(e.kind)))continue;
  let estimate=t.duration,deadline=t.deadline||'',valid=true;
  const edits=new Set();
  for(const e of logs){
   const at=Date.parse(e.at);if(!Number.isFinite(at)){valid=false;break}
   if(at===s.firstFocus&&e.changes?.some(c=>['duration','deadline'].includes(c.field))){valid=false;break}
   if(at<=s.firstFocus)continue;
   for(const c of e.changes||[]){
    if(c.field==='duration'){const before=normalize(c.field,c.before),after=normalize(c.field,c.after);if(after!==estimate||!Number.isFinite(before)||before<=0||before>1440){valid=false;break}estimate=before}
    if(c.field==='deadline'){const before=normalize(c.field,c.before),after=normalize(c.field,c.after);if(after!==deadline||!validDeadline(before)||typeof before!=='string'){valid=false;break}deadline=before}
    if(at<=s.completedAt&&['manual','bulk'].includes(e.source)&&['date','time','planMinutes','planSegments'].includes(c.field))edits.add(e.operation||e.id);
   }
   if(!valid)break;
  }
  if(!valid)continue;
  traced.push({...s,estimate});const end=deadlineEnd(deadline);if(end!==null){deadlineTotal++;deadlineMet+=Number(s.completedAt<=end)}
  adjustmentRecords+=edits.size;adjustmentTasks+=Number(edits.size>0);
 }
 return {samples:traced,count:traced.length,deadlineTotal,deadlineMet,adjustmentRecords,adjustmentTasks};
}

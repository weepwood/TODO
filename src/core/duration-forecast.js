import {dayKey,shiftDay,validDate} from './domain.js';
const dateOf=value=>Number.isFinite(Date.parse(value))?dayKey(new Date(value)):'';
const q=(sorted,p)=>{const i=(sorted.length-1)*p,lo=Math.floor(i);return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo)};
const round=n=>Math.round(n*10)/10;
export function durationSamples(data,today,list='all'){
 if(!validDate(today))return [];
 const since=shiftDay(today,-179),eligible=new Map();
 for(const t of data.tasks){const date=dateOf(t.completedAt);if(!t.deletedAt&&t.status==='completed'&&date>=since&&date<=today&&(list==='all'||t.listId===list)&&Number.isFinite(t.duration)&&t.duration>0)eligible.set(t.id,{id:t.id,date,completedAt:Date.parse(t.completedAt),estimate:t.duration,actual:0})}
 for(const s of data.sessions){const t=eligible.get(s.taskId),start=Date.parse(s.startedAt);if(t&&(s.mode==='focus'||s.mode==='stopwatch')&&Number.isFinite(s.seconds)&&s.seconds>0&&Number.isFinite(start)&&start<=t.completedAt&&start+s.seconds*1000<=t.completedAt)t.actual+=s.seconds/60}
 return [...eligible.values()].filter(t=>t.actual>0&&Number.isFinite(t.actual)).sort((a,b)=>a.completedAt-b.completedAt||a.id.localeCompare(b.id));
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

import {shiftDay,validDate} from './domain.js';
export function clockMinutes(value){const [h,m]=value.split(':').map(Number);return h*60+m}
export function minuteClock(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
export function snapTimelineMinute(y,height,start,end){
 if(!Number.isFinite(y)||!Number.isFinite(height)||height<=0||end<=start)return null;
 return Math.max(start,Math.min(end-15,Math.round((start+y/height*(end-start))/15)*15));
}
// Interval partitioning: overlapping events share columns, nonoverlapping clusters reclaim full width.
export function layoutTimeline(segments,start=0,end=1440){
 const intervals=segments.map(t=>({...t,startMinute:Math.max(start,clockMinutes(t.time)),endMinute:Math.min(end,clockMinutes(t.endTime))})).filter(t=>Number.isFinite(t.startMinute)&&t.endMinute>t.startMinute).sort((a,b)=>a.startMinute-b.startMinute||b.endMinute-a.endMinute||a.id.localeCompare(b.id));
 const result=[];let cluster=[],lanes=[],maxEnd=-1;
 function finish(){for(const t of cluster)result.push({...t,columns:lanes.length});cluster=[];lanes=[];maxEnd=-1}
 for(const t of intervals){if(cluster.length&&t.startMinute>=maxEnd)finish();let lane=lanes.findIndex(e=>e<=t.startMinute);if(lane<0)lane=lanes.length;lanes[lane]=t.endMinute;cluster.push({...t,lane});maxEnd=Math.max(maxEnd,t.endMinute)}
 if(cluster.length)finish();
 return result;
}

export function resizeTimelineDuration(duration,delta,start,end=1440){
 if(![duration,delta,start,end].every(Number.isFinite)||end<=start)return duration;
 // Clamp within the visible day; preserve exact duration when the gesture is canceled.
 const max=Math.min(1440,Math.floor((end-start)/15)*15);
 if(max<15)return duration;
 return Math.max(15,Math.min(max,Math.round((duration+delta)/15)*15));
}

// Wall-clock 15-minute movement. Crossing a date boundary is only permitted
// on a full-day axis, never when the visible work hours are clipped.
export function timelineMove(date,start,delta,from=0,to=1440){
 if(!validDate(date)||![start,delta,from,to].every(Number.isFinite)||from<0||to>1440||to-from<15)return null;
 const minute=Math.round((start+delta)/15)*15;
 const cross=from===0&&to===1440;
 const bounded=cross?Math.max(-1440,Math.min(2865,minute)):Math.max(from,Math.min(to-15,minute));
 const day=Math.floor(bounded/1440),nextDate=shiftDay(date,day);
 if(!validDate(nextDate))return null;
 return {date:nextDate,time:minuteClock((bounded%1440+1440)%1440),anchor:Number(nextDate.slice(-2)),dayOffset:day,guide:Math.max(from,Math.min(to,bounded))};
}

// Same-day preview only: half-open intervals, excluding the moving task.
// Does not modify the persisted conflict model or block intentional overlaps.
export function previewOverlaps(segments,id,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
 return segments.some(t=>{if(t.id===id||typeof t.time!=='string'||typeof t.endTime!=='string')return false;const a=clockMinutes(t.time),b=clockMinutes(t.endTime);return Number.isFinite(a)&&Number.isFinite(b)&&a<end&&start<b});
}

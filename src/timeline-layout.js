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

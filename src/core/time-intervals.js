import {blockMinutes,expandPlanBlocks} from './plan-block.js';
const MINUTE=60000;
import {localDate,uniqueWallInstant} from './wall-time.js';
export {localDate,wallInstant,uniqueWallInstant} from './wall-time.js';
export function blockInterval(t){
 const start=t.external&&Number.isFinite(t.startInstant)?t.startInstant:+new Date(t.date+'T'+t.time);
 const end=t.external&&Number.isFinite(t.endInstant)?t.endInstant:start+blockMinutes(t)*MINUTE;
 return [start,end];
}
export function busyRanges(tasks){return expandPlanBlocks(tasks).filter(t=>t.status==='pending'&&!t.deletedAt&&t.date&&t.time).map(blockInterval).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a)}
export function elapsedWindow(ranges,date,start,end){
 const a=uniqueWallInstant(date,start),b=uniqueWallInstant(date,end);if(a===null||b===null||b<=a)return null;
 const clipped=ranges.map(([s,e])=>[Math.max(a,s),Math.min(b,e)]).filter(([s,e])=>e>s).sort((x,y)=>x[0]-y[0]);
 let cursor=a,occupied=0;const free=[];
 for(const [s,e] of clipped){if(e<=cursor)continue;if(s>cursor)free.push([cursor,s]);occupied+=e-Math.max(s,cursor);cursor=e}
 if(cursor<b)free.push([cursor,b]);
 return {capacity:(b-a)/MINUTE,occupied:occupied/MINUTE,remaining:(b-a-occupied)/MINUTE,free};
}
export function representableStart(date,start,end,minutes=1){
 for(let a=Math.ceil(start/MINUTE)*MINUTE;a+minutes*MINUTE<=end;a+=MINUTE){
  const d=new Date(a),time=d.toTimeString().slice(0,5);
  if(localDate(d)===date&&uniqueWallInstant(date,time)===a)return {instant:a,time};
 }
 return null;
}

// Find the nearest representable minute, with a deterministic earlier-time tie break.
// The search is bounded by the free intervals of one day.
export function nearestFreeStart(date,free,minutes,target,notBefore=-Infinity,deadline=Infinity){
 let best=null;
 for(const [a,b] of free){
  const lo=Math.ceil(Math.max(a,notBefore)/MINUTE)*MINUTE,hi=Math.floor((Math.min(b,deadline)-minutes*MINUTE)/MINUTE)*MINUTE;
  if(lo>hi)continue;
  const center=Math.max(lo,Math.min(hi,Math.round(target/MINUTE)*MINUTE));
  for(let delta=0;center-delta>=lo||center+delta<=hi;delta+=MINUTE){
   let found=false;
   for(const instant of delta?[center-delta,center+delta]:[center]){
    if(instant<lo||instant>hi)continue;
    const d=new Date(instant),time=d.toTimeString().slice(0,5);
    if(localDate(d)!==date||uniqueWallInstant(date,time)!==instant)continue;
    if(!best||Math.abs(instant-target)<Math.abs(best.instant-target)||Math.abs(instant-target)===Math.abs(best.instant-target)&&instant<best.instant)best={instant,time};
    found=true;
   }
   if(found)break;
  }
 }
 return best;
}

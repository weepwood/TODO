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

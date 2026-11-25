import {reviewPeriod,buildReview} from './task-review.js';
import {makeVisual} from './review-visual.js';
import {readSnapshots,saveSnapshot} from './archive-review.js';
import {shiftDay} from './domain.js';
export function isSnapshotDay(today,mode){
 if(!['day','week','month'].includes(mode))return false;
 const next=shiftDay(today,1);
 if(mode==='week'&&new Date(today+'T12:00:00').getDay()!==0||mode==='month'&&next.slice(0,7)===today.slice(0,7))return false;
 return true;
}
export function automaticSnapshot(storage,data,today,mode,now){
 if(!isSnapshotDay(today,mode))return false;
 const period=reviewPeriod(today,today,mode==='month'?'month':mode==='week');
 if(readSnapshots(storage).some(s=>s.mode===mode&&s.since===period.since&&s.until===period.until))return false;
 const r=buildReview(data,period);saveSnapshot(storage,r,mode,now,makeVisual(data,r));return true;
}

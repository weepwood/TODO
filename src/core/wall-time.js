const MINUTE=60000;
export const localDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
export function wallInstant(date,time){
 if(typeof date!=='string'||typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
 const d=new Date(date+'T'+time);
 return Number.isFinite(+d)&&localDate(d)===date&&d.toTimeString().slice(0,5)===time?+d:null;
}
// Legacy local timestamps cannot distinguish the two occurrences of a repeated hour.
export function uniqueWallInstant(date,time){
 const a=wallInstant(date,time);if(a===null)return null;
 const delta=(new Date(a+86400000).getTimezoneOffset()-new Date(a-86400000).getTimezoneOffset())*MINUTE;
 if(delta>0){const other=new Date(a+delta);if(localDate(other)===date&&other.toTimeString().slice(0,5)===time)return null}
 return a;
}

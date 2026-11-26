// A task estimate is not its calendar occupancy. Legacy tasks use the estimate
// until an explicit block length is chosen. Locks protect scheduling tools.
export const blockMinutes=t=>Number.isInteger(t.planMinutes)&&t.planMinutes>=1&&t.planMinutes<=1440?t.planMinutes:t.duration;
export const validBlock=t=>(t.planMinutes===undefined||t.planMinutes===null||Number.isInteger(t.planMinutes)&&t.planMinutes>=1&&t.planMinutes<=1440)&&(t.planLocked===undefined||typeof t.planLocked==='boolean');
export function blockPatch(task,fields){
 if(task.planLocked&&['date','time','planMinutes'].some(k=>Object.hasOwn(fields,k)&&fields[k]!==task[k]))return null;
 return fields.planLocked===true?{...fields,planMinutes:blockMinutes(task)}:fields;
}

import {performance} from 'node:perf_hooks';
import {initialState,newTask,shiftDay} from '../src/core/domain.js';
import {defaultWeek,previewWeekReflow,elapsedBudget} from '../src/core/weekly-planner.js';
import {taskConflicts} from '../src/core/advanced.js';
import {backupTaskChanges} from '../src/core/backup-selection.js';
const date='2026-11-27',week=defaultWeek();
const measure=fn=>{fn();fn();const values=Array.from({length:7},()=>{const start=performance.now();fn();return performance.now()-start}).sort((a,b)=>a-b);return {medianMs:+values[3].toFixed(2),maxMs:+values.at(-1).toFixed(2),samples:values.length}};
const cases=[];
for(const count of [1000,10000]){
 const fixed={...newTask('固定','inbox',date,'fixed'),time:'09:00',duration:540,planMinutes:540,planLocked:true};
 const movable={...newTask('可重排','inbox',date,'move'),time:'10:00',duration:30};
 const tasks=[fixed,movable,...Array.from({length:count-2},(_,i)=>({...newTask('合成任务 '+i,'inbox',shiftDay(date,14+i%365),'t'+i),time:String(8+i%10).padStart(2,'0')+':00',duration:30,planLocked:true}))];
 const data={...initialState(),tasks},copy=structuredClone(data);copy.tasks[0].notes='变更';
 cases.push({count,conflicts:measure(()=>{if(!taskConflicts(tasks).has('move'))throw Error('missing conflict')}),capacity:measure(()=>{if(elapsedBudget(tasks,date,'09:00','18:00').remaining!==0)throw Error('capacity mismatch')}),weekReflow:measure(()=>{if(previewWeekReflow(data,date,week,7)[0]?.date!=='2026-11-30')throw Error('reflow mismatch')}),backupDiff:measure(()=>{if(backupTaskChanges(data,copy).length!==1)throw Error('diff mismatch')})});
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,method:'synthetic records, 2 warmups + 7 timed samples; no real records; not browser frame latency',cases},null,2));

// Read-only independent acceptance check of the frozen hourly test evidence.
// It does not launch or stop a test, change the database, or certify leak-freedom.
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export function verifyHour({expected,commit,exitCode,progress,final}){
 const failures=[];
 if(!/^[a-f0-9]{40}$/.test(expected)||commit!==expected)failures.push('提交标识不匹配');
 const record=final||progress;
 if(!record)return {status:'incomplete',failures:[...failures,'缺少采样证据']};
 const samples=record.samples,validSamples=Array.isArray(samples)&&samples.length>0&&samples.every((s,i)=>Number.isInteger(s.cycle)&&s.cycle>=0&&Number.isFinite(s.elapsedMs)&&s.elapsedMs>=0&&Number.isFinite(s.usedSize)&&s.usedSize>0&&Number.isFinite(s.totalSize)&&s.totalSize>=s.usedSize&&Number.isInteger(s.domNodes)&&s.domNodes>0&&(!i||(s.cycle>samples[i-1].cycle&&s.elapsedMs>samples[i-1].elapsedMs)));
 if(!validSamples)failures.push('采样序列无效');
 if(!Number.isFinite(record.elapsedMs)||record.elapsedMs<0)failures.push('运行时长无效');
 if(!Array.isArray(record.errors)||record.errors.length)failures.push('页面异常记录未通过');
 const first=validSamples?samples[0]:null,last=validSamples?samples.at(-1):null;
 const summary={elapsedSeconds:record.elapsedMs/1000,rounds:final?record.cycles:record.rounds,sampleCount:validSamples?samples.length:0,firstHeapBytes:first?.usedSize,lastHeapBytes:last?.usedSize,firstDom:first?.domNodes,lastDom:last?.domNodes};
 if(!final||progress?.complete!==true||exitCode===null){
  if(exitCode!==null)failures.push(exitCode===0?'测试已退出但最终证据不完整':'测试退出失败');
  return {status:failures.length?'failed':'incomplete',failures,...summary};
 }
 if(exitCode!==0)failures.push('测试退出失败');
 if(record.elapsedMs<3600000||!last||last.elapsedMs<3600000||first?.cycle!==0||samples.length<2||record.elapsedMs<last.elapsedMs)failures.push('未达到一小时有效采样');
 if(record.tasks!==10000||!Number.isInteger(record.cycles)||record.cycles<1||record.added!==record.cycles+1||record.switches!==2*record.added||record.saved!==record.tasks+record.added||last?.cycle!==record.cycles)failures.push('任务持久化或操作计数不匹配');
 for(const key of ['elapsedMs','cycles','tasks','added','saved','switches'])if(progress[key]!==final[key])failures.push('最终与进度证据不一致：'+key);
 if(JSON.stringify(progress.samples)!==JSON.stringify(final.samples)||JSON.stringify(progress.errors)!==JSON.stringify(final.errors))failures.push('最终与进度采样不一致');
 return {status:failures.length?'failed':'passed-workload',failures,...summary,limitation:'仅验收冻结版本小时级工作负载、持久化及页面异常；堆趋势仍需人工解释，不等于无泄漏或整体验收'};
}
export function readHourEvidence(directory,expected){
 const read=name=>{const file=join(directory,name);return existsSync(file)?readFileSync(file,'utf8'):null};
 const json=name=>{const raw=read(name);return raw===null?null:JSON.parse(raw)};
 const code=read('exit-code.txt');
 return verifyHour({expected,commit:read('commit.txt')?.trim(),exitCode:code===null?null:code.trim()==='0'?0:1,progress:json('shard-hour-progress.json'),final:json('shard-hour-final.json')});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=readHourEvidence(process.argv[2],process.argv[3]);console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='passed-workload'?0:result.status==='incomplete'?2:1}
 catch(e){console.error(e.message);process.exitCode=1}
}

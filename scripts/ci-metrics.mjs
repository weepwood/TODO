// Machine-readable evidence for one browser job and a strict full-gate summary.
import {readFileSync,writeFileSync,readdirSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export function aggregate(metrics,sha,shards){
 assert([1,2].includes(shards));assert.equal(metrics.length,shards);
 const ids=new Set(),all=new Set(),expected=new Set(metrics[0].expectedIds);assert(expected.size>0&&expected.size===metrics[0].expectedIds.length);let passed=0,skipped=0,failed=0,flaky=0,runnerMs=0;
 for(const m of metrics){
  assert.equal(m.sha,sha);assert.equal(m.mode,'full');assert.equal(m.shards,shards);assert(Number.isInteger(m.shard)&&m.shard>=1&&m.shard<=shards&&!ids.has(m.shard));ids.add(m.shard);
  for(const k of ['passed','skipped','failed','flaky','durationMs'])assert(Number.isFinite(m[k])&&m[k]>=0);
  assert.equal(m.failed,0);assert.equal(m.flaky,0);assert(m.passed>0);
  assert.equal(m.ids.length,m.passed+m.skipped+m.failed+m.flaky);
  assert(m.expectedIds.length===expected.size&&new Set(m.expectedIds).size===expected.size&&m.expectedIds.every(id=>expected.has(id)));
  for(const id of m.ids){assert(expected.has(id),'unexpected test '+id);assert(!all.has(id),'duplicate test '+id);all.add(id)}
  passed+=m.passed;skipped+=m.skipped;failed+=m.failed;flaky+=m.flaky;runnerMs+=m.durationMs;
 }
 assert.equal(all.size,expected.size,'missing full-suite tests');
 return {sha,shards,passed,skipped,failed,flaky,tests:all.size,browserRunnerMs:runnerMs,browserCriticalPathMs:Math.max(...metrics.map(m=>m.durationMs))};
}
function collect(suites,out=[]){
 for(const suite of suites||[]){
  for(const spec of suite.specs||[])for(const t of spec.tests||[]){assert(spec.id);out.push(JSON.stringify([spec.id,t.projectName||'',t.repeatEachIndex||0]))}
  collect(suite.suites,out);
 }
 return out;
}
function main(){
 const [cmd,...args]=process.argv.slice(2);let value;
 if(cmd==='record'){
  const [planPath,shardText,shardsText]=args,plan=JSON.parse(readFileSync(planPath,'utf8')),report=JSON.parse(readFileSync('test-results/ci-result.json','utf8')),s=report.stats;
  value={sha:plan.head,mode:plan.mode,shard:Number(shardText),shards:Number(shardsText),passed:s.expected,skipped:s.skipped,failed:s.unexpected,flaky:s.flaky,durationMs:s.duration,ids:collect(report.suites),expectedIds:collect(JSON.parse(readFileSync('ci-list.json','utf8')).suites)};
  assert(value.expectedIds.length>0&&value.ids.every(id=>value.expectedIds.includes(id)));
  if(Number(shardsText)===1)assert.equal(new Set(value.ids).size,new Set(value.expectedIds).size,'incomplete browser execution');
  mkdirSync('ci-metrics',{recursive:true});writeFileSync('ci-metrics/result.json',JSON.stringify(value,null,2)+'\n');
 }else if(cmd==='aggregate'){
  const [dir,sha,count]=args;
  const read=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?read(resolve(folder,e.name)):e.name==='result.json'?[JSON.parse(readFileSync(resolve(folder,e.name),'utf8'))]:[]);
  value=aggregate(read(dir),sha,Number(count));
 }else throw Error('Unknown metrics command');
 const {ids,expectedIds,...summary}=value;const message=JSON.stringify(summary,null,2);console.log(message);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n### Browser evidence\n\n```json\n'+message+'\n```\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();

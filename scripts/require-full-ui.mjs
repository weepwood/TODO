import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
export function hasFullGate(run,jobs,sha){
 return run.head_sha===sha&&run.event==='workflow_dispatch'&&run.conclusion==='success'&&jobs.some(j=>j.name==='UI full gate'&&j.conclusion==='success');
}
const sha=process.argv[2];
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert(/^[a-f0-9]{40}$/.test(sha));
 const repo=process.env.GITHUB_REPOSITORY;assert(repo&&process.env.GH_TOKEN);
 const api=(...args)=>JSON.parse(execFileSync('gh',['api',...args],{encoding:'utf8',timeout:15000}));
 const runs=api('--method','GET','repos/'+repo+'/actions/workflows/ui-review.yml/runs','-f','head_sha='+sha,'-f','event=workflow_dispatch','-f','status=success','-f','per_page=30').workflow_runs;
 for(const r of runs||[]){
  if(r.head_sha!==sha||r.event!=='workflow_dispatch'||r.conclusion!=='success')continue;
  const jobs=api('repos/'+repo+'/actions/runs/'+r.id+'/jobs?per_page=100').jobs;
  if(hasFullGate(r,jobs,sha)){console.log('Verified full UI gate run '+r.id+' for '+sha);process.exit(0)}
 }
 throw Error('Exact candidate has no successful manual full UI gate');
}

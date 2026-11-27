import {execFileSync,spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
const specName=/^e2e\/[a-zA-Z0-9_-]+\.spec\.js$/;
export const CORE=['e2e/smoke.spec.js'];
// Only reviewed, narrow leaf modules may reduce the browser scope. Shared
// UI/domain/storage/auth/native code and unrecognized paths always fall back.
const group=names=>names.split(' ').map(n=>'e2e/'+n+'.spec.js');
export const LEAF_MAP={
 'src/components/ReminderHistory.jsx':group('advanced platform ui-archive-review ui-business ui-design-system ui-desktop-list-interaction ui-detail-sections ui-detail-timeline ui-governance ui-rc-lifetime ui-reminder ui-settings-layout ui-unified-layout'),
 'src/components/DraftDirectory.jsx':group('ui-advanced-task-search ui-capacity-closeout ui-compatible-release ui-design-system ui-detail-sections ui-governance ui-idb-pilot ui-rc-lifetime ui-shard-incremental ui-shell-design ui-v14-studio ui-v15-mobile-insights ui-v15-motion ui-v16-professional ui-v16-third ui-visual-system v061 v112 v114'),
 'src/calendar-feeds.js':group('calendar-feed cloud pwa ui-compatible-release ui-v14-studio'),
 'src/ical-import.js':group('calendar-feed cloud ui-compatible-release ui-v14-studio'),
};
export const SPECIAL={
 visual:group('ui-visual-final ui-workflow-responsive ui-v15-motion ui-v16-third ui-v16-second ui-mobile-design-matrix'),
 pressure:group('ui-performance-baseline ui-search-lifecycle ui-workspace-lifecycle ui-sustained-session ui-rc-retainers'),
};
const doc=p=>/^(?:README|CHANGELOG|AGENTS|CLAUDE|DESIGN|ANDROID|RELEASE)\.md$/.test(p)||/^docs\/[\w./-]+\.md$/.test(p);
const unit=p=>/^tests\/[\w-]+\.test\.js$/.test(p);
export function parseNameStatus(raw){
 const parts=raw.split('\0');if(parts.at(-1)==='')parts.pop();
 const result=[];
 for(let i=0;i<parts.length;){const status=parts[i++],path=parts[i++];if(!path||!['A','M','D','T','U','X','B'].includes(status))throw Error('Unrecognized diff record');result.push({status,path})}
 return result;
}
export function planScope(changes,{level='integration',inventory}={}){
 assert(['daily','integration','release'].includes(level));assert(Array.isArray(inventory)&&inventory.length);
 const all=new Set(inventory), reasons=[], selected=new Set();let full=level==='release',hasUnit=false,hasBrowser=false;
 if(full)reasons.push('release: full suite');
 for(const {status,path} of changes){
  if(doc(path)&&['M','A','D'].includes(status))continue;
  if(!['M','A'].includes(status)){full=true;reasons.push('deleted/type/unknown: '+path);continue}
  if(unit(path)){hasUnit=true;continue}
  if(specName.test(path)&&all.has(path)){hasBrowser=true;selected.add(path);continue}
  if(status==='M'&&Object.hasOwn(LEAF_MAP,path)){hasBrowser=true;for(const s of LEAF_MAP[path])selected.add(s);reasons.push('reviewed leaf: '+path);continue}
  full=true;reasons.push('conservative fallback: '+path);
 }
 if(hasBrowser)for(const s of CORE)selected.add(s);
 if([...selected].some(s=>!all.has(s))){full=true;reasons.push('missing mapped spec')}
 const mode=full?'full':hasBrowser?'targeted':hasUnit?'unit':'docs';
 return {level,mode,unit:mode!=='docs',browser:mode==='full'||mode==='targeted',files:mode==='full'?[...all].sort():mode==='targeted'?[...selected].sort():[],reasons,changes};
}
export function chooseBaseline(base,head,candidates,isAncestor){
 for(const c of candidates){
  if(c.event!=='workflow_dispatch'||c.conclusion!=='success'||!c.fullGate||!(/^[a-f0-9]{40}$/.test(c.sha)))continue;
  if(isAncestor(base,c.sha)&&isAncestor(c.sha,head))return c.sha;
 }
 return base;
}
function ancestor(a,b){return spawnSync('git',['merge-base','--is-ancestor',a,b],{stdio:'ignore'}).status===0}
function recentFull(base,head,branch){
 if(!branch||!process.env.GH_TOKEN||!process.env.GITHUB_REPOSITORY)return base;
 const api=(...args)=>JSON.parse(execFileSync('gh',['api',...args],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}));
 try{
  const runs=api('--method','GET','repos/'+process.env.GITHUB_REPOSITORY+'/actions/workflows/ui-review.yml/runs','-f','branch='+branch,'-f','event=workflow_dispatch','-f','status=success','-f','per_page=8').workflow_runs;
  const candidates=[];
  for(const r of runs||[]){
   if(!ancestor(base,r.head_sha)||!ancestor(r.head_sha,head))continue;
   const jobs=api('repos/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+r.id+'/jobs?per_page=100').jobs||[];
   candidates.push({event:r.event,conclusion:r.conclusion,sha:r.head_sha,fullGate:jobs.some(j=>j.name==='UI full gate'&&j.conclusion==='success')});
  }
  return chooseBaseline(base,head,candidates,ancestor);
 }catch{console.error('Trusted full baseline unavailable; using cumulative diff');return base}
}
export function collectChanges(base,head,working){
 const changes=parseNameStatus(git('diff','--name-status','-z','--no-renames',base,...(working?[]:[head]),'--'));
 if(working)for(const path of git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean))changes.push({status:'A',path});
 return changes;
}
function main(){
 const args=process.argv.slice(2),arg=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1]};
 const level=arg('--level','daily'),working=args.includes('--working'),head=git('rev-parse','HEAD').trim();
 const inventory=readdirSync('e2e').filter(n=>specName.test('e2e/'+n)).map(n=>'e2e/'+n).sort();
 const original=arg('--base',level==='daily'?'HEAD':'origin/main');
 let base=head,baseline=head,plan;
 try{
  base=level==='release'?head:git('rev-parse','--verify',original+'^{commit}').trim();
  baseline=level==='integration'&&args.includes('--ci-baseline')?recentFull(base,head,arg('--branch','')):base;
  plan=planScope(level==='release'?[]:collectChanges(baseline,head,working),{level,inventory});
 }catch(e){console.error(e.message);plan=planScope([],{level:'release',inventory});plan.reasons.push('diff could not be resolved')}

 const suite=arg('--suite',null);
 if(suite){assert(level==='daily'&&Object.hasOwn(SPECIAL,suite),'Diagnostic suite is local daily only');const files=SPECIAL[suite];assert(files.every(f=>inventory.includes(f)));plan={...plan,mode:'targeted',unit:true,browser:true,files:[...files].sort(),reasons:['explicit diagnostic suite: '+suite]}}
 plan={...plan,head,base,baseline,working};
 const output=arg('--output',args.includes('--run')?'ci-plan.json':null);
 if(output)writeFileSync(output,JSON.stringify(plan,null,2)+'\n');
 console.log(JSON.stringify(plan,null,2));
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'mode='+plan.mode+'\nunit='+plan.unit+'\nbrowser='+plan.browser+'\n');
 if(args.includes('--run')){
  const env={...process.env,CI:'true',TODO_BROWSER_CHANNEL:process.env.TODO_BROWSER_CHANNEL||'chromium',VITE_SUPABASE_URL:'https://example.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'qa-isolated-placeholder',VITE_TODO_EXTERNAL_API:'0'};
  // Local diagnostics use the same isolated standard-build flags as CI.
  for(const flag of ['TODO_IDB_PILOT','VITE_TODO_IDB_PILOT','TODO_UI_RETAINER','TODO_SUSTAINED','VITE_TODO_SIGNED_RELEASE'])delete env[flag];
  const run=(cmd,a,shell=false)=>{const r=spawnSync(cmd,a,{stdio:'inherit',env,shell});if(r.error||r.status!==0)process.exit(r.status||1)};
  const npm=(...a)=>run(process.platform==='win32'?'npm.cmd':'npm',a,process.platform==='win32');
  if(plan.unit)npm('test');
  if(plan.browser){npm('run','build');run(process.execPath,['scripts/ci-run-browser.mjs',output]);run(process.execPath,['scripts/ci-metrics.mjs','record',output,'1','1'])}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();

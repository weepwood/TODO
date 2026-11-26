// Isolated compatibility gate. No app installation, browser data or cloud access.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrateState,saveState,readState,STORAGE_KEY,BACKUP_KEY} from '../src/core/domain.js';
import {startFocusTimer,settleFocus,startQueueRun} from '../src/core/focus-engine.js';
import {makeQueueRun} from '../src/core/focus-queue.js';
import {unsafeHistoryPull} from '../src/services/sync-merge.js';
const git=(...args)=>execFileSync('git',args,{cwd:new URL('..',import.meta.url),encoding:'utf8'});
const revision=git('rev-parse','6b78c9b^{commit}').trim();
const dir=mkdtempSync(join(process.env.TODO_LEGACY_TMP||tmpdir(),'todo-legacy-probe-'));
const roundtrip=state=>JSON.parse(JSON.stringify(state));
try{
 writeFileSync(join(dir,'package.json'),'{"type":"module"}');
 for(const f of ['domain','advanced','smart-lists','focus-engine'])writeFileSync(join(dir,f+'.js'),git('show',revision+':src/'+f+'.js'));
 const old=await import(pathToFileURL(join(dir,'domain.js'))),legacy=await import(pathToFileURL(join(dir,'focus-engine.js')));
 const d=old.initialState(),date='2026-11-26',at=Date.parse(date+'T09:00:00');d.tasks=[old.newTask('旧端隔离任务','inbox',date,'a')];d.focusConfig.autoContinue=true;
 const raw=JSON.stringify(d),map=new Map([[STORAGE_KEY,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const migrated=readState(storage);saveState(storage,migrated);assert.equal(storage.getItem(BACKUP_KEY),raw);
 assert.equal(migrated.tasks[0].title,d.tasks[0].title);assert.equal(migrated.focusConfig.smartPlan,true);
 console.log('PASS legacy snapshot migration and original backup');
 const extended=migrateState({...migrated,tasks:[{...migrated.tasks[0],planLocked:true,planMinutes:20,planSegments:[{id:'s',date,time:'10:00',minutes:10}]}]});
 old.saveState(storage,old.migrateState(roundtrip(extended)));const restored=readState(storage);
 assert.deepEqual(restored.tasks[0].planSegments,extended.tasks[0].planSegments);assert.equal(restored.tasks[0].planLocked,true);assert.equal(restored.tasks[0].planMinutes,20);
 assert.equal(unsafeHistoryPull(extended,restored),false);
 console.log('PASS actual legacy serialization preserves supplemental blocks and lock');
 const run=makeQueueRun({items:[{id:'a'}]},extended,120,'legacy-queue'),q=startQueueRun(extended,run,at);
 const l=migrateState(legacy.settleFocus(old.migrateState(roundtrip(q)),at+q.timer.target*1000)),newer=settleFocus(q,at+q.timer.target*1000);
 assert.equal(unsafeHistoryPull(q,l),true);assert.equal(unsafeHistoryPull(q,newer),false);
 console.log('PASS legacy continuous-queue settlement rejected; current receipt accepted');
 const p=startFocusTimer(extended,{mode:'focus',taskId:'a',planned:true,now:at});
 const pl=migrateState(legacy.settleFocus(old.migrateState(roundtrip(p)),at+p.timer.target*1000)),pn=settleFocus(p,at+p.timer.target*1000);
 assert.equal(pl.timer.mode,'break');assert.equal(pn.timer,null);assert.equal(unsafeHistoryPull(p,pl),true);assert.equal(unsafeHistoryPull(p,pn),false);
 console.log('PASS legacy smart-focus settlement rejected; current natural completion accepted');
 console.log('LEGACY_SOURCE_PASS '+revision);
}finally{rmSync(dir,{recursive:true,force:true})}

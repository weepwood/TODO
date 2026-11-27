import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {planScope,parseNameStatus,chooseBaseline,LEAF_MAP,SPECIAL} from '../scripts/ci-scope.mjs';
const inventory=readdirSync(new URL('../e2e/',import.meta.url)).filter(n=>n.endsWith('.spec.js')).map(n=>'e2e/'+n);
const change=(path,status='M')=>({status,path});
const plan=(paths,level='integration')=>planScope(paths.map(p=>typeof p==='string'?change(p):p),{level,inventory});
test('docs and direct unit edits do not start browsers; release always full',()=>{
 assert.equal(plan(['docs/ACTIVE.md','AGENTS.md']).mode,'docs');
 assert.equal(plan(['tests/live-verifier.test.js']).mode,'unit');
 const full=plan(['docs/ACTIVE.md'],'release');assert.equal(full.mode,'full');assert.deepEqual(full.files,[...inventory].sort());
});
test('direct test and reviewed leaf select core plus affected specs; union deduplicated',()=>{
 assert.deepEqual(plan(['e2e/cloud.spec.js']).files,['e2e/cloud.spec.js','e2e/smoke.spec.js']);
 for(const [path,files] of Object.entries(LEAF_MAP)){
  assert(files.every(s=>inventory.includes(s)));const result=plan([path,'e2e/cloud.spec.js']);
  assert.equal(result.mode,'targeted');assert(files.every(f=>result.files.includes(f)));assert(result.files.includes('e2e/cloud.spec.js'));
 }
 for(const files of Object.values(SPECIAL))assert(files.every(s=>inventory.includes(s)));
});
test('shared dependencies, data, auth, build, fixture, public files, new source, deletes and unknowns fail closed',()=>{
 for(const c of ['src/main.jsx','src/styles.css','src/cloud.jsx','src/core/domain.js','src/services/sync-merge.js','src/services/social-auth.js','src-tauri/Cargo.toml','supabase/rollout/oauth-only-signup.sql','public/sw.js','index.html','vite.config.js','package-lock.json','playwright.config.js','e2e/fixtures/new.js','scripts/ci-scope.mjs','.github/workflows/ui-review.yml','unknown.txt',change('e2e/cloud.spec.js','D'),change('src/calendar-feeds.js','A')]){
  assert.equal(plan([c]).mode,'full',JSON.stringify(c));
 }
 const reduced=inventory.filter(n=>n!=='e2e/calendar-feed.spec.js');
 assert.equal(planScope([change('src/calendar-feeds.js')],{inventory:reduced}).mode,'full');
});
test('NUL diff preserves spaces; rename is conservatively delete/add, malformed records reject',()=>{
 assert.deepEqual(parseNameStatus('M\0docs/my note.md\0D\0e2e/old.spec.js\0A\0e2e/new.spec.js\0'),[change('docs/my note.md'),change('e2e/old.spec.js','D'),change('e2e/new.spec.js','A')]);
 assert.throws(()=>parseNameStatus('R100\0a\0b\0'));
});
test('only successful explicit full gate, ancestral on both sides, can advance cumulative baseline',()=>{
 const base='a'.repeat(40),head='c'.repeat(40),old='b'.repeat(40),foreign='d'.repeat(40);
 const isAncestor=(a,b)=>a===b||(a===base&&b===old)||(a===old&&b===head)||(a===base&&b===head);
 const good={event:'workflow_dispatch',conclusion:'success',fullGate:true,sha:old};
 for(const bad of [{...good,event:'pull_request'},{...good,conclusion:'failure'},{...good,fullGate:false},{...good,sha:foreign}])assert.equal(chooseBaseline(base,head,[bad],isAncestor),base);
 assert.equal(chooseBaseline(base,head,[good],isAncestor),old);
});

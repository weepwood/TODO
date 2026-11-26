// Local browser gate: run under the existing resource-budget wrapper.
// On macOS 27, use an empty app-data home for Firefox instead of the real user profile.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const env={...process.env,TODO_BROWSER_ENGINE:'firefox'};
const home=process.platform==='darwin'?mkdtempSync(join(tmpdir(),'todo-firefox-qa-home-')):null;
if(home)env.CFFIXED_USER_HOME=home;
try{
 const result=spawnSync(process.execPath,['node_modules/playwright/cli.js','test','e2e/ui-rc-gates.spec.js','e2e/ui-feature-forward.spec.js','e2e/pwa.spec.js','e2e/cloud.spec.js','--workers=1'],{cwd,env,stdio:'inherit'});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
}finally{
 // Only remove the unique, newly created test directory.
 if(home)rmSync(home,{recursive:true,force:true,maxRetries:10,retryDelay:300});
}

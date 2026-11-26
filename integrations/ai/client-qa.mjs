import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {localFixture} from './local-fixture.mjs';
const f=await localFixture(),dir=await mkdtemp(join(tmpdir(),'todo-ai-client-'));
try{
 const token=(await f.api('qa-owner-a','/v1/owner/tokens',{label:'CLI QA',automatic:false})).body.token;
 const mcp=fileURLToPath(new URL('./mcp.mjs',import.meta.url)),home=join(dir,'home'),codexHome=join(dir,'codex'),claudeHome=join(dir,'claude');
 await Promise.all([home,codexHome,claudeHome].map(p=>mkdir(p)));
 const env={PATH:process.env.PATH,HOME:home,CODEX_HOME:codexHome,CLAUDE_CONFIG_DIR:claudeHome,TODO_API_URL:f.base,TODO_API_TOKEN:token,DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',NO_COLOR:'1'};
 function run(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{cwd:dir,env,stdio:['ignore','pipe','pipe']});let text='';const timer=setTimeout(()=>{p.kill();reject(Error('CLI timeout'))},30000);p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('exit',code=>{clearTimeout(timer);resolve({code,text:text.replaceAll(token,'[synthetic token redacted]')})})})}
 const codex=process.env.TODO_QA_CODEX_BIN,claude=process.env.TODO_QA_CLAUDE_BIN;
 if(codex){
  await writeFile(join(codexHome,'config.toml'),'[mcp_servers.todo]\ncommand = '+JSON.stringify(process.execPath)+'\nargs = ['+JSON.stringify(mcp)+']\nenv_vars = ["TODO_API_URL", "TODO_API_TOKEN"]\n');
  const version=await run(codex,['--version']),list=await run(codex,['mcp','list','--json']);assert.equal(list.code,0);assert(list.text.includes('todo'));console.log(version.text.trim()+' · isolated config parsed, mcp list includes todo (not a model call)');
 }
 if(claude){
  const version=await run(claude,['--version']);
  const add=await run(claude,['mcp','add','--scope','user','--transport','stdio','todo','--',process.execPath,mcp]);
  if(add.code!==0)throw Error('Claude MCP registration failed: '+add.text.slice(0,300));
  const list=await run(claude,['mcp','list']);assert.equal(list.code,0);assert.match(list.text,/todo[\s\S]*Connected/i);console.log(version.text.trim()+' · actual MCP connectivity confirmed by claude mcp list');
 }
}finally{await f.close();await rm(dir,{recursive:true,force:true})}

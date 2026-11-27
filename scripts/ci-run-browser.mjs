// Run a validated plan, never silently accept an empty browser selection.
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const plan=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(plan.head,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
assert(['targeted','full'].includes(plan.mode)&&plan.browser&&plan.files.length);
const shard=process.argv[3];
assert(!shard||plan.mode==='full'&&/^[12]\/2$/.test(shard));
assert(plan.files.every(f=>/^e2e\/[\w-]+\.spec\.js$/.test(f)));
const base=['node_modules/@playwright/test/cli.js','test',...(plan.mode==='full'?[]:plan.files.map(f=>'/'+f.replaceAll('.','\\.')+'$'))];
// The full inventory is collected without sharding; aggregation must match it.
const listEnv={...process.env};delete listEnv.PLAYWRIGHT_JSON_OUTPUT_NAME;delete listEnv.PLAYWRIGHT_JSON_OUTPUT_FILE;
const inventory=execFileSync(process.execPath,[...base,'--list','--reporter=json'],{encoding:'utf8',env:listEnv,maxBuffer:16*1024*1024});
writeFileSync('ci-list.json',inventory);
const files=new Set();
function listed(suites){for(const suite of suites||[]){for(const spec of suite.specs||[])if(spec.tests?.length)files.add('e2e/'+spec.file.replaceAll('\\','/'));listed(suite.suites)}}
listed(JSON.parse(inventory).suites);
assert(plan.files.every(f=>files.has(f)),'A planned spec has no discovered tests');
if(plan.mode==='targeted')assert.equal(files.size,plan.files.length,'Unexpected targeted file');
const args=[...base,'--workers=2','--reporter=list,json',...(shard?['--shard='+shard]:[])];
const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_NAME:'test-results/ci-result.json'}});
process.exit(result.status??1);

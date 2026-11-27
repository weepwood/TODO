// Verify original signing run identity (metadata) and exact release asset bytes.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,createPublicKey,verify} from 'node:crypto';
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.GITHUB_REF,'refs/heads/research/signed-upgrade-20261127');
const platform=process.argv[2];assert(['mac','android'].includes(platform));
const pins=JSON.parse(readFileSync(new URL('./signed-'+platform+'-upgrade-pins.json',import.meta.url),'utf8'));
const api=path=>JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8',timeout:30000}));
const base='repos/weepwood/TODO/actions/';
const out=platform+'-upgrade-evidence';mkdirSync(out,{recursive:true});
const evidence=[];
for(const [i,pin] of pins.entries()){
 const run=api(base+'runs/'+pin.runId),a=api(base+'artifacts/'+pin.artifactId);
 assert.equal(run.head_sha,pin.sha);assert.equal(run.path,'.github/workflows/signed-release.yml');assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 assert.equal(a.workflow_run.id,pin.runId);assert.equal(a.name,'signed-'+platform);assert.equal(a.expired,false);
 const dir=join(process.env.RUNNER_TEMP,'todo-'+platform+'-alpha.'+(i+1));
 assert.deepEqual(readdirSync(dir).sort(),Object.keys(pin.files).sort());
 for(const [name,digest] of Object.entries(pin.files))assert.equal(createHash('sha256').update(readFileSync(join(dir,name))).digest('hex'),digest);
 if(platform==='mac'){
  const decode=s=>Buffer.from(s.trim(),'base64'),lines=s=>decode(s).toString('utf8').trimEnd().split(/\r?\n/);
  const raw=decode(lines(process.env.TODO_VERIFY_PUBLIC_KEY)[1]);assert.equal(raw.length,42);assert.equal(raw.subarray(0,2).toString(),'Ed');
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw.subarray(10)]),format:'der',type:'spki'});
  const name='TODO_'+pin.version+'_aarch64.app.tar.gz',bytes=readFileSync(join(dir,name)),[untrusted,sig,comment,global]=lines(readFileSync(join(dir,name+'.sig'),'utf8')),record=decode(sig);
  assert(untrusted.startsWith('untrusted comment:')&&comment.startsWith('trusted comment: '));assert.equal(record.length,74);assert.equal(record.subarray(0,2).toString(),'ED');assert(record.subarray(2,10).equals(raw.subarray(2,10)));
  assert(verify(null,createHash('blake2b512').update(bytes).digest(),key,record.subarray(10)));
  assert(verify(null,Buffer.concat([record.subarray(10),Buffer.from(comment.slice(17))]),key,decode(global)));
 }else{
  const apk=join(dir,'TODO_'+pin.version+'_arm64.apk'),tools=join(process.env.ANDROID_HOME,'build-tools','36.0.0');
  const cert=execFileSync(join(tools,'apksigner'),['verify','--verbose','--print-certs',apk],{encoding:'utf8'});
  assert(cert.includes('Signer #1 certificate SHA-256 digest: '+process.env.TODO_VERIFY_ANDROID_PIN));
  const info=execFileSync(join(tools,'aapt'),['dump','badging',apk],{encoding:'utf8'});
  assert(info.includes("package: name='com.weepwood.todo' versionCode='"+(102001+i)+"' versionName='"+pin.version+"'"));assert(info.includes("native-code: 'arm64-v8a'"));assert(!info.includes('application-debuggable'));
 }
 evidence.push(pin);console.log('PASS original '+platform+' signed assets '+pin.version);
}
writeFileSync(join(out,'assets.json'),JSON.stringify(evidence,null,2)+'\n');

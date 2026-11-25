// Promote only an already downloaded, fully verified immutable release.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateFeed,compareVersion} from '../src/services/updates/protocol.js';
const dir=process.argv[2],tag=process.argv[3];assert(dir&&tag);
const feed=JSON.parse(readFileSync(join(dir,'TODO-manifest.json'),'utf8')),r=validateFeed(feed,feed.channel);assert(r&&r.tag===tag);
const checks=readFileSync(join(dir,'SHA256SUMS.txt'),'utf8').trim().split('\n');
const names=new Set();
for(const line of checks){
 const m=line.match(/^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/);assert(m&&!names.has(m[2]));
 names.add(m[2]);assert.equal(createHash('sha256').update(readFileSync(join(dir,m[2]))).digest('hex'),m[1]);
}
assert.deepEqual([...names].sort(),readdirSync(dir).filter(x=>x!=='SHA256SUMS.txt').sort());
for(const a of Object.values(r.platforms)){
 const file=a.url.split('/').at(-1);assert(names.has(file));
 const bytes=readFileSync(join(dir,file));assert.equal(bytes.length,a.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);
 if(a.signature)assert.equal(readFileSync(join(dir,file+'.sig'),'utf8').trim(),a.signature);
}
const desktop=JSON.parse(readFileSync(join(dir,'TODO-desktop.json'),'utf8'));
assert.equal(desktop.version,r.version);
for(const k of ['windows-x86_64','darwin-aarch64'])assert.deepEqual(desktop.platforms[k],{url:r.platforms[k].url,signature:r.platforms[k].signature});
const target='public/updates/'+feed.channel+'.json',old=validateFeed(JSON.parse(readFileSync(target,'utf8')),feed.channel);
if(old){assert(compareVersion(r.version,old.version)>0,'Release downgrade or duplicate');assert(r.platforms['android-aarch64'].versionCode>old.platforms['android-aarch64'].versionCode,'Android versionCode not increasing')}
const other=feed.channel==='stable'?'preview':'stable';
const otherRelease=validateFeed(JSON.parse(readFileSync('public/updates/'+other+'.json','utf8')),other);
if(otherRelease)assert(r.platforms['android-aarch64'].versionCode>otherRelease.platforms['android-aarch64'].versionCode,'Android versionCode must increase across channels');
if(process.argv.includes('--write')){
 writeFileSync(target,JSON.stringify(feed,null,2)+'\n');
 writeFileSync('public/updates/'+feed.channel+'-desktop.json',JSON.stringify(desktop,null,2)+'\n');
}
console.log('Verified signed release asset metadata: '+tag);

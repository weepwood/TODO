import {readdirSync,mkdirSync,copyFileSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {RELEASE_BASE,releaseChannel,validateFeed} from '../src/services/updates/protocol.js';
const pkg=JSON.parse(readFileSync('package.json','utf8')),version=pkg.version,tag='v'+version,channel=releaseChannel(version);
const base=RELEASE_BASE+'download/'+tag+'/';
const versionCode=JSON.parse(readFileSync('src-tauri/tauri.android.conf.json','utf8')).bundle.android.versionCode;
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const exactly=(paths,predicate)=>{const matched=paths.filter(predicate);assert.equal(matched.length,1,'Expected one release asset: '+matched.join(','));return matched[0]};
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const meta=p=>({url:base+p.split('/').at(-1),size:statSync(p).size,sha256:hash(p)});
const mode=process.argv[2],dest=process.argv[3]||'release-assets';mkdirSync(dest,{recursive:true});
const name={windows:'TODO_'+version+'_x64-setup.exe',mac:'TODO_'+version+'_aarch64.app.tar.gz',dmg:'TODO_'+version+'_aarch64.dmg',android:'TODO_'+version+'_arm64.apk'};
if(mode==='windows'||mode==='mac'){
 const target=mode==='windows'?'x86_64-pc-windows-msvc':'aarch64-apple-darwin';
 const files=walk('src-tauri/target/'+target+'/release/bundle');
 const pkgfile=exactly(files,p=>mode==='windows'?p.endsWith('-setup.exe'):p.endsWith('.app.tar.gz'));
 const sig=exactly(files,p=>p===pkgfile+'.sig');
 copyFileSync(pkgfile,join(dest,name[mode]));copyFileSync(sig,join(dest,name[mode]+'.sig'));
 if(mode==='mac')copyFileSync(exactly(files,p=>p.endsWith('.dmg')),join(dest,name.dmg));
}else if(mode==='manifest'){
 const cert=process.env.TODO_ANDROID_CERT_SHA256;assert(/^[a-f0-9]{64}$/.test(cert||''));
 const p=k=>join(dest,name[k]);
 const platforms={
  'windows-x86_64':{...meta(p('windows')),signature:readFileSync(p('windows')+'.sig','utf8').trim()},
  'darwin-aarch64':{...meta(p('mac')),signature:readFileSync(p('mac')+'.sig','utf8').trim()},
  'android-aarch64':{...meta(p('android')),versionCode,packageName:'com.weepwood.todo',certificate:cert}
 };
 assert(statSync(p('dmg')).size>0);
 const release={version,tag,notes:'TODO '+version+'：统一品牌图标、应用内更新与跨平台发布。',publishedAt:new Date().toISOString(),platforms};
 const feed={schema:1,channel,release};validateFeed(feed,channel);
 const desktop={version,notes:release.notes,pub_date:release.publishedAt,platforms:Object.fromEntries(['windows-x86_64','darwin-aarch64'].map(k=>[k,{url:platforms[k].url,signature:platforms[k].signature}]))};
 writeFileSync(join(dest,'TODO-manifest.json'),JSON.stringify(feed,null,2)+'\n');
 writeFileSync(join(dest,'TODO-desktop.json'),JSON.stringify(desktop,null,2)+'\n');
 writeFileSync(join(dest,'BUILD_COMMIT.txt'),process.env.GITHUB_SHA+'\n');
 const files=readdirSync(dest).filter(p=>p!=='SHA256SUMS.txt').sort();
 writeFileSync(join(dest,'SHA256SUMS.txt'),files.map(p=>hash(join(dest,p))+'  '+p).join('\n')+'\n');
}else throw Error('unknown release collection mode');

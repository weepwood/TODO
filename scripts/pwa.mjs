import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
export async function generateWorker(root='dist'){
 async function walk(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())out.push(...await walk(path));else out.push(path)}return out}
 const dir=resolve(root),files=(await walk(dir)).filter(p=>/\.(?:js|css|html|png|svg|webmanifest|woff2?)$/.test(p)&&!p.endsWith('/sw.js')).sort();
 const hash=createHash('sha256');hash.update(await readFile(new URL(import.meta.url)));for(const path of files){hash.update(relative(dir,path));hash.update(await readFile(path))}
 const version=hash.digest('hex').slice(0,16),assets=files.map(p=>'./'+relative(dir,p).replaceAll('\\','/'));
 await writeFile(resolve(dir,'sw.js'),`const VERSION=${JSON.stringify(version)};
const FILES=${JSON.stringify(assets)};
const PREFIX='todo-static:'+self.registration.scope+':';
const CACHE=PREFIX+VERSION;
// Normal released worker only supports the existing legacy writer.
self.addEventListener('message',event=>{if(event.data?.type==='TODO_STORAGE_PROTOCOL')event.ports[0]?.postMessage({mode:'legacy',version:1,build:VERSION})});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const req=event.request,u=new URL(req.url);
 if(req.method!=='GET'||u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;
 if(req.mode==='navigate'){
  // Never cache navigation URLs or auth callbacks; only serve the built static shell when offline.
  event.respondWith(fetch(req).catch(()=>caches.open(CACHE).then(c=>c.match(new URL('./index.html',self.registration.scope).href,{ignoreVary:true})).then(r=>r||Response.error())));return;
 }
 if(u.search||!FILES.some(path=>new URL(path,self.registration.scope).href===u.href))return;
 event.respondWith(caches.open(CACHE).then(async c=>await c.match(u.href,{ignoreVary:true})||fetch(req)));
});`);
}

// Test-only worker: models a cooperating legacy protocol, no production cache.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type==='TODO_STORAGE_PROTOCOL')event.ports[0]?.postMessage({mode:'legacy',version:1});
});

const CACHE='medlembrete-v10',SDK_CACHE='medlembrete-sdk-v1';
const ASSETS=['/','/index.html','/styles.css','/app.js','/config.js','/manifest.json','/icon.svg','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
const SDK=['app','auth','firestore'].map(n=>`https://www.gstatic.com/firebasejs/10.13.2/firebase-${n}-compat.js`);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const c=await caches.open(CACHE);await c.addAll(ASSETS);
    const sdk=await caches.open(SDK_CACHE);
    await Promise.allSettled(SDK.map(async u=>{if(!await sdk.match(u))await sdk.put(u,await fetch(new Request(u,{mode:'no-cors'})))}));
  })());
  self.skipWaiting();
});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==SDK_CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  if(req.url.startsWith('https://www.gstatic.com/firebasejs/')){
    event.respondWith(caches.open(SDK_CACHE).then(async c=>(await c.match(req.url))||fetch(req).then(r=>{c.put(req.url,r.clone());return r})));
    return;
  }
  if(!req.url.startsWith(self.location.origin))return;
  event.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r;}).catch(()=>caches.match(req).then(r=>r||caches.match('/index.html'))));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list[0]?.focus()||clients.openWindow('/')));});

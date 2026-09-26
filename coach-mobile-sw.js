/* O Coach mobile guarda apenas o shell da aplicação. Dados de alunos e chamadas
   autenticadas à API nunca entram em cache no dispositivo. */
const CACHE = 'almove-coach-mobile-shell-v1';
const SHELL = [
  '/coach-mobile.html',
  '/coach-mobile-manifest.json',
  '/icons/coach-192.png',
  '/icons/coach-512.png',
  '/js/firebase-config.js',
  '/js/firebase-sdk.js',
  '/js/firebase-auth.js',
  '/js/firebase-crm-session.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key.startsWith('almove-coach-mobile-') && key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
});
function offline() {
  return new Response('<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coach sem ligação</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#07121d;color:#eef7ff;font:16px system-ui,sans-serif}main{max-width:330px;padding:28px;text-align:center}strong{color:#22d3c5}p{color:#b9c9d8;line-height:1.5}</style><main><strong>ANDRÉ MARTINS · COACH</strong><h1>Sem ligação</h1><p>Volta a ligar-te à internet para consultar dados atualizados e registar uma sessão.</p></main></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
self.addEventListener('fetch', function (event) {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && url.pathname === '/coach-mobile.html') {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })).then(function (response) { const copy = response.clone(); caches.open(CACHE).then(function (cache) { return cache.put('/coach-mobile.html', copy); }); return response; }).catch(offline));
    return;
  }
  if (url.origin === self.location.origin && SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).then(function (response) { const copy = response.clone(); caches.open(CACHE).then(function (cache) { return cache.put(request, copy); }); return response; }).catch(function () { return caches.match(request); }));
  }
});

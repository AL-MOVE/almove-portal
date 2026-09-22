/* O Coach guarda apenas o shell público da aplicação. Dados clínicos, alunos,
   credenciais e chamadas API continuam sempre a ser pedidas à rede. */
const VERSAO_CACHE_COACH = 'almove-coach-shell-v2';
const SHELL_COACH = [
  '/coach-firebase.html',
  '/coach-manifest.json',
  '/icons/coach-192.png',
  '/icons/coach-512.png',
  '/al-move-mark.png'
];

self.addEventListener('install', function(evento) {
  evento.waitUntil(caches.open(VERSAO_CACHE_COACH).then(function(cache) {
    return cache.addAll(SHELL_COACH);
  }).then(function() {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function(evento) {
  evento.waitUntil(caches.keys().then(function(nomes) {
    return Promise.all(nomes.filter(function(nome) {
      return nome.startsWith('almove-coach-') && nome !== VERSAO_CACHE_COACH;
    }).map(function(nome) { return caches.delete(nome); }));
  }).then(function() {
    return self.clients.claim();
  }));
});

function respostaSemLigacao() {
  return new Response('<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AL MOVE Coach</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07121d;color:#eef7ff;font:16px Inter,system-ui,sans-serif}main{max-width:360px;padding:30px;text-align:center}b{color:#5eead4}p{color:#b8c8d8;line-height:1.55}</style><main><b>AL MOVE · COACH</b><h1>Sem ligação</h1><p>Volta a ligar-te à internet para entrar na área segura do Coach.</p></main></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', function(evento) {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(fetch(new Request(pedido, { cache: 'no-store' })).then(function(resposta) {
      const copia = resposta.clone();
      caches.open(VERSAO_CACHE_COACH).then(function(cache) { return cache.put('/coach-firebase.html', copia); });
      return resposta;
    }).catch(function() { return respostaSemLigacao(); }));
    return;
  }

  if (url.origin === self.location.origin && SHELL_COACH.includes(url.pathname)) {
    evento.respondWith(fetch(pedido).then(function(resposta) {
      const copia = resposta.clone();
      caches.open(VERSAO_CACHE_COACH).then(function(cache) { return cache.put(pedido, copia); });
      return resposta;
    }).catch(function() { return caches.match(pedido); }));
  }
});

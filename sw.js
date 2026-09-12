const VERSAO_CACHE = 'almove-portal-v1';

const FICHEIROS_ESSENCIAIS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-any-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO_CACHE).then((cache) => cache.addAll(FICHEIROS_ESSENCIAIS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== VERSAO_CACHE)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.url.includes('/api/')) {
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      return (
        respostaCache ||
        fetch(evento.request).then((respostaRede) => {
          const clone = respostaRede.clone();
          caches.open(VERSAO_CACHE).then((cache) => cache.put(evento.request, clone));
          return respostaRede;
        })
      );
    })
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
